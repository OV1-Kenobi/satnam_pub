// ARCHITECTURE: Netlify Function (ESM) — autonomy rules enforcement
import { getRequestClient } from "../../functions_active/supabase";
import {
  createErrorResponse,
  logErrorWithContext as logError,
  generateRequestId,
} from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";

type AutonomyActionType =
  | "payment"
  | "external_api_call"
  | "encrypted_dm_send"
  | "task_create"
  | "credit_envelope_request";

interface AutonomyCheckContext {
  agentId: string;
  actionType: AutonomyActionType;
  estimatedCostSats?: number;
  externalApiDomain?: string;
  messageBatchSize?: number;
}

interface AutonomyFailureHint {
  reason:
    | "payment_over_single_limit"
    | "payment_over_daily_limit"
    | "external_api_requires_human"
    | "bulk_message_send"
    | "autonomy_rule_violation";
  suggested_action:
    | "reduce_amount"
    | "request_approval"
    | "split_payment"
    | "contact_support";
  details: string;
}

export async function enforceAutonomyRules(ctx: AutonomyCheckContext): Promise<{
  allowed: boolean;
  reason?: string;
  autonomyFailure?: AutonomyFailureHint;
}> {
  const supabase = getRequestClient();

  // Check autonomy rules using database function
  const { data: rulesCheck } = await supabase.rpc("check_autonomy_rules", {
    p_agent_id: ctx.agentId,
    p_action_type: ctx.actionType,
    p_estimated_cost_sats: ctx.estimatedCostSats,
    p_external_api_domain: ctx.externalApiDomain,
    p_message_batch_size: ctx.messageBatchSize,
  });

  if (rulesCheck && rulesCheck.length > 0) {
    const rule = rulesCheck[0];

    if (!rule.allowed) {
      // Generate autonomy failure hint
      const autonomyFailure: AutonomyFailureHint = {
        reason: rule.reason as any,
        suggested_action: getAutonomySuggestedAction(rule.reason),
        details: getAutonomyFailureDetails(
          rule.reason,
          rule.escalation_action,
          rule.escalation_channel,
        ),
      };

      // Handle escalation if needed
      if (rule.escalation_action === "pause_and_notify") {
        await triggerAutonomyEscalation(ctx, rule, autonomyFailure);
      }

      return {
        allowed: false,
        reason: rule.reason,
        autonomyFailure,
      };
    }
  }

  return { allowed: true };
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = getRequestClient();
  const request: AutonomyCheckContext = JSON.parse(event.body || "{}");

  try {
    const result = await enforceAutonomyRules(request);

    if (!result.allowed) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "Action blocked by autonomy rules",
          reason: result.reason,
          autonomy_failure: result.autonomyFailure,
          request_id: requestId,
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        allowed: true,
        request_id: requestId,
      }),
    };
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      component: "enforce-autonomy",
      action: "autonomy_check",
      metadata: { agentId: request.agentId, actionType: request.actionType },
    });

    return {
      statusCode: 500,
      body: JSON.stringify(
        createErrorResponse("Internal server error", undefined, requestId),
      ),
    };
  }
};

// Helper functions
function getAutonomySuggestedAction(
  reason: string,
): AutonomyFailureHint["suggested_action"] {
  switch (reason) {
    case "payment_over_single_limit":
      return "reduce_amount";
    case "payment_over_daily_limit":
      return "split_payment";
    case "external_api_requires_human":
      return "request_approval";
    default:
      return "contact_support";
  }
}

function getAutonomyFailureDetails(
  reason: string,
  escalationAction?: string,
  escalationChannel?: string,
): string {
  switch (reason) {
    case "payment_over_single_limit":
      return "This payment exceeds your configured single-transaction limit. Please reduce the amount or split into smaller payments.";
    case "payment_over_daily_limit":
      return "This payment would exceed your configured daily spending limit. Please wait until tomorrow or split into smaller payments.";
    case "external_api_requires_human":
      return "This action requires human approval for external API calls. Please request approval from your agent creator.";
    case "bulk_message_send":
      return "Bulk messaging is restricted for your agent configuration. Please reduce the batch size or request approval.";
    default:
      return "This action is blocked by your agent's autonomy configuration. Please contact support for assistance.";
  }
}

async function triggerAutonomyEscalation(
  ctx: AutonomyCheckContext,
  rule: any,
  autonomyFailure: AutonomyFailureHint,
): Promise<void> {
  const supabase = getRequestClient();

  try {
    // Get agent information for notification
    const { data: agent } = await supabase
      .from("user_identities")
      .select("id, npub")
      .eq("id", ctx.agentId)
      .single();

    if (!agent) return;

    // Log the autonomy violation
    await supabase.from("agent_autonomy_violations").insert({
      agent_id: ctx.agentId,
      action_type: ctx.actionType,
      violation_reason: autonomyFailure.reason,
      escalation_action: rule.escalation_action,
      escalation_channel: rule.escalation_channel,
      context: {
        estimatedCostSats: ctx.estimatedCostSats,
        externalApiDomain: ctx.externalApiDomain,
        messageBatchSize: ctx.messageBatchSize,
      },
      created_at: new Date(),
    });

    // TODO: Implement actual notification sending (email/Nostr DM)
    // For now, just log the escalation
    console.log(`Autonomy escalation triggered for agent ${agent.npub}:`, {
      action: ctx.actionType,
      reason: autonomyFailure.reason,
      channel: rule.escalation_channel,
    });
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      component: "enforce-autonomy",
      action: "escalation_trigger",
      metadata: { agentId: ctx.agentId, actionType: ctx.actionType },
    });
  }
}
