import { beforeEach, describe, expect, it, vi } from "vitest";

const singleMock = vi.fn();
const selectMock = vi.fn(() => ({ single: singleMock }));
const insertMock = vi.fn(() => ({ select: selectMock }));
const updateEqMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: updateEqMock }));
const fromMock = vi.fn((table: string) => {
  if (table === "agent_task_challenges") {
    return {
      insert: insertMock,
      update: updateMock,
    };
  }

  return {
    insert: insertMock,
    update: updateMock,
  };
});

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import {
  evaluateTaskBeforeAcceptance,
  recordTaskChallenge,
  recordTaskChallengeOutcome,
  resolveTaskChallenge,
} from "../../src/lib/agents/task-challenge-evaluator";

const validCriteriaTask = {
  id: "task-valid",
  description: "Perform the requested work with measurable criteria.",
  required_capabilities: ["typescript"],
  estimated_cost_sats: 50,
  estimated_context_tokens: 500,
  success_criteria: ["Passes unit tests"],
  delegator_id: "delegator-1",
};

const capableAgent = {
  skill_ids: ["typescript"],
  max_budget_sats: 500,
  max_context_tokens: 4000,
  current_context_used_percent: 10,
  ethical_constraints: [
    "no_secret_storage",
    "no_pii_access",
    "no_destructive_actions",
  ],
  verified_capabilities: ["typescript"],
};

describe("task-challenge-evaluator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    singleMock.mockResolvedValue({ data: { id: "challenge-1" }, error: null });
    updateEqMock.mockResolvedValue({ error: null });
  });

  it("flags ambiguous specifications without measurable success criteria", async () => {
    const result = await evaluateTaskBeforeAcceptance(
      {
        id: "task-1",
        description: "Refactor the dashboard when possible",
        required_capabilities: ["typescript"],
        estimated_cost_sats: 50,
        estimated_context_tokens: 500,
        success_criteria: [],
        delegator_id: "delegator-1",
      },
      {
        skill_ids: ["typescript"],
        max_budget_sats: 500,
        max_context_tokens: 4000,
        current_context_used_percent: 10,
        ethical_constraints: ["no_secret_storage"],
        verified_capabilities: ["typescript"],
      },
    );

    expect(result?.challenge_reason).toBe("AMBIGUOUS_SPEC");
  });

  it("flags resource exceed when the task budget is above the agent limit", async () => {
    const result = await evaluateTaskBeforeAcceptance(
      {
        ...validCriteriaTask,
        estimated_cost_sats: 999,
      },
      capableAgent,
    );

    expect(result?.challenge_reason).toBe("RESOURCE_EXCEED");
  });

  it("flags context saturation when projected usage exceeds 90%", async () => {
    const result = await evaluateTaskBeforeAcceptance(
      {
        ...validCriteriaTask,
        estimated_context_tokens: 2000,
      },
      {
        ...capableAgent,
        current_context_used_percent: 50,
      },
    );

    expect(result?.challenge_reason).toBe("CONTEXT_SATURATION");
  });

  it("flags capability mismatch when verified capabilities are missing", async () => {
    const result = await evaluateTaskBeforeAcceptance(
      {
        ...validCriteriaTask,
        required_capabilities: ["typescript", "rust"],
      },
      capableAgent,
    );

    expect(result?.challenge_reason).toBe("CAPABILITY_MISMATCH");
  });

  it("flags ethical concern when the task conflicts with constraints", async () => {
    const result = await evaluateTaskBeforeAcceptance(
      {
        ...validCriteriaTask,
        description:
          "Review private emails and delete records with password hints",
      },
      capableAgent,
    );

    expect(result?.challenge_reason).toBe("ETHICAL_CONCERN");
  });

  it("returns null when the task passes all challenge checks", async () => {
    const result = await evaluateTaskBeforeAcceptance(
      validCriteriaTask,
      capableAgent,
    );

    expect(result).toBeNull();
  });

  it("records a task challenge in the database", async () => {
    const id = await recordTaskChallenge(
      {
        task_id: "task-2",
        challenge_reason: "RESOURCE_EXCEED",
        agent_concern: "Budget is too low.",
        requires_clarification: true,
        suggested_modification: "Increase budget",
        confidence_in_challenge: 95,
      },
      "agent-1",
      "delegator-1",
    );

    expect(id).toBe("challenge-1");
    expect(fromMock).toHaveBeenCalledWith("agent_task_challenges");
  });

  it("records delegator resolution details for learning and audit", async () => {
    await resolveTaskChallenge({
      challengeId: "challenge-1",
      resolution: "OVERRIDE_WITH_EXPLANATION",
      challengeAccepted: false,
      taskProceeded: true,
      delegatorExplanation:
        "The oversight board reviewed the request and supplied bounded acceptance criteria.",
      revisedTaskSpec: { success_criteria: ["Passes unit tests"] },
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resolution: "OVERRIDE_WITH_EXPLANATION",
        challenge_accepted: false,
        task_proceeded: true,
        delegator_explanation:
          "The oversight board reviewed the request and supplied bounded acceptance criteria.",
      }),
    );
    expect(updateEqMock).toHaveBeenCalledWith("id", "challenge-1");
  });

  it("records the final task outcome for challenge-learning follow-up", async () => {
    await recordTaskChallengeOutcome({
      challengeId: "challenge-1",
      finalTaskOutcome: "SUCCESS",
      taskProceeded: true,
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        final_task_outcome: "SUCCESS",
        task_proceeded: true,
      }),
    );
    expect(updateEqMock).toHaveBeenCalledWith("id", "challenge-1");
  });
});
