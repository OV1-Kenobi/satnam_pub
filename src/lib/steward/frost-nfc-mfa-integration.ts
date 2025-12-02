/**
 * FROST NFC MFA Integration Methods
 * Extends FrostSessionManager with NFC Physical MFA verification
 *
 * Integration Point: After FROST signature aggregation
 * Allows stewards without physical cards to participate (backward compatible)
 */

import { frostNfcMfa, NfcMfaSignatureEnvelope } from "./frost-nfc-mfa";

// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("../supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};

export interface NfcMfaPolicy {
  policy: "disabled" | "optional" | "required" | "required_for_high_value";
  requiresNfcMfa: boolean;
}

export interface VerifyNfcMfaSignaturesResult {
  success: boolean;
  verified: number;
  failed: number;
  errors: Record<string, string>;
  allVerified?: boolean;
}

/**
 * Get NFC MFA policy for a family federation
 * Determines whether NFC MFA is required, optional, or disabled
 */
export async function getNfcMfaPolicy(familyId: string): Promise<NfcMfaPolicy> {
  try {
    const supabase = await getSupabaseClient();

    // Query family_federations for NFC MFA policy
    const query = supabase
      .from("family_federations")
      .select("nfc_mfa_policy")
      .eq("federation_duid", familyId);

    const { data, error } = await query.single();

    if (error) {
      console.warn("⚠️ Failed to fetch NFC MFA policy", {
        familyId: familyId.substring(0, 8) + "...",
        error: error.message,
      });
      // Default to disabled if policy not found
      return { policy: "disabled", requiresNfcMfa: false };
    }

    const policy = data?.nfc_mfa_policy || "disabled";
    const requiresNfcMfa =
      policy === "required" || policy === "required_for_high_value";

    console.log("✅ NFC MFA policy retrieved", {
      familyId: familyId.substring(0, 8) + "...",
      policy,
      requiresNfcMfa,
    });

    return { policy, requiresNfcMfa };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ NFC MFA policy retrieval failed", { error: errorMsg });
    return { policy: "disabled", requiresNfcMfa: false };
  }
}

/**
 * Verify NFC MFA signatures for all participants in a FROST session
 * Called AFTER signature aggregation
 *
 * Returns:
 * - success: true if verification completed (even if some failed)
 * - verified: number of successfully verified signatures
 * - failed: number of failed verifications
 * - errors: map of participant -> error message
 * - allVerified: true if all required signatures verified
 */
export async function verifyNfcMfaSignatures(
  sessionId: string,
  operationHash: string,
  nfcSignatures: Record<string, NfcMfaSignatureEnvelope>,
  policy: NfcMfaPolicy
): Promise<VerifyNfcMfaSignaturesResult> {
  // Track aggregate verification statistics so they are available even if
  // an error occurs before we finish processing all signatures.
  const errors: Record<string, string> = {};
  let verified = 0;
  let failed = 0;

  try {
    const supabase = await getSupabaseClient();

    console.log("🔐 Verifying NFC MFA signatures", {
      sessionId: sessionId.substring(0, 8) + "...",
      operationHash: operationHash.substring(0, 8) + "...",
      participantCount: Object.keys(nfcSignatures).length,
      policy: policy.policy,
    });

    // Verify each NFC signature
    for (const [participantId, nfcSignature] of Object.entries(nfcSignatures)) {
      try {
        // Verify signature using Web Crypto API
        const verifyResult = await frostNfcMfa.verifyNfcMfaSignature(
          operationHash,
          nfcSignature
        );

        if (!verifyResult.valid) {
          failed++;
          errors[participantId] =
            verifyResult.error || "Signature verification failed";
          console.warn("⚠️ NFC signature verification failed", {
            participantId: participantId.substring(0, 8) + "...",
            error: verifyResult.error,
          });
          continue;
        }

        // Store verified signature in database
        const storeResult = await frostNfcMfa.storeNfcMfaSignature(
          sessionId,
          participantId,
          nfcSignature
        );

        if (!storeResult.success) {
          failed++;
          errors[participantId] =
            storeResult.error || "Failed to store signature";
          console.warn("⚠️ NFC signature storage failed", {
            participantId: participantId.substring(0, 8) + "...",
            error: storeResult.error,
          });
          continue;
        }

        verified++;
        console.log("✅ NFC signature verified and stored", {
          participantId: participantId.substring(0, 8) + "...",
        });
      } catch (error) {
        failed++;
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        errors[participantId] = errorMsg;
        console.error("❌ NFC signature verification error", {
          participantId: participantId.substring(0, 8) + "...",
          error: errorMsg,
        });
      }
    }

    // Determine if all required signatures verified
    const allVerified = failed === 0 && verified > 0;

    // Update session with NFC verification status
    const { error: updateError } = await supabase
      .from("frost_signing_sessions")
      .update({
        nfc_verification_status: {
          verified,
          failed,
          allVerified,
          errors,
        },
        updated_at: Date.now(),
      })
      .eq("session_id", sessionId);

    if (updateError) {
      console.warn("⚠️ Failed to update NFC verification status", {
        sessionId: sessionId.substring(0, 8) + "...",
        error: updateError.message,
      });
    }

    console.log("✅ NFC MFA verification complete", {
      sessionId: sessionId.substring(0, 8) + "...",
      verified,
      failed,
      allVerified,
    });

    return {
      success: true,
      verified,
      failed,
      errors,
      allVerified,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ NFC MFA verification failed", { error: errorMsg });
    return {
      success: false,
      verified,
      failed,
      errors: { _global: errorMsg },
    };
  }
}

/**
 * Check if NFC MFA verification should block operation
 * Returns true if NFC MFA is required and verification failed
 */
export function shouldBlockOnNfcMfaFailure(
  policy: NfcMfaPolicy,
  verificationResult: VerifyNfcMfaSignaturesResult
): boolean {
  if (policy.policy === "disabled" || policy.policy === "optional") {
    return false; // Don't block if NFC MFA is optional or disabled
  }

  if (policy.policy === "required") {
    return !verificationResult.allVerified; // Block if not all verified
  }

  if (policy.policy === "required_for_high_value") {
    return !verificationResult.allVerified; // Block if not all verified
  }

  return false;
}
