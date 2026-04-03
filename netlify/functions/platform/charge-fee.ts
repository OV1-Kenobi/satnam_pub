// ARCHITECTURE: Netlify Function (ESM) — uses process.env, server-side Supabase
import { getRequestClient } from "../../functions_active/supabase";
import {
  createErrorResponse,
  logErrorWithContext,
  generateRequestId,
} from "../utils/error-handler";
import type { HandlerEvent, HandlerContext } from "@netlify/functions";
import {
  verifyLightningPayment,
  verifyCashuToken,
  verifyFedimintTxid,
  generateCashuPaymentRequest,
  generateFedimintPaymentAddress,
} from "../../functions_active/utils/payment-verification";

// ── Typed interfaces (no `any` types) ──────────────────────────
// MONETIZATION UPDATE: Updated action types to match anti-spam fee schedule
type PlatformActionType =
  | "agent_account_creation"
  | "agent_account_init_event"
  | "agent_status_update_event"
  | "agent_attestation_light"
  | "agent_attestation_strong"
  | "agent_badge_award_event"
  | "agent_dm_bundle"
  | "contact_add"
  | "credit_envelope_request"
  | "task_record_create"
  | "profile_update";

interface ChargeFeeRequest {
  agent_id: string;
  agent_npub?: string; // Required for free tier claim tracking
  action_type: PlatformActionType;
  payment_protocol: "lightning" | "cashu" | "fedimint";
  payment_proof?: string;
  related_entity_id?: string;
  user?: { id: string; roles?: string[]; npub?: string };
}

// SECURITY ADDITION: Rate limiting configuration
// Prevents abuse of payment endpoints and resource exhaustion attacks
// Implementation: Use Netlify Edge rate limiting or custom Redis-based limiter
interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  burstAllowance: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  charge_fee: {
    maxRequestsPerMinute: 10,
    maxRequestsPerHour: 100,
    burstAllowance: 5,
  },
  issue_tokens: {
    maxRequestsPerMinute: 5,
    maxRequestsPerHour: 50,
    burstAllowance: 2,
  },
  redeem_token: {
    maxRequestsPerMinute: 20,
    maxRequestsPerHour: 200,
    burstAllowance: 10,
  },
};

// TODO: Implement rate limiting middleware
// - Per auth.uid() for authenticated requests
// - Per IP address for anonymous requests
// - Per npub for agent-specific limits
// - Return 429 Too Many Requests with Retry-After header

/** Cashu payment request structure (replaces `any`) */
interface CashuPaymentRequest {
  mint_url: string;
  amount_sats: number;
  memo: string;
  payment_id: string;
}

// UX IMPROVEMENT: Standardized economic failure response
// Provides machine-readable hints for agents to recover from out-of-funds/tokens
interface EconomicFailureHint {
  reason:
    | "INSUFFICIENT_TOKENS"
    | "INSUFFICIENT_FUNDS"
    | "BOND_REQUIRED"
    | "RATE_LIMITED";
  required_sats?: number;
  suggested_action:
    | "BUY_TOKENS"
    | "TOP_UP_BOND"
    | "WAIT_AND_RETRY"
    | "CONTACT_SUPPORT";
  retry_after_seconds?: number;
  details?: string;
}

interface ChargeFeeResponse {
  fee_required: boolean;
  fee_sats?: number;
  payment_invoice?: string;
  cashu_payment_request?: CashuPaymentRequest;
  fedimint_payment_address?: string;
  payment_id?: string;
  free_tier_used?: boolean;
  allocation_number?: number;
  message?: string;
  economic_failure?: EconomicFailureHint;
}

import { verify } from "jsonwebtoken"; // Import JWT verification

