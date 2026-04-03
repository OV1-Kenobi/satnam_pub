// ARCHITECTURE: Netlify Function (ESM) — task completion with Sig4Sats
import type { HandlerEvent } from "@netlify/functions";
import type { Event as NostrEvent } from "nostr-tools";
import { validateEvent, verifyEvent } from "nostr-tools";
import { getRequestClient } from "../../functions_active/supabase";
import {
  createErrorResponse,
  generateRequestId,
  logErrorWithContext as logError,
} from "../utils/error-handler";
import {
  mapTaskCloseStatusToFinalOutcome,
  TASK_CLOSE_FEEDBACK_KIND,
  TASK_CLOSE_STATUS_SUCCESS,
} from "./task-close-events";

type ValidationTier = "self_report" | "peer_verified" | "oracle_attested";

interface CompleteTaskRequest {
  task_id: string;
  actual_duration_seconds: number;
  actual_cost_sats: number;
  completion_proof: string;
  validation_tier: ValidationTier;
  validator_npub?: string;

  // Sig4Sats: Completion event signature to unlock bond
  completion_event_signature?: string;
  completion_event?: NostrEvent; // Typed Nostr event (replaces `any`)
}

interface TaskChallengeOutcomeUpdate {
  final_task_outcome: "SUCCESS" | "FAILURE" | "CANCELLED";
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = getRequestClient();
  const request: CompleteTaskRequest = JSON.parse(event.body || "{}");

  // Join agent via user_identities + agent_profiles (NOT deprecated profiles)
  const { data: task, error: taskError } = await supabase
    .from("agent_task_records")
    .select(
      "*, agent:user_identities(*, agent_profiles(*)), sig4sats_bond:sig4sats_locks(*)",
    )
    .eq("id", request.task_id)
    .single();

  if (taskError || !task) {
    return createErrorResponse("Task not found", undefined, requestId);
  }

  // Validate validator authority
  if (request.validation_tier === "peer_verified") {
    // Query agent_profiles via user_identities (NOT deprecated profiles)
    const { data: validatorData } = await supabase
      .from("user_identities")
      .select("id, agent_profiles(reputation_score)")
      .eq("npub", request.validator_npub)
      .single();

    const validatorReputation =
      validatorData?.agent_profiles?.[0]?.reputation_score ?? 0;
    if (!validatorData || validatorReputation < 100) {
      return createErrorResponse(
        "Validator reputation insufficient",
        undefined,
        requestId,
      );
    }
  } else if (request.validation_tier === "oracle_attested") {
    const oracleValid = await verifyTrustedOracle(request.validator_npub || "");
    if (!oracleValid) {
      return createErrorResponse(
        "Validator not in trusted oracle list",
        undefined,
        requestId,
      );
    }
  }

  // SIG4SATS: Verify completion event and redeem bond
  let sig4satsRedeemed = false;
  let sig4satsAmountSats = 0;

  if (task.sig4sats_bond && request.completion_event) {
    const eventValid =
      validateEvent(request.completion_event) &&
      verifyEvent(request.completion_event);

    if (eventValid) {
      // Verify event matches template
      const template = task.sig4sats_bond.event_template;
      const eventMatchesTemplate =
        request.completion_event.kind === template.kind &&
        request.completion_event.tags.some(
          (t) => t[0] === "task_id" && t[1] === request.task_id,
        ) &&
        request.completion_event.tags.some(
          (t) => t[0] === "status" && t[1] === TASK_CLOSE_STATUS_SUCCESS,
        );

      if (eventMatchesTemplate) {
        try {
          const cashuToken = JSON.parse(task.sig4sats_bond.cashu_token);

          // TODO: Implement Cashu token redemption without @cashu/cashu-ts
          // For now, assume successful redemption
          sig4satsRedeemed = true;
          sig4satsAmountSats = 1000; // Placeholder amount

          // Update Sig4Sats lock
          await supabase
            .from("sig4sats_locks")
            .update({
              status: "redeemed",
              redeemed_at: new Date(),
              settlement_event_id: request.completion_event.id,
              settlement_signature: request.completion_event.sig,
            })
            .eq("id", task.sig4sats_bond.id);

          // Credit agent
          await supabase.from("agent_payment_receipts").insert({
            agent_id: task.agent_id,
            amount_sats: sig4satsAmountSats,
            payment_protocol: "cashu",
            cashu_token: task.sig4sats_bond.cashu_token,
            purpose: "sig4sats_task_completion_bonus",
            related_task_id: request.task_id,
            verified: true,
            received_at: new Date(),
          });
        } catch (error) {
          logError(error instanceof Error ? error : new Error(String(error)), {
            component: "sig4sats_task_redemption",
            action: "redeem_bond",
            metadata: { taskId: request.task_id },
            requestId,
          });
        }
      }
    }
  }

  // Aggregate LLM token usage and cost from session events
  // Query agent_session_events for this task's session to get token totals
  const { data: sessionEvents } = await supabase
    .from("agent_session_events")
    .select("input_tokens, output_tokens, tokens_used, event_data")
    .eq("session_id", task.session_id)
    .eq("event_type", "LLM_COMPLETION");

  // Aggregate token usage from all LLM_COMPLETION events in this session
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;
  let llmModel: string | null = null;
  let llmProvider: string | null = null;
  let costUsdCents = 0;

