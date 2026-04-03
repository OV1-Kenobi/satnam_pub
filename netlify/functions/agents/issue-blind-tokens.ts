// ARCHITECTURE: Netlify Function (ESM)
import type { HandlerEvent } from "@netlify/functions";
import { blindSign } from "../../../src/lib/crypto/blind-signatures";
import type { BlindTokenType } from "../../../types/agent-tokens";
import { getRequestClient } from "../../functions_active/supabase";
import {
  generateRequestId,
  type EconomicFailureHint,
} from "../utils/error-handler";

interface IssueBlindTokensRequest {
  agent_id: string;
  token_type: BlindTokenType;
  quantity: number;
  blinded_messages: string[];
  payment_proof?: string;
  payment_protocol?: "lightning" | "cashu" | "fedimint";
  token_value?: number; // MONETIZATION UPDATE: Support bundled tokens (e.g., dm_bundle with value=10)
}

interface IssueBlindTokensResponse {
  tokens_issued: number;
  blind_signatures: string[];
  keypair_public_key: string;
  expires_at: Date;
  economic_failure?: EconomicFailureHint; // UX IMPROVEMENT: Standardized error handling
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = getRequestClient();
  const request: IssueBlindTokensRequest = JSON.parse(event.body || "{}");

  // SECURITY: Rate limiting check (TODO: implement middleware)
  // See RATE_LIMITS configuration in Task 0.2
  // Should enforce: 5 requests/minute, 50 requests/hour per agent

  // 1. Verify payment for tokens
  // MONETIZATION UPDATE: Support token bundles (token_value > 1)
  // Example: agent_dm_bundle costs 21 sats but has token_value=10 (10 DMs)
  const tokenValue = request.token_value || 1;
  const feePerToken = await getFeeForAction(request.token_type);
  const totalFee = feePerToken * request.quantity;

  if (request.payment_proof) {
    const paymentValid = await verifyPayment(
      request.payment_proof,
      request.payment_protocol || "lightning",
      totalFee,
    );
    if (!paymentValid) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Invalid payment proof",
          economic_failure: {
            reason: "INSUFFICIENT_FUNDS",
            required_sats: totalFee,
            suggested_action: "BUY_TOKENS",
            details: "Payment proof verification failed",
          },
        }),
      };
    }

    // Record platform revenue
    await supabase.from("platform_revenue").insert({
      payer_agent_id: request.agent_id,
      action_type: `blind_token_purchase_${request.token_type}`,
      fee_sats: totalFee,
      payment_protocol: request.payment_protocol || "lightning", // FIXED: Add required field
      payment_proof: request.payment_proof,
      payment_status: "paid",
      paid_at: new Date(),
    });
  } else {
    // Generate payment request
    const paymentRequest = await generatePaymentRequest(totalFee, {
      purpose: `${request.quantity}x ${request.token_type} tokens (value=${tokenValue} each)`,
    });

    return {
      statusCode: 402, // Payment Required
      body: JSON.stringify({
        error: "Payment required",
        fee_sats: totalFee,
        payment_request: paymentRequest,
        economic_failure: {
          reason: "INSUFFICIENT_FUNDS",
          required_sats: totalFee,
          suggested_action: "BUY_TOKENS",
          details: `Need ${totalFee} sats for ${request.quantity} tokens`,
        },
      }),
    };
  }

  // 2. Get active blind signing keypair
  const { data: keypair } = await supabase
    .from("platform_blind_keypairs")
    .select("id, public_key, private_key_encrypted")
    .eq("keypair_purpose", "capability_tokens")
    .eq("active", true)
    .single();

  if (!keypair) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "No active signing keypair" }),
    };
  }

  const privateKey = decryptKeypair(keypair.private_key_encrypted);

  // 3. Sign each blinded message
  const blindSignatures: string[] = [];
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  for (const blindedMessage of request.blinded_messages) {
    // Platform signs blinded message (doesn't know what it's signing)
    const signature = blindSign(blindedMessage, privateKey);
    blindSignatures.push(signature);

    // Store token record (but we don't know the unblinded token yet)
    // MONETIZATION UPDATE: Support token_value > 1 for bundled actions (e.g., DM bundles)
    await supabase.from("agent_blind_tokens").insert({
      token_hash: null, // Will be revealed on redemption
      token_type: request.token_type,
      token_value: tokenValue, // Support bundles: 1 token = N actions
      issued_to_agent_id: request.agent_id,
      expires_at: expiresAt,
      status: "issued",
      blinded_message: blindedMessage,
      blind_signature: signature,
      keypair_id: keypair.id,
    });
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      tokens_issued: request.quantity,
      blind_signatures: blindSignatures,
      keypair_public_key: keypair.public_key,
      expires_at: expiresAt,
    }),
  };
};

// Helper functions (import from existing utilities)
async function getFeeForAction(actionType: string): Promise<number> {
  switch (actionType) {
    case "event_post":
    case "dm_send":
      return 21;
    case "contact_add":
      return 50;
    case "task_create":
      return 150;
    default:
      return 21;
  }
}

async function verifyPayment(
  paymentProof: string,
  protocol: string,
  amount: number,
): Promise<boolean> {
  // This should be imported from payment-verification.ts
  // For now, return true for testing
  return true;
}

async function generatePaymentRequest(
  amount: number,
  options: { purpose?: string },
): Promise<string> {
  // This should be imported from payment-verification.ts
  // For now, return a mock payment request
  return `lnbc${amount}0n1p0xlxtp...`;
}

function decryptKeypair(encryptedPrivateKey: string): string {
  // This should be imported from payment-verification.ts
  // For now, return a mock private key for testing
  return "mock_private_key_for_testing";
}
