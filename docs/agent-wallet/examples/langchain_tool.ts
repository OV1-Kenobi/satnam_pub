import { tool } from "@langchain/core/tools";

const baseUrl = process.env.SATNAM_BASE_URL!;
const jwt = process.env.SATNAM_AGENT_JWT!;

export const satnamWalletSendTool = tool(
  async ({ amount_sats, payment_uri }) => {
    const response = await fetch(`${baseUrl}/v1/agent-wallet/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount_sats,
        payment_uri,
        privacy_preference: "high",
      }),
    });

    if (!response.ok) throw new Error(await response.text());
    return await response.text();
  },
  {
    name: "satnam_wallet_send",
    description: "Send sats using Satnam agent wallet",
    schema: {
      type: "object",
      properties: {
        amount_sats: { type: "number" },
        payment_uri: { type: "string" },
      },
      required: ["amount_sats", "payment_uri"],
    },
  },
);
