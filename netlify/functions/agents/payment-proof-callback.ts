// BIP-321 Proof-of-Payment Callback Handler
// Handles satnam://payment-proof deep link callbacks from wallets
// Automatically triggers settlement when payment proof is received

import type { HandlerEvent } from "@netlify/functions";
import { getRequestClient } from "../../functions_active/supabase";
import { createErrorResponse, generateRequestId } from "../utils/error-handler";
import {
  verifyLightningPreimage,
  verifyCashuToken,
  verifyFedimintTxid,
} from "../../functions_active/utils/payment-verification";

interface ProofOfPaymentRequest {
  envelope_id: string;
  payment_method: "lightning" | "cashu" | "fedimint" | "ark" | "onchain";
  payment_proof: string; // Hex-encoded preimage, Cashu token JSON, or txid
}

interface ProofOfPaymentResponse {
  success: boolean;
  envelope_id?: string;
  payment_method?: string;
  settlement_triggered?: boolean;
  settlement_status?: string;
  error?: string;
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = getRequestClient();

  try {
    // Parse query parameters from satnam://payment-proof?envelope_id=123&lightning=abc...
    const params = new URLSearchParams(
      event.queryStringParameters as Record<string, string>,
    );

    const envelopeId = params.get("envelope_id");
    if (!envelopeId) {
      return {
        statusCode: 400,
        body: JSON.stringify(
          createErrorResponse(
            "Missing envelope_id parameter",
            undefined,
            requestId,
          ),
        ),
      };
    }

    // Determine payment method and extract proof
    let paymentMethod: ProofOfPaymentRequest["payment_method"] | null = null;
    let paymentProof: string | null = null;

    // Check for each payment method (BIP-321 spec: method name = query param key)
    if (params.has("lightning")) {
      paymentMethod = "lightning";
      paymentProof = params.get("lightning")!;
    } else if (params.has("cashu")) {
      paymentMethod = "cashu";
      paymentProof = params.get("cashu")!;
    } else if (params.has("fedimint")) {
      paymentMethod = "fedimint";
      paymentProof = params.get("fedimint")!;
    } else if (params.has("ark")) {
      paymentMethod = "ark";
      paymentProof = params.get("ark")!;
    } else if (params.has("onchain")) {
      paymentMethod = "onchain";
      paymentProof = params.get("onchain")!;
    }

    if (!paymentMethod || !paymentProof) {
      return {
        statusCode: 400,
        body: JSON.stringify(
          createErrorResponse(
            "Missing payment proof (expected lightning, cashu, fedimint, ark, or onchain parameter)",
            undefined,
            requestId,
          ),
        ),
      };
    }

    // Process proof of payment
    const response = await handleProofOfPayment(
      {
        envelope_id: envelopeId,
        payment_method: paymentMethod,
        payment_proof: paymentProof,
      },
      supabase,
    );

    return {
      statusCode: response.success ? 200 : 400,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Proof-of-payment callback error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify(
        createErrorResponse("Internal server error", undefined, requestId),
      ),
    };
  }
};

