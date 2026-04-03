export class SatnamWalletActor {
  constructor(
    private readonly baseUrl: string,
    private readonly jwt: string,
  ) {}

  async balance() {
    return await this.request("GET", "/v1/agent-wallet");
  }

  async send(amountSats: number, paymentUri: string) {
    return await this.request("POST", "/v1/agent-wallet/send", {
      amount_sats: amountSats,
      payment_uri: paymentUri,
      privacy_preference: "balanced",
    });
  }

  private async request(method: string, path: string, body?: unknown) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.jwt}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) throw new Error(await response.text());
    return await response.json();
  }
}