import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithAuthMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("../../src/lib/auth/fetch-with-auth", () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
}));

vi.mock("../../src/components/AgentDashboard", () => ({
  default: ({ agentId }: { agentId: string }) => <div>AgentDashboard:{agentId}</div>,
}));

vi.mock("../../src/services/toastService", () => ({
  showToast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

import AgentManagementDashboard from "../../src/components/agents/AgentManagementDashboard";

describe("AgentManagementDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchWithAuthMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          agents: [
            {
              id: "agent-1",
              unified_address: "agent@ai.satnam.pub",
              agent_role: "adult",
              lifecycle_state: "ACTIVE",
              reputation_score: 50,
              free_tier_claimed: true,
              free_tier_allocation_number: 8,
              required_bond_amount_sats: 2100,
              intent_vision_title: "Keep records organized",
              intent_mission_summary: "Deliver bounded support",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        status: 404,
        ok: false,
        json: async () => ({ error: "Intent not found" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: 1 }),
      });
  });

  it("loads managed agents, shows the selected dashboard, and saves intent edits", async () => {
    render(<AgentManagementDashboard />);

    await waitFor(() => {
      expect(screen.getByText("agent@ai.satnam.pub")).toBeTruthy();
      expect(screen.getByText("AgentDashboard:agent-1")).toBeTruthy();
      expect(screen.getByText("Reputation 50")).toBeTruthy();
      expect(screen.getByText("Free Tier #8")).toBeTruthy();
      expect(screen.getAllByText("Bond Required").length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Vision title")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Vision title"), {
      target: { value: "Updated vision" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Intent" }));

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenCalledTimes(3);
      expect(toastSuccessMock).toHaveBeenCalled();
    });

    const saveRequest = JSON.parse(fetchWithAuthMock.mock.calls[2][1].body as string) as {
      agent_id: string;
      intent: { vision_title: string };
    };

    expect(saveRequest.agent_id).toBe("agent-1");
    expect(saveRequest.intent.vision_title).toBe("Updated vision");
    expect(screen.getByText("Updated vision")).toBeTruthy();
  });
});
