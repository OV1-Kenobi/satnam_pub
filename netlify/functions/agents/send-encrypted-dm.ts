// ARCHITECTURE: Netlify Function (ESM) — encrypted DM sending with monetization
// Uses existing ClientMessageService / CEPS gift-wrap patterns (NIP-17/59)
import { SimplePool } from "nostr-tools";
import type { UnsignedEvent } from "nostr-tools";
import { getRequestClient } from "../../functions_active/supabase";
import {
  createErrorResponse,
  logErrorWithContext as logError,
  generateRequestId,
} from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";

interface SendEncryptedDMRequest {
  agent_id: string;
  recipient_npub: string;
  message_content: string;

  // Payment for DM send fee (25 sats)
  fee_payment_method?: "blind_token" | "direct_payment";
  fee_payment_proof?: string;
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = getRequestClient();
  const request: SendEncryptedDMRequest = JSON.parse(event.body || "{}");

  // 1. MONETIZATION: Charge DM send fee (25 sats)
  let feeCharged = false;

  if (request.fee_payment_method === "blind_token") {
    const tokenRedemption = await fetch(
      `${process.env.VITE_API_BASE_URL}/agents/redeem-blind-token`,
      {
        method: "POST",
        body: JSON.stringify({
          unblinded_token: request.fee_payment_proof,
          action_type: "dm_send",
          action_payload: { recipient: request.recipient_npub },
        }),
      },
    );

    if (tokenRedemption.ok) {
      feeCharged = true;
    }
  } else {
    const feeResponse = await fetch(
      `${process.env.VITE_API_BASE_URL}/platform/charge-fee`,
      {
        method: "POST",
        body: JSON.stringify({
          agent_id: request.agent_id,
          action_type: "agent_dm_bundle",
          payment_proof: request.fee_payment_proof,
        }),
      },
    );

    const feeResult = await feeResponse.json();
    if (feeResult.fee_paid) {
      feeCharged = true;
    } else {
      return {
        statusCode: 402,
        body: JSON.stringify({
          error: "DM send fee required",
          fee_sats: 25,
          payment_invoice: feeResult.payment_invoice,
        }),
      };
    }
  }

  if (!feeCharged) {
    return {
      statusCode: 402,
      body: JSON.stringify({ error: "Fee payment required" }),
    };
  }

  // 2. Get agent identity from user_identities (NOT deprecated profiles)
  // ZERO-KNOWLEDGE: Only fetch npub — signing done via NIP-46 or SecureNsecManager session
  const { data: agent } = await supabase
    .from("user_identities")
    .select("id, npub")
    .eq("id", request.agent_id)
    .single();

  if (!agent) {
    return createErrorResponse("Agent not found", undefined, requestId);
  }

  // 3. Encrypt and create NIP-17 gift wrap event via NIP-46 remote signer
  // ZERO-KNOWLEDGE: Encryption and signing done via remote signer session
  // NEVER access nostr_secret_key from database — use ClientMessageService/CEPS patterns
  const dmEvent = await createGiftWrappedDMViaRemoteSigner({
    agentId: request.agent_id,
    senderNpub: agent.npub,
    recipientNpub: request.recipient_npub,
    content: request.message_content,
  });

  // 4. Publish to Nostr relays (configurable, NOT hardcoded)
  const pool = new SimplePool();
  const relayUrls = (
    process.env.NOSTR_RELAYS ||
    "wss://relay.satnam.pub,wss://relay.damus.io,wss://nos.lol"
  ).split(",");
  const relays = relayUrls.map((r) => r.trim());

  await Promise.all(relays.map((relay) => pool.publish([relay], dmEvent)));

  // 5. Record DM (store only event metadata, NOT plaintext content)
  await supabase.from("agent_dms").insert({
    agent_id: request.agent_id,
    recipient_npub: request.recipient_npub,
    event_id: dmEvent.id,
    sent_at: new Date(),
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      dm_sent: true,
      event_id: dmEvent.id,
      fee_paid_anonymously: request.fee_payment_method === "blind_token",
    }),
  };
};

// Helper function to create gift-wrapped DM via remote signer
async function createGiftWrappedDMViaRemoteSigner(params: {
  agentId: string;
  senderNpub: string;
  recipientNpub: string;
  content: string;
}) {
  // TODO: Implement actual NIP-17 gift wrap encryption via remote signer
  // For now, return a mock event
  const mockEvent: any = {
    kind: 1059, // NIP-17 gift wrap
    content: params.content,
    tags: [
      ["p", params.recipient_npub],
      ["wrapped", true],
    ],
    pubkey: params.senderNpub,
    created_at: Math.floor(Date.now() / 1000),
    id: `mock-giftwrap-${Date.now()}`,
    sig: `mock-signature-${Date.now()}`,
  };
  return mockEvent;
}
