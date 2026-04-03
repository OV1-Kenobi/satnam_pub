import { beforeEach, describe, expect, it, vi } from "vitest";

const mockValidateSessionFromHeader = vi.fn<
  (authHeader: string | undefined) => Promise<{ userId: string } | null>
>();
const mockCheckRateLimitStatus = vi.fn<
  (id: string, cfg: any) => Promise<{ allowed: boolean }>
>();

let lastFromView: string | null = null;
let lastOrderColumn: string | null = null;
let lastEq: Array<{ col: string; val: string }> = [];
let lastRange: { from: number; to: number } | null = null;
const mockGetRequestClient = vi.fn<(token?: string) => any>();

function makeEvent(
  overrides: Partial<{ httpMethod: string; headers: any; queryStringParameters: any }> = {},
) {
  return {
    httpMethod: "GET",
    headers: { origin: "http://localhost", authorization: "Bearer testtoken" },
    queryStringParameters: {},
    ...overrides,
  } as any;
}

function setSupabaseResult(result: { data: any[]; count?: number; error?: any }) {
  lastFromView = null;
  lastOrderColumn = null;
  lastEq = [];
  lastRange = null;

  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string, val: string) => {
      lastEq.push({ col, val });
      return builder;
    }),
    order: vi.fn((col: string) => {
      lastOrderColumn = col;
      return builder;
    }),
    range: vi.fn(async (from: number, to: number) => {
      lastRange = { from, to };
      return {
        data: result.data,
        count: result.count ?? result.data.length,
        error: result.error ?? null,
      };
    }),
  };

  const client: any = {
    from: vi.fn((view: string) => {
      lastFromView = view;
      return builder;
    }),
  };

  mockGetRequestClient.mockReturnValue(client);
}

vi.mock("../../netlify/functions/security/session-manager.js", () => ({
  SecureSessionManager: {
    validateSessionFromHeader: mockValidateSessionFromHeader,
  },
}));

vi.mock("../../netlify/functions/supabase.js", () => ({
  getRequestClient: mockGetRequestClient,
}));

vi.mock("../../netlify/functions_active/utils/enhanced-rate-limiter.js", () => ({
  RATE_LIMITS: { SESSION_QUERY: { limit: 30, windowMs: 60000 } },
  getClientIP: () => "1.2.3.4",
  createRateLimitIdentifier: (id?: string) => `ip:${id ?? "unknown"}`,
  checkRateLimitStatus: mockCheckRateLimitStatus,
}));

describe("GET /api/agents/performance-report", () => {
  beforeEach(() => {
    vi.resetModules();
    mockValidateSessionFromHeader.mockResolvedValue({
      userId: "550e8400-e29b-41d4-a716-446655440000",
    });
    mockCheckRateLimitStatus.mockResolvedValue({ allowed: true });
    mockGetRequestClient.mockReset();
    setSupabaseResult({ data: [], count: 0 });
  });

  it("handles OPTIONS preflight", async () => {
    const { handler } = await import(
      "../../netlify/functions/agents/performance-report.ts"
    );
    const res = await (handler as any)(
      makeEvent({ httpMethod: "OPTIONS" }),
      {} as any,
    );
    expect(res.statusCode).toBe(204);
  });

  it("returns 401 when Authorization header is missing", async () => {
    const { handler } = await import(
      "../../netlify/functions/agents/performance-report.ts"
    );
    const res = await (handler as any)(
      makeEvent({ headers: { origin: "http://localhost" } }),
      {} as any,
    );
    expect(res.statusCode).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimitStatus.mockResolvedValueOnce({ allowed: false });
    const { handler } = await import(
      "../../netlify/functions/agents/performance-report.ts"
    );
    const res = await (handler as any)(makeEvent(), {} as any);
    expect(res.statusCode).toBe(429);
  });

  it("queries daily report by default and returns pagination", async () => {
    setSupabaseResult({
      data: [
        {
          report_date: "2026-03-03",
          agent_id: "550e8400-e29b-41d4-a716-446655440000",
          tasks_completed: 2,
          total_tokens: 123,
          total_cost_sats: 10,
        },
      ],
      count: 1,
    });

    const { handler } = await import(
      "../../netlify/functions/agents/performance-report.ts"
    );
    const res = await (handler as any)(
      makeEvent({ queryStringParameters: { page: "1", limit: "50" } }),
      {} as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["Cache-Control"]).toContain("private");

    const body = JSON.parse(res.body as string);
    expect(body.success).toBe(true);
    expect(body.range).toBe("daily");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination.total).toBe(1);

    expect(mockGetRequestClient).toHaveBeenCalledWith("testtoken");
    expect(lastFromView).toBe("agent_daily_report");
    expect(lastOrderColumn).toBe("report_date");
  });

  it("queries weekly report when range=weekly", async () => {
    const { handler } = await import(
      "../../netlify/functions/agents/performance-report.ts"
    );
    const res = await (handler as any)(
      makeEvent({ queryStringParameters: { range: "weekly" } }),
      {} as any,
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.range).toBe("weekly");
    expect(lastFromView).toBe("agent_weekly_report");
    expect(lastOrderColumn).toBe("week_start_date");
  });

  it("applies agent_id filter and rejects invalid UUID", async () => {
    const { handler } = await import(
      "../../netlify/functions/agents/performance-report.ts"
    );

    const bad = await (handler as any)(
      makeEvent({ queryStringParameters: { agent_id: "not-a-uuid" } }),
      {} as any,
    );
    expect(bad.statusCode).toBe(400);

    const goodUuid = "550e8400-e29b-41d4-a716-446655440000";
    await (handler as any)(
      makeEvent({ queryStringParameters: { agent_id: goodUuid } }),
      {} as any,
    );
    expect(lastEq.some((f) => f.col === "agent_id" && f.val === goodUuid)).toBe(
      true,
    );
  });
});
