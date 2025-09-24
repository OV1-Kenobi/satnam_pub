import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

function makeEvent(body: any, ip = "10.0.0.1") {
  return {
    httpMethod: "POST",
    headers: { "x-forwarded-for": ip },
    body: JSON.stringify(body),
  } as any;
}

describe("trust-score endpoint", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("calculates expected score and level", async () => {
    const { handler } = await import(
      "../netlify/functions_active/trust-score.ts"
    );
    const res = await handler(
      makeEvent({
        physicallyVerified: true,
        vpVerified: true,
        socialAttestations: { count: 3, distinctIssuers: 2, recentCount30d: 1 },
        recencyDays: 45,
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    // physical 30 + vp 30 + social (3*5 + 2*2 + 1 = 20); recency 0 => 80
    expect(body.data.score).toBe(80);
    expect(body.data.level).toBe("high");
  });

  it("handles missing fields and boundary values", async () => {
    const { handler } = await import(
      "../netlify/functions_active/trust-score.ts"
    );
    const res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.data.score).toBe("number");
    expect(["low", "medium", "high"]).toContain(body.data.level);

    // Recency penalty at 180d => -15
    const res2 = await handler(makeEvent({ recencyDays: 180 }));
    const b2 = JSON.parse(res2.body);
    expect(b2.data.components.recencyPenalty).toBe(-15);
  });

  it("rate limits when allowRequest denies", async () => {
    const rlPath = path.resolve(
      process.cwd(),
      "netlify/functions_active/utils/rate-limiter.js"
    );
    await vi.doMock(rlPath, () => ({ allowRequest: () => false }));
    const { handler } = await import(
      "../netlify/functions_active/trust-score.ts"
    );
    const res = await handler(
      makeEvent({ physicallyVerified: true }, "1.2.3.4")
    );
    expect(res.statusCode).toBe(429);
  });
});
