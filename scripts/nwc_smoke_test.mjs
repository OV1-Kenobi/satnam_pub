// Minimal NWC smoke test: list_transactions using provided NWC URI
// Usage: node scripts/nwc_smoke_test.mjs

const NWC_URI = process.env.NWC_URI;
if (!NWC_URI) {
  console.error("NWC_URI environment variable is required");
  process.exit(1);
}

function parseNwc(uri) {
  const u = new URL(String(uri).replace(/^nostr\+walletconnect:\/\//, "https://"));
  const pubkey = u.hostname;
  const relay = String(u.searchParams.get("relay") || "");
  const secret = String(u.searchParams.get("secret") || "");
  if (!pubkey || !relay || !secret) throw new Error("Invalid NWC URI");
  return { pubkey, relay, secret };
}

const conn = parseNwc(NWC_URI);

const modUrl = new URL("../netlify/functions/utils/nwc-client.js", import.meta.url);
const { performNwcOperationOverNostr } = await import(modUrl.href);

try {
  const res = await performNwcOperationOverNostr({ method: "list_transactions", params: { limit: 5, offset: 0 }, connection: conn, timeoutMs: 30000 });
  console.log(JSON.stringify({ ok: true, method: "list_transactions", relay: conn.relay, result: res }, null, 2));
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e?.message || String(e) }, null, 2));
  process.exit(2);
}

