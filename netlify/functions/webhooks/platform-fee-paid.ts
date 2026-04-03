// ARCHITECTURE: Netlify Function (ESM) — webhook handler
import { createClient } from "@supabase/supabase-js";
import {
  createErrorResponse,
  logError,
  generateRequestId,
} from "../functions_active/utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";
import {
  timingSafeEqualHex,
  decodeCashuToken,
  emitEvent,
} from "../functions_active/utils/payment-verification";

interface WebhookPayload {
  payment_hash?: string;
  cashu_token?: string;
  fedimint_txid?: string;
  proof?: string;
  preimage?: string;
  extra?: { agent_id: string; action_type: string };
  metadata?: { agent_id: string; action_type: string };
}

/**
 * W1: Verify webhook signature using HMAC-SHA256
 * Prevents unauthorized webhook calls
 */
async function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body),
  );

  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqualHex(signature, expectedSignature);
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );

  // W1: Verify webhook signature
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    logError(new Error("WEBHOOK_SECRET not configured"), {
      requestId,
      endpoint: "platform-fee-paid",
    });
    return createErrorResponse(500, "Webhook configuration error", requestId);
  }

  const signature = event.headers["x-webhook-signature"] || null;
  const isValid = await verifyWebhookSignature(
    event.body || "",
    signature,
    webhookSecret,
  );

  if (!isValid) {
    logError(new Error("Invalid webhook signature"), {
      requestId,
      endpoint: "platform-fee-paid",
      signature,
    });
    return createErrorResponse(401, "Unauthorized webhook call", requestId);
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return createErrorResponse(400, "Invalid webhook payload", requestId);
  }

  let paymentHash: string | undefined;
  let agentId: string | undefined;
  let actionType: string | undefined;

  if (payload.payment_hash) {
    paymentHash = payload.payment_hash;
    agentId = payload.extra?.agent_id;
    actionType = payload.extra?.action_type;
  } else if (payload.cashu_token) {
    const decoded = await decodeCashuToken(payload.cashu_token);
    paymentHash = decoded.token_hash;
    agentId = payload.metadata?.agent_id;
    actionType = payload.metadata?.action_type;
  } else if (payload.fedimint_txid) {
    paymentHash = payload.fedimint_txid;
    agentId = payload.metadata?.agent_id;
    actionType = payload.metadata?.action_type;
  }

  if (!paymentHash) {
    return createErrorResponse(400, "Missing payment identifier", requestId);
  }

  // Update revenue record to 'paid'
  const { error: updateError } = await supabase
    .from("platform_revenue")
    .update({
      payment_status: "paid",
      payment_proof: payload.proof || payload.preimage || payload.cashu_token,
      paid_at: new Date(),
    })
    .eq("payment_hash", paymentHash);

  if (updateError) {
    logError(updateError, { requestId, endpoint: "platform-fee-paid" });
    return createErrorResponse(
      500,
      "Failed to update payment status",
      requestId,
    );
  }

  // Emit event so other systems know payment cleared
  await emitEvent("platform_fee_paid", {
    agent_id: agentId,
    action_type: actionType,
    payment_hash: paymentHash,
  });

  return { statusCode: 200, body: JSON.stringify({ status: "ok" }) };
};
