// ARCHITECTURE: Netlify Function (ESM) — Nostr event publishing with Sig4Sats
import { getEventHash, verifyEvent, validateEvent, nip19 } from "nostr-tools";
import type { UnsignedEvent, Event as NostrEvent } from "nostr-tools";
import { SimplePool } from "nostr-tools";
import { getRequestClient } from "../../functions_active/supabase";
import {
  createErrorResponse,
  logErrorWithContext as logError,
  generateRequestId,
} from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";

interface PublishNostrEventRequest {
  agent_id: string;
  event_kind: number;
  event_content: string;
  event_tags: string[][];

  // Payment for event publishing fee (100 sats)
  fee_payment_method?: "blind_token" | "direct_payment";
  fee_payment_proof?: string;

  // Optional: Sig4Sats - receive Cashu payment for publishing this event
  sig4sats_payment_for_event?: string;
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = getRequestClient();
  const request: PublishNostrEventRequest = JSON.parse(event.body || "{}");

  // 1. MONETIZATION: Charge event publishing fee (100 sats)
  let feeCharged = false;

  if (request.fee_payment_method === "blind_token") {
    const tokenRedemption = await fetch(
      `${process.env.VITE_API_BASE_URL}/agents/redeem-blind-token`,
      {
        method: "POST",
        body: JSON.stringify({
          unblinded_token: request.fee_payment_proof,
          action_type: "event_post",
          action_payload: { kind: request.event_kind },
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
          action_type: "agent_status_update_event",
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
          error: "Event publishing fee required",
          fee_sats: 100,
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

  // 3. SIG4SATS: Check if someone will pay for this event's signature
  let sig4satsPaymentAvailable = false;
  let sig4satsAmountSats = 0;
  let sig4satsLockId: string | null = null;

  if (request.sig4sats_payment_for_event) {
    const cashuToken = JSON.parse(request.sig4sats_payment_for_event);

    // Store Sig4Sats payment lock
    const { data: sig4satsLock } = await supabase
      .from("sig4sats_locks")
      .insert({
        cashu_token: request.sig4sats_payment_for_event,
        cashu_mint_url: cashuToken.mint,
        locked_amount_sats: cashuToken.amount,
        event_template: {
          kind: request.event_kind,
          content: request.event_content,
          tags: request.event_tags,
        },
        required_kind: request.event_kind,
        agent_id: request.agent_id,
        status: "locked",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      })
      .select()
      .single();

    sig4satsLockId = sig4satsLock.id;
    sig4satsPaymentAvailable = true;
    sig4satsAmountSats = cashuToken.amount;
  }

  // 4. Create and sign Nostr event
  // ZERO-KNOWLEDGE: Sign via NIP-46 remote signer or SecureNsecManager session
  // NEVER access nostr_secret_key from database
  const unsignedEvent: UnsignedEvent = {
    kind: request.event_kind,
    created_at: Math.floor(Date.now() / 1000),
    tags: request.event_tags,
    content: request.event_content,
    pubkey: agent.npub, // user_identities column (NOT deprecated nostr_pubkey)
  };

  // Sign via NIP-46 remote signer (agent key management)
  const nostrEvent = await signEventViaRemoteSigner(
    unsignedEvent,
    request.agent_id,
  );

  // 5. SIG4SATS: Redeem Cashu token if event signature matches
  let sig4satsRedeemed = false;

  if (sig4satsLockId && request.sig4sats_payment_for_event) {
    try {
      const cashuToken = JSON.parse(request.sig4sats_payment_for_event);
      const template = {
        kind: request.event_kind,
        content: request.event_content,
        tags: request.event_tags,
      };

      const redemption = await redeemCashuToken(
        cashuToken,
        template,
        nostrEvent,
      );

      if (redemption.success) {
        sig4satsRedeemed = true;

        // Update lock status
        await supabase
          .from("sig4sats_locks")
          .update({
            status: "redeemed",
            redeemed_at: new Date(),
            settlement_event_id: nostrEvent.id,
            settlement_signature: nostrEvent.sig,
          })
          .eq("id", sig4satsLockId);

        // Credit agent
        await supabase.from("agent_payment_receipts").insert({
          agent_id: request.agent_id,
          amount_sats: sig4satsAmountSats,
          payment_protocol: "cashu",
          cashu_token: request.sig4sats_payment_for_event,
          purpose: "sig4sats_event_signature_payment",
          verified: true,
          received_at: new Date(),
        });
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), {
        component: "sig4sats_event_redemption",
        metadata: { agentId: request.agent_id },
      });
    }
  }

  // 6. Publish to Nostr relays (configurable, NOT hardcoded)
  const pool = new SimplePool();
  const relayUrls = (
    process.env.NOSTR_RELAYS ||
    "wss://relay.satnam.pub,wss://relay.damus.io,wss://nos.lol"
  ).split(",");
  const relays = relayUrls.map((r) => r.trim());

  await Promise.all(relays.map((relay) => pool.publish([relay], nostrEvent)));

  // 7. Record in platform
  await supabase.from("agent_nostr_events").insert({
    agent_id: request.agent_id,
    event_id: nostrEvent.id,
    event_kind: request.event_kind,
    event_published: true,
    sig4sats_redeemed: sig4satsRedeemed,
    sig4sats_earned_sats: sig4satsRedeemed ? sig4satsAmountSats : 0,
    published_at: new Date(),
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      event_id: nostrEvent.id,
      event_published: true,
      relays_published: relays.length,
      fee_paid_anonymously: request.fee_payment_method === "blind_token",
      sig4sats_redeemed: sig4satsRedeemed,
      sig4sats_earned_sats: sig4satsRedeemed ? sig4satsAmountSats : 0,
    }),
  };
};

// Helper functions
async function signEventViaRemoteSigner(
  event: UnsignedEvent,
  agentId: string,
): Promise<NostrEvent> {
  // TODO: Implement remote signing via NIP-46 or SecureNsecManager
  // For now, return a mock event
  const mockEvent: NostrEvent = {
    ...event,
    id: getEventHash(event),
    sig: `mock-signature-${Date.now()}`,
  };
  return mockEvent;
}

// Mock function for Cashu redemption - to be implemented when @cashu/cashu-ts is available
async function redeemCashuToken(
  cashuToken: any,
  template: any,
  nostrEvent: NostrEvent,
) {
  // TODO: Implement actual Cashu token redemption
  // For now, return success as placeholder
  return { success: true, amount_sats: cashuToken.amount };
}