async function handleProofOfPayment(
  request: ProofOfPaymentRequest,
  supabase: any,
): Promise<ProofOfPaymentResponse> {
  // 1. Fetch envelope
  const { data: envelope, error: fetchError } = await supabase
    .from("credit_envelopes")
    .select("*")
    .eq("id", request.envelope_id)
    .single();

  if (fetchError || !envelope) {
    return {
      success: false,
      error: "Credit envelope not found",
    };
  }

  // 2. Verify envelope is in pending state
  if (envelope.status !== "pending") {
    return {
      success: false,
      error: `Envelope already ${envelope.status}`,
    };
  }

  // 3. Verify payment proof based on method
  let proofValid = false;
  let verifiedAmount = 0;

  try {
    switch (request.payment_method) {
      case "lightning": {
        // Verify Lightning preimage
        const result = await verifyLightningPreimage(request.payment_proof);
        proofValid = result.valid;
        verifiedAmount = result.amount_sats;
        break;
      }

      case "cashu": {
        // Verify Cashu token
        const result = await verifyCashuToken(request.payment_proof);
        proofValid = result.valid;
        verifiedAmount = result.amount_sats;
        break;
      }

      case "fedimint": {
        // Verify Fedimint transaction
        const result = await verifyFedimintTxid(request.payment_proof);
        proofValid = result.valid;
        verifiedAmount = result.amount_sats;
        break;
      }

      case "ark":
      case "onchain": {
        // TODO: Implement Ark and on-chain verification
        console.warn(
          `${request.payment_method} verification not yet implemented`,
        );
        return {
          success: false,
          error: `${request.payment_method} verification not yet implemented`,
        };
      }
    }
  } catch (error) {
    console.error("Payment proof verification error:", error);
    return {
      success: false,
      error: "Payment proof verification failed",
    };
  }

  if (!proofValid) {
    return {
      success: false,
      error: "Invalid payment proof",
    };
  }

  // 4. Update envelope with payment proof details
  const { error: updateError } = await supabase
    .from("credit_envelopes")
    .update({
      payment_method_used: request.payment_method,
      pop_callback_received_at: new Date().toISOString(),
      actual_spent_sats: verifiedAmount,
    })
    .eq("id", request.envelope_id);

  if (updateError) {
    console.error("Failed to update envelope:", updateError);
    return {
      success: false,
      error: "Failed to record payment proof",
    };
  }

  // 5. Trigger automatic settlement after successful payment verification
  // Update envelope status to "settled" and trigger reputation updates
  try {
    // Update envelope status to settled
    const { error: settlementError } = await supabase
      .from("credit_envelopes")
      .update({
        status: "settled",
        settled_at: new Date().toISOString(),
      })
      .eq("id", request.envelope_id);

    if (settlementError) {
      console.error("Failed to update envelope to settled:", settlementError);
      return {
        success: false,
        error: "Failed to settle envelope",
        envelope_id: request.envelope_id,
      };
    }

    // Fetch envelope details for reputation update
    const { data: envelope, error: fetchError } = await supabase
      .from("credit_envelopes")
      .select(
        `
        *,
        user_identities!inner(
          id,
          npub,
          agent_profiles(
            id,
            reputation_score,
            credit_limit_sats,
            total_credits_issued_sats,
            total_credits_settled_sats
          )
        )
      `,
      )
      .eq("id", request.envelope_id)
      .single();

    if (fetchError || !envelope) {
      console.error(
        "Failed to fetch envelope for reputation update:",
        fetchError,
      );
      // Settlement succeeded but reputation update failed - log and continue
      return {
        success: true,
        envelope_id: request.envelope_id,
        payment_method: request.payment_method,
        settlement_triggered: true,
        settlement_status: "settled_reputation_update_pending",
      };
    }

    // Update agent reputation and credit limits
    const agentProfile = envelope.user_identities?.agent_profiles;
    if (agentProfile) {
      const reputationDelta = envelope.success ? 10 : -5; // Reward success, penalize failure
      const newReputation = Math.max(
        0,
        (agentProfile.reputation_score || 0) + reputationDelta,
      );
      const newCreditLimit = Math.min(
        1_000_000, // Max 1M sats credit limit
        (agentProfile.credit_limit_sats || 0) + (envelope.success ? 1000 : 0),
      );

      const { error: reputationError } = await supabase
        .from("agent_profiles")
        .update({
          reputation_score: newReputation,
          credit_limit_sats: newCreditLimit,
          total_credits_settled_sats:
            (agentProfile.total_credits_settled_sats || 0) +
            envelope.amount_sats,
          updated_at: new Date().toISOString(),
        })
        .eq("id", agentProfile.id);

      if (reputationError) {
        console.error("Failed to update agent reputation:", reputationError);
      } else {
        console.log(
          `✅ Updated agent reputation: ${newReputation} (Δ${reputationDelta}), credit limit: ${newCreditLimit} sats`,
        );
      }
    }

    return {
      success: true,
      envelope_id: request.envelope_id,
      payment_method: request.payment_method,
      settlement_triggered: true,
      settlement_status: "settled",
    };
  } catch (error) {
    console.error("Settlement trigger failed:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Settlement trigger failed",
      envelope_id: request.envelope_id,
    };
  }
}
