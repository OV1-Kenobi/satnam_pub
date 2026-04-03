import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const purchaseTokensMock = vi.fn();

vi.mock("../../src/lib/crypto/blind-signatures", () => ({
  blindMessage: vi.fn(async () => ({
    blindedMessage: "blinded-message",
    blindingFactor: "blinding-factor",
  })),
}));

vi.mock("../../src/lib/crypto/blind-tokens", () => ({
  BlindTokenManager: class {
    async initialize() {
      return undefined;
    }

    async purchaseTokens(...args: unknown[]) {
      return purchaseTokensMock(...args);
    }
  },
}));

vi.mock("../../src/services/toastService", () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import TokenPurchaseModal from "../../src/components/TokenPurchaseModal";

describe("TokenPurchaseModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    purchaseTokensMock.mockResolvedValue([]);
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 402,
      json: async () => ({ payment_request: "lnbc210invoice" }),
    })) as unknown as typeof fetch;
  });

  it("requests an invoice and completes a purchase", async () => {
    render(
      <TokenPurchaseModal
        isOpen={true}
        agentId="agent-1"
        tokenType="event_post"
        quantity={10}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate Payment Invoice" }));

    await waitFor(() => {
      expect(screen.getByText("Payment Invoice")).toBeTruthy();
      expect(screen.getByText("lnbc210invoice")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Payment Proof"), {
      target: { value: "proof-123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Complete Purchase" }));

    await waitFor(() => {
      expect(purchaseTokensMock).toHaveBeenCalledWith(
        "agent-1",
        "event_post",
        10,
        "proof-123",
        "lightning",
      );
    });
  });
});