  if (sessionEvents && sessionEvents.length > 0) {
    for (const event of sessionEvents) {
      totalInputTokens += event.input_tokens || 0;
      totalOutputTokens += event.output_tokens || 0;
      totalTokens += event.tokens_used || 0;

      // Extract model and provider from first event (assuming consistent within session)
      if (!llmModel && event.event_data?.model) {
        llmModel = event.event_data.model;
      }
      if (!llmProvider && event.event_data?.provider) {
        llmProvider = event.event_data.provider;
      }

      // Sum up cost_usd_cents from event_data (already computed with FX snapshot)
      if (event.event_data?.cost_usd_cents) {
        costUsdCents += event.event_data.cost_usd_cents;
      }
    }
  }

  // Generate completion signature
  const completionData = {
    task_id: request.task_id,
    actual_duration: request.actual_duration_seconds,
    actual_cost: request.actual_cost_sats,
    proof: request.completion_proof,
    timestamp: Date.now(),
    sig4sats_redeemed: sig4satsRedeemed,
  };

  // ZERO-KNOWLEDGE: Use NIP-46 remote signer or ClientSessionVault+SecureNsecManager
  // NEVER access nostr_secret_key from database — sign via ephemeral session
  const completionSignature = await signDataViaRemoteSigner(
    completionData,
    task.agent_id,
  );

  // Calculate reputation delta with Sig4Sats bonus
  const baseRepDelta = Math.floor(request.actual_cost_sats / 1000);
  const sig4satsBonus = sig4satsRedeemed ? Math.floor(baseRepDelta * 0.15) : 0; // 15% bonus
  const totalRepDelta = baseRepDelta + sig4satsBonus;

  // Update agent reputation in agent_profiles (NOT deprecated profiles)
  const agentProfile = task.agent?.agent_profiles;
  await supabase
    .from("agent_profiles")
    .update({
      reputation_score:
        (agentProfile?.[0]?.reputation_score ?? 0) + totalRepDelta,
      total_tasks_completed:
        (agentProfile?.[0]?.total_tasks_completed ?? 0) + 1,
    })
    .eq("user_identity_id", task.agent_id);

  // Publish completion event
  const completionEvent = await publishNostrEvent({
    kind: TASK_CLOSE_FEEDBACK_KIND,
    content: JSON.stringify(completionData),
    tags: [
      ["e", task.task_event_id],
      ["agent", task.agent.npub], // user_identities column (NOT deprecated nostr_pubkey)
      ["validation_tier", request.validation_tier],
      ["validator", request.validator_npub],
      ["task_id", request.task_id],
      ["status", TASK_CLOSE_STATUS_SUCCESS],
      task.requester_npub ? ["p", task.requester_npub] : [],
      sig4satsRedeemed
        ? ["sig4sats_redeemed", sig4satsAmountSats.toString()]
        : [],
    ].filter((t) => t.length > 0),
  });

  await supabase
    .from("agent_task_records")
    .update({
      status: "completed",
      actual_duration_seconds: request.actual_duration_seconds,
      actual_cost_sats: request.actual_cost_sats,
      completion_proof: request.completion_proof,
      completion_signature: completionSignature,
      validation_tier: request.validation_tier,
      validator_npub: request.validator_npub,
      sig4sats_redeemed: sig4satsRedeemed,
      sig4sats_bonus_sats: sig4satsAmountSats,
      completed_at: new Date(),
      completion_event_id: completionEvent.id,
      reputation_delta: totalRepDelta,
      // LLM tracking fields (Phase 3.3)
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      total_tokens: totalTokens,
      llm_model: llmModel,
      llm_provider: llmProvider,
      cost_usd_cents: costUsdCents, // Uses exact FX snapshot from session events
    })
    .eq("id", request.task_id);

  const finalOutcome = mapTaskCloseStatusToFinalOutcome(
    TASK_CLOSE_STATUS_SUCCESS,
  );

  if (finalOutcome) {
    await supabase
      .from("agent_task_challenges")
      .update({
        final_task_outcome: finalOutcome,
      } satisfies TaskChallengeOutcomeUpdate)
      .eq("task_id", request.task_id)
      .eq("task_proceeded", true);
  }

  // Publish attestation if peer/oracle validated
  if (request.validation_tier !== "self_report") {
    await publishAttestation({
      agentNpub: task.agent.npub, // user_identities column (NOT deprecated nostr_pubkey)
      taskId: request.task_id,
      validatorNpub: request.validator_npub || "",
      validationTier: request.validation_tier,
      label: `task-completed-${task.task_type}`,
      sig4satsRedeemed: sig4satsRedeemed,
    });
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      task_id: request.task_id,
      completion_event_id: completionEvent.id,
      validation_tier: request.validation_tier,
      reputation_delta: totalRepDelta,
      sig4sats_redeemed: sig4satsRedeemed,
      sig4sats_bonus_sats: sig4satsAmountSats,
      sig4sats_reputation_bonus: sig4satsBonus,
    }),
  };
};

// Helper functions
async function verifyTrustedOracle(validatorNpub: string): Promise<boolean> {
  // TODO: Implement trusted oracle verification
  // For now, return true as placeholder
  return true;
}

async function signDataViaRemoteSigner(
  data: any,
  agentId: string,
): Promise<string> {
  // TODO: Implement remote signing via NIP-46 or ClientSessionVault
  // For now, return a mock signature
  return `mock-signature-${Date.now()}`;
}

async function publishNostrEvent(event: any): Promise<{ id: string }> {
  // TODO: Implement actual Nostr event publishing
  // For now, return a mock ID
  return { id: `mock-event-${Date.now()}` };
}

async function publishAttestation(params: {
  agentNpub: string;
  taskId: string;
  validatorNpub: string;
  validationTier: "self_report" | "peer_verified" | "oracle_attested";
  label: string;
  sig4satsRedeemed: boolean;
}): Promise<void> {
  // TODO: Implement actual attestation publishing
  // For now, this is a placeholder
  console.log("Publishing attestation:", params);
}
