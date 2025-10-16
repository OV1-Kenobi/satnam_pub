import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex } from "@noble/curves/utils";
import { getPublicKey } from "nostr-tools";
import { useCallback, useState } from "react";



// Feature flag: gate all LNbits-related UI
const LNBITS_ENABLED = typeof process !== "undefined" && !!process.env.VITE_LNBITS_INTEGRATION_ENABLED;

// Minimal shape for rows we list
type NwcRow = {
  connection_id: string;
  wallet_name: string;
  wallet_provider: string;
  pubkey_preview: string;
  relay_domain: string;
  is_active?: boolean;
  is_primary?: boolean;
  connection_status?: string;
  supported_methods?: string[];
  created_at?: string;
  last_used_at?: string | null;
};

// Helper for API calls to our Netlify function wrapper
async function callProxy(action: string, payload?: any, init?: RequestInit) {
  const res = await fetch("/.netlify/functions/lnbits-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
    ...(init || {}),
  });
  const json = await res.json();
  if (!json?.success) throw new Error(json?.error || "Request failed");
  return json.data ?? json;
}

export default function NWCManagementPanel() {
  const [rows, setRows] = useState<NwcRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oneTimeUri, setOneTimeUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // We read from our own table via an existing endpoint to avoid exposing secrets
      const res = await fetch("/.netlify/functions/individual-wallet-unified?nwcConnections=1", { method: "GET" });
      const j = await res.json();
      if (j?.success && Array.isArray(j?.connections)) setRows(j.connections);
      else setRows([]);
    } catch (e: any) {
      setError(e?.message || "Failed to load connections");
    } finally {
      setBusy(false);
    }
  }, []);

  const create = useCallback(async () => {
    setBusy(true);
    setError(null);
    setOneTimeUri(null);
    try {
      // Generate secp256k1 keypair (production-grade): 32-byte secret + Schnorr pubkey
      const sk = secp256k1.utils.randomPrivateKey();
      const client_secret = bytesToHex(sk);
      const client_pubkey = getPublicKey(sk); // 32-byte hex (Nostr Schnorr pubkey)

      const data = await callProxy("nwcCreateConnection", {
        client_pubkey,
        client_secret,
        description: "Satnam NWC",
        permissions: ["get_balance", "make_invoice", "pay_invoice", "lookup_invoice", "list_transactions"],
        // budgets optional: budget_sats and refresh_window
        budget_sats: undefined,
        refresh_window: 86400,
        wallet_name: "Satnam Wallet",
      });

      if (data?.one_time_uri) setOneTimeUri(String(data.one_time_uri));
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to create connection");
    } finally {
      setBusy(false);
    }
  }, [load]);

  const revoke = useCallback(async (row: NwcRow) => {
    if (!window.confirm(`Revoke connection "${row.wallet_name}"? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // We do not have provider pubkey in the UI list; require the client to paste it if needed later
      // For now, we only soft-delete the DB record if we know the connection_id (server revocation needs pubkey)
      await callProxy("nwcRevokeConnection", { pubkey: undefined, connection_id: row.connection_id });
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to revoke connection");
    } finally {
      setBusy(false);
    }
  }, [load]);

  if (!LNBITS_ENABLED) return null;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Nostr Wallet Connect</h3>
        <button onClick={load} disabled={busy}>Refresh</button>
        <button onClick={create} disabled={busy}>New Connection</button>
      </div>
      {error && <div style={{ color: "red" }}>{error}</div>}
      {oneTimeUri && (
        <div style={{ marginTop: 8 }}>
          <div><strong>Copy your NWC URI now (shown once):</strong></div>
          <code style={{ wordBreak: "break-all" }}>{oneTimeUri}</code>
        </div>
      )}
      <ul style={{ marginTop: 12 }}>
        {rows.map((r) => (
          <li key={r.connection_id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>{r.wallet_name}   {r.pubkey_preview}   {r.relay_domain}</span>
            <button onClick={() => revoke(r)} disabled={busy}>Revoke</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

