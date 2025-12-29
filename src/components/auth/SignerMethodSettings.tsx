import { useCallback, useEffect, useState } from "react";
import { getCEPS } from "../../lib/ceps";
import type { SignerAdapter, SignerCapability, SignerStatus } from "../../lib/signers/signer-adapter";

interface Row {
  id: string;
  label: string;
  status: SignerStatus;
  capabilities: SignerCapability;
  signer: SignerAdapter;
  error?: string;
}

const statusLabel = (s: SignerStatus) => {
  switch (s) {
    case "connected":
      return "Connected";
    case "available":
      return "Available";
    case "locked":
      return "Locked";
    case "unavailable":
      return "Unavailable";
    case "error":
    default:
      return "Error";
  }
};

function CapBadge({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 6px",
        borderRadius: 6,
        background: on ? "#e0f2fe" : "#f3f4f6",
        color: on ? "#0369a1" : "#6b7280",
        marginLeft: 6,
      }}
      aria-label={`${label}-${on ? "on" : "off"}`}
    >
      {label}
    </span>
  );
}

export default function SignerMethodSettings(): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [preferred, setPreferred] = useState<string>(() => {
    try {
      return localStorage.getItem("satnam.signing.preferred") || "";
    } catch {
      return "";
    }
  });

  const [signers, setSigners] = useState<SignerAdapter[]>([]);

  // Load signers from CEPS asynchronously
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const ceps = await getCEPS();
        const list = (ceps as any).getRegisteredSigners?.() || [];
        if (mounted) setSigners(list);
      } catch {
        // Signers not available
      }
    })();
    return () => { mounted = false; };
  }, []);

  const refresh = useCallback(async () => {
    const items: Row[] = await Promise.all(
      signers.map(async (s) => ({
        id: s.id,
        label: s.label,
        status: await s.getStatus(),
        capabilities: s.capabilities,
        signer: s,
      }))
    );
    setRows(items);
  }, [signers]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await Promise.allSettled(signers.map((s) => s.initialize?.()));
        if (mounted) await refresh();
      } catch {
        if (mounted) setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [signers, refresh]);

  const onConnect = async (s: SignerAdapter) => {
    try {
      await s.connect?.();
      await refresh();
    } catch (e) {
      setRows((prev) =>
        prev.map((r) => (r.id === s.id ? { ...r, error: e instanceof Error ? e.message : "Failed to connect" } : r))
      );
    }
  };

  const onDisconnect = async (s: SignerAdapter) => {
    try {
      await s.disconnect?.();
      await refresh();
    } catch (e) {
      setRows((prev) =>
        prev.map((r) => (r.id === s.id ? { ...r, error: e instanceof Error ? e.message : "Failed to disconnect" } : r))
      );
    }
  };

  const setPreferredId = (id: string) => {
    try {
      localStorage.setItem("satnam.signing.preferred", id);
    } catch { }
    setPreferred(id);
  };

  if (loading) {
    return (
      <div className="signer-settings">
        <h3>Signing Methods</h3>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="signer-settings">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3>Signing Methods</h3>
        <button onClick={() => refresh()} style={{ fontSize: 12 }}>Refresh</button>
      </div>
      {rows.length === 0 ? (
        <p>No signers registered yet. Adapters will appear here once enabled.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {rows.map((r) => (
            <li
              key={r.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 0",
                borderBottom: "1px solid var(--border-color, #e5e7eb)",
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{r.label}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{r.id}</div>
                <div style={{ marginTop: 6 }}>
                  <CapBadge on={r.capabilities.event} label="event" />
                  <CapBadge on={r.capabilities.payment} label="payment" />
                  <CapBadge on={r.capabilities.threshold} label="threshold" />
                </div>
                {r.error && (
                  <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 6 }}>{r.error}</div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  aria-label={`status-${r.id}`}
                  style={{
                    fontSize: 12,
                    padding: "2px 6px",
                    borderRadius: 6,
                    background: "var(--badge-bg, #f3f4f6)",
                  }}
                >
                  {statusLabel(r.status)}
                </span>
                {r.status === "connected" ? (
                  <button onClick={() => onDisconnect(r.signer)} style={{ fontSize: 12 }}>Disconnect</button>
                ) : r.status === "available" || r.status === "locked" ? (
                  <button onClick={() => onConnect(r.signer)} style={{ fontSize: 12 }}>Connect</button>
                ) : (
                  <button disabled style={{ fontSize: 12, opacity: 0.6 }}>Connect</button>
                )}
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="radio"
                    name="preferred-signer"
                    checked={preferred === r.id}
                    onChange={() => setPreferredId(r.id)}
                  />
                  Preferred
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
