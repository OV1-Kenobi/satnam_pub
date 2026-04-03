import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({ name: "satnam-money", version: "1.0.0" });
const baseUrl = process.env.SATNAM_BASE_URL!;
const jwt = process.env.SATNAM_AGENT_JWT!;

server.tool("wallet_balance", {}, async () => {
  const response = await fetch(`${baseUrl}/v1/agent-wallet`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  return { content: [{ type: "text", text: await response.text() }] };
});

server.tool(
  "wallet_send",
  {
    amount_sats: { type: "number" },
    payment_uri: { type: "string" },
  },
  async ({ amount_sats, payment_uri }) => {
    const response = await fetch(`${baseUrl}/v1/agent-wallet/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount_sats, payment_uri, privacy_preference: "balanced" }),
    });

    return { content: [{ type: "text", text: await response.text() }] };
  },
);
