// ARCHITECTURE: Netlify Function (ESM)
import { getRequestClient } from "../../functions_active/supabase";
import {
  verifyBlindSignature,
  hashToken,
} from "../../../src/lib/crypto/blind-signatures";
import {
  createErrorResponse,
  logErrorWithContext,
  generateRequestId,
  type EconomicFailureHint,
} from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";

// W4: Import shared types from centralized location (no duplicates)
import type {
  BlindTokenType,
  ActionPayload,
  ActionResult,
} from "../../../types/agent-tokens";

interface RedeemBlindTokenRequest {
  unblinded_token: string;
  signature_proof: string;
  action_type: string;
  keypair_public_key: string;
  action_payload: ActionPayload;
}

interface RedeemBlindTokenResponse {
  token_valid: boolean;
  action_authorized: boolean;
  action_result?: ActionResult;
  economic_failure?: EconomicFailureHint; // UX IMPROVEMENT: Standardized error handling
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = getRequestClient();
  const request: RedeemBlindTokenRequest = JSON.parse(event.body || "{}");

  // SECURITY: Rate limiting check (TODO: implement middleware)
  // See RATE_LIMITS configuration in Task 0.2
  // Should enforce: 20 requests/minute, 200 requests/hour per agent

  // 1. Verify blind signature is valid
  const signatureValid = verifyBlindSignature(
    request.unblinded_token,
    request.signature_proof,
    request.keypair_public_key,
  );

  if (!signatureValid) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        error: "Invalid token signature",
        economic_failure: {
          reason: "INSUFFICIENT_TOKENS",
          suggested_action: "BUY_TOKENS",
          details: "Token signature verification failed",
        },
      }),
    };
  }

  // 2. Check if token already redeemed (hash of unblinded token)
  const tokenHash = await hashToken(request.unblinded_token);

  const existingRedemption = await supabase
    .from("anonymous_token_redemptions")
    .select("id")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (existingRedemption) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Token already redeemed" }),
    };
  }

  // 3. Verify token hasn't expired
  const { data: tokenRecord } = await supabase
    .from("agent_blind_tokens")
    .select("expires_at, token_type")
    .eq("blind_signature", request.signature_proof)
    .single();

  if (!tokenRecord) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Token not found" }),
    };
  }

  if (new Date() > new Date(tokenRecord.expires_at)) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Token expired" }),
    };
  }

  // 4. Verify token type matches action
  if (tokenRecord.token_type !== request.action_type) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Token type mismatch" }),
    };
  }

  // 5. Record anonymous redemption (doesn't link to agent ID)
  await supabase.from("anonymous_token_redemptions").insert({
    token_hash: tokenHash,
    action_type: request.action_type,
    unblinded_token: request.unblinded_token,
    signature_proof: request.signature_proof,
    redeemed_at: new Date(),
  });

  // 6. Update token status
  await supabase
    .from("agent_blind_tokens")
    .update({
      status: "redeemed",
      redeemed_at: new Date(),
      redeemed_for_action: request.action_type,
      token_hash: tokenHash,
    })
    .eq("blind_signature", request.signature_proof);

  // 7. Perform the authorized action
  let actionResult: ActionResult | undefined;

  if (request.action_type === "event_post") {
    // Publish Nostr event anonymously
    actionResult = await publishNostrEvent(request.action_payload);
  } else if (request.action_type === "task_create") {
    // Create task record
    actionResult = await createTaskRecord(request.action_payload);
  } else if (request.action_type === "contact_add") {
    // Add contact
    actionResult = await addContact(request.action_payload);
  } else if (request.action_type === "dm_send") {
    // Send DM
    actionResult = await sendEncryptedDM(request.action_payload);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      token_valid: true,
      action_authorized: true,
      action_result: actionResult,
      redemption_anonymous: true, // Agent's identity not linked to this action
    }),
  };
};

// Helper functions (import from existing utilities)
async function publishNostrEvent(eventPayload: any): Promise<ActionResult> {
  // This should be imported from payment-verification.ts
  // For now, return a mock result
  return {
    token_valid: true,
    action_performed: true,
    result_data: {
      event_id: "mock_event_id",
    },
  };
}

async function createTaskRecord(taskPayload: any): Promise<ActionResult> {
  // This should be imported from payment-verification.ts
  // For now, return a mock result
  return {
    token_valid: true,
    action_performed: true,
    result_data: {
      task_id: "mock_task_id",
    },
  };
}

async function addContact(contactPayload: any): Promise<ActionResult> {
  // This should be imported from payment-verification.ts
  // For now, return a mock result
  return {
    token_valid: true,
    action_performed: true,
    result_data: {
      contact_id: "mock_contact_id",
    },
  };
}

async function sendEncryptedDM(dmPayload: any): Promise<ActionResult> {
  // This should be imported from payment-verification.ts
  // For now, return a mock result
  return {
    token_valid: true,
    action_performed: true,
    result_data: {
      dm_id: "mock_message_id",
    },
  };
}
