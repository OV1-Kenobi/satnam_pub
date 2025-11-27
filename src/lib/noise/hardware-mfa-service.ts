/**
 * Hardware MFA Service for Hardened FS Tier
 *
 * Phase 0 Foundation: Skeleton implementation for NFC-based hardware MFA.
 * Provides Web NFC detection and token enrollment/verification interfaces.
 *
 * Platform Support:
 * - Android: Chrome 89+ with NFC hardware
 * - iOS: Not supported (Web NFC not available)
 * - Desktop: Not supported (no NFC hardware typically)
 *
 * @module src/lib/noise/hardware-mfa-service
 */

import type {
  HardwareTokenMetadata,
  NfcAvailability,
  NfcChallenge,
  NfcChallengeResponse,
  NfcEnrollmentResult,
  NfcVerificationResult,
} from "./types";
import { NoiseProtocolError } from "./types";
import type { VaultAccessor } from "./noise-session-manager";
import { bytesToHex, hexToBytes } from "./primitives";

// =============================================================================
// Constants
// =============================================================================

/** Vault storage key prefix for enrolled tokens */
const VAULT_TOKEN_PREFIX = "noise-hw-token:";

// =============================================================================
// ECDSA Signature Verification Helpers
// =============================================================================

/**
 * Convert hex string to ArrayBuffer (Web Crypto compatible).
 * @param hex - Hex string
 * @returns ArrayBuffer
 */
function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

/**
 * Verify an ECDSA P-256 signature using Web Crypto API.
 * This performs real cryptographic verification, not just presence checks.
 *
 * @param challengeHex - Hex-encoded challenge that was signed
 * @param signatureHex - Hex-encoded ECDSA signature (64 bytes: r || s)
 * @param publicKeyHex - Hex-encoded P-256 public key (uncompressed 65 bytes, or compressed 33 bytes)
 * @returns true if signature is cryptographically valid
 * @throws NoiseProtocolError if key format is invalid
 */
