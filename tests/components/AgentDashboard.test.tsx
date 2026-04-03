import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockWriteText = vi.fn<(_value: string) => Promise<void>>(() => Promise.resolve());

vi.mock("../../src/services/toastService", () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../src/lib/crypto/blind-tokens", () => ({
  BlindTokenManager: class {
    async initialize() {
      return undefined;
    }

    getBalance() {
      return 3;
    }
  },
}));

vi.mock("../../src/lib/supabase", () => {
  const userIdentitiesResult = {
    data: {
      id: "agent-1",
      npub: "npub1agent",
      nip05: "agent@ai.satnam.pub",
      role: "adult",
      agent_profiles: {
        unified_address: "agent@ai.satnam.pub",
        reputation_score: 42,
        credit_limit_sats: 25000,
        current_bonded_sats: 5000,
        total_bonds_released_sats: 2500,
        total_bonds_staked_sats: 5000,
        free_tier_claimed: true,
        free_tier_allocation_number: 12,
        tier1_validations: 3,
        tier2_validations: 2,
        tier3_validations: 1,
        event_tokens_balance: 8,
        task_tokens_balance: 4,
        contact_tokens_balance: 2,
        dm_tokens_balance: 6,
        total_platform_fees_paid_sats: 2100,
      },
      payment_config: {
        unified_address: "agent@ai.satnam.pub",
        lightning_enabled: true,
        cashu_enabled: true,
        fedimint_enabled: true,
        total_received_lightning_sats: 12000,
        total_received_cashu_sats: 500,
        total_received_fedimint_sats: 300,
      },
    },
    error: null,
  };

  const feeRows = {
    data: [
      {
        id: "fee-1",
        action_type: "agent_account_creation",
        fee_sats: 1000,
        payment_protocol: "lightning",
        paid_at: "2026-03-07T12:00:00.000Z",
      },
    ],
    error: null,
  };

  const sig4satsRows = {
    data: [
      {
        id: "earn-1",
        purpose: "sig4sats_event_signature_payment",
        amount_sats: 210,
        received_at: "2026-03-07T12:10:00.000Z",
      },
    ],
    error: null,
  };

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === "user_identities") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue(userIdentitiesResult),
              })),
            })),
          };
        }

        if (table === "platform_revenue") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn().mockResolvedValue(feeRows),
                  })),
                })),
              })),
            })),
          };
        }

        if (table === "agent_payment_receipts") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  like: vi.fn(() => ({
                    order: vi.fn().mockResolvedValue(sig4satsRows),
                  })),
                })),
              })),
            })),
          };
        }

        throw new Error(`Unexpected table queried in test: ${table}`);
      }),
    },
  };
});

import AgentDashboard from "../../src/components/AgentDashboard";

describe("AgentDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    });
  });

  it("renders token balances, payment history, and sig4sats earnings", async () => {
    render(<AgentDashboard agentId="agent-1" />);

    await waitFor(() => {
      expect(screen.getByText("Blind Token Balances")).toBeTruthy();
      expect(screen.getByText("agent account creation")).toBeTruthy();
      expect(screen.getByText("event signature payment")).toBeTruthy();
    });

    expect(screen.getByRole("heading", { name: "agent@ai.satnam.pub" })).toBeTruthy();
    expect(screen.getByText("Free Tier #12")).toBeTruthy();
    expect(screen.getByText("Event Publishing")).toBeTruthy();
    expect(screen.getByText("Task Creation")).toBeTruthy();
    expect(screen.getByText("Total Sig4Sats Earned:", { exact: false })).toBeTruthy();
    expect(screen.getByText("⚡ Lightning")).toBeTruthy();
    expect(screen.getByText("🥜 Cashu")).toBeTruthy();
    expect(screen.getByText("🏛️ Fedimint")).toBeTruthy();
  });

  it("copies the unified payment address", async () => {
    render(<AgentDashboard agentId="agent-1" />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("agent@ai.satnam.pub")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith("agent@ai.satnam.pub");
    });
  });

  it("updates selected purchase state when a token button is clicked", async () => {
    render(<AgentDashboard agentId="agent-1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Buy 10 (210 sats)" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Buy 10 (210 sats)" }));

    expect(screen.getByText(/Selected purchase: 10 event post tokens for 210 sats\./i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Purchase Blind Tokens" })).toBeTruthy();
  });
});