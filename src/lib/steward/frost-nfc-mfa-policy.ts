/**
 * FROST NFC MFA Policy Enforcement
 * Implements policy-based NFC MFA enforcement for FROST signing operations
 *
 * Policies:
 * - disabled: NFC MFA not used
 * - optional: NFC MFA collected if available, doesn't block operation
 * - required: NFC MFA mandatory, blocks operation if verification fails
 * - required_for_high_value: NFC MFA required for high-value operations
 *
 * Logging: Uses precise zero-knowledge logging strategy (see nfc-mfa-privacy-logger.ts)
 */

import {
  logNfcMfaEvent,
  truncateHash,
  anonymizeStewardDuid,
  initializeSessionAnonymization,
} from "./nfc-mfa-privacy-logger";

// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("../supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};

export interface FamilyNfcMfaPolicy {
  policy: "disabled" | "optional" | "required" | "required_for_high_value";
  amountThreshold: number; // in satoshis
  stewardThreshold: "all" | "threshold";
}

export interface HighValueOperationCheck {
  isHighValue: boolean;
  amount: number;
  threshold: number;
}

/**
 * Get complete NFC MFA policy configuration for a family
 * Includes policy type, amount threshold, and steward consensus requirement
 */
export async function getFamilyNfcMfaPolicy(
  familyId: string
): Promise<FamilyNfcMfaPolicy> {
  try {
    const supabase = await getSupabaseClient();

    const query = supabase
      .from("family_federations")
      .select("nfc_mfa_policy, nfc_mfa_amount_threshold, nfc_mfa_threshold")
      .eq("federation_duid", familyId);

    const { data, error } = await query.single();

    if (error) {
      logNfcMfaEvent("warn", "⚠️ Failed to fetch family NFC MFA policy", {
        familyId,
        error: error.message,
      });
      // Default to disabled if policy not found
      return {
        policy: "disabled",
        amountThreshold: 1000000,
        stewardThreshold: "all",
      };
    }

    const policy = data?.nfc_mfa_policy || "disabled";
    const amountThreshold = data?.nfc_mfa_amount_threshold || 1000000;
    const stewardThreshold = data?.nfc_mfa_threshold || "all";

    logNfcMfaEvent("log", "✅ Family NFC MFA policy retrieved", {
      familyId,
      policy,
      amountThreshold,
      stewardThreshold,
    });

    return { policy, amountThreshold, stewardThreshold };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logNfcMfaEvent("error", "❌ Family NFC MFA policy retrieval failed", {
      error: errorMsg,
    });
    return {
      policy: "disabled",
      amountThreshold: 1000000,
      stewardThreshold: "all",
    };
  }
}

/**
 * Check if an operation is high-value based on family policy
 * Used for 'required_for_high_value' policy enforcement
 */
export function isHighValueOperation(
  amount: number,
  threshold: number
): HighValueOperationCheck {
  const isHighValue = amount > threshold;

  logNfcMfaEvent("log", "💰 High-value operation check", {
    amount,
    threshold,
    isHighValue,
  });

  return {
    isHighValue,
    amount,
    threshold,
  };
}

/**
 * Determine if NFC MFA should be enforced for an operation
 * Takes into account policy type and operation amount
 */
export function shouldEnforceNfcMfa(
  policy: FamilyNfcMfaPolicy,
  operationAmount?: number
): boolean {
  if (policy.policy === "disabled") {
    return false; // NFC MFA not used
  }

  if (policy.policy === "optional") {
    return false; // NFC MFA optional, doesn't block
  }

  if (policy.policy === "required") {
    return true; // NFC MFA always required
  }

  if (policy.policy === "required_for_high_value") {
    if (operationAmount === undefined) {
      // If amount not provided, enforce NFC MFA to be safe
      return true;
    }
    return isHighValueOperation(operationAmount, policy.amountThreshold)
      .isHighValue;
  }

  return false;
}

/**
 * Log NFC MFA event to audit log database
 * Tracks all NFC MFA-related events for compliance and debugging
 */
export async function logNfcMfaEventToDatabase(
  sessionId: string,
  familyId: string,
  eventType:
    | "policy_retrieved"
    | "signature_collected"
    | "signature_verified"
    | "signature_failed"
    | "operation_blocked"
    | "operation_allowed",
  participantId: string,
  operationHash?: string,
  policy?: string,
  errorMessage?: string
): Promise<void> {
  try {
    const supabase = await getSupabaseClient();

    const { error } = await supabase.from("nfc_mfa_audit_log").insert({
      session_id: sessionId,
      family_id: familyId,
      event_type: eventType,
      participant_id: participantId,
      operation_hash: operationHash,
      policy,
      error_message: errorMessage,
      created_at: new Date().toISOString(),
    });

    if (error) {
      logNfcMfaEvent("warn", "⚠️ Failed to log NFC MFA event", {
        sessionId,
        eventType,
        error: error.message,
      });
      return;
    }

    logNfcMfaEvent("log", "📝 NFC MFA event logged", {
      sessionId,
      eventType,
      participantId,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logNfcMfaEvent("error", "❌ NFC MFA event logging failed", {
      error: errorMsg,
    });
  }
}

/**
 * Get NFC MFA audit log for a session
 * Returns all NFC MFA events for a specific FROST signing session
 */
export async function getSessionNfcMfaAuditLog(
  sessionId: string
): Promise<any[]> {
  try {
    const supabase = await getSupabaseClient();

    const { data, error } = await supabase
      .from("nfc_mfa_audit_log")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      logNfcMfaEvent("warn", "⚠️ Failed to fetch NFC MFA audit log", {
        sessionId,
        error: error.message,
      });
      return [];
    }

    logNfcMfaEvent("log", "📋 NFC MFA audit log retrieved", {
      sessionId,
      eventCount: data?.length || 0,
    });

    return data || [];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logNfcMfaEvent("error", "❌ NFC MFA audit log retrieval failed", {
      error: errorMsg,
    });
    return [];
  }
}

/**
 * Determine if operation should be blocked based on NFC MFA verification results
 * Takes into account policy enforcement and steward consensus requirements
 */
export function shouldBlockOperation(
  policy: FamilyNfcMfaPolicy,
  nfcVerified: number,
  nfcFailed: number,
  requiredThreshold: number
): boolean {
  if (policy.policy === "disabled" || policy.policy === "optional") {
    return false; // Don't block if NFC MFA is optional or disabled
  }

  if (policy.policy === "required") {
    // All stewards must provide NFC MFA
    if (policy.stewardThreshold === "all") {
      return nfcFailed > 0; // Block if any steward failed
    }
    // Only threshold number of stewards need NFC MFA
    return nfcVerified < requiredThreshold;
  }

  if (policy.policy === "required_for_high_value") {
    // Same logic as required for high-value operations
    if (policy.stewardThreshold === "all") {
      return nfcFailed > 0;
    }
    return nfcVerified < requiredThreshold;
  }

  return false;
}