async function verifyEcdsaP256Signature(
  challengeHex: string,
  signatureHex: string,
  publicKeyHex: string
): Promise<boolean> {
  try {
    // Validate inputs
    if (!challengeHex || !signatureHex || !publicKeyHex) {
      return false;
    }

    // Convert hex public key to ArrayBuffer
    const publicKeyBytes = hexToBytes(publicKeyHex);

    // P-256 public keys: 33 bytes (compressed) or 65 bytes (uncompressed)
    if (publicKeyBytes.length !== 33 && publicKeyBytes.length !== 65) {
      throw new NoiseProtocolError(
        `Invalid P-256 public key length: ${publicKeyBytes.length} bytes (expected 33 or 65)`,
        "NFC_AUTH_FAILED"
      );
    }

    // For compressed keys, we need to decompress (Web Crypto only accepts uncompressed)
    let rawKeyBuffer: ArrayBuffer;
    if (publicKeyBytes.length === 33) {
      // Compressed key - needs decompression
      // Note: Full decompression requires EC point calculation
      // For now, reject compressed keys with a clear error
      throw new NoiseProtocolError(
        "Compressed P-256 public keys not yet supported. Use uncompressed (65-byte) format.",
        "NFC_AUTH_FAILED"
      );
    } else {
      // Uncompressed key (0x04 prefix + 64 bytes)
      rawKeyBuffer = publicKeyBytes.buffer as ArrayBuffer;
    }

    // Import the public key using Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      rawKeyBuffer,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );

    // Convert challenge hex to ArrayBuffer (this is what was signed)
    const challengeBuffer = hexToArrayBuffer(challengeHex);

    // Convert signature hex to ArrayBuffer
    // ECDSA P-256 signature should be 64 bytes (r: 32 bytes, s: 32 bytes)
    const signatureBytes = hexToBytes(signatureHex);
    if (signatureBytes.length !== 64) {
      console.warn(
        `[HardwareMfaService] Invalid signature length: ${signatureBytes.length} bytes (expected 64)`
      );
      return false;
    }
    const signatureBuffer = signatureBytes.buffer as ArrayBuffer;

    // Verify the signature using Web Crypto
    const isValid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      signatureBuffer,
      challengeBuffer
    );

    return isValid;
  } catch (error) {
    if (error instanceof NoiseProtocolError) {
      throw error;
    }
    console.warn(
      "[HardwareMfaService] ECDSA signature verification failed:",
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

// =============================================================================
// Web NFC Type Declarations
// =============================================================================

/**
 * Web NFC API types (not in standard TypeScript lib).
 * These are only available in Chrome Android 89+.
 */
interface NDEFReader {
  scan(): Promise<void>;
  write(message: NDEFMessageInit): Promise<void>;
  onreading: ((event: NDEFReadingEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}

interface NDEFReadingEvent extends Event {
  serialNumber: string;
  message: NDEFMessage;
}

interface NDEFMessage {
  records: NDEFRecord[];
}

interface NDEFRecord {
  recordType: string;
  mediaType?: string;
  data?: ArrayBuffer;
  encoding?: string;
  lang?: string;
}

interface NDEFMessageInit {
  records: NDEFRecordInit[];
}

interface NDEFRecordInit {
  recordType: string;
  mediaType?: string;
  data?: ArrayBuffer | string;
}

// Note: NDEFReader Window declaration is in src/lib/nfc-auth.ts to avoid duplicates

// =============================================================================
// Hardware MFA Service Class
// =============================================================================

/**
 * Service for hardware MFA operations (NFC tokens).
 * Singleton pattern - use HardwareMfaService.getInstance().
 */
export class HardwareMfaService {
  private static instance: HardwareMfaService | null = null;

  /** Enrolled tokens (loaded from vault) */
  private enrolledTokens: Map<string, HardwareTokenMetadata> = new Map();

  /** Vault accessor for persistent storage */
  private vaultAccessor: VaultAccessor | null = null;

  /** Cached NFC availability result */
  private nfcAvailability: NfcAvailability | null = null;

  private constructor() {}

  /**
   * Get the singleton instance.
   */
  static getInstance(): HardwareMfaService {
    if (!HardwareMfaService.instance) {
      HardwareMfaService.instance = new HardwareMfaService();
    }
    return HardwareMfaService.instance;
  }

  /**
   * Reset the singleton instance (for testing only).
   */
  static resetInstance(): void {
    HardwareMfaService.instance = null;
  }

  /**
   * Initialize the service with vault accessor.
   */
  async initialize(vaultAccessor: VaultAccessor): Promise<void> {
    this.vaultAccessor = vaultAccessor;
    await this.loadEnrolledTokens();
  }

  /**
   * Check if Web NFC is available on this device/browser.
   */
  checkNfcAvailability(): NfcAvailability {
    if (this.nfcAvailability) {
      return this.nfcAvailability;
    }

    const platform = this.detectPlatform();
    const apiAvailable =
      typeof window !== "undefined" && "NDEFReader" in window;

    // Web NFC is only available on Chrome Android
    const hardwareAvailable = platform === "android" && apiAvailable;

    let unavailableReason: string | undefined;
    if (!apiAvailable) {
      unavailableReason = "Web NFC API not available in this browser";
    } else if (platform !== "android") {
      unavailableReason = `Web NFC requires Chrome on Android (detected: ${platform})`;
    }

    this.nfcAvailability = {
      apiAvailable,
      hardwareAvailable,
      unavailableReason,
      platform,
    };

    return this.nfcAvailability;
  }

  /**
   * Check if Hardened FS tier is available on this device.
   */
  isHardenedFsAvailable(): boolean {
    const availability = this.checkNfcAvailability();
    return availability.hardwareAvailable;
  }

  /**
   * Get list of enrolled tokens.
   */
  getEnrolledTokens(): HardwareTokenMetadata[] {
    return Array.from(this.enrolledTokens.values());
  }

  /**
   * Check if any tokens are enrolled.
   */
  hasEnrolledTokens(): boolean {
    return this.enrolledTokens.size > 0;
  }

  /**
   * Enroll a new hardware token.
   * Initiates NFC scan and captures token metadata.
   *
   * @param label - User-friendly label for the token
   * @param timeoutMs - Scan timeout in milliseconds (default: 60000)
   * @returns Enrolled token metadata
   * @throws NoiseProtocolError if NFC unavailable or scan fails
   */
  async enrollToken(
    label?: string,
    timeoutMs: number = 60000
  ): Promise<HardwareTokenMetadata> {
    const availability = this.checkNfcAvailability();
    if (!availability.hardwareAvailable) {
      throw new NoiseProtocolError(
        availability.unavailableReason ?? "NFC not available",
        "NFC_UNAVAILABLE"
      );
    }

    // Perform NFC scan to read token
    const scanResult = await this.performNfcScan(timeoutMs);

    if (!scanResult.serialNumber) {
      throw new NoiseProtocolError(
        "Failed to read token serial number",
        "NFC_AUTH_FAILED"
      );
    }

    // Generate unique token ID from serial number
    const tokenId = await this.generateTokenId(scanResult.serialNumber);

    // Check if already enrolled
    if (this.enrolledTokens.has(tokenId)) {
      throw new NoiseProtocolError(
        "This token is already enrolled",
        "NFC_AUTH_FAILED"
      );
    }

    // Determine if token has cryptographic capability
    // Boltcard and Satscard support ECDSA signing; generic NFC tokens do not
    const tokenType = scanResult.tokenType || "generic-nfc";
    const cryptoCapable = tokenType === "boltcard" || tokenType === "satscard";

    // Create token metadata
    const token: HardwareTokenMetadata = {
      tokenType,
      tokenId,
      publicKey: scanResult.publicKey || "",
      enrolledAt: Date.now(),
      label: label || `Token ${this.enrolledTokens.size + 1}`,
      cryptoCapable,
    };

    // For crypto-capable tokens, verify that a valid public key was provided
    if (cryptoCapable && !token.publicKey) {
      throw new NoiseProtocolError(
        `${tokenType} token requires a public key for signature verification`,
        "NFC_AUTH_FAILED"
      );
    }

    // Save to vault
    await this.saveToken(token);

    return token;
  }

  /**
   * Verify a hardware token for authentication.
   * Initiates NFC scan and verifies against enrolled tokens.
   *
   * @param specificTokenId - Optional specific token ID to verify against
   * @param timeoutMs - Scan timeout in milliseconds (default: 60000)
   * @returns Verified token metadata
   * @throws NoiseProtocolError if verification fails
   */
  async verifyToken(
    specificTokenId?: string,
    timeoutMs: number = 60000
  ): Promise<HardwareTokenMetadata> {
    const availability = this.checkNfcAvailability();
    if (!availability.hardwareAvailable) {
      throw new NoiseProtocolError(
        availability.unavailableReason ?? "NFC not available",
        "NFC_UNAVAILABLE"
      );
    }

    if (!this.hasEnrolledTokens()) {
      throw new NoiseProtocolError(
        "No hardware tokens enrolled",
        "NFC_AUTH_FAILED"
      );
    }

    // Perform NFC scan
    const scanResult = await this.performNfcScan(timeoutMs);

    if (!scanResult.serialNumber) {
      throw new NoiseProtocolError(
        "Failed to read token serial number",
        "NFC_AUTH_FAILED"
      );
    }

    // Generate token ID from scanned serial
    const scannedTokenId = await this.generateTokenId(scanResult.serialNumber);

    // If specific token requested, verify it matches
    if (specificTokenId && scannedTokenId !== specificTokenId) {
      throw new NoiseProtocolError(
        "Scanned token does not match expected token",
        "NFC_AUTH_FAILED"
      );
    }

    // Look up enrolled token
    const enrolledToken = this.enrolledTokens.get(scannedTokenId);
    if (!enrolledToken) {
      throw new NoiseProtocolError("Token not enrolled", "NFC_AUTH_FAILED");
    }

    return enrolledToken;
  }

  /**
   * Generate a challenge for NFC token authentication.
   *
   * @returns Challenge object with random bytes and expiry
   */
  generateChallenge(): NfcChallenge {
    const challengeBytes = new Uint8Array(32);
    crypto.getRandomValues(challengeBytes);

    const now = Date.now();
    return {
      challenge: bytesToHex(challengeBytes),
      createdAt: now,
      expiresAt: now + 60000, // 60 second expiry
    };
  }

  /**
   * Verify a challenge response from an NFC token.
   *
   * @param challenge - Original challenge
   * @param response - Token's response
   * @returns Verification result
   */
  async verifyChallengeResponse(
    challenge: NfcChallenge,
    response: NfcChallengeResponse
  ): Promise<NfcVerificationResult> {
    // Check challenge expiry
    if (Date.now() > challenge.expiresAt) {
      return {
        success: false,
        error: "Challenge expired",
      };
    }

    // Look up enrolled token
    const token = this.enrolledTokens.get(response.tokenId);
    if (!token) {
      return {
        success: false,
        error: "Token not enrolled",
      };
    }

    // Verify signature using proper ECDSA for crypto-capable tokens
    try {
      const isValid = await this.verifySignature(
        challenge.challenge,
        response.signature,
        token.publicKey,
        token.cryptoCapable
      );

      if (!isValid) {
        return {
          success: false,
          error: "Invalid signature",
        };
      }

      return {
        success: true,
        tokenId: response.tokenId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Verification failed",
      };
    }
  }

  /**
   * Remove an enrolled token.
   *
   * @param tokenId - Token ID to remove
   */
  async removeToken(tokenId: string): Promise<void> {
    this.enrolledTokens.delete(tokenId);

    if (this.vaultAccessor) {
      await this.vaultAccessor.remove(`${VAULT_TOKEN_PREFIX}${tokenId}`);
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Perform an NFC scan and return token data.
   *
   * @param timeoutMs - Scan timeout in milliseconds
   * @returns Scan result with token data
   */
  private async performNfcScan(timeoutMs: number): Promise<{
    serialNumber: string;
    publicKey?: string;
    tokenType?: "boltcard" | "satscard" | "generic-nfc";
  }> {
    return new Promise((resolve, reject) => {
      const win = window as unknown as { NDEFReader?: new () => NDEFReader };
      if (!win.NDEFReader) {
        reject(
          new NoiseProtocolError("Web NFC not available", "NFC_UNAVAILABLE")
        );
        return;
      }

      const reader = new win.NDEFReader();
      let timeoutId: ReturnType<typeof setTimeout>;
      let resolved = false;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        reader.onreading = null;
        reader.onerror = null;
      };

      reader.onreading = (event: NDEFReadingEvent) => {
        if (resolved) return;
        resolved = true;
        cleanup();

        // Detect token type from NDEF records
        let tokenType: "boltcard" | "satscard" | "generic-nfc" = "generic-nfc";
        let publicKey: string | undefined;

        for (const record of event.message.records) {
          if (record.recordType === "text" && record.data) {
            const text = new TextDecoder().decode(record.data);
            if (text.includes("boltcard")) {
              tokenType = "boltcard";
            } else if (text.includes("satscard")) {
              tokenType = "satscard";
            }
          }
          // Look for public key in external records
          if (record.recordType === "external" && record.data) {
            publicKey = bytesToHex(new Uint8Array(record.data));
          }
        }

        resolve({
          serialNumber: event.serialNumber,
          publicKey,
          tokenType,
        });
      };

      reader.onerror = (event: Event) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        reject(
          new NoiseProtocolError(
            `NFC scan error: ${
              (event as ErrorEvent).message || "Unknown error"
            }`,
            "NFC_AUTH_FAILED"
          )
        );
      };

      // Start scanning
      reader.scan().catch((error: Error) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        reject(
          new NoiseProtocolError(
            `Failed to start NFC scan: ${error.message}`,
            "NFC_AUTH_FAILED"
          )
        );
      });

      // Set timeout
      timeoutId = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        cleanup();
        reject(new NoiseProtocolError("NFC scan timed out", "NFC_AUTH_FAILED"));
      }, timeoutMs);
    });
  }

  /**
   * Generate a unique token ID from serial number.
   *
   * @param serialNumber - NFC tag serial number
   * @returns Hashed token ID
   */
  private async generateTokenId(serialNumber: string): Promise<string> {
    const data = new TextEncoder().encode(`satnam-nfc:${serialNumber}`);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return bytesToHex(new Uint8Array(hash)).slice(0, 32);
  }

  /**
   * Verify a signature from an NFC token using proper cryptographic validation.
   *
   * For tokens with crypto capability (Boltcard, Satscard):
   * - Performs real ECDSA P-256 signature verification using Web Crypto API
   * - Verifies the signature was produced by the private key matching the public key
   *
   * For generic NFC tokens without crypto capability:
   * - Falls back to presence-only verification (with security warning logged)
   *
   * @param challengeHex - Hex-encoded challenge that was signed
   * @param signatureHex - Hex-encoded signature to verify (64 bytes for P-256)
   * @param publicKeyHex - Hex-encoded token's public key (33 or 65 bytes for P-256)
   * @param cryptoCapable - Whether the token supports cryptographic verification
   * @returns Whether signature is valid
   */
  private async verifySignature(
    challengeHex: string,
    signatureHex: string,
    publicKeyHex: string,
    cryptoCapable: boolean = true
  ): Promise<boolean> {
    // For generic NFC tokens without crypto capability,
    // we use presence-only verification with a security warning
    if (!publicKeyHex || publicKeyHex.length === 0 || !cryptoCapable) {
      console.warn(
        "[HardwareMfaService] Using presence-only verification (no crypto). " +
          "This provides limited security - consider using Boltcard or Satscard."
      );
      // Presence verification: just check the signature is non-empty
      return signatureHex.length > 0;
    }

    // Crypto-capable token: perform real ECDSA P-256 signature verification
    try {
      const isValid = await verifyEcdsaP256Signature(
        challengeHex,
        signatureHex,
        publicKeyHex
      );

      if (!isValid) {
        console.warn(
          "[HardwareMfaService] ECDSA signature verification failed - " +
            "signature does not match public key"
        );
      }

      return isValid;
    } catch (error) {
      // Re-throw NoiseProtocolError (invalid key format, etc.)
      if (error instanceof NoiseProtocolError) {
        throw error;
      }
      // Log other errors but don't fall back to presence verification
      // for crypto-capable tokens (that would defeat the security purpose)
      console.error(
        "[HardwareMfaService] Unexpected error during signature verification:",
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  /**
   * Detect the current platform.
   */
  private detectPlatform(): "android" | "ios" | "desktop" | "unknown" {
    if (typeof navigator === "undefined") {
      return "unknown";
    }

    const ua = navigator.userAgent.toLowerCase();

    if (/android/.test(ua)) {
      return "android";
    }
    if (/iphone|ipad|ipod/.test(ua)) {
      return "ios";
    }
    if (/windows|macintosh|linux/.test(ua) && !/android/.test(ua)) {
      return "desktop";
    }

    return "unknown";
  }

  /**
   * Load enrolled tokens from vault.
   */
  private async loadEnrolledTokens(): Promise<void> {
    if (!this.vaultAccessor) return;

    try {
      const keys = await this.vaultAccessor.keys();
      const tokenKeys = keys.filter((k) => k.startsWith(VAULT_TOKEN_PREFIX));

      for (const key of tokenKeys) {
        const data = await this.vaultAccessor.get(key);
        if (data) {
          const token: HardwareTokenMetadata = JSON.parse(data);
          this.enrolledTokens.set(token.tokenId, token);
        }
      }
    } catch {
      console.warn("Failed to load enrolled hardware tokens");
    }
  }

  /**
   * Save a token to vault.
   */
  private async saveToken(token: HardwareTokenMetadata): Promise<void> {
    this.enrolledTokens.set(token.tokenId, token);

    if (this.vaultAccessor) {
      await this.vaultAccessor.set(
        `${VAULT_TOKEN_PREFIX}${token.tokenId}`,
        JSON.stringify(token)
      );
    }
  }

  /**
   * Destroy the singleton instance (for testing).
   */
  static destroy(): void {
    HardwareMfaService.instance = null;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get a user-friendly message about NFC availability.
 */
export function getNfcAvailabilityMessage(): string {
  const service = HardwareMfaService.getInstance();
  const availability = service.checkNfcAvailability();

  if (availability.hardwareAvailable) {
    return "NFC is available for Hardened FS authentication";
  }

  switch (availability.platform) {
    case "ios":
      return "Hardened FS requires Chrome on Android. iOS does not support Web NFC.";
    case "desktop":
      return "Hardened FS requires Chrome on Android with NFC hardware.";
    case "android":
      return "Please use Chrome browser for NFC authentication.";
    default:
      return (
        availability.unavailableReason ?? "NFC is not available on this device."
      );
  }
}
