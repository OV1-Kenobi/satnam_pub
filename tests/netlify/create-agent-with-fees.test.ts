import { beforeEach, describe, expect, it, vi } from "vitest";

const authGetUserMock = vi.fn();
const userIdentitySingleMock = vi.fn();

vi.mock("../../netlify/functions_active/supabase", () => ({
  getRequestClient: () => ({
    auth: { getUser: authGetUserMock },
    from: (table: string) => {
      if (table === "user_identities") {
        return {
          select: () => ({
            eq: () => ({ single: userIdentitySingleMock }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

vi.mock("../../src/lib/crypto/blind-tokens", () => ({
  BlindTokenManager: class {},
}));

vi.mock("../../netlify/functions_active/utils/payment-verification", () => ({
  verifyCashuToken: vi.fn(),
  verifyFedimintTxid: vi.fn(),
  verifyLightningPreimage: vi.fn(),
}));

function makeEvent(body: Record<string, unknown>) {
  return {
    headers: {
      authorization: "Bearer test-token",
    },
    body: JSON.stringify(body),
  } as any;
}

function readError(response: { body?: string; error?: string }) {
  if (response.body) {
    return JSON.parse(response.body).error as string;
  }

  return response.error || "";
}

const validRequest = {
  agent_role: "guardian",
  agent_username: "federation-agent",
  nostr_pubkey: "npub123",
  bond_amount_sats: 1000,
  bond_payment_type: "lightning",
  bond_payment_proof: "proof",
  preferred_protocol: "lightning",
} as const;

describe("create-agent-with-fees", () => {
  beforeEach(() => {
    vi.resetModules();
    authGetUserMock.mockReset();
    userIdentitySingleMock.mockReset();
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
  });

  it("accepts expanded platform roles and then requires federation context", async () => {
    userIdentitySingleMock.mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        family_federation_id: null,
      },
      error: null,
    });

    const { handler } =
      await import("../../netlify/functions/agents/create-agent-with-fees");
    const response = await handler(makeEvent(validRequest));

    expect(readError(response)).toContain("family_federation_id is required");
  });

  it("rejects non-platform roles", async () => {
    const { handler } =
      await import("../../netlify/functions/agents/create-agent-with-fees");
    const response = await handler(
      makeEvent({ ...validRequest, agent_role: "admin" }),
    );

    expect(readError(response)).toContain("Invalid agent_role");
  });
});
