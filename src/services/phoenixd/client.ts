/**
 * Phoenixd Client (server-only)
 * - Wraps REST calls with Basic Auth (":" + apiPassword)
 * - Intended for use inside Netlify Functions or Node scripts
 */

export type PhoenixdConfig = {
  apiUrl: string;
  apiPassword: string;
};

export class PhoenixdClient {
  private apiUrl: string;
  private authHeader: string;
  private fetchImpl: typeof fetch;

  constructor(cfg: PhoenixdConfig, fetchImpl?: typeof fetch) {
    if (typeof window !== "undefined") {
      throw new Error("PhoenixdClient is server-only. Use the Netlify proxy from the browser.");
    }
    this.apiUrl = cfg.apiUrl.replace(/\/$/, "");
    this.authHeader =
      "Basic " + Buffer.from(":" + cfg.apiPassword).toString("base64");
    this.fetchImpl = fetchImpl || fetch.bind(globalThis);
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.apiUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
    });
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const msg = json?.message || json?.error || `phoenixd error ${res.status}`;
      throw new Error(msg);
    }
    return json as T;
  }

  healthCheck() {
    return this.req<{ ok: boolean }>(`/health`);
  }
  getNodeInfo() {
    return this.req(`/getinfo`);
  }
  getBalance() {
    return this.req(`/balance`);
  }
  decodeInvoice(bolt11: string) {
    return this.req(`/decodeinvoice?invoice=${encodeURIComponent(bolt11)}`);
  }
  createInvoice(params: { amountMsat: number; description?: string }) {
    return this.req(`/createinvoice`, {
      method: "POST",
      body: JSON.stringify({ amountMsat: params.amountMsat, description: params.description }),
    });
  }
  payInvoice(bolt11: string, maxFeeMsat?: number) {
    return this.req(`/payinvoice`, {
      method: "POST",
      body: JSON.stringify({ invoice: bolt11, maxFeeMsat }),
    });
  }
  listPayments(params?: { limit?: number; offset?: number }) {
    const q: string[] = [];
    if (typeof params?.limit === "number") q.push(`limit=${params.limit}`);
    if (typeof params?.offset === "number") q.push(`offset=${params.offset}`);
    const qs = q.length ? `?${q.join("&")}` : "";
    return this.req(`/listpayments${qs}`);
  }
}

