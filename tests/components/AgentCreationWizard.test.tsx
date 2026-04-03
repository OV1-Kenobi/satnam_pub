import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithAuthMock = vi.fn();

vi.mock("../../src/lib/auth/fetch-with-auth", () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
}));

import AgentCreationWizard from "../../src/components/agents/AgentCreationWizard";

describe("AgentCreationWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchWithAuthMock.mockResolvedValue({
      ok: true,
      json: async () => ({ agent_id: "agent-123", lifecycle_state: "ACTIVE" }),
    });
  });

  it("submits the role, intent, and pay-gate payload to create-agent-with-fees", async () => {
    const onAgentCreated = vi.fn();

    render(
      <AgentCreationWizard
        creationContext={{
          agent_username: "forge-agent",
          nostr_pubkey: "npub1forgeagent",
          family_federation_id: "federation-1",
          bond_amount_sats: 2100,
          bond_payment_type: "lightning",
          bond_payment_proof: "bond-proof",
          preferred_protocol: "lightning",
        }}
        onAgentCreated={onAgentCreated}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByPlaceholderText("Vision title"), {
      target: { value: "Protect family knowledge" },
    });
    fireEvent.change(screen.getByPlaceholderText("High-level purpose"), {
      target: { value: "Preserve knowledge with privacy-first guard rails." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByPlaceholderText("How the agent should operate"), {
      target: { value: "Operate with measurable governance workflows." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(
      screen.getByPlaceholderText(
        "Describe the value context, operating constraints, and success model",
      ),
      { target: { value: "Provide bounded support for federation operations." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Agent" }));

    await waitFor(() => {
      expect(onAgentCreated).toHaveBeenCalledWith("agent-123");
    });

    const request = JSON.parse(fetchWithAuthMock.mock.calls[0][1].body as string) as {
      creator_type: string;
      paygate: { provider: string };
      intent: { vision_title: string; extra_config: { paygate_provider: string } };
    };

    expect(request.creator_type).toBe("human");
    expect(request.paygate.provider).toBe("self_hosted");
    expect(request.intent.vision_title).toBe("Protect family knowledge");
    expect(request.intent.extra_config.paygate_provider).toBe("self_hosted");
  });

  it("blocks progress when intent text appears to include secrets and renders economic failure hints", async () => {
    fetchWithAuthMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "Bond top-up required",
        economic_failure_hint: {
          isFreeTier: false,
          requiredCreationFeeSats: 1500,
          requiredBondAmountSats: 2100,
        },
      }),
    });

    render(
      <AgentCreationWizard
        creationContext={{
          agent_username: "forge-agent",
          nostr_pubkey: "npub1forgeagent",
          family_federation_id: "federation-1",
          bond_amount_sats: 2100,
          bond_payment_type: "lightning",
          bond_payment_proof: "bond-proof",
          preferred_protocol: "lightning",
        }}
        onAgentCreated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByPlaceholderText("Vision title"), {
      target: { value: "Store the nsec1supersecretforlater" },
    });
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/raw nsec material/i)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Vision title"), {
      target: { value: "Safer vision title" },
    });
    fireEvent.change(screen.getByPlaceholderText("High-level purpose"), {
      target: { value: "High-level intent without secrets." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByPlaceholderText("How the agent should operate"), {
      target: { value: "Operate with reviewable governance workflows." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(
      screen.getByPlaceholderText(
        "Describe the value context, operating constraints, and success model",
      ),
      { target: { value: "Support family operations within bounded constraints." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Fallback provider"), {
      target: { value: "aperture" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Agent" }));

    await waitFor(() => {
      expect(screen.getByText(/Bond top-up required/i)).toBeTruthy();
      expect(screen.getByText(/Creation fee:/i)).toBeTruthy();
      expect(screen.getByText(/1500 sats/i)).toBeTruthy();
      expect(screen.getByText(/2100 sats/i)).toBeTruthy();
    });
  });
});
