import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  delete process.env.LLM_PROXY_RATE_LIMIT;
  delete process.env.LLM_PROXY_RATE_WINDOW_MS;
  vi.resetModules();
});

describe("RATE_LIMITS.LLM_PROXY env configuration", () => {
  it("uses defaults when env vars are not set", async () => {
    const { RATE_LIMITS } = await import(
      "../../netlify/functions_active/utils/enhanced-rate-limiter.js"
    );

    expect(RATE_LIMITS.LLM_PROXY.limit).toBe(1000);
    expect(RATE_LIMITS.LLM_PROXY.windowMs).toBe(60 * 60 * 1000);
  });

  it("respects LLM_PROXY_RATE_LIMIT and LLM_PROXY_RATE_WINDOW_MS overrides", async () => {
    process.env.LLM_PROXY_RATE_LIMIT = "2500";
    process.env.LLM_PROXY_RATE_WINDOW_MS = "120000";

    const { RATE_LIMITS } = await import(
      "../../netlify/functions_active/utils/enhanced-rate-limiter.js"
    );

    expect(RATE_LIMITS.LLM_PROXY.limit).toBe(2500);
    expect(RATE_LIMITS.LLM_PROXY.windowMs).toBe(120000);
  });

  it("falls back to defaults on invalid env values", async () => {
    process.env.LLM_PROXY_RATE_LIMIT = "-10";
    process.env.LLM_PROXY_RATE_WINDOW_MS = "not-a-number";

    const { RATE_LIMITS } = await import(
      "../../netlify/functions_active/utils/enhanced-rate-limiter.js"
    );

    expect(RATE_LIMITS.LLM_PROXY.limit).toBe(1000);
    expect(RATE_LIMITS.LLM_PROXY.windowMs).toBe(60 * 60 * 1000);
  });
});

