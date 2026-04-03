import { supabase } from "../supabase";

export type ChallengeReason =
  | "AMBIGUOUS_SPEC"
  | "RESOURCE_EXCEED"
  | "ETHICAL_CONCERN"
  | "CAPABILITY_MISMATCH"
  | "CONTEXT_SATURATION";

export type ChallengeResolution =
  | "REVISED"
  | "OVERRIDE_WITH_EXPLANATION"
  | "CANCELLED"
  | "DELEGATED_TO_ALTERNATIVE";

export type FinalTaskChallengeOutcome = "SUCCESS" | "FAILURE" | "CANCELLED";

export interface TaskChallengeCheck {
  task_id: string;
  challenge_reason: ChallengeReason;
  agent_concern: string;
  requires_clarification: boolean;
  suggested_modification?: string;
  confidence_in_challenge: number;
}

export interface TaskChallengeResolutionInput {
  challengeId: string;
  resolution: ChallengeResolution;
  challengeAccepted: boolean;
  taskProceeded: boolean;
  delegatorExplanation?: string;
  revisedTaskSpec?: Record<string, unknown>;
}

export interface TaskChallengeOutcomeInput {
  challengeId: string;
  finalTaskOutcome: FinalTaskChallengeOutcome;
  taskProceeded: boolean;
}

export interface TaskAssignment {
  id: string;
  description: string;
  required_capabilities: string[];
  estimated_cost_sats: number;
  estimated_context_tokens: number;
  success_criteria: string[];
  delegator_id: string;
  deadline?: string;
}

export interface AgentCapabilities {
  skill_ids: string[];
  max_budget_sats: number;
  max_context_tokens: number;
  current_context_used_percent: number;
  ethical_constraints: string[];
  verified_capabilities: string[];
}

export async function evaluateTaskBeforeAcceptance(
  task: TaskAssignment,
  agentCapabilities: AgentCapabilities,
): Promise<TaskChallengeCheck | null> {
  const successCriteria = task.success_criteria.map((criteria) =>
    criteria.toLowerCase(),
  );
  const hasVerifiableCriteria =
    successCriteria.length > 0 &&
    successCriteria.some(
      (criteria) =>
        criteria.includes("test") ||
        criteria.includes("measurable") ||
        criteria.includes("verifiable"),
    );

  if (!hasVerifiableCriteria) {
    return {
      task_id: task.id,
      challenge_reason: "AMBIGUOUS_SPEC",
      agent_concern:
        "Task lacks verifiable success criteria. Without clear acceptance tests, disputes may arise.",
      requires_clarification: true,
      suggested_modification:
        'Add specific, measurable success criteria (e.g., "passes unit tests", "achieves 95% accuracy")',
      confidence_in_challenge: 85,
    };
  }

  if (task.estimated_cost_sats > agentCapabilities.max_budget_sats) {
    return {
      task_id: task.id,
      challenge_reason: "RESOURCE_EXCEED",
      agent_concern: `Task estimated cost (${task.estimated_cost_sats} sats) exceeds my budget limit (${agentCapabilities.max_budget_sats} sats)`,
      requires_clarification: true,
      suggested_modification: `Reduce scope or increase budget allocation to ${task.estimated_cost_sats} sats`,
      confidence_in_challenge: 95,
    };
  }

  const projectedContextUsed =
    agentCapabilities.current_context_used_percent +
    (task.estimated_context_tokens / agentCapabilities.max_context_tokens) *
      100;

  if (projectedContextUsed > 90) {
    return {
      task_id: task.id,
      challenge_reason: "CONTEXT_SATURATION",
      agent_concern: `Adding this task would saturate my context window (${projectedContextUsed.toFixed(0)}% used). Performance degradation likely.`,
      requires_clarification: true,
      suggested_modification:
        "Wait for current tasks to complete, or delegate to agent with larger context window",
      confidence_in_challenge: 80,
    };
  }

  const missingCapabilities = task.required_capabilities.filter(
    (requirement) =>
      !agentCapabilities.verified_capabilities.includes(requirement),
  );

  if (missingCapabilities.length > 0) {
    return {
      task_id: task.id,
      challenge_reason: "CAPABILITY_MISMATCH",
      agent_concern: `I lack verified capabilities: ${missingCapabilities.join(", ")}`,
      requires_clarification: true,
      suggested_modification: `Delegate to agent with these capabilities, or allow me to acquire skills: ${missingCapabilities.join(", ")}`,
      confidence_in_challenge: 90,
    };
  }

  const ethicalFlags = detectEthicalConcerns(
    task.description,
    agentCapabilities.ethical_constraints,
  );

  if (ethicalFlags.length > 0) {
    return {
      task_id: task.id,
      challenge_reason: "ETHICAL_CONCERN",
      agent_concern: `Task may violate ethical constraints: ${ethicalFlags.join("; ")}`,
      requires_clarification: true,
      suggested_modification:
        "Clarify data handling, consent requirements, or remove PII exposure",
      confidence_in_challenge: 75,
    };
  }

  return null;
}

export async function recordTaskChallenge(
  challenge: TaskChallengeCheck,
  agentId: string,
  delegatorId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("agent_task_challenges")
    .insert({
      task_id: challenge.task_id,
      agent_id: agentId,
      delegator_id: delegatorId,
      challenge_reason: challenge.challenge_reason,
      agent_concern: challenge.agent_concern,
      suggested_modification: challenge.suggested_modification,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(
      `Failed to record task challenge: ${error?.message ?? "Unknown error"}`,
    );
  }

  return data.id;
}

export async function resolveTaskChallenge(
  input: TaskChallengeResolutionInput,
): Promise<void> {
  const updatePayload = {
    resolution: input.resolution,
    challenge_accepted: input.challengeAccepted,
    task_proceeded: input.taskProceeded,
    delegator_explanation: input.delegatorExplanation ?? null,
    revised_task_spec: input.revisedTaskSpec ?? null,
    resolved_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("agent_task_challenges")
    .update(updatePayload)
    .eq("id", input.challengeId);

  if (error) {
    throw new Error(`Failed to resolve task challenge: ${error.message}`);
  }
}

export async function recordTaskChallengeOutcome(
  input: TaskChallengeOutcomeInput,
): Promise<void> {
  const { error } = await supabase
    .from("agent_task_challenges")
    .update({
      final_task_outcome: input.finalTaskOutcome,
      task_proceeded: input.taskProceeded,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", input.challengeId);

  if (error) {
    throw new Error(
      `Failed to record task challenge outcome: ${error.message}`,
    );
  }
}

function detectEthicalConcerns(
  description: string,
  constraints: string[],
): string[] {
  const concerns: string[] = [];
  const lowerDesc = description.toLowerCase();

  if (
    (lowerDesc.includes("email") ||
      lowerDesc.includes("private") ||
      lowerDesc.includes("personal")) &&
    constraints.includes("no_pii_access")
  ) {
    concerns.push("Task may require PII access (emails, personal data)");
  }

  if (
    (lowerDesc.includes("delete") ||
      lowerDesc.includes("remove") ||
      lowerDesc.includes("irreversible")) &&
    constraints.includes("no_destructive_actions")
  ) {
    concerns.push("Task involves potentially irreversible actions");
  }

  if (
    (lowerDesc.includes("secret") ||
      lowerDesc.includes("password") ||
      lowerDesc.includes("key")) &&
    constraints.includes("no_secret_storage")
  ) {
    concerns.push("Task may involve handling secrets/credentials");
  }

  return concerns;
}
