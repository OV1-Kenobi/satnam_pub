import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithAuthMock = vi.fn();
const globalFetchMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastWarningMock = vi.fn();
const toastErrorMock = vi.fn();
const toastInfoMock = vi.fn();

const selectedAgent = {
  agent_id: "11111111-1111-4111-8111-111111111111",
  agent_name: "CodeBot-Pro",
  reputation_score: 4.2,
  reported_confidence: 85,
  estimated_cost_sats: 500,
  similar_task_success_rate: 68,
  recommended_task_type: "compute" as const,
  capabilities: {
    skill_ids: ["typescript", "testing"],
    max_budget_sats: 750,
    max_context_tokens: 4096,
    current_context_used_percent: 35,
    ethical_constraints: [
      "no_secret_storage",
      "no_pii_access",
      "no_destructive_actions",
    ],
    verified_capabilities: ["typescript", "testing"],
  },
};

vi.mock("../../../components/TaskVerifiabilityChecker", () => ({
  TaskVerifiabilityChecker: ({ onAssessmentComplete }: { onAssessmentComplete?: (result: { can_proceed: boolean }) => void }) => (
    <button
      type="button"
      onClick={() => onAssessmentComplete?.({ can_proceed: true })}
    >
      Approve Verifiability
    </button>
  ),
}));

vi.mock("../../../components/AgentSelectionWithCalibration", () => ({
  AgentSelectionWithCalibration: ({ onSelectAgent }: { onSelectAgent: (agent: typeof selectedAgent) => void }) => (
    <button type="button" onClick={() => onSelectAgent(selectedAgent)}>
      Select Mock Agent
    </button>
  ),
}));

vi.mock("../../src/components/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "99999999-9999-4999-8999-999999999999",
      npub: "npub1delegator",
    },
  }),
}));

vi.mock("../../src/lib/auth/fetch-with-auth", () => ({
  fetchWithAuth: fetchWithAuthMock,
}));

vi.mock("../../src/services/toastService", () => ({
  showToast: {
    success: toastSuccessMock,
    warning: toastWarningMock,
    error: toastErrorMock,
    info: toastInfoMock,
  },
}));

function makeResponse(status: number, jsonValue: Record<string, unknown>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonValue,
  };
}

describe("CreateTaskPage", () => {
  beforeEach(() => {
    globalFetchMock.mockReset();
    globalFetchMock.mockResolvedValue(
      makeResponse(200, {
        verifiability_score: 88,
        verification_method: "unit_tests",
        requires_decomposition: false,
        dispute_risk: "LOW",
        can_proceed: true,
        estimated_verification_cost_sats: 25,
        warnings: [],
      }),
    );
    vi.stubGlobal("fetch", globalFetchMock);
    fetchWithAuthMock.mockReset();
    toastSuccessMock.mockReset();
    toastWarningMock.mockReset();
    toastErrorMock.mockReset();
    toastInfoMock.mockReset();
  });

  it("records a task challenge, then resolves it on override before creating the task", async () => {
    fetchWithAuthMock
      .mockResolvedValueOnce(
        makeResponse(200, {
          challenge_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      )
      .mockResolvedValueOnce(makeResponse(200, { success: true }))
      .mockResolvedValueOnce(
        makeResponse(201, {
          task_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        }),
      );

    const { default: CreateTaskPage } = await import("../../src/pages/tasks/create");

    render(<CreateTaskPage />);

    fireEvent.change(screen.getByPlaceholderText("Describe the task in detail..."), {
      target: { value: "Investigate the issue and produce a fix." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check Verifiability" }));
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Select Agent" }).length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Select Agent" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Create Task & Delegate" }));

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        "/api/agents/task-challenge-record",
        expect.any(Object),
      );
    });

    expect(screen.getByText(/has concerns about this task/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Override with Explanation" }));
    fireEvent.change(
      screen.getByPlaceholderText("Provide clear reasoning for overriding the agent's concern..."),
      {
        target: {
          value: "We reviewed the scope and attached measurable acceptance criteria.",
        },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm Override" }));

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenNthCalledWith(
        2,
        "/api/agents/task-challenge-resolve",
        expect.objectContaining({ method: "POST" }),
      );
      expect(fetchWithAuthMock).toHaveBeenNthCalledWith(
        3,
        "/api/agents/task-record-create",
        expect.objectContaining({ method: "POST" }),
      );
    });

    expect(toastWarningMock).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith("Task delegated successfully.");
  });

  it("creates a task immediately when success criteria are measurable", async () => {
    fetchWithAuthMock.mockResolvedValueOnce(
      makeResponse(201, {
        task_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      }),
    );

    const { default: CreateTaskPage } = await import("../../src/pages/tasks/create");

    render(<CreateTaskPage />);

    fireEvent.change(screen.getByPlaceholderText("Describe the task in detail..."), {
      target: { value: "Implement the fix and verify it." },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Add one measurable success criterion per line"),
      {
        target: { value: "Passes unit tests" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Check Verifiability" }));
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Select Agent" }).length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Select Agent" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Create Task & Delegate" }));

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        "/api/agents/task-record-create",
        expect.any(Object),
      );
    });

    expect(toastSuccessMock).toHaveBeenCalledWith("Task delegated successfully.");
  });
});