// ARCHITECTURE: Netlify Function (ESM) — task record creation with Sig4Sats
import type { HandlerEvent } from "@netlify/functions";
import { getRequestClient } from "../../functions_active/supabase";
import {
  generateRequestId,
  logErrorWithContext as logError,
} from "../utils/error-handler";
import {
  TASK_CLOSE_FEEDBACK_KIND,
  TASK_CLOSE_STATUS_SUCCESS,
} from "./task-close-events";

interface CreateTaskRecordRequest {
  task_id?: string;
  agent_id: string;
  task_title: string;
  task_description: string;
  task_type: string; // 'compute', 'data_processing', 'api_integration'
  requester_npub: string;
  estimated_duration_seconds: number;
  estimated_cost_sats: number;
  credit_envelope_id?: string;

  // Payment for task record creation fee (150 sats)
  fee_payment_method?: "blind_token" | "direct_payment";
  fee_payment_proof?: string;

  // Sig4Sats integration
  sig4sats_task_bond?: string;
}

// Helper function to publish Nostr event (simplified for now)
async function publishNostrEvent(event: any): Promise<{ id: string }> {
  // This would integrate with the existing Nostr publishing infrastructure
  // For now, return a mock ID
  return { id: `mock-event-${Date.now()}` };
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = getRequestClient();
  const request: CreateTaskRecordRequest = JSON.parse(event.body || "{}");

  // 1. MONETIZATION: Charge task record creation fee (150 sats)
  let feeCharged = false;

  if (request.fee_payment_method === "blind_token") {
    const tokenRedemption = await fetch(
      `${process.env.VITE_API_BASE_URL}/agents/redeem-blind-token`,
      {
        method: "POST",
        body: JSON.stringify({
          unblinded_token: request.fee_payment_proof,
          action_type: "task_record_create",
          action_payload: { task_title: request.task_title },
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
          action_type: "task_record_create",
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
          error: "Task record creation fee required",
          fee_sats: 150,
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

  // 2. SIG4SATS: Lock Cashu bond to task completion if provided
  let sig4satsBondId: string | null = null;

  if (request.sig4sats_task_bond) {
    try {
      const cashuToken = JSON.parse(request.sig4sats_task_bond);

      // Create event template for task completion
      const completionEventTemplate = {
        kind: TASK_CLOSE_FEEDBACK_KIND,
        content: "", // Will be filled with completion proof
        tags: [
          ["task_id", ""], // Will be filled with actual task ID
          ["agent", request.agent_id],
          ["status", TASK_CLOSE_STATUS_SUCCESS],
        ],
      };

      const { data: sig4satsBond } = await supabase
        .from("sig4sats_locks")
        .insert({
          cashu_token: request.sig4sats_task_bond,
          cashu_mint_url: cashuToken.mint,
          locked_amount_sats: cashuToken.amount,
          event_template: completionEventTemplate,
          required_kind: TASK_CLOSE_FEEDBACK_KIND,
          agent_id: request.agent_id,
          created_by_npub: request.requester_npub,
          status: "locked",
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        })
        .select()
        .single();

      sig4satsBondId = sig4satsBond.id;
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), {
        component: "task-record-create",
        action: "sig4sats_task_bond_parsing",
        metadata: { taskId: "unknown" },
      });
    }
  }

  // 3. Generate Nostr event (kind 30078 - parameterized replaceable)
  const taskEvent = await publishNostrEvent({
    kind: 30078,
    content: JSON.stringify({
      title: request.task_title,
      description: request.task_description,
      type: request.task_type,
      estimated_duration: request.estimated_duration_seconds,
      estimated_cost: request.estimated_cost_sats,
      sig4sats_bonded: !!request.sig4sats_task_bond,
    }),
    tags: [
      ["d", `task-${Date.now()}`],
      ["agent", request.agent_id],
      ["requester", request.requester_npub],
      ["task_type", request.task_type],
      ["estimated_cost", request.estimated_cost_sats.toString()],
      request.sig4sats_task_bond ? ["sig4sats", "enabled"] : [],
    ].filter((t) => t.length > 0),
  });

  // 4. Store task record
  const { data: taskRecord } = await supabase
    .from("agent_task_records")
    .insert({
      id: request.task_id,
      agent_id: request.agent_id,
      task_title: request.task_title,
      task_description: request.task_description,
      task_type: request.task_type,
      status: "in_progress",
      task_event_id: taskEvent.id,
      requester_npub: request.requester_npub,
      estimated_duration_seconds: request.estimated_duration_seconds,
      estimated_cost_sats: request.estimated_cost_sats,
      credit_envelope_id: request.credit_envelope_id,
      sig4sats_bond_id: sig4satsBondId,
      started_at: new Date(),
    })
    .select()
    .single();

  // Update Sig4Sats lock with task ID
  if (sig4satsBondId) {
    await supabase
      .from("sig4sats_locks")
      .update({
        event_template: {
          kind: TASK_CLOSE_FEEDBACK_KIND,
          content: "",
          tags: [
            ["task_id", taskRecord.id],
            ["agent", request.agent_id],
            ["status", TASK_CLOSE_STATUS_SUCCESS],
          ],
        },
      })
      .eq("id", sig4satsBondId);
  }

  return {
    statusCode: 201,
    body: JSON.stringify({
      task_id: taskRecord.id,
      task_event_id: taskEvent.id,
      sig4sats_bond_locked: !!sig4satsBondId,
      sig4sats_bond_id: sig4satsBondId,
      fee_paid_anonymously: request.fee_payment_method === "blind_token",
    }),
  };
};
