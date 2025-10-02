import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock rate limiter to always allow
vi.mock("../netlify/functions_active/utils/rate-limiter.js", () => ({
  allowRequest: () => true,
}));

// Mock Supabase client minimal
const mockAuthGetUser = vi.fn(async () => ({
  data: { user: { id: "user_duid_1" } },
  error: null,
}));
const queries: any[] = [];
vi.mock("../netlify/functions_active/supabase.js", () => ({
  getRequestClient: vi.fn(() => ({
    auth: { getUser: mockAuthGetUser },
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn(async (payload: any) => {
        queries.push({ table, action: "insert", payload });
        return { data: null, error: null };
      }),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      head: vi.fn().mockReturnThis(),
      count: vi.fn().mockReturnThis(),
    })),
  })),
}));

// Helper to call handler
async function call(
  route: string,
  method: string,
  body?: any,
  queryParams?: any
) {
  const { handler } = await import(
    "../netlify/functions_active/key-rotation-unified"
  );
  const event: any = {
    httpMethod: method,
    path: `/.netlify/functions/key-rotation-unified/${route}`,
    headers: { authorization: "Bearer a.b.c" },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: queryParams || {},
  };
  return handler(event as any, {} as any);
}

describe("key-rotation-unified CORS", () => {
  it("returns CORS headers on OPTIONS preflight", async () => {
    const { handler } = await import(
      "../netlify/functions_active/key-rotation-unified"
    );
    const res = await handler(
      {
        httpMethod: "OPTIONS",
        path: "/.netlify/functions/key-rotation-unified/start",
      } as any,
      {} as any
    );

    // Type guard to ensure response is not void
    expect(res).toBeDefined();
    expect(res).not.toBeNull();
    if (!res) throw new Error("Handler returned void");

    expect(res.statusCode).toBe(204);
    expect(res.headers).toBeDefined();
    if (res.headers) {
      expect(res.headers["Access-Control-Allow-Origin"]).toBeDefined();
      expect(res.headers["Access-Control-Allow-Methods"]).toContain("OPTIONS");
    }
  });
});

describe("key-rotation-unified routes", () => {
  beforeEach(() => {
    queries.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("start requires auth and returns rotationId", async () => {
    const res = await call("start", "POST", {
      desiredNip05Strategy: "keep",
      desiredLightningStrategy: "keep",
    });

    // Type guard to ensure response is not void
    expect(res).toBeDefined();
    expect(res).not.toBeNull();
    if (!res) throw new Error("Handler returned void");

    expect(res.statusCode).toBe(200);
    expect(res.body).toBeDefined();
    if (res.body) {
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.rotationId).toBeDefined();
    }
    expect(res.headers).toBeDefined();
    if (res.headers) {
      expect(res.headers["Access-Control-Allow-Origin"]).toBeDefined();
    }
  });

  it("status requires rotationId", async () => {
    const res = await call("status", "GET", undefined, { rotationId: "abc" });

    // Type guard to ensure response is not void
    expect(res).toBeDefined();
    expect(res).not.toBeNull();
    if (!res) throw new Error("Handler returned void");

    expect(res.statusCode).toBe(200); // returns 200 with success false? current impl returns 400 on missing; but with abc, ok to hit DB mock
  });
});
