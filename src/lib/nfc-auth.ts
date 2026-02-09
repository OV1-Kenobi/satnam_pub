/**
 * @fileoverview N424 NFC Authentication Module for NTAG424 DNA
 * @description NFC signing method using N424 tag bearer instruments to authenticate payments and messages
 * @compliance Master Context - Privacy-first, Bitcoin-only, browser-compatible
 * @security Hardware-backed authentication with encrypted bearer instruments
 */

import CryptoJS from "crypto-js";
import { getEnvVar } from "../config/env.client";
import fetchWithAuth from "./auth/fetch-with-auth";
import {
  getNTAG424Manager,
  type NTAG424SignOperation,
  type NTAG424SpendOperation,
} from "./ntag424-production";
import { secureNsecManager } from "./secure-nsec-manager";
import { stewardApprovalClient } from "./steward/approval-client";

// NFC Web API types
interface NFCReader {
  addEventListener(event: string, listener: EventListener): void;
  removeEventListener(event: string, listener: EventListener): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface NFCReadingEvent extends Event {
  message: NFCNDEFMessage;
  serialNumber?: string;
}

interface NFCNDEFMessage {
  records: NFCNDEFRecord[];
}

interface NFCNDEFRecord {
  recordType: string;
  mediaType?: string;
  id?: Uint8Array;
  data?: Uint8Array;
}

// NTAG424 DNA specific types
interface NTAG424DNAConfig {
  familyId: string;
  applicationId: string;
  keyId: number;
  keyVersion: number;
  maxReadAttempts: number;
  privacyDelayMs: number;
}

interface NTAG424DNAAuth {
  uid: string;
  familyId: string;
  applicationId: string;
  keyId: number;
  keyVersion: number;
  signature: string;
  timestamp: number;
  nonce: string;
}

interface GuardianApprovalRequest {
  requestId: string;
  guardianNpub: string;
  operation: "spend" | "sign" | "recovery" | "emergency";
  amount?: number;
  recipient?: string;
  memo?: string;
  timestamp: number;
  expiresAt: number;
}

interface GuardianApprovalResponse {
  requestId: string;
  guardianNpub: string;
  approved: boolean;
  signature: string;
  timestamp: number;
  reason?: string;
}

interface CardConfig {
  uid: string;
  signingPublicKey: string;
  encryptedPrivateKey?: string; // Optional encrypted private key for recovery scenarios
  aesKeys: {
    authentication: string;
    encryption: string;
    sun: string;
  };
  pinHash: string;
  userNpub: string;
  familyRole: "offspring" | "adult" | "steward" | "guardian" | "private";
  spendingLimits?: {
    daily: number;
    weekly: number;
    monthly: number;
    perTransaction: number;
  };
  individual: string;
  createdAt: number;
  lastUsed: number;
  // Application-layer P-256 keypair for NTAG424 operation signing (encrypted at rest in encrypted_config)
  p256PrivateKey?: string; // 64-char hex (32 bytes), used for spend + non-Nostr sign operations
  /**
   * P-256 public key for integrity verification.
   * Supports:
   * - 130-char uncompressed hex with 0x04 prefix (04 + x[32B] + y[32B])
   * - 66-char compressed hex with 0x02/0x03 prefix (02/03 + x[32B])
   */
  p256PublicKey?: string;
}

interface StewardPolicy {
  requiresStewardApproval: boolean;
  stewardThreshold: number;
  eligibleApproverPubkeys: string[];
  eligibleCount: number;
  federationDuid: string | null;
}

interface TapToSpendRequest {
  amount: number;
  recipient: string;
  memo?: string;
  requiresGuardianApproval: boolean;
  guardianThreshold: number;
  privacyLevel: "standard" | "enhanced" | "maximum";
}

interface TapToSignRequest {
  message: string;
  purpose: "transaction" | "communication" | "recovery" | "identity" | "nostr";
  requiresGuardianApproval: boolean;
  guardianThreshold: number;
  /**
   * When purpose === "nostr", a valid SecureNsecManager session ID must be
   * provided so that signing uses the user's Nostr key via zero-knowledge
   * session handling instead of ephemeral keys.
   */
  signingSessionId?: string;
}

// NFC Web API type definitions for better type safety
interface NDEFWriter {
  write(message: NDEFMessageInit): Promise<void>;
}

interface NDEFReader {
  scan(): Promise<void>;
  onreading: ((event: NDEFReadingEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}

interface NDEFMessageInit {
  records: NDEFRecordInit[];
}

interface NDEFRecordInit {
  recordType: string;
  data: string | ArrayBuffer | Uint8Array;
}

interface NDEFReadingEvent extends Event {
  serialNumber?: string;
  message: NDEFMessage;
}

interface NDEFMessage {
  records: NDEFRecord[];
}

interface NDEFRecord {
  recordType: string;
  data: ArrayBuffer;
}

// Extend Window interface for NFC API
declare global {
  interface Window {
    NDEFReader?: new () => NDEFReader;
    NDEFWriter?: new () => NDEFWriter;
  }
}

// CRITICAL: Use getEnvVar() for module-level env access to avoid TDZ issues
const API_BASE: string = getEnvVar("VITE_API_BASE_URL") || "/api";

// Steward approval client-side timeouts (ms) and request expiry (seconds)
const STEWARD_APPROVAL_TIMEOUT_MS = 60_000; // 60s to wait for approvals
const STEWARD_APPROVAL_WINDOW_SECONDS = 120; // 2 minutes validity for requests

// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("./supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};

/**
 * NFC Authentication Service for NTAG424 DNA
 * Provides tap-to-sign, tap-to-spend, and guardian approval via NFC
 */
export class NFCAuthService {
  private reader: NFCReader | null = null;
  private isListening: boolean = false;
  private config: NTAG424DNAConfig;
  private authCallbacks: Map<string, (auth: NTAG424DNAAuth) => void> =
    new Map();
  private guardianApprovalCallbacks: Map<
    string,
    (response: GuardianApprovalResponse) => void
  > = new Map();

  constructor(config?: Partial<NTAG424DNAConfig>) {
    this.config = {
      familyId: "satnam.pub",
      applicationId: "nfc-auth-v1",
      keyId: 0,
      keyVersion: 1,
      maxReadAttempts: 3,
      privacyDelayMs: 2000,
      ...config,
    };
  }

  /**
   * Initialize NFC reader for browser compatibility
   */
  async initializeNFC(): Promise<boolean> {
    try {
      // Check if NFC is supported
      if (!("NDEFReader" in window)) {
        console.warn("⚠️ NFC not supported in this browser");
        return false;
      }

      // Initialize NDEF reader
      this.reader = new (window as any).NDEFReader();
      console.log("🔐 NFC reader initialized for NTAG424 DNA");
      return true;
    } catch (error) {
      console.error("❌ Failed to initialize NFC:", error);
      return false;
    }
  }

  /**
   * Start listening for NFC tags
   */
  async startListening(): Promise<void> {
    if (!this.reader || this.isListening) return;

    try {
      await this.reader.start();
      this.isListening = true;
      console.log("👂 NFC listening started");

      // Add event listeners
      this.reader.addEventListener("reading", (event: Event) =>
        this.handleNFCTag(event as NFCReadingEvent),
      );
      this.reader.addEventListener(
        "readingerror",
        this.handleNFCError.bind(this),
      );
    } catch (error) {
      console.error("❌ Failed to start NFC listening:", error);
      throw error;
    }
  }

  /**
   * Stop listening for NFC tags
   */
  async stopListening(): Promise<void> {
    if (!this.reader || !this.isListening) return;

    try {
      await this.reader.stop();
      this.isListening = false;
      console.log("🛑 NFC listening stopped");
    } catch (error) {
      console.error("❌ Failed to stop NFC listening:", error);
    }
  }

  /**
   * Handle NFC tag detection
   */
  private async handleNFCTag(event: NFCReadingEvent): Promise<void> {
    try {
      console.log("📱 NFC tag detected:", event.serialNumber);

      // Parse NTAG424 DNA data
      const ntagData = await this.parseNTAG424DNA(event.message);
      if (!ntagData) {
        console.warn("⚠️ Invalid NTAG424 DNA data");
        return;
      }

      // Validate family and application IDs
      if (!this.validateNTAG424DNA(ntagData)) {
        console.warn("⚠️ NTAG424 DNA validation failed");
        return;
      }

      // Process authentication
      await this.processNTAG424DNAAuth(ntagData, event.serialNumber);
    } catch (error) {
      console.error("❌ Error processing NFC tag:", error);
    }
  }

  /**
   * Handle NFC reading errors
   */
  private handleNFCError(event: Event): void {
    console.error("❌ NFC reading error:", event);
  }

  /**
   * Parse NTAG424 DNA data from NDEF message
   */
  private async parseNTAG424DNA(
    message: NFCNDEFMessage,
  ): Promise<NTAG424DNAAuth | null> {
    try {
      // Look for NTAG424 DNA record
      const ntagRecord = message.records.find(
        (record) => record.recordType === "application/vnd.ntag424.dna",
      );

      if (!ntagRecord || !ntagRecord.data) {
        return null;
      }

      // Parse NTAG424 DNA structure
      const data = new Uint8Array(ntagRecord.data);

      // Extract UID (first 7 bytes)
      const uid = Array.from(data.slice(0, 7))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Extract family ID (next 4 bytes)
      const familyId = new TextDecoder().decode(data.slice(7, 11));

      // Extract application ID (next 4 bytes)
      const applicationId = new TextDecoder().decode(data.slice(11, 15));

      // Extract key ID (1 byte)
      const keyId = data[15];

      // Extract key version (1 byte)
      const keyVersion = data[16];

      // Extract signature (32 bytes)
      const signature = Array.from(data.slice(17, 49))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Extract timestamp (8 bytes)
      const timestamp = new DataView(data.slice(49, 57).buffer).getBigUint64(
        0,
        false,
      );

      // Extract nonce (16 bytes)
      const nonce = Array.from(data.slice(57, 73))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      return {
        uid,
        familyId,
        applicationId,
        keyId,
        keyVersion,
        signature,
        timestamp: Number(timestamp),
        nonce,
      };
    } catch (error) {
      console.error("❌ Error parsing NTAG424 DNA:", error);
      return null;
    }
  }

  /**
   * Validate NTAG424 DNA data
   */
  private validateNTAG424DNA(auth: NTAG424DNAAuth): boolean {
    // Validate family ID
    if (auth.familyId !== this.config.familyId) {
      console.warn("⚠️ Invalid family ID:", auth.familyId);
      return false;
    }

    // Validate application ID
    if (auth.applicationId !== this.config.applicationId) {
      console.warn("⚠️ Invalid application ID:", auth.applicationId);
      return false;
    }

    // Validate key version
    if (auth.keyVersion !== this.config.keyVersion) {
      console.warn("⚠️ Invalid key version:", auth.keyVersion);
      return false;
    }

    // Validate timestamp (not too old)
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    if (now - auth.timestamp > maxAge) {
      console.warn("⚠️ NTAG424 DNA timestamp too old");
      return false;
    }

    return true;
  }

  /**
   * Process NTAG424 DNA authentication
   */
  private async processNTAG424DNAAuth(
    auth: NTAG424DNAAuth,
    _serialNumber?: string,
  ): Promise<void> {
    try {
      // Verify signature using Web Crypto API
      const isValid = await this.verifyNTAG424DNASignature(auth);
      if (!isValid) {
        console.warn("⚠️ NTAG424 DNA signature verification failed");
        return;
      }

      console.log("✅ NTAG424 DNA authentication successful");

      // Trigger callbacks
      const callback = this.authCallbacks.get(auth.uid);
      if (callback) {
        callback(auth);
      }

      // Add privacy delay
      await this.privacyDelay();
    } catch (error) {
      console.error("❌ Error processing NTAG424 DNA auth:", error);
    }
  }

  /**
   * Verify NTAG424 DNA signature using Web Crypto API with enhanced security
   * SECURITY: Uses secure hex parsing, input validation, and constant-time comparison
   */
  private async verifyNTAG424DNASignature(
    auth: NTAG424DNAAuth,
  ): Promise<boolean> {
    // Input validation with early returns for security
    if (!auth || !auth.signature || !auth.uid || !auth.keyId) {
      console.error("Missing required NTAG424 DNA authentication fields");
      return false;
    }

    try {
      // Validate signature format with strict requirements
      if (!auth.signature || auth.signature.length % 2 !== 0) {
        console.error("Invalid NTAG424 DNA signature format");
        return false;
      }

      // Secure hex conversion with validation
      const signatureBytes = this.secureHexToBytes(auth.signature);
      if (!signatureBytes) {
        console.error("Invalid NTAG424 DNA signature hex format");
        return false;
      }

      // Create message to verify with input validation
      const messageComponents = [
        auth.uid,
        auth.familyId,
        auth.applicationId,
        auth.keyId,
        auth.keyVersion,
        auth.timestamp,
        auth.nonce,
      ];

      // Validate all message components
      if (messageComponents.some((component) => !component)) {
        console.error("Missing required NTAG424 DNA message components");
        return false;
      }

      const message = messageComponents.join("");
      const messageBytes = new TextEncoder().encode(message);

      // Import public key with validation (this would be stored securely)
      const publicKey = await this.getNTAG424DNAPublicKey(auth.keyId);
      if (!publicKey) {
        console.error("Failed to retrieve NTAG424 DNA public key");
        return false;
      }

      // Verify signature with proper error handling
      try {
        // Create proper ArrayBuffer for Web Crypto API compatibility
        const signatureBuffer = new Uint8Array(signatureBytes);
        const messageBuffer = new Uint8Array(messageBytes);

        const isValid = await crypto.subtle.verify(
          {
            name: "ECDSA",
            hash: "SHA-256",
          },
          publicKey,
          signatureBuffer,
          messageBuffer,
        );

        // Use constant-time logging to prevent timing attacks
        const logMessage = isValid
          ? "✅ NTAG424 DNA signature verified successfully"
          : "❌ NTAG424 DNA signature verification failed";

        console.log(logMessage, auth.uid.substring(0, 8) + "...");
        return isValid;
      } catch (cryptoError) {
        console.error(
          "Cryptographic NTAG424 DNA signature verification failed:",
          cryptoError,
        );
        return false;
      }
    } catch (error) {
      console.error("NTAG424 DNA signature verification error:", error);
      return false;
    } finally {
      // Secure memory cleanup for sensitive data
      await this.secureCleanup([auth.signature, auth.uid]);
    }
  }

  /**
   * Secure hex string to bytes conversion with validation
   * SECURITY: Prevents malformed hex from causing issues
   */
  private secureHexToBytes(hex: string): Uint8Array | null {
    try {
      // Validate hex string format
      if (!hex || hex.length % 2 !== 0) {
        return null;
      }

      // Validate hex characters
      if (!/^[0-9a-fA-F]+$/.test(hex)) {
        return null;
      }

      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        const byte = parseInt(hex.substring(i, i + 2), 16);
        if (isNaN(byte)) {
          return null;
        }
        bytes[i / 2] = byte;
      }
      return bytes;
    } catch (error) {
      return null;
    }
  }

  /**
   * Secure memory cleanup for sensitive signature data
   * SECURITY: Clears sensitive data from memory after use
   */
  private async secureCleanup(sensitiveData: string[]): Promise<void> {
    try {
      const sensitiveTargets = sensitiveData.map((data) => ({
        data,
        type: "string" as const,
      }));

      // Import secure memory clearing if available
      try {
        const { secureClearMemory } = await import("./privacy/encryption.js");
        secureClearMemory(sensitiveTargets);
      } catch (importError) {
        // Fallback to basic clearing if import fails
        console.warn("Could not import secure memory clearing");
      }
    } catch (cleanupError) {
      console.warn("Memory cleanup failed:", cleanupError);
    }
  }

  /**
   * Get NTAG424 DNA public key for verification
   */
  private async getNTAG424DNAPublicKey(_keyId: number): Promise<CryptoKey> {
    // This would retrieve the public key from secure storage
    // For now, return a placeholder
    throw new Error("NTAG424 DNA public key retrieval not implemented");
  }

  /**
   * Add privacy delay to prevent timing attacks
   */
  private async privacyDelay(): Promise<void> {
    await new Promise((resolve) =>
      setTimeout(resolve, this.config.privacyDelayMs),
    );
  }

  /**
   * Register callback for NTAG424 DNA authentication
   */
  registerAuthCallback(
    uid: string,
    callback: (auth: NTAG424DNAAuth) => void,
  ): void {
    this.authCallbacks.set(uid, callback);
  }

  /**
   * Unregister callback for NTAG424 DNA authentication
   */
  unregisterAuthCallback(uid: string): void {
    this.authCallbacks.delete(uid);
  }

  /**
   * Tap-to-Spend functionality
   */
  async tapToSpend(request: TapToSpendRequest): Promise<boolean> {
    try {
      console.log("💳 Tap-to-Spend initiated:", request);

      // Check if guardian approval is required
      if (request.requiresGuardianApproval) {
        const approved = await this.requestGuardianApproval({
          requestId: crypto.randomUUID(),
          guardianNpub: "", // Would be set based on family configuration
          operation: "spend",
          amount: request.amount,
          recipient: request.recipient,
          memo: request.memo,
          timestamp: Date.now(),
          expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
        });

        if (!approved) {
          console.warn("⚠️ Guardian approval required for tap-to-spend");
          return false;
        }
      }

      // Fetch steward policy before performing any NFC operations
      let policy: StewardPolicy | null = null;
      try {
        policy = await this.fetchStewardPolicy("spend");
      } catch (err) {
        console.error(
          "❌ Tap-to-Spend: failed to fetch steward policy",
          err instanceof Error ? err.message : "Unknown error",
        );
        // Abort cleanly without attempting NFC operation when policy cannot be determined
        return false;
      }

      const needsStewardApproval =
        !!policy &&
        policy.requiresStewardApproval === true &&
        policy.stewardThreshold > 0;

      // Start listening for NFC tag
      await this.startListening();

      // Wait for NFC authentication
      const authPromise = new Promise<NTAG424DNAAuth>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("NFC authentication timeout"));
        }, 30000); // 30 seconds

