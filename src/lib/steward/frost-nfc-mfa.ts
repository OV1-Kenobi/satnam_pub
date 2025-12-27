/**
 * FROST NFC Physical MFA Integration
 * Handles NFC card signing for FROST multiparty signing operations
 * Uses P-256 signatures from NTAG424 DNA cards as proof-of-presence
 */

import { NFCAuthService, TapToSignRequest } from "../nfc-auth";

// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("../supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};

export interface NfcMfaSignatureEnvelope {
  curve: "P-256";
  publicKey: string;
  signature: string;
  timestamp: number;
  cardUid: string;
}

export interface CollectNfcMfaSignatureResult {
  success: boolean;
  nfcSignature?: NfcMfaSignatureEnvelope;
  error?: string;
}

export interface VerifyNfcMfaSignatureResult {
  valid: boolean;
  error?: string;
}

export interface StoreNfcMfaSignatureResult {
  success: boolean;
  error?: string;
}

/**
 * FROST NFC MFA Service
 * Orchestrates NFC card signing for FROST operations
 */
export class FrostNfcMfa {
  private nfcAuthService: NFCAuthService;

  constructor() {
    this.nfcAuthService = new NFCAuthService();
  }

  /**
   * Collect NFC MFA signature for FROST operation
   * Taps NFC card to sign operation hash with P-256
   */
  async collectNfcMfaSignature(
    operationHash: string,
    stewardDuid: string,
    familyId: string
  ): Promise<CollectNfcMfaSignatureResult> {
    try {
      console.log("🔐 Collecting NFC MFA signature for FROST", {
        operationHash: operationHash.substring(0, 8) + "...",
        stewardDuid: stewardDuid.substring(0, 8) + "...",
        familyId: familyId.substring(0, 8) + "...",
      });

      // Call NFCAuthService to tap card and sign operation hash
      const tapRequest: TapToSignRequest = {
        message: operationHash,
        purpose: "transaction",
        requiresGuardianApproval: false,
        guardianThreshold: 0,
        signingSessionId: `frost_${Date.now()}`,
      };

      const result = await this.nfcAuthService.tapToSign(tapRequest);

      if (!result) {
        return {
          success: false,
          error: "NFC card tap failed or was cancelled",
        };
      }

      // Extract P-256 signature from NTAG424 operation result
      // Result is a JSON string containing the signature envelope
      let signatureEnvelope;
      try {
        signatureEnvelope =
          typeof result === "string" ? JSON.parse(result) : result;
      } catch {
        signatureEnvelope = result;
      }

      // Validate required fields
      if (!signatureEnvelope.publicKey || !signatureEnvelope.signature) {
        return {
          success: false,
          error: "Invalid signature envelope: missing publicKey or signature",
        };
      }

      const nfcSignature: NfcMfaSignatureEnvelope = {
        curve: "P-256",
        publicKey: signatureEnvelope.publicKey,
        signature: signatureEnvelope.signature,
        timestamp: Date.now(),
        cardUid: signatureEnvelope.cardUid || "unknown",
      };

      console.log("✅ NFC MFA signature collected", {
        curve: nfcSignature.curve,
        publicKey: nfcSignature.publicKey.substring(0, 8) + "...",
        signature: nfcSignature.signature.substring(0, 8) + "...",
        timestamp: nfcSignature.timestamp,
        cardUid: nfcSignature.cardUid.substring(0, 8) + "...",
      });

      return { success: true, nfcSignature };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ NFC MFA signature collection failed", {
        error: errorMsg,
        operationHash: operationHash.substring(0, 8) + "...",
      });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Verify NFC MFA signature using Web Crypto API
   * Validates P-256 signature and timestamp
   */
  async verifyNfcMfaSignature(
    operationHash: string,
    nfcSignature: NfcMfaSignatureEnvelope
  ): Promise<VerifyNfcMfaSignatureResult> {
    try {
      // Validate timestamp (within 5 minutes)
      const TIMESTAMP_TOLERANCE_MS = 300000; // 5 minutes
      const now = Date.now();
      const diff = Math.abs(now - nfcSignature.timestamp);

      if (diff > TIMESTAMP_TOLERANCE_MS) {
        return {
          valid: false,
          error: `Signature expired: ${diff}ms > ${TIMESTAMP_TOLERANCE_MS}ms`,
        };
      }

      // Validate hex inputs
      const hexPattern = /^[0-9a-fA-F]+$/;
      if (!hexPattern.test(nfcSignature.publicKey)) {
        return { valid: false, error: "Invalid public key hex format" };
      }
      if (!hexPattern.test(nfcSignature.signature)) {
        return { valid: false, error: "Invalid signature hex format" };
      }
      if (nfcSignature.publicKey.length !== 130) {
        // 65 bytes uncompressed point encoded as hex (0x04 + 64-byte coordinates)
        return { valid: false, error: "Invalid public key length" };
      }

      // Verify P-256 signature using Web Crypto API
      const publicKeyObj = await crypto.subtle.importKey(
        "raw",
        this.hexToArrayBuffer(nfcSignature.publicKey),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"]
      );

      const signatureBuffer = this.hexToArrayBuffer(nfcSignature.signature);
      const messageBuffer = new TextEncoder().encode(operationHash);

      const isValid = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKeyObj,
        signatureBuffer,
        messageBuffer
      );

      if (!isValid) {
        return { valid: false, error: "Signature verification failed" };
      }

      console.log("✅ NFC MFA signature verified", {
        publicKey: nfcSignature.publicKey.substring(0, 8) + "...",
        signature: nfcSignature.signature.substring(0, 8) + "...",
        timestamp: nfcSignature.timestamp,
      });

      return { valid: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ NFC MFA verification failed", { error: errorMsg });
      return { valid: false, error: errorMsg };
    }
  }

  /**
   * Store NFC MFA signature in database
   * Updates frost_signature_shares with NFC signature data
   */
  async storeNfcMfaSignature(
    sessionId: string,
    participantId: string,
    nfcSignature: NfcMfaSignatureEnvelope
  ): Promise<StoreNfcMfaSignatureResult> {
    try {
      const supabase = await getSupabaseClient();

      // Update frost_signature_shares with NFC signature
      const { data, error } = await supabase
        .from("frost_signature_shares")
        .update({
          nfc_signature: nfcSignature.signature,
          nfc_public_key: nfcSignature.publicKey,
          nfc_verified_at: new Date(nfcSignature.timestamp).toISOString(),
          nfc_verification_error: null,
        })
        .eq("session_id", sessionId)
        .eq("participant_id", participantId)
        .select();

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return {
          success: false,
          error: "No signature share found for participant",
        };
      }

      console.log("✅ NFC MFA signature stored", {
        sessionId: sessionId.substring(0, 8) + "...",
        participantId: participantId.substring(0, 8) + "...",
      });

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ NFC MFA storage failed", { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Convert hex string to ArrayBuffer
   * Used for Web Crypto API operations
   */
  private hexToArrayBuffer(hex: string): ArrayBuffer {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes.buffer;
  }
}

// ============================================================================
// LAZY SINGLETON EXPORT
// ============================================================================

let frostNfcMfaInstance: FrostNfcMfa | null = null;

/**
 * Get the lazy singleton instance of FrostNfcMfa.
 *
 * The instance is created on first use instead of at module import time to
 * avoid initialization-order issues when this module participates in circular
 * dependencies with NFC auth and steward approval flows.
 */
export function getFrostNfcMfa(): FrostNfcMfa {
  if (!frostNfcMfaInstance) {
    frostNfcMfaInstance = new FrostNfcMfa();
  }
  return frostNfcMfaInstance;
}
