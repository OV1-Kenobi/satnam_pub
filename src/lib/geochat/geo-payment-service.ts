/**
 * Phase 4: Geo Payment Service
 *
 * Service layer for geo-room payment integration.
 * Handles account type detection, payment context building,
 * and routing to appropriate payment flows.
 */

import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { supabase } from "../supabase";
import { truncateGeohashForPrivacy } from "./geo-room-service";
import type {
  AccountContext,
  AccountType,
  GeoPaymentContext,
  GeoPaymentRequest,
  GeoPaymentResult,
  GeoPaymentTrustLevel,
  PaymentMethodHint,
  PaymentPrivacyLevel,
} from "./geo-payment-types";
import { DEFAULT_TRUST_THRESHOLDS, GeoPaymentError } from "./geo-payment-types";

// ============================================================================
// Account Context Detection
// ============================================================================

/**
 * Detect user's account type and federation context.
 * Queries database to determine if user is an individual or federation member.
 *
 * @param userNpub - User's Nostr public key
 * @returns Account context for payment modal routing
 */
export async function getAccountContext(
  userNpub: string
): Promise<AccountContext> {
  try {
    // First, try to get federation membership from user_identities
    const { data: identity } = await supabase
      .from("user_identities")
      .select("family_federation_id, role")
      .eq("npub", userNpub)
      .maybeSingle();

    if (identity?.family_federation_id) {
      // User is a federation member - get federation details
      const { data: federation } = await supabase
        .from("family_federations")
        .select("federation_name, guardian_approval_threshold")
        .eq("id", identity.family_federation_id)
        .maybeSingle();

      return {
        type: "federation" as AccountType,
        userNpub,
        federationId: identity.family_federation_id,
        federationName: federation?.federation_name ?? undefined,
        hasGuardianApproval: (federation?.guardian_approval_threshold ?? 0) > 0,
      };
    }

    // Fallback: check family_members table
    const { data: member } = await supabase
      .from("family_members")
      .select("family_federation_id, family_role")
      .eq("member_npub", userNpub)
      .eq("is_active", true)
      .maybeSingle();

    if (member?.family_federation_id) {
      const { data: federation } = await supabase
        .from("family_federations")
        .select("federation_name, guardian_approval_threshold")
        .eq("id", member.family_federation_id)
        .maybeSingle();

      return {
        type: "federation" as AccountType,
        userNpub,
        federationId: member.family_federation_id,
        federationName: federation?.federation_name ?? undefined,
        hasGuardianApproval: (federation?.guardian_approval_threshold ?? 0) > 0,
      };
    }

    // User is an individual (not in a federation)
    return {
      type: "individual" as AccountType,
      userNpub,
    };
  } catch (error) {
    // Default to individual on error (fail safe)
    console.error("[geo-payment] Error detecting account context:", error);
    return {
      type: "individual" as AccountType,
      userNpub,
    };
  }
}

// ============================================================================
// Payment Context Building
// ============================================================================

/**
 * Build a GeoPaymentContext from a geo-room message.
 *
 * @param message - Nostr event from geo-room
 * @param originGeohash - Full geohash of the geo-room
 * @param userNpub - Current user's npub (sender)
 * @param trustLevel - Known trust level of recipient
 * @returns Payment context ready for modal display
 */
export async function buildGeoPaymentContext(
  message: NostrEvent,
  originGeohash: string,
  userNpub: string,
  trustLevel: GeoPaymentTrustLevel = "unknown"
): Promise<GeoPaymentContext> {
  // Get account context for modal routing
  const accountContext = await getAccountContext(userNpub);

  // Extract recipient display name from content or tags
  let recipientDisplayName: string | undefined;
  const profileTag = message.tags.find((t) => t[0] === "profile");
  if (profileTag?.[1]) {
    try {
      const profile = JSON.parse(profileTag[1]);
      recipientDisplayName = profile.name || profile.display_name;
    } catch {
      // Ignore parse errors
    }
  }

  // Look for Lightning address in profile or nip05 tag
  let recipientLightningAddress: string | undefined;
  const nip05Tag = message.tags.find((t) => t[0] === "nip05");
  if (nip05Tag?.[1]) {
    // NIP-05 identifiers can often be used as Lightning addresses
    recipientLightningAddress = nip05Tag[1];
  }

  // Convert hex pubkey to npub
  const recipientNpub = nip19.npubEncode(message.pubkey);

  return {
    originGeohash: truncateGeohashForPrivacy(originGeohash),
    recipientNpub,
    recipientDisplayName,
    recipientLightningAddress,
    trustLevel,
    paymentMethodHint: "auto" as PaymentMethodHint,
    accountContext,
  };
}

// ============================================================================
// Trust-Aware Safeguards
// ============================================================================

import type { PaymentWarning, TrustThresholdConfig } from "./geo-payment-types";

/**
 * Check if a payment should show a warning or be blocked based on trust level.
 *
 * @param trustLevel - Recipient's trust level
 * @param amount - Payment amount in satoshis
 * @param thresholds - Optional custom thresholds (defaults to DEFAULT_TRUST_THRESHOLDS)
 * @returns Warning info if applicable, null if payment is safe
 */
