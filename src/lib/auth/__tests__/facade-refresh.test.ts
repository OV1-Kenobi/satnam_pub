import { describe, it, expect, beforeEach, vi } from "vitest";
import SecureTokenManager from "../../auth/secure-token-manager";

describe("Client auth facade - refresh", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // @ts-ignore
    global.fetch = vi.fn();
  });

  it("silentRefresh calls /api/auth/refresh and stores new token", async () => {
    const token = [btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })), btoa(JSON.stringify({ userId: "u3", hashedId: "h3", exp: Math.floor(Date.now()/1000)+900, type: "access", sessionId: "s3" })), "sig"].join(".");

    // @ts-ignore
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: async () => ({ accessToken: token, accessTokenExpiry: Date.now() + 900_000 }),
    });

    const refreshed = await SecureTokenManager.silentRefresh();
    expect(refreshed).toBeTruthy();

    // Confirm endpoint and credentials
    expect((global.fetch as any)).toHaveBeenCalledWith(
      "/api/auth/refresh",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );

    const payload = SecureTokenManager.parseTokenPayload(refreshed!);
    expect(payload?.type).toBe("access");
  });
});