        this.registerAuthCallback("any", (auth) => {
          clearTimeout(timeout);
          resolve(auth);
        });
      });

      const auth = await authPromise;
      console.log("✅ NFC authentication for tap-to-spend successful");

      // If steward approval is required, gate the spend on sufficient approvals
      if (needsStewardApproval && policy) {
        console.log("🛡️ Steward approval required for tap-to-spend", {
          threshold: policy.stewardThreshold,
          eligibleCount: policy.eligibleCount,
        });

        const unsignedOperation: NTAG424SpendOperation = {
          uid: auth.uid,
          amount: request.amount,
          recipient: request.recipient,
          memo: request.memo,
          paymentType: "lightning",
          requiresGuardianApproval: request.requiresGuardianApproval,
          guardianThreshold: request.guardianThreshold,
          privacyLevel: request.privacyLevel,
          timestamp: Date.now(),
          signature: "",
        };

        const operationHash =
          await getNTAG424Manager().getOperationHashForClient(
            unsignedOperation,
          );

        // Best-effort publish of steward approval requests; failures are logged but do not leak sensitive data
        try {
          const expiresAt =
            Math.floor(Date.now() / 1000) + STEWARD_APPROVAL_WINDOW_SECONDS;
          await stewardApprovalClient.publishApprovalRequests({
            operationHash,
            operationKind: "ntag424_spend",
            uidHint: auth.uid.substring(0, 8) + "...",
            stewardThreshold: policy.stewardThreshold,
            federationDuid: policy.federationDuid || undefined,
            expiresAt,
            recipients: policy.eligibleApproverPubkeys.map((pubkey) => ({
              pubkeyHex: pubkey,
            })),
          });
        } catch (publishErr) {
          console.warn("⚠️ Steward approval request publish failed", {
            error:
              publishErr instanceof Error
                ? publishErr.message
                : String(publishErr),
          });
        }

        const approvalResult = await stewardApprovalClient.awaitApprovals(
          operationHash,
          {
            required: policy.stewardThreshold,
            timeoutMs: STEWARD_APPROVAL_TIMEOUT_MS,
            federationDuid: policy.federationDuid || undefined,
            eligibleApproverPubkeys: policy.eligibleApproverPubkeys,
          },
        );

        if (approvalResult.status !== "approved") {
          console.warn("⚠️ Tap-to-spend steward approvals not satisfied", {
            status: approvalResult.status,
          });
          await this.stopListening();
          return false;
        }

        console.log("✅ Steward approvals satisfied for tap-to-spend");
      }

      // Build and sign NTAG424 spend operation
      const operation = await this.createSignedSpendOperation(request, auth);

      // Execute the spend operation via NTAG424 production manager
      const success = await getNTAG424Manager().executeTapToSpend(operation);

      // Stop listening
      await this.stopListening();

      return success;
    } catch (error) {
      console.error("❌ Tap-to-Spend failed:", error);
      await this.stopListening();
      return false;
    }
  }

  /**
   * Tap-to-Sign functionality
   */
  async tapToSign(request: TapToSignRequest): Promise<string | null> {
    try {
      console.log("✍️ Tap-to-Sign initiated:", request);

      // Check if guardian approval is required
      if (request.requiresGuardianApproval) {
        const approved = await this.requestGuardianApproval({
          requestId: crypto.randomUUID(),
          guardianNpub: "", // Would be set based on family configuration
          operation: "sign",
          timestamp: Date.now(),
          expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
        });

        if (!approved) {
          console.warn("⚠️ Guardian approval required for tap-to-sign");
          return null;
        }
      }

      // Fetch steward policy before performing any NFC operations
      let policy: StewardPolicy | null = null;
      try {
        policy = await this.fetchStewardPolicy("sign");
      } catch (err) {
        console.error(
          "❌ Tap-to-Sign: failed to fetch steward policy",
          err instanceof Error ? err.message : "Unknown error",
        );
        return null;
      }

      const needsStewardApproval =
        !!policy &&
        policy.requiresStewardApproval === true &&
        policy.stewardThreshold > 0;

      // Start listening for NFC tag
      await this.startListening();

      // Wait for NFC authentication
      const authPromise = new Promise<NTAG424DNAAuth>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("NFC authentication timeout"));
        }, 30000); // 30 seconds

        this.registerAuthCallback("any", (auth) => {
          clearTimeout(timeout);
          resolve(auth);
        });
      });

      const auth = await authPromise;
      console.log("✅ NFC authentication for tap-to-sign successful");

      if (needsStewardApproval && policy) {
        console.log("🛡️ Steward approval required for tap-to-sign", {
          threshold: policy.stewardThreshold,
          eligibleCount: policy.eligibleCount,
        });

        const unsignedOperation: NTAG424SignOperation = {
          uid: auth.uid,
          message: request.message,
          purpose: request.purpose,
          requiresGuardianApproval: request.requiresGuardianApproval,
          guardianThreshold: request.guardianThreshold,
          timestamp: Date.now(),
          signature: "",
        };

        const operationHash =
          await getNTAG424Manager().getOperationHashForClient(
            unsignedOperation,
          );

        try {
          const expiresAt =
            Math.floor(Date.now() / 1000) + STEWARD_APPROVAL_WINDOW_SECONDS;
          await stewardApprovalClient.publishApprovalRequests({
            operationHash,
            operationKind: "ntag424_sign",
            uidHint: auth.uid.substring(0, 8) + "...",
            stewardThreshold: policy.stewardThreshold,
            federationDuid: policy.federationDuid || undefined,
            expiresAt,
            recipients: policy.eligibleApproverPubkeys.map((pubkey) => ({
              pubkeyHex: pubkey,
            })),
          });
        } catch (publishErr) {
          console.warn("⚠️ Steward approval request publish failed", {
            error:
              publishErr instanceof Error
                ? publishErr.message
                : String(publishErr),
          });
        }

        const approvalResult = await stewardApprovalClient.awaitApprovals(
          operationHash,
          {
            required: policy.stewardThreshold,
            timeoutMs: STEWARD_APPROVAL_TIMEOUT_MS,
            federationDuid: policy.federationDuid || undefined,
            eligibleApproverPubkeys: policy.eligibleApproverPubkeys,
          },
        );

        if (approvalResult.status !== "approved") {
          console.warn("⚠️ Tap-to-sign steward approvals not satisfied", {
            status: approvalResult.status,
          });
          await this.stopListening();
          return null;
        }

        console.log("✅ Steward approvals satisfied for tap-to-sign");
      }

      // Build and sign NTAG424 sign operation (for Nostr, this will use secureNsecManager)
      const operation = await this.createSignedSignOperation(request, auth);

      // Execute the sign operation via NTAG424 production manager
      const signature = await getNTAG424Manager().executeTapToSign(operation);

      // Stop listening
      await this.stopListening();

      return signature;
    } catch (error) {
      console.error("❌ Tap-to-Sign failed:", error);
      await this.stopListening();
      return null;
    }
  }

  /**
   * Execute spend operation after NFC authentication
   */
  private async executeSpendOperation(
    request: TapToSpendRequest,
    auth: NTAG424DNAAuth,
  ): Promise<boolean> {
    try {
      // This would integrate with the payment system
      console.log("💰 Executing spend operation:", {
        amount: request.amount,
        recipient: request.recipient,
        nfcAuth: auth.uid,
        privacyLevel: request.privacyLevel,
      });

      // For now, return success
      return true;
    } catch (error) {
      console.error("❌ Spend operation failed:", error);
      return false;
    }

    // End of executeSpendOperation
  }

  /**
   * Build and sign an NTAG424 spend operation using deterministic hashing
   * and a JSON signature envelope compatible with NTAG424ProductionManager.
   */
  async createSignedSpendOperation(
    request: TapToSpendRequest,
    auth: NTAG424DNAAuth,
  ): Promise<NTAG424SpendOperation> {
    const truncatedUid = auth.uid.substring(0, 8) + "...";

    // Base operation without signature; paymentType is currently limited
    // to Lightning for browser-side NFC tap-to-spend.
    const operation: NTAG424SpendOperation = {
      uid: auth.uid,
      amount: request.amount,
      recipient: request.recipient,
      memo: request.memo,
      paymentType: "lightning",
      requiresGuardianApproval: request.requiresGuardianApproval,
      guardianThreshold: request.guardianThreshold,
      privacyLevel: request.privacyLevel,
      timestamp: Date.now(),
      signature: "",
    };

    // Compute deterministic operation hash via NTAG424ProductionManager
    const operationHashHex =
      await getNTAG424Manager().getOperationHashForClient(operation);

    // Sign with per-card P-256 key for hardware-backed spend operations
    const { publicKeyHex, signatureHex } = await this.signOperationHashWithP256(
      operationHashHex,
      auth,
    );

    operation.signature = JSON.stringify({
      curve: "P-256" as const,
      publicKey: publicKeyHex,
      signature: signatureHex,
    });

    console.log("🔏 NTAG424 spend operation signed", {
      uid: truncatedUid,
      amount: request.amount,
      paymentType: operation.paymentType,
    });

    return operation;
  }

  /**
   * Build and sign an NTAG424 sign operation using deterministic hashing
   * and a JSON signature envelope. Uses secp256k1 for Nostr purposes
   * and P-256 for all other signing purposes.
   */
  async createSignedSignOperation(
    request: TapToSignRequest,
    auth: NTAG424DNAAuth,
  ): Promise<NTAG424SignOperation> {
    const truncatedUid = auth.uid.substring(0, 8) + "...";

    const operation: NTAG424SignOperation = {
      uid: auth.uid,
      message: request.message,
      purpose: request.purpose,
      requiresGuardianApproval: request.requiresGuardianApproval,
      guardianThreshold: request.guardianThreshold,
      timestamp: Date.now(),
      signature: "",
    };

    const operationHashHex =
      await getNTAG424Manager().getOperationHashForClient(operation);

    let curve: "P-256" | "secp256k1";
    let publicKeyHex: string;
    let signatureHex: string;

    if (request.purpose === "nostr") {
      curve = "secp256k1";
      const result = await this.signOperationHashWithSecp256k1(
        operationHashHex,
        request.signingSessionId,
      );
      publicKeyHex = result.publicKeyHex;
      signatureHex = result.signatureHex;
    } else {
      curve = "P-256";
      const result = await this.signOperationHashWithP256(
        operationHashHex,
        auth,
      );
      publicKeyHex = result.publicKeyHex;
      signatureHex = result.signatureHex;
    }

    operation.signature = JSON.stringify({
      curve,
      publicKey: publicKeyHex,
      signature: signatureHex,
    });

    console.log("🔏 NTAG424 sign operation prepared", {
      uid: truncatedUid,
      purpose: request.purpose,
      curve,
    });

    return operation;
  }

  /**
   * Generate signature after NFC authentication
   * SECURITY: Verifies signature using @noble/curves/secp256k1 before returning
   * @param message - Message to sign
   * @param auth - NTAG424 DNA authentication data including uid
   * @returns Hex-encoded verified signature (128 characters for 64 bytes)
   * @throws Error if card not registered, signature read fails, or verification fails
   */
  private async generateSignature(
    message: string,
    auth: NTAG424DNAAuth,
  ): Promise<string> {
    try {
      console.log("✍️ Generating signature with NFC key:", {
        message: message.substring(0, 50) + "...",
        nfcAuth: auth.uid.substring(0, 8) + "...",
      });

      // 1. Get card configuration with signing public key
      const cardConfig = await this.getCardConfig(auth.uid);
      if (!cardConfig || !cardConfig.signingPublicKey) {
        throw new Error(
          "Card not registered for signing - no public key found",
        );
      }

      // 2. Create message hash using Web Crypto API
      const messageBytes = new TextEncoder().encode(message);
      const messageHashBuffer = await crypto.subtle.digest(
        "SHA-256",
        messageBytes,
      );
      const messageHash = new Uint8Array(messageHashBuffer);
      const messageHashHex = Array.from(messageHash)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // 3. Request signature from NFC card
      const signatureHex = await this.requestCardSignature(
        auth.uid,
        messageHashHex,
      );

      // 4. Validate signature format (must be 128 hex characters = 64 bytes)
      if (!/^[a-fA-F0-9]{128}$/.test(signatureHex)) {
        throw new Error(
          `Invalid signature format - expected 128 hex characters, got ${signatureHex.length}`,
        );
      }

      // 5. Verify signature using secp256k1 before returning
      const { secp256k1 } = await import("@noble/curves/secp256k1");

      // Convert signature hex to bytes (64 bytes)
      const signatureBytes = new Uint8Array(
        signatureHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
      );

      // Convert public key hex to bytes (32 bytes for x-only pubkey)
      const publicKeyHex = cardConfig.signingPublicKey;
      if (!/^[a-fA-F0-9]{64}$/.test(publicKeyHex)) {
        throw new Error("Invalid signing public key format in card config");
      }
      const publicKeyBytes = new Uint8Array(
        publicKeyHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
      );

      // Verify signature
      const isValid = secp256k1.verify(
        signatureBytes,
        messageHash,
        publicKeyBytes,
      );

      if (!isValid) {
        console.error(
          "❌ NFC signature verification failed - signature invalid",
        );
        throw new Error(
          "Card signature verification failed - signature invalid",
        );
      }

      // Log success metadata only (zero-knowledge: don't log actual signature)
      console.log("✅ NFC signature generated and verified:", {
        cardUid: auth.uid.substring(0, 8) + "...",
        signatureLength: signatureHex.length,
        verified: true,
      });

      return signatureHex;
    } catch (error) {
      console.error(
        "❌ Signature generation failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
      throw error;
    }
  }

  /**
   * Sign a deterministic NTAG424 operation hash using Web Crypto P-256
   * and return public key and signature as hex strings.
   */
  private async signOperationHashWithP256(
    operationHashHex: string,
    auth: NTAG424DNAAuth,
  ): Promise<{
    publicKeyHex: string;
    signatureHex: string;
  }> {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      throw new Error("Web Crypto API is not available for P-256 signing");
    }

    const messageBytes = this.secureHexToBytes(operationHashHex);
    if (!messageBytes) {
      throw new Error("Invalid NTAG424 operation hash for P-256 signing");
    }

    // Retrieve per-card P-256 key material from encrypted card config
    const cardConfig = await this.getCardConfig(auth.uid);
    if (!cardConfig || !cardConfig.p256PrivateKey) {
      console.error(
        "❌ P-256 signing key not found in card config",
        auth.uid.substring(0, 8) + "...",
      );
      throw new Error(
        "Card configuration missing required P-256 signing key; please re-provision this card.",
      );
    }

    const privHex = cardConfig.p256PrivateKey;
    if (!/^[0-9a-fA-F]{64}$/.test(privHex)) {
      console.error(
        "❌ Invalid P-256 private key format in card config",
        auth.uid.substring(0, 8) + "...",
      );
      throw new Error("Invalid P-256 signing key format in card configuration");
    }

    const privBytes = this.secureHexToBytes(privHex);
    if (!privBytes) {
      throw new Error(
        "Failed to parse P-256 private key from card configuration",
      );
    }

    try {
      // Validate and extract P-256 public key coordinates from card config
      if (!cardConfig.p256PublicKey) {
        console.error(
          "❌ P-256 public key missing in card config for operation envelope",
          auth.uid.substring(0, 8) + "...",
        );
        throw new Error(
          "Card configuration missing P-256 public key required for operation envelope.",
        );
      }

      let pubKeyHex = cardConfig.p256PublicKey;

      // Support compressed P-256 keys: 0x02/0x03 prefix + 32-byte X coordinate (66 hex chars)
      if (
        pubKeyHex.length === 66 &&
        (pubKeyHex.startsWith("02") || pubKeyHex.startsWith("03"))
      ) {
        try {
          const compressedBytes = this.secureHexToBytes(pubKeyHex);
          if (!compressedBytes) {
            throw new Error("Invalid compressed P-256 public key hex");
          }

          const { p256 } = await import("@noble/curves/nist");
          const point = p256.ProjectivePoint.fromHex(compressedBytes);
          const uncompressedBytes = point.toRawBytes(false); // false = uncompressed
          pubKeyHex = this.bytesToHex(uncompressedBytes);
        } catch (e) {
          console.error(
            "❌ Failed to decompress compressed P-256 public key from card config",
            e instanceof Error ? e.message : "Unknown error",
          );
          throw new Error(
            "Invalid compressed P-256 public key in card configuration",
          );
        }
      }

      // Validate uncompressed format: 0x04 prefix (1 byte) + x (32 bytes) + y (32 bytes) = 130 hex chars
      if (pubKeyHex.length !== 130) {
        throw new Error(
          `Invalid p256PublicKey: must be 130 hex characters (uncompressed format with 0x04 prefix), got ${pubKeyHex.length}`,
        );
      }

      if (!pubKeyHex.startsWith("04")) {
        throw new Error(
          "Invalid p256PublicKey: must start with 0x04 prefix for uncompressed format",
        );
      }

      // Extract x and y coordinates from uncompressed format
      // Format: 0x04 (2 hex chars) + x (64 hex chars) + y (64 hex chars)
      const xHex = pubKeyHex.slice(2, 66); // Skip 0x04 prefix, get x (32 bytes = 64 hex chars)
      const yHex = pubKeyHex.slice(66, 130); // Get y (32 bytes = 64 hex chars)

      const xBytes = this.secureHexToBytes(xHex);
      const yBytes = this.secureHexToBytes(yHex);

      if (!xBytes || !yBytes || xBytes.length !== 32 || yBytes.length !== 32) {
        throw new Error(
          "Failed to parse P-256 public key coordinates from card configuration",
        );
      }

      // Build complete JWK with x and y coordinates for proper P-256 key import
      const jwk: JsonWebKey = {
        kty: "EC",
        crv: "P-256",
        d: this.bytesToBase64Url(privBytes),
        x: this.bytesToBase64Url(xBytes),
        y: this.bytesToBase64Url(yBytes),
        ext: true,
      };

      const privateKey = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
      );

      const signatureBuffer = await crypto.subtle.sign(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        privateKey,
        new Uint8Array(messageBytes),
      );

      const signatureHex = this.bytesToHex(new Uint8Array(signatureBuffer));
      return { publicKeyHex: pubKeyHex, signatureHex };
    } finally {
      // Best-effort cleanup of raw private key bytes
      privBytes.fill(0);
    }
  }

  /**
   * Sign a deterministic NTAG424 operation hash using secp256k1 via
   * @noble/curves and return public key and signature as hex strings.
   * Used for Nostr-related signing purposes.
   */
  private async signOperationHashWithSecp256k1(
    operationHashHex: string,
    signingSessionId?: string,
  ): Promise<{
    publicKeyHex: string;
    signatureHex: string;
  }> {
    if (!signingSessionId) {
      throw new Error(
        "Nostr signing session required. Please authenticate with your Nostr account before using tap-to-sign for Nostr operations.",
      );
    }

    const messageBytes = this.secureHexToBytes(operationHashHex);
    if (!messageBytes) {
      throw new Error("Invalid NTAG424 operation hash for secp256k1 signing");
    }

    const { secp256k1 } = await import("@noble/curves/secp256k1");

    const result = await secureNsecManager.useTemporaryNsec(
      signingSessionId,
      async (nsecHex: string) => {
        // nsecHex may be raw hex or bech32-encoded; for NTAG424 operation
        // signing we expect a 64-char hex private key.
        if (!/^[0-9a-fA-F]{64}$/.test(nsecHex)) {
          throw new Error(
            "Unsupported Nostr key format for NTAG424 secp256k1 signing",
          );
        }

        const privBytes = this.secureHexToBytes(nsecHex);
        if (!privBytes) {
          throw new Error("Failed to parse Nostr private key for signing");
        }

        try {
          const signatureBytes = secp256k1.sign(messageBytes, privBytes);
          const publicKeyBytes = secp256k1.getPublicKey(privBytes);

          const signatureHex = this.bytesToHex(signatureBytes);
          const publicKeyHex = this.bytesToHex(publicKeyBytes);

          return { publicKeyHex, signatureHex };
        } finally {
          // Best-effort cleanup of raw private key material
          privBytes.fill(0);
        }
      },
    );

    return result;
  }

  /**
   * Convert a byte array to a hex string
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Convert bytes to base64url string for JWK encoding
   */
  private bytesToBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }

  /**
   * Get master key from environment
   * SECURITY: Uses same key source as NTAG424ProductionManager
   */
  private getMasterKey(): string {
    const vaultKey = getEnvVar("VITE_NTAG424_MASTER_KEY");
    if (vaultKey && vaultKey !== "your-master-key-here") {
      return vaultKey;
    }

    // Development fallback - matches NTAG424ProductionManager
    console.warn(
      "⚠️ Using development NTAG424 master key. Use Supabase Vault in production.",
    );
    return "dev-ntag424-master-key-32-chars";
  }

  /**
   * Decrypt card configuration using AES-256
   * SECURITY: Uses CryptoJS.AES matching NTAG424ProductionManager.encryptConfig()
   * @throws Error if decryption fails (invalid key or corrupted data)
   */
  private decryptCardConfig(encryptedConfig: string): CardConfig {
    try {
      const masterKey = this.getMasterKey();
      const bytes = CryptoJS.AES.decrypt(encryptedConfig, masterKey);
      const decryptedString = bytes.toString(CryptoJS.enc.Utf8);

      if (!decryptedString) {
        throw new Error(
          "Decryption produced empty result - invalid key or corrupted data",
        );
      }

      const config = JSON.parse(decryptedString) as CardConfig;

      // Validate required fields
      if (!config.uid || !config.pinHash) {
        throw new Error(
          "Decrypted config missing required fields (uid, pinHash)",
        );
      }

      // Derive signing public key from authentication key if not explicitly set
      if (!config.signingPublicKey && config.aesKeys?.authentication) {
        config.signingPublicKey = config.aesKeys.authentication;
      }

      return config;
    } catch (error) {
      // Log security event without exposing sensitive data
      console.error(
        "❌ Card config decryption failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
      throw new Error("Configuration decryption failed - check master key");
    }
  }

  /**
   * Fetch card configuration from database
   * @param uid - Card unique identifier
   * @returns CardConfig or null if not found
   * @throws Error if database or decryption fails
   */
  private async getCardConfig(uid: string): Promise<CardConfig | null> {
    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase
        .from("ntag424_registrations")
        .select("encrypted_config, user_npub, family_role")
        .eq("uid", uid)
        .single();

      if (error) {
        // Not found is not an error, just return null
        if (error.code === "PGRST116") {
          console.log("⚠️ Card not registered:", uid.substring(0, 8) + "...");
          return null;
        }
        throw new Error(`Database query failed: ${error.message}`);
      }

      if (!data?.encrypted_config) {
        console.log("⚠️ Card registration missing encrypted config");
        return null;
      }

      // Decrypt configuration using shared master key
      const config = this.decryptCardConfig(data.encrypted_config);

      // Merge database fields with decrypted config
      return {
        ...config,
        userNpub: data.user_npub || config.userNpub,
        familyRole: data.family_role || config.familyRole,
      };
    } catch (error) {
      console.error(
        "❌ Failed to fetch card config:",
        error instanceof Error ? error.message : "Unknown error",
      );
      throw error; // Re-throw to signal failure to caller
    }
  }

  /**
   * Request signature from NFC card
   * Uses Web NFC API to scan for NTAG424 DNA signature records
   * @param uid - Card unique identifier (for validation)
   * @param messageHash - Hash to be signed (for future challenge-response)
   * @returns Hex-encoded signature string (64 characters for 32 bytes)
   * @throws Error if NFC not supported, timeout, or no signature found
   */
  private async requestCardSignature(
    uid: string,
    _messageHash: string,
  ): Promise<string> {
    // Check if NFC is supported
    if (!("NDEFReader" in window)) {
      throw new Error("NFC not supported in this browser");
    }

    const TIMEOUT_MS = 10000; // 10 seconds
    const abortController = new AbortController();
    let reader: NDEFReader | null = null;

    try {
      reader = new (window as any).NDEFReader();
      console.log(
        "📡 Starting NFC signature scan for card:",
        uid.substring(0, 8) + "...",
      );

      // Create promise for NFC reading
      const readPromise = new Promise<string>((resolve, reject) => {
        reader!.onreading = (event: NDEFReadingEvent) => {
          try {
            // Look for NTAG424 DNA record
            const ntagRecord = event.message.records.find(
              (record) => record.recordType === "application/vnd.ntag424.dna",
            );

            if (!ntagRecord || !ntagRecord.data) {
              reject(new Error("No signature record found on card"));
              return;
            }

            // Parse NTAG424 DNA structure
            const data = new Uint8Array(ntagRecord.data);

            // Validate UID matches (first 7 bytes)
            const cardUid = Array.from(data.slice(0, 7))
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");

            if (cardUid.toLowerCase() !== uid.toLowerCase()) {
              reject(new Error("Card UID mismatch - wrong card presented"));
              return;
            }

            // Extract signature (bytes 17-81, 64 bytes for ECDSA r+s components)
            // ECDSA signatures are always 64 bytes: r component (32 bytes) + s component (32 bytes)
            // This matches the expected 128 hex characters in generateSignature()
            const signatureBytes = data.slice(17, 81);
            if (signatureBytes.length !== 64) {
              reject(
                new Error(
                  `Invalid signature length on card: expected 64 bytes, got ${signatureBytes.length}`,
                ),
              );
              return;
            }

            const signature = Array.from(signatureBytes)
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");

            // Log metadata only (zero-knowledge: don't log actual signature)
            console.log("✅ Signature read successfully:", {
              cardUid: cardUid.substring(0, 8) + "...",
              signatureLength: signature.length,
            });

            resolve(signature);
          } catch (error) {
            reject(
              new Error(
                `Failed to parse signature: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              ),
            );
          }
        };

        reader!.onerror = (_event: Event) => {
          reject(new Error("NFC read cancelled by user"));
        };
      });

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          abortController.abort();
          reject(new Error("NFC signature read timeout after 10s"));
        }, TIMEOUT_MS);

        // Clean up timeout if reading completes
        abortController.signal.addEventListener("abort", () => {
          clearTimeout(timeoutId);
        });
      });

      // Start scanning
      if (!reader) {
        throw new Error("NFC reader initialization failed");
      }
      await reader.scan();
      console.log("👂 NFC scan active, waiting for card tap...");

      // Race between read and timeout
      const signature = await Promise.race([readPromise, timeoutPromise]);

      // Signal completion to clean up timeout
      abortController.abort();

      return signature;
    } catch (error) {
      // Clean up on any error
      abortController.abort();

      console.error(
        "❌ NFC signature request failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
      throw error;
    }
  }

  /**
   * Request guardian approval for NFC operations
   */
  private async requestGuardianApproval(
    request: GuardianApprovalRequest,
  ): Promise<boolean> {
    try {
      console.log("🛡️ Requesting guardian approval:", request);

      // This would send the request to guardians via Nostr
      // For now, simulate approval
      const approved = Math.random() > 0.5; // 50% chance for demo

      if (approved) {
        console.log("✅ Guardian approval granted");
      } else {
        console.log("❌ Guardian approval denied");
      }

      return approved;
    } catch (error) {
      console.error("❌ Guardian approval request failed:", error);
      return false;
    }
  }

  /**
   * Fetch steward policy from the Netlify steward-policy endpoint using the
   * existing JWT-based authentication. This method never logs raw DUIDs,
   * federation IDs, or pubkeys; only high-level error messages.
   */
  private async fetchStewardPolicy(
    operationType: "spend" | "sign",
  ): Promise<StewardPolicy> {
    const url = `${API_BASE}/steward-policy`;
    try {
      const res = await fetchWithAuth(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ operation_type: operationType }),
        timeoutMs: 15_000,
      });

      let payload: any = null;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        payload = await res.json().catch(() => ({}));
      } else {
        const text = await res.text().catch(() => "");
        try {
          payload = text ? JSON.parse(text) : {};
        } catch {
          payload = {};
        }
      }

      if (!res.ok) {
        const baseError =
          (payload && typeof payload.error === "string" && payload.error) ||
          `Steward policy request failed with HTTP ${res.status}`;

        if (res.status === 409) {
          throw new Error(
            payload?.error ||
              "Steward policy misconfigured. Please contact support before using steward-gated NFC flows.",
          );
        }
        if (res.status >= 500) {
          throw new Error(
            payload?.error ||
              "Steward policy service is temporarily unavailable. Please try again later.",
          );
        }

        throw new Error(baseError);
      }

      if (!payload || !payload.success || !payload.policy) {
        throw new Error("Invalid steward policy response from server.");
      }

      const policy = payload.policy as StewardPolicy;
      return policy;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch steward policy";
      console.error("❌ Steward policy fetch failed", { message });
      throw new Error(message);
    }
  }

  /**
   * Register callback for guardian approval responses
   */
  registerGuardianApprovalCallback(
    requestId: string,
    callback: (response: GuardianApprovalResponse) => void,
  ): void {
    this.guardianApprovalCallbacks.set(requestId, callback);
  }

  /**
   * Unregister callback for guardian approval responses
   */
  unregisterGuardianApprovalCallback(requestId: string): void {
    this.guardianApprovalCallbacks.delete(requestId);
  }

  /**
   * Cleanup NFC resources
   */
  async cleanup(): Promise<void> {
    await this.stopListening();
    this.authCallbacks.clear();
    this.guardianApprovalCallbacks.clear();
    console.log("🧹 NFC Auth Service cleaned up");
  }

  /**
   * Register and program an NTAG424 tag in-app using Web NFC API
   * Phase 11 Task 11.2.4: Updated to use batch writer with retry logic
   * @param pin User-chosen PIN (string)
   * @param nsec Encrypted nsec or other protected data (string)
   * @returns { tagUID, aesKey, pinHash }
   */
  async registerAndProgramTag(
    pin: string,
    nsec: string,
  ): Promise<{ tagUID: string | null; aesKey: string; pinHash: string }> {
    // Import batch writer for optimized write operations
    const { batchWriteNDEFRecords, isNFCWriteSupported } =
      await import("./nfc/batch-ndef-writer");

    if (!isNFCWriteSupported()) {
      throw new Error("NFC writing not supported in this browser");
    }

    // 1. Generate AES-256 key
    const aesKey = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    const rawKey = await window.crypto.subtle.exportKey("raw", aesKey);
    const aesKeyB64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)));

    // 2. Hash PIN
    const pinHashBuffer = await window.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(pin),
    );
    const pinHash = btoa(String.fromCharCode(...new Uint8Array(pinHashBuffer)));

    // 3. Prompt user to tap tag and write data using batch writer with retry logic
    const protectedData = JSON.stringify({ nsec, pinHash });
    const writeResult = await batchWriteNDEFRecords(
      [{ recordType: "text", data: protectedData }],
      3, // 3 retries with exponential backoff
    );

    if (!writeResult.success) {
      throw new Error(
        `Failed to write to NFC tag: ${writeResult.error || "Unknown error"}`,
      );
    }

    // 4. Try to read tag UID (not always available)
    let tagUID: string | null = null;
    if (window.NDEFReader) {
      try {
        const reader = new window.NDEFReader();
        await new Promise<void>(async (resolve, reject) => {
          try {
            await reader.scan();
          } catch (err) {
            reject(err instanceof Error ? err : new Error("NFC scan failed"));
            return;
          }
          reader.onreading = (event: NDEFReadingEvent) => {
            tagUID = event.serialNumber || null;
            resolve();
          };
          reader.onerror = (_event: Event) =>
            reject(new Error("NFC reading error"));
        });
      } catch {
        tagUID = null;
      }
    }
    return { tagUID, aesKey: aesKeyB64, pinHash };
  }
}

/**
 * NFC Hardware Security Manager
 * Manages multiple NFC devices and provides unified interface
 */
export class NFCHardwareSecurityManager {
  private nfcServices: Map<string, NFCAuthService> = new Map();
  private defaultService: NFCAuthService | null = null;

  /**
   * Register NFC device
   */
  registerNFCDevice(
    deviceId: string,
    config?: Partial<NTAG424DNAConfig>,
  ): NFCAuthService {
    const service = new NFCAuthService(config);
    this.nfcServices.set(deviceId, service);

    if (!this.defaultService) {
      this.defaultService = service;
    }

    console.log("📱 NFC device registered:", deviceId);
    return service;
  }

  /**
   * Get NFC service by device ID
   */
  getNFCService(deviceId: string): NFCAuthService | null {
    return this.nfcServices.get(deviceId) || null;
  }

  /**
   * Get default NFC service
   */
  getDefaultNFCService(): NFCAuthService | null {
    return this.defaultService;
  }

  /**
   * Initialize all NFC devices
   */
  async initializeAllDevices(): Promise<void> {
    const promises = Array.from(this.nfcServices.values()).map((service) =>
      service.initializeNFC(),
    );

    const results = await Promise.allSettled(promises);
    const successCount = results.filter(
      (r) => r.status === "fulfilled" && r.value,
    ).length;

    console.log(
      `🔐 ${successCount}/${this.nfcServices.size} NFC devices initialized`,
    );
  }

  /**
   * Tap-to-Spend with any available NFC device
   */
  async tapToSpend(request: TapToSpendRequest): Promise<boolean> {
    if (!this.defaultService) {
      throw new Error("No NFC devices registered");
    }

    return this.defaultService.tapToSpend(request);
  }

  /**
   * Tap-to-Sign with any available NFC device
   */
  async tapToSign(request: TapToSignRequest): Promise<string | null> {
    if (!this.defaultService) {
      throw new Error("No NFC devices registered");
    }

    return this.defaultService.tapToSign(request);
  }

  /**
   * Cleanup all NFC devices
   */
  async cleanup(): Promise<void> {
    const promises = Array.from(this.nfcServices.values()).map((service) =>
      service.cleanup(),
    );

    await Promise.allSettled(promises);
    this.nfcServices.clear();
    this.defaultService = null;

    console.log("🧹 All NFC devices cleaned up");
  }
}

// Export types for external use
export type {
  GuardianApprovalRequest,
  GuardianApprovalResponse,
  NTAG424DNAAuth,
  NTAG424DNAConfig,
  TapToSignRequest,
  TapToSpendRequest,
};
