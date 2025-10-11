/**
 * LNbits Client
 * - Browser: calls Netlify proxy (no keys in bundle)
 * - Server: can call LNbits directly with injected key resolver
 *
 * The client keeps the request/response shape compatible with existing endpoints.
 */

export type LNbitsKeyResolver = {
  // Returns an API key suitable for the requested operation
  // - "admin" for admin operations (user/wallet create)
  // - "wallet" for per-user wallet operations
  resolveKey: (
    scope: "admin" | "wallet",
    context?: Record<string, unknown>
  ) => Promise<string>;
};

export type LNbitsClientOptions = {
  baseUrl: string; // LNbits base (server-side usage only)
  proxyUrl?: string; // Netlify proxy URL (browser usage)
  keyResolver?: LNbitsKeyResolver; // Server-only key resolver
  fetchImpl?: typeof fetch;
};

export class LNbitsClient {
  private baseUrl: string;
  private proxyUrl?: string;
  private keyResolver?: LNbitsKeyResolver;
  private fetchImpl: typeof fetch;

  constructor(opts: LNbitsClientOptions) {
    this.baseUrl = opts.baseUrl;
    this.proxyUrl = opts.proxyUrl;
    this.keyResolver = opts.keyResolver;
    this.fetchImpl = opts.fetchImpl || fetch.bind(globalThis);
  }

  private isBrowser() {
    return typeof window !== "undefined";
  }

  // Generic proxy caller preserving { success, data | error }
  private async callProxy(action: string, payload: unknown) {
    if (!this.proxyUrl) throw new Error("Proxy URL not configured");
    const res = await this.fetchImpl(this.proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
      credentials: "include",
    });
    let json;
    try {
      json = await res.json();
    } catch (e) {
      throw new Error(`Proxy returned non-JSON response: ${res.status}`);
    }
    if (!res.ok || json?.success === false) {
      const msg = json?.error || `Proxy error: ${res.status}`;
      throw new Error(msg);
    }
    return json;
  }

  // Example methods (align with your existing endpoints):

  async payInvoice(params: {
    invoice: string;
    maxFeeSats?: number;
    memo?: string;
  }) {
    if (this.isBrowser()) {
      return this.callProxy("payInvoice", params);
    }
    // Server-side direct call (requires keyResolver)
    if (!this.keyResolver)
      throw new Error("keyResolver required for server-side LNbits usage");
    const apiKey = await this.keyResolver.resolveKey("wallet", {
      op: "payInvoice",
    });
    const url = new URL("/api/v1/payments", this.baseUrl).toString();
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        out: true,
        bolt11: params.invoice,
        memo: params.memo,
        ...(params.maxFeeSats !== undefined && { max_fee: params.maxFeeSats }),
      }),
    });
    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error(`LNbits returned non-JSON response: ${res.status}`);
    }
    if (!res.ok) throw new Error(data?.detail || "LNbits payInvoice failed");
    return { success: true, data } as const;
  }

  async getPaymentHistory(params: { limit?: number; offset?: number }) {
    if (this.isBrowser()) {
      return this.callProxy("getPaymentHistory", params);
    }
    if (!this.keyResolver)
      throw new Error("keyResolver required for server-side LNbits usage");
    const apiKey = await this.keyResolver.resolveKey("wallet", {
      op: "getPaymentHistory",
    });
    const url = new URL(
      `/api/v1/payments?limit=${params.limit ?? 50}&offset=${
        params.offset ?? 0
      }`,
      this.baseUrl
    ).toString();
    const res = await this.fetchImpl(url, { headers: { "X-Api-Key": apiKey } });
    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error(`LNbits returned non-JSON response: ${res.status}`);
    }
    if (!res.ok)
      throw new Error(data?.detail || "LNbits getPaymentHistory failed");
    return { success: true, data } as const;
  }

  async getWalletUrl(params: { walletId: string }) {
    // Purely computed; keeps response shape
    const dashboardUrl = `${this.baseUrl}/wallet?wal=${encodeURIComponent(
      params.walletId
    )}`;
    return { success: true, data: { url: dashboardUrl } } as const;
  }
}
