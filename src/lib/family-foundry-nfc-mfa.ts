/**
 * Family Foundry NFC MFA Policy Configuration
 *
 * Handles NFC MFA policy setup during federation creation.
 * Integrates with FROST session manager for high-value operation detection.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Privacy-first NFC MFA policy management
 * - Steward threshold-based approval requirements
 * - High-value operation detection with configurable thresholds
 * - Integration with existing NFC MFA infrastructure
 *
 * Phase 3 - FROST & NFC Integration
 */

// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("./supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};

export type NfcMfaPolicyType =
  | "disabled"
  | "optional"
  | "required"
  | "required_for_high_value";

export interface NfcMfaPolicyConfig {
  federationDuid: string;
  policy: NfcMfaPolicyType;
  amountThreshold?: number; // satoshis for high-value detection
  stewardThreshold?: number; // number of stewards required for approval
  requiresNfcMfa?: boolean;
}

export interface NfcMfaPolicyResult {
  success: boolean;
  policyId?: string;
  error?: string;
}

/**
 * Determine high-value operation threshold based on federation size
 * Larger federations have higher thresholds
 */
export function calculateHighValueThreshold(
  federationSize: number
): number {
  // Base threshold: 100,000 satoshis
  const BASE_THRESHOLD = 100000;

  // Scale by federation size: larger federations have higher thresholds
  // 1-3 members: 100k sats
  // 4-6 members: 250k sats
  // 7+ members: 500k sats
  if (federationSize <= 3) {
    return BASE_THRESHOLD;
  }
  if (federationSize <= 6) {
    return BASE_THRESHOLD * 2.5;
  }
  return BASE_THRESHOLD * 5;
}

/**
 * Create NFC MFA policy for federation
 * Sets up policy type, thresholds, and steward requirements
 */
export async function createNfcMfaPolicy(
  config: NfcMfaPolicyConfig
): Promise<NfcMfaPolicyResult> {
  try {
    const supabase = await getSupabaseClient();

    // Validate configuration
    if (!config.federationDuid) {
      return {
        success: false,
        error: "Federation DUID required for NFC MFA policy",
      };
    }

    // Set defaults
    const policy = config.policy || "required_for_high_value";
    const amountThreshold =
      config.amountThreshold || calculateHighValueThreshold(3);
    const stewardThreshold = config.stewardThreshold || 2;

    // Create policy record in family_federations table
    // (NFC MFA policy is stored as columns in family_federations)
    const { data, error } = await supabase
      .from("family_federations")
      .update({
        nfc_mfa_policy: policy,
        nfc_mfa_amount_threshold: amountThreshold,
        nfc_mfa_threshold: stewardThreshold,
      })
      .eq("federation_duid", config.federationDuid)
      .select()
      .single();

    if (error) {
      return {
        success: false,
        error: `Failed to create NFC MFA policy: ${error.message}`,
      };
    }

    if (!data) {
      return {
        success: false,
        error: "Federation not found for NFC MFA policy creation",
      };
    }

    return {
      success: true,
      policyId: data.federation_duid,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `NFC MFA policy creation failed: ${errorMsg}`,
    };
  }
}

/**
 * Determine if operation is high-value based on amount and policy
 */
export function isHighValueOperation(
  amount: number,
  threshold: number
): { isHighValue: boolean; reason: string } {
  if (amount >= threshold) {
    return {
      isHighValue: true,
      reason: `Amount ${amount} sats exceeds threshold ${threshold} sats`,
    };
  }
  return {
    isHighValue: false,
    reason: `Amount ${amount} sats below threshold ${threshold} sats`,
  };
}

