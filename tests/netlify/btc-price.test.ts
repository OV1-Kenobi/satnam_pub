import { describe, expect, it } from "vitest";

function makeEvent() {
  return {
    httpMethod: "GET",
    headers: {},
    queryStringParameters: {},
  } as any;
}

describe("btc-price endpoint", () => {
  it("returns BTC price in USD with caching metadata", async () => {
    const { handler } = await import(
      "../../netlify/functions_active/btc-price.ts"
    );

    const res = await (handler as any)(makeEvent(), {} as any);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);

    expect(body.success).toBe(true);
    expect(typeof body.price_usd).toBe("number");
    expect(typeof body.timestamp).toBe("string");
    expect(typeof body.cached).toBe("boolean");
    expect(typeof body.cache_expires_at).toBe("string");
  });
});
