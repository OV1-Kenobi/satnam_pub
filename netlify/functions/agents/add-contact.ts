// ARCHITECTURE: Netlify Function (ESM) — contact/relay addition with monetization
import { getRequestClient } from "../../functions_active/supabase";
import {
  createErrorResponse,
  logErrorWithContext as logError,
  generateRequestId,
} from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";

interface AddContactRequest {
  agent_id: string;
  contact_type: "npub" | "relay";
  contact_value: string;

  // Payment for contact add fee (50 sats)
  fee_payment_method?: "blind_token" | "direct_payment";
  fee_payment_proof?: string;
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = getRequestClient();
  const request: AddContactRequest = JSON.parse(event.body || "{}");

  // 1. MONETIZATION: Charge contact add fee (50 sats)
  let feeCharged = false;

  if (request.fee_payment_method === "blind_token") {
    const tokenRedemption = await fetch(
      `${process.env.VITE_API_BASE_URL}/agents/redeem-blind-token`,
      {
        method: "POST",
        body: JSON.stringify({
          unblinded_token: request.fee_payment_proof,
          action_type: "contact_add",
          action_payload: { contact_type: request.contact_type },
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
          action_type: "contact_add",
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
          error: "Contact add fee required",
          fee_sats: 50,
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

  // 2. Add contact/relay
  if (request.contact_type === "npub") {
    await supabase.from("agent_contacts").insert({
      agent_id: request.agent_id,
      contact_npub: request.contact_value,
      added_at: new Date(),
    });
  } else if (request.contact_type === "relay") {
    await supabase.from("agent_relays").insert({
      agent_id: request.agent_id,
      relay_url: request.contact_value,
      added_at: new Date(),
    });

    // Update coordination_relay_urls in agent_profiles
    await supabase.rpc("add_relay_to_agent_profile", {
      p_agent_id: request.agent_id,
      p_relay_url: request.contact_value,
    });
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      contact_added: true,
      contact_type: request.contact_type,
      fee_paid_anonymously: request.fee_payment_method === "blind_token",
    }),
  };
};
