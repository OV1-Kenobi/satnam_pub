#!/usr/bin/env node

const [, , command, ...rest] = process.argv;

function readFlag(name, fallback = undefined) {
  const index = rest.findIndex((item) => item === `--${name}`);
  if (index === -1) return fallback;
  return rest[index + 1] ?? fallback;
}

function hasFlag(name) {
  return rest.includes(`--${name}`);
}

function requireValue(name, fallback = undefined) {
  const value = readFlag(name, fallback);
  if (!value) throw new Error(`Missing required --${name}`);
  return value;
}

async function main() {
  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h" ||
    hasFlag("help")
  ) {
    console.log(`satnam-agent-wallet

Commands:
  balance
  history [--limit 20] [--offset 0]
  receive --amount 1000 [--rail lightning|cashu] [--memo text]
  pay --invoice <bolt11> | --payment-uri <bip321> | --cashu-token <cashuA...>
  send --amount 1000 [--invoice <bolt11> | --payment-uri <bip321>] [--rail auto|lightning|cashu] [--privacy high|balanced|fast]

Env:
  SATNAM_AGENT_WALLET_BASE_URL
  SATNAM_AGENT_JWT
`);
    return;
  }

  const baseUrl = requireValue(
    "base-url",
    process.env.SATNAM_AGENT_WALLET_BASE_URL,
  ).replace(/\/$/, "");
  const token = requireValue("token", process.env.SATNAM_AGENT_JWT);

  let method = "GET";
  let path = "/v1/agent-wallet";
  let body;

  if (command === "history") {
    const limit = readFlag("limit", "20");
    const offset = readFlag("offset", "0");
    path = `/v1/agent-wallet/history?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`;
  } else if (command === "receive") {
    method = "POST";
    path = "/v1/agent-wallet/receive";
    body = {
      amount_sats: Number(requireValue("amount")),
      rail: readFlag("rail"),
      memo: readFlag("memo"),
    };
  } else if (command === "pay") {
    method = "POST";
    path = "/v1/agent-wallet/pay";
    body = {
      invoice: readFlag("invoice"),
      payment_uri: readFlag("payment-uri"),
      cashu_token: readFlag("cashu-token"),
      memo: readFlag("memo"),
    };
  } else if (command === "send") {
    method = "POST";
    path = "/v1/agent-wallet/send";
    body = {
      amount_sats: Number(requireValue("amount")),
      invoice: readFlag("invoice"),
      payment_uri: readFlag("payment-uri"),
      rail: readFlag("rail"),
      privacy_preference: readFlag("privacy"),
      memo: readFlag("memo"),
      credit_envelope_id: readFlag("credit-envelope-id"),
      outcome_scope: readFlag("outcome-scope"),
    };
  } else if (command !== "balance") {
    throw new Error(`Unknown command: ${command}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(async () => ({
    status: response.status,
    text: await response.text(),
  }));

  console.log(JSON.stringify({ status: response.status, ...payload }, null, 2));
  if (!response.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
