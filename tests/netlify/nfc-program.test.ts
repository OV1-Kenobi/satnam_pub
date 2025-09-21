import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies used by the function under test
vi.mock("../../netlify/functions_active/security/session-manager.js", () => ({
  SecureSessionManager: {
    validateSessionFromHeader: vi.fn(async () => ({ hashedId: "user_hash_1" })),
    createSession: vi.fn(async () => "session_token_mock"),
  },
}));

// Rate limiter always allows in tests
vi.mock("../../netlify/functions_active/utils/rate-limiter.js", () => ({
  allowRequest: () => true,
}));

// Minimal Supabase client mock capturing inserts for verification
const inserts: any[] = [];
vi.mock("../../netlify/functions_active/supabase.js", () => ({
  getRequestClient: vi.fn(() => ({
    from: vi.fn((_table: string) => ({
      insert: vi.fn(async (payload: any) => {
        inserts.push({ table: _table, payload });
        return { data: null, error: null };
      }),
      select: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })),
  })),
}));

describe("nfc-unified /program endpoint", () => {
  beforeEach(() => {
    inserts.length = 0;
    delete (globalThis as any).fetch;
    delete process.env.NTAG424_BRIDGE_URL;
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs program intent when bridge is unconfigured", async () => {
    const { handler } = await import(
      "../../netlify/functions_active/nfc-unified"
    );
    const event = {
      httpMethod: "POST",
      path: "/.netlify/functions/nfc-unified/program",
      headers: { authorization: "Bearer testtoken" },
      body: JSON.stringify({ url: "https://satnam.pub/nfc" }),
    } as any;

    const res = await handler(event as any, {} as any);
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload.success).toBe(true);
    expect(payload.data.programmed).toBe(false);
    // Confirm an insert to ntag424_operations_log happened
    expect(
      inserts.some(
        (i) =>
          i.table === "ntag424_operations_log" &&
          i.payload?.operation_type === "program_intent"
      )
    ).toBe(true);
  });

  it("returns programmed=true when bridge responds ok", async () => {
    // Configure bridge and mock fetch
    process.env.NTAG424_BRIDGE_URL = "https://bridge.local";
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { applied: true } }),
    })) as any;

    const { handler } = await import(
      "../../netlify/functions_active/nfc-unified"
    );
    const event = {
      httpMethod: "POST",
      path: "/.netlify/functions/nfc-unified/program",
      headers: { authorization: "Bearer testtoken" },
      body: JSON.stringify({ url: "https://satnam.pub/nfc", enableSDM: true }),
    } as any;

    const res = await handler(event as any, {} as any);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.programmed).toBe(true);
    // Confirm an insert to ntag424_operations_log happened
    expect(
      inserts.some(
        (i) =>
          i.table === "ntag424_operations_log" &&
          i.payload?.operation_type === "program_intent"
      )
    ).toBe(true);
    // Ensure fetch was called with bridge endpoint
    expect((globalThis as any).fetch).toHaveBeenCalledOnce();
  });
});
