import { describe, expect, it, vi } from "vitest";

import {
  parseAgentWalletRoute,
  selectSpendRail,
} from "../../netlify/functions/agents/agent-wallet-helpers";

describe("agent-wallet route parsing", () => {
  it("maps public v1 routes to wallet actions", () => {
    expect(parseAgentWalletRoute("/v1/agent-wallet")).toBe("balance");
    expect(parseAgentWalletRoute("/v1/agent-wallet/pay")).toBe("pay");
    expect(parseAgentWalletRoute("/v1/agent-wallet/send")).toBe("send");
    expect(parseAgentWalletRoute("/v1/agent-wallet/receive")).toBe("receive");
    expect(parseAgentWalletRoute("/v1/agent-wallet/history")).toBe("history");
    expect(parseAgentWalletRoute("/v1/nope")).toBeNull();
  });
});

describe("agent-wallet rail selection", () => {
  it("prefers cashu for privacy-sensitive small sends when balance is available", () => {
    expect(
      selectSpendRail({
        requestedRail: "auto",
        preferredRail: "auto",
        privacyPreference: "high",
        amountSats: 1000,
        hasLightningTarget: true,
        hasCashuCapability: true,
        cashuBalanceSats: 5000,
      }),
    ).toBe("cashu");
  });

  it("falls back to lightning when cashu cannot cover the payment", () => {
    expect(
      selectSpendRail({
        requestedRail: "auto",
        preferredRail: "cashu",
        privacyPreference: "balanced",
        amountSats: 20000,
        hasLightningTarget: true,
        hasCashuCapability: true,
        cashuBalanceSats: 1000,
      }),
    ).toBe("lightning");
  });

  it("honors an explicitly requested rail", () => {
    expect(
      selectSpendRail({
        requestedRail: "lightning",
        preferredRail: "cashu",
        privacyPreference: "high",
        amountSats: 1000,
        hasLightningTarget: true,
        hasCashuCapability: true,
        cashuBalanceSats: 100000,
      }),
    ).toBe("lightning");
  });
});

const mockValidateSessionFromHeader = vi.fn();
const getBalanceMock = vi.fn();

vi.mock("../../netlify/functions/security/session-manager.js", () => ({
  SecureSessionManager: {
    validateSessionFromHeader: mockValidateSessionFromHeader,
  },
}));

vi.mock("../../netlify/functions/agents/unified-wallet-service.js", () => ({
  UnifiedWalletService: class {
    async getBalance(agentId) {
      return await getBalanceMock(agentId);
    }
  },
}));

describe("agent-wallet handler", () => {
  it("returns wallet balance for authenticated agent JWTs", async () => {
    mockValidateSessionFromHeader.mockResolvedValue({
      isAuthenticated: true,
      userId: "agent-123",
    });
    getBalanceMock.mockResolvedValue({ success: true, balance_sats: { total: 42 } });

    const { handler } = await import("../../netlify/functions/agent-wallet.ts");
    const response = await handler(
      {
        httpMethod: "GET",
        path: "/v1/agent-wallet",
        headers: {
          origin: "https://satnam.pub",
          authorization: "Bearer wallet-jwt",
        },
      } as never,
      {} as never,
    );

    expect(response.statusCode).toBe(200);
    expect(getBalanceMock).toHaveBeenCalledWith("agent-123");
    expect(String(response.body)).toContain("42");
  });
});