export const handler = async (event: HandlerEvent, context: HandlerContext) => {
  const requestId = generateRequestId();
  const supabase = getRequestClient();

  let request: ChargeFeeRequest;
  try {
    request = JSON.parse(event.body || "{}");
  } catch {
    return createErrorResponse("Invalid request body", undefined, requestId);
  }

  const authHeader = event.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer token

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "No token provided" }),
    };
  }

  if (!process.env.JWT_SECRET) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Server misconfiguration: missing JWT_SECRET",
      }),
    };
  }

  try {
    const decoded = verify(token, process.env.JWT_SECRET) as any;
    const userId = decoded?.sub || decoded?.uid || decoded?.id;
    const roles = decoded?.roles || decoded?.role || decoded?.roles || [];
    request.user = {
      id: String(userId),
      roles: Array.isArray(roles) ? roles : [String(roles)],
    };
  } catch (err) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Invalid token" }),
    };
  }

  const { user } = request;
  // Basic permission check: allow if acting on own agent_id or JWT contains admin/billing roles
  const checkUserPermission = async (
    _supabaseClient: ReturnType<typeof getRequestClient>,
    userId: string | undefined,
    action: PlatformActionType,
  ) => {
    if (!userId) return false;
    if (userId === request.agent_id) return true;
    const userRoles = request.user?.roles || [];
    const allowedRoles = ["admin", "platform_admin", "billing"];
    if (userRoles.some((r) => allowedRoles.includes(r))) return true;
    // Fallback: deny
    return false;
  };

  const hasPermission = await checkUserPermission(
    supabase,
    user?.id,
    request.action_type,
  );

  if (!hasPermission) {
    return { statusCode: 403, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  // 1. Check if agent qualifies for free tier (first 210 agents only for account creation)
  //    ATOMIC: Uses Supabase RPC to atomically claim the lowest unclaimed slot,
  //    preventing TOCTOU race conditions when concurrent requests compete for slots.
  //    SECURITY: Per-human limits enforced in RPC to prevent Sybil farming
  if (request.action_type === "agent_account_creation") {
    // FIXED: RPC returns TABLE, so data is an array. Extract first element.
    // FIXED: Pass actual npub (from request or user_identities lookup), not UUID
    const { data: claimedSlots, error: claimError } = await supabase.rpc(
      "claim_free_tier_slot",
      {
        p_agent_id: request.agent_id,
        p_agent_npub: request.agent_npub || null,
      },
    );

    const claimedSlot = claimedSlots?.[0];

    if (!claimError && claimedSlot) {
      // Record as free transaction
      await supabase.from("platform_revenue").insert({
        payer_agent_id: request.agent_id,
        action_type: request.action_type,
        fee_sats: 0,
        payment_protocol: "free_tier",
        payment_status: "paid",
        payment_proof: `free_tier_slot_${claimedSlot.allocation_number}`,
        paid_at: new Date(),
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          fee_required: false,
          free_tier_used: true,
          allocation_number: claimedSlot.allocation_number,
          message: `Free tier used! You claimed slot ${claimedSlot.allocation_number} of 210.`,
        } satisfies Partial<ChargeFeeResponse>),
      };
    }
    // If claim failed or no slots left, fall through to paid flow
  }

  // 2. Lookup fee for this action
  const { data: feeSchedule } = await supabase
    .from("platform_fee_schedule")
    .select("fee_sats")
    .eq("action_type", request.action_type)
    .eq("active", true)
    .single();

  if (!feeSchedule) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Unknown action type" }),
    };
  }

  const feeSats = feeSchedule.fee_sats;

  // 3. If payment proof provided, verify it
  if (request.payment_proof) {
    let paymentValid = false;
    let paymentHash: string | undefined;

    if (request.payment_protocol === "lightning") {
      const lnVerify = await verifyLightningPayment(request.payment_proof);
      paymentValid = lnVerify.valid && lnVerify.amount_sats >= feeSats;
      paymentHash = lnVerify.payment_hash;
    } else if (request.payment_protocol === "cashu") {
      const cashuVerify = await verifyCashuToken(request.payment_proof);
      paymentValid = cashuVerify.valid && cashuVerify.amount_sats >= feeSats;
      paymentHash = cashuVerify.token_hash;
    } else if (request.payment_protocol === "fedimint") {
      const fediVerify = await verifyFedimintTxid(request.payment_proof);
      paymentValid = fediVerify.valid && fediVerify.amount_sats >= feeSats;
      paymentHash = fediVerify.txid;
    }

    if (paymentValid) {
      // Payment verified - record revenue
      await supabase.from("platform_revenue").insert({
        payer_agent_id: request.agent_id,
        action_type: request.action_type,
        fee_sats: feeSats,
        payment_protocol: request.payment_protocol,
        payment_hash: paymentHash,
        payment_proof: request.payment_proof,
        payment_status: "paid",
        related_entity_id: request.related_entity_id,
        paid_at: new Date(),
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          fee_required: true,
          fee_sats: feeSats,
          payment_id: paymentHash,
          message: "Payment verified and recorded",
        } satisfies ChargeFeeResponse),
      };
    } else {
      // Payment verification failed
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Payment verification failed",
          economic_failure: {
            reason: "INSUFFICIENT_FUNDS",
            required_sats: feeSats,
            suggested_action: "BUY_TOKENS",
            details: `Payment proof verification failed for ${request.payment_protocol} payment`,
          },
        }),
      };
    }
  }

  // 4. No payment proof provided - generate payment request
  let paymentRequest: string;
  let paymentId: string;

  if (request.payment_protocol === "cashu") {
    const cashuRequest = await generateCashuPaymentRequest(feeSats, {
      agent_id: request.agent_id,
      action_type: request.action_type,
    });
    paymentRequest = cashuRequest;
    paymentId = `cashu_${Date.now()}`;
  } else if (request.payment_protocol === "fedimint") {
    const fediAddress = await generateFedimintPaymentAddress(
      feeSats,
      `Platform fee for ${request.action_type}`,
    );
    paymentRequest = fediAddress;
    paymentId = `fedimint_${Date.now()}`;
  } else {
    // Lightning - generate invoice (placeholder implementation)
    paymentRequest = `lightning_invoice_placeholder_${Date.now()}`;
    paymentId = `lightning_${Date.now()}`;
  }

  // Record pending payment
  const { error: insertError } = await supabase
    .from("platform_revenue")
    .insert({
      payer_agent_id: request.agent_id,
      action_type: request.action_type,
      fee_sats: feeSats,
      payment_protocol: request.payment_protocol,
      payment_hash: paymentId,
      payment_status: "pending",
      related_entity_id: request.related_entity_id,
    });

  if (insertError) {
    logErrorWithContext(insertError, { requestId, component: "charge-fee" });
    return createErrorResponse(
      "Failed to create payment record",
      undefined,
      requestId,
    );
  }

  // Return payment request
  const response: ChargeFeeResponse = {
    fee_required: true,
    fee_sats: feeSats,
    payment_id: paymentId,
  };

  if (request.payment_protocol === "cashu") {
    response.cashu_payment_request = {
      mint_url: "https://mint.satnam.pub", // TODO: Make configurable
      amount_sats: feeSats,
      memo: `Platform fee for ${request.action_type}`,
      payment_id: paymentId,
    };
  } else if (request.payment_protocol === "fedimint") {
    response.fedimint_payment_address = paymentRequest;
  } else {
    response.payment_invoice = paymentRequest;
  }

  return {
    statusCode: 200,
    body: JSON.stringify(response),
  };
};
