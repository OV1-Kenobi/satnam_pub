/**
 * Guardian Approval Response Handler with NFC MFA Verification
 * Processes approval responses and verifies NFC signatures when present
 *
 * Integration with approval-client.ts:
 * - Extends handleEvent() logic to verify NFC signatures
 * - Logs verification events with privacy protection
 * - Maintains backward compatibility with responses without NFC signatures
 */

import {
  verifyApprovalResponseNfcSignature,
  cleanupApprovalSession,
  type ApprovalResponseWithNfcMfa,
} from "./approval-nfc-mfa-integration";
import {
  logNfcMfaEvent,
  truncateHash,
  anonymizeStewardDuid,
} from "./nfc-mfa-privacy-logger";

/**
 * Extended approval response with NFC verification result
 */
export interface ApprovalResponseWithVerification {
  operationHash: string;
  approverPubkeyHex: string;
  decision: "approved" | "rejected";
  nfcVerified?: boolean;
  nfcVerificationError?: string;
  receivedAt: string;
  protocol: "nip17" | "nip04" | "nip44";
}

/**
 * Process guardian approval response with NFC MFA verification
 *
 * @param response - Parsed approval response from guardian
 * @param operationHash - Operation hash for verification
 * @param sessionId - Session ID for logging and cleanup
 * @returns Verification result with NFC status
 */
export async function processApprovalResponseWithNfcVerification(
  response: ApprovalResponseWithNfcMfa,
  operationHash: string,
  sessionId: string
): Promise<ApprovalResponseWithVerification> {
  const result: ApprovalResponseWithVerification = {
    operationHash,
    approverPubkeyHex: "", // Will be set by caller
    decision: response.approved ? "approved" : "rejected",
    receivedAt: new Date().toISOString(),
    protocol: "nip17",
  };

  // If response includes NFC signature, verify it
  if (response.nfcSignature) {
    try {
      const verifyResult = await verifyApprovalResponseNfcSignature(
        response,
        operationHash,
        sessionId
      );

      result.nfcVerified = verifyResult.verified;
      if (!verifyResult.verified) {
        result.nfcVerificationError = verifyResult.error;
        logNfcMfaEvent(
          "warn",
          "⚠️ NFC verification failed in approval response",
          {
            sessionId,
            operationHash: truncateHash(operationHash),
            error: verifyResult.error,
          }
        );
      } else {
        logNfcMfaEvent(
          "log",
          "✅ NFC verification successful in approval response",
          {
            sessionId,
            operationHash: truncateHash(operationHash),
          }
        );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      result.nfcVerified = false;
      result.nfcVerificationError = errorMsg;
      logNfcMfaEvent(
        "error",
        "❌ NFC verification error in approval response",
        {
          sessionId,
          error: errorMsg,
        }
      );
    }
  } else {
    // No NFC signature in response
    // This is acceptable if NFC MFA was not required
    logNfcMfaEvent("log", "ℹ️ No NFC signature in approval response", {
      sessionId,
      operationHash: truncateHash(operationHash),
    });
  }

  return result;
}

/**
 * Determine if NFC verification failure should block the approval
 *
 * @param nfcVerified - NFC verification result
 * @param nfcMfaRequired - Whether NFC MFA was required for this operation
 * @returns true if approval should be blocked due to NFC verification failure
 */
export function shouldBlockApprovalDueToNfcFailure(
  nfcVerified: boolean | undefined,
  nfcMfaRequired: boolean
): boolean {
  // If NFC MFA was required and verification failed, block approval
  if (nfcMfaRequired && nfcVerified === false) {
    return true;
  }

  // If NFC MFA was not required, don't block (backward compatibility)
  return false;
}

/**
 * Log approval response with privacy protection
 *
 * @param response - Approval response with verification
 * @param sessionId - Session ID for logging
 * @param nfcMfaRequired - Whether NFC MFA was required
 */
export function logApprovalResponseWithPrivacy(
  response: ApprovalResponseWithVerification,
  sessionId: string,
  nfcMfaRequired: boolean
): void {
  const opPrefix = truncateHash(response.operationHash);
  const stewardId = anonymizeStewardDuid(response.approverPubkeyHex, sessionId);

  logNfcMfaEvent("log", "📋 Approval response processed", {
    sessionId,
    operationHash: opPrefix,
    steward: stewardId,
    decision: response.decision,
    nfcMfaRequired,
    nfcVerified: response.nfcVerified,
    protocol: response.protocol,
  });
}

/**
 * Clean up resources after approval response processing
 *
 * @param sessionId - Session ID to clean up
 */
export function cleanupApprovalResponseSession(sessionId: string): void {
  cleanupApprovalSession(sessionId);
}