export function getPaymentWarning(
  trustLevel: GeoPaymentTrustLevel,
  amount: number,
  thresholds: TrustThresholdConfig = DEFAULT_TRUST_THRESHOLDS
): PaymentWarning | null {
  // Verified contacts: no automatic warnings or blocks
  if (trustLevel === "verified") {
    return null;
  }

  // Known contacts: warn at high amounts, no blocks
  if (trustLevel === "known") {
    if (amount > thresholds.knownWarnThreshold) {
      return {
        severity: "warning",
        message: `Large payment to known contact. Amount (${amount} sats) exceeds ${thresholds.knownWarnThreshold} sats threshold.`,
        trustLevel,
        amount,
        threshold: thresholds.knownWarnThreshold,
        shouldBlock: false,
      };
    }
    return null;
  }

  // Unknown contacts: warn at lower amounts, block at high amounts
  if (amount > thresholds.unknownBlockThreshold) {
    return {
      severity: "block",
      message: `Payment blocked. Amount (${amount} sats) to unknown contact exceeds ${thresholds.unknownBlockThreshold} sats limit. Verify contact first.`,
      trustLevel,
      amount,
      threshold: thresholds.unknownBlockThreshold,
      shouldBlock: true,
    };
  }

  if (amount > thresholds.unknownWarnThreshold) {
    return {
      severity: "warning",
      message: `Caution: Sending ${amount} sats to an unknown contact. Consider verifying their identity first.`,
      trustLevel,
      amount,
      threshold: thresholds.unknownWarnThreshold,
      shouldBlock: false,
    };
  }

  return null;
}

// ============================================================================
// Payment Request Creation
// ============================================================================

/**
 * Create a geo-room payment request.
 * Validates trust safeguards and routes to appropriate payment flow.
 *
 * @param request - Payment request with context, amount, and options
 * @returns Payment result (success or error)
 * @throws GeoPaymentError if payment is blocked by trust policy
 */
export async function createGeoPaymentRequest(
  request: GeoPaymentRequest
): Promise<GeoPaymentResult> {
  const {
    context,
    amount,
    memo,
    privacyLevel = "auto",
    maxFee = 1000,
  } = request;

  // Step 1: Check trust safeguards
  const warning = getPaymentWarning(context.trustLevel, amount);
  if (warning?.shouldBlock) {
    throw new GeoPaymentError(warning.message, "TRUST_BLOCKED", {
      trustLevel: context.trustLevel,
      amount,
      threshold: warning.threshold,
    });
  }

  // Step 2: Route based on account type
  if (context.accountContext.type === "federation") {
    return await processFederationPayment(request, maxFee);
  } else {
    return await processIndividualPayment(request, maxFee);
  }
}

/**
 * Process payment for individual (non-federation) user.
 * Uses privacy-enhanced-payments API directly.
 */
async function processIndividualPayment(
  request: GeoPaymentRequest,
  maxFee: number
): Promise<GeoPaymentResult> {
  const { context, amount, memo, privacyLevel } = request;

  try {
    const response = await fetch("/api/family/privacy-enhanced-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        privacyLevel: privacyLevel === "auto" ? "encrypted" : privacyLevel,
        amount,
        recipient: context.recipientLightningAddress || context.recipientNpub,
        memo: memo || `Geo-room payment from ${context.originGeohash}`,
        routingPreference: context.paymentMethodHint,
        maxFee,
        // Geo-context metadata (privacy-protected)
        geoContext: {
          originGeohash: context.originGeohash,
          trustLevel: context.trustLevel,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Payment failed",
        errorType:
          data.code === "INSUFFICIENT_FUNDS" ? "insufficient_funds" : "unknown",
      };
    }

    return {
      success: data.success,
      transactionId: data.paymentId,
      routingUsed: data.routingUsed,
      fee: data.fee,
      error: data.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
      errorType: "network_error",
    };
  }
}

/**
 * Process payment for federation member.
 * Routes through family payment approval workflow.
 */
async function processFederationPayment(
  request: GeoPaymentRequest,
  maxFee: number
): Promise<GeoPaymentResult> {
  const { context, amount, memo, privacyLevel } = request;

  try {
    // Use family fedimint/payment API for federation members
    const response = await fetch("/api/family/fedimint/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        familyId: context.accountContext.federationId,
        amount,
        recipient: context.recipientLightningAddress || context.recipientNpub,
        memo: memo || `Geo-room payment from ${context.originGeohash}`,
        privacyLevel: privacyLevel === "auto" ? "encrypted" : privacyLevel,
        maxFee,
        // Geo-context for audit trail
        geoContext: {
          originGeohash: context.originGeohash,
          trustLevel: context.trustLevel,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Check for guardian approval required
      if (data.code === "GUARDIAN_APPROVAL_REQUIRED") {
        return {
          success: false,
          error: "Payment requires guardian approval",
          errorType: "authorization_failed",
        };
      }
      return {
        success: false,
        error: data.error || "Payment failed",
        errorType:
          data.code === "INSUFFICIENT_FUNDS" ? "insufficient_funds" : "unknown",
      };
    }

    return {
      success: data.success,
      transactionId: data.transactionId || data.paymentId,
      routingUsed: data.routingUsed || "fedimint",
      fee: data.fee,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
      errorType: "network_error",
    };
  }
}
