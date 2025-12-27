/**
 * Guardian Approval + NFC MFA Integration
 * Extends steward approval workflow with NFC MFA signature collection and verification
 *
 * Integration Points:
 * - Extends PublishApprovalRequestsInput with NFC MFA fields
 * - Adds NFC signature verification to approval response processing
 * - Implements high-value operation detection in approval flow
 */

import { getFrostNfcMfa } from "./frost-nfc-mfa";
import {
  getFamilyNfcMfaPolicy,
  shouldEnforceNfcMfa,
} from "./frost-nfc-mfa-policy";
import {
  cleanupSessionAnonymization,
  initializeSessionAnonymization,
  logNfcMfaEvent,
  truncateHash,
} from "./nfc-mfa-privacy-logger";

/**
 * Extended approval request payload with NFC MFA fields
 */
export interface ApprovalRequestWithNfcMfa {
  type: "steward_approval_request";
  version: number;
  operationHash: string;
  operationKind: string;
  operationAmount?: number; // NEW: for high-value detection
  nfcMfaRequired: boolean; // NEW: policy enforcement flag
  nfcMfaPolicy: string; // NEW: "disabled" | "optional" | "required" | "required_for_high_value"
  stewardThreshold: number;
  federationDuid?: string;
  expiresAt: number;
  nonce: string;
  uidHint: string;
}

/**
 * Extended approval response with NFC MFA signature
 */
export interface ApprovalResponseWithNfcMfa {
  type: "steward_approval_response";
  requestId: string;
  approved: boolean;
  nfcSignature?: {
    signature: string; // P-256 ECDSA signature
    publicKey: string; // P-256 public key from card
    timestamp: number; // Unix milliseconds
    cardUid: string; // NTAG424 card identifier
  };
  nfcVerified?: boolean; // Verification result
  reason?: string;
}

/**
 * Determine if NFC MFA should be required for an approval request
 * Takes into account family policy and operation amount
 */
export async function shouldRequireNfcMfaForApproval(
  familyId: string,
  operationAmount?: number
): Promise<boolean> {
  try {
    const policy = await getFamilyNfcMfaPolicy(familyId);
    return shouldEnforceNfcMfa(policy, operationAmount);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logNfcMfaEvent("error", "❌ Failed to determine NFC MFA requirement", {
      familyId,
      error: errorMsg,
    });
    // Default to safe: require NFC MFA if policy check fails
    return true;
  }
}

/**
 * Verify NFC MFA signature in approval response
 * Ensures guardian's physical card possession and operation binding
 */
export async function verifyApprovalResponseNfcSignature(
  response: ApprovalResponseWithNfcMfa,
  operationHash: string,
  sessionId: string
): Promise<{ verified: boolean; error?: string }> {
  try {
    if (!response.nfcSignature) {
      return {
        verified: false,
        error: "NFC signature missing from approval response",
      };
    }

    // Initialize session anonymization if needed
    initializeSessionAnonymization(sessionId);

    const { signature, publicKey, timestamp, cardUid } = response.nfcSignature;

    // Verify timestamp is within tolerance (±5 minutes)
    const now = Date.now();
    const timeDiff = Math.abs(now - timestamp);
    if (timeDiff > 300000) {
      // 5 minutes
      logNfcMfaEvent("warn", "⚠️ NFC signature timestamp out of tolerance", {
        sessionId,
        timeDiff,
        tolerance: 300000,
      });
      return {
        verified: false,
        error: "NFC signature timestamp expired",
      };
    }

    // Verify NFC signature against operation hash using FrostNfcMfa service
    const frostNfcMfa = getFrostNfcMfa();
    const verifyResult = await frostNfcMfa.verifyNfcMfaSignature(
      operationHash,
      {
        curve: "P-256",
        publicKey,
        signature,
        timestamp,
        cardUid,
      }
    );

    if (!verifyResult.valid) {
      logNfcMfaEvent("warn", "⚠️ NFC signature verification failed", {
        sessionId,
        operationHash: truncateHash(operationHash),
        error: verifyResult.error,
      });
      return {
        verified: false,
        error: verifyResult.error || "NFC signature verification failed",
      };
    }

    logNfcMfaEvent("log", "✅ NFC signature verified in approval response", {
      sessionId,
      operationHash: truncateHash(operationHash),
      cardUid,
    });

    return { verified: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logNfcMfaEvent("error", "❌ NFC signature verification error", {
      sessionId,
      error: errorMsg,
    });
    return {
      verified: false,
      error: errorMsg,
    };
  }
}

/**
 * Clean up session resources after approval completes
 */
export function cleanupApprovalSession(sessionId: string): void {
  cleanupSessionAnonymization(sessionId);
}
