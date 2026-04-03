import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/crypto/blind-tokens", () => ({
  BlindTokenManager: class {
    async initialize() {
      return undefined;
    }

    getBalance() {
      return 2;
    }
  },
}));

import ActionButtons from "../../src/components/ActionButtons";

describe("ActionButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("surfaces the anonymous token choice for an action", async () => {
    const onActionRequest = vi.fn();

    render(<ActionButtons agentId="agent-1" onActionRequest={onActionRequest} />);

    await waitFor(() => {
      expect(screen.getAllByText("2 anonymous tokens available")).toHaveLength(4);
    });

    fireEvent.click(screen.getByRole("button", { name: /Publish Event/i }));
    fireEvent.click(screen.getByRole("button", { name: "Use Anonymous Token" }));

    expect(onActionRequest).toHaveBeenCalledWith({
      actionType: "event_post",
      paymentMethod: "blind_token",
      feeSats: 21,
    });
  });

  it("links to blind token purchase when balances are low", async () => {
    const onPurchaseRequest = vi.fn();

    render(<ActionButtons agentId="agent-1" onPurchaseRequest={onPurchaseRequest} />);

    await waitFor(() => {
      expect(screen.getAllByText("2 anonymous tokens available")).toHaveLength(4);
    });

    fireEvent.click(screen.getByRole("button", { name: /Create Task/i }));
    fireEvent.click(screen.getByRole("button", { name: "Buy More Tokens" }));

    expect(onPurchaseRequest).toHaveBeenCalledWith({
      tokenType: "task_create",
      quantity: 10,
      totalFeeSats: 1500,
    });
  });
});
