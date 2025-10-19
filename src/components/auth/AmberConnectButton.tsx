import React, { useEffect, useMemo, useState } from "react";
import { central_event_publishing_service as CEPS } from "../../../lib/central_event_publishing_service";
import type { SignerAdapter, SignerStatus } from "../../lib/signers/signer-adapter";

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}
function getFlag(key: string, def: boolean): boolean {
  try {
    const v = (typeof process !== "undefined" ? (process as any)?.env?.[key] : undefined) ??
      (typeof import.meta !== "undefined" ? (import.meta as any)?.env?.[key] : undefined);
    if (v == null) return def;
    const s = String(v).toLowerCase();
    return s === "1" || s === "true" || s === "yes";
  } catch {
    return def;
  }
}

/**
 * Compact CTA to connect Amber (Android) signer.
 * Renders nothing unless on Android and VITE_ENABLE_AMBER_SIGNING is enabled.
 */
const AmberConnectButton: React.FC<{ className?: string }> = ({ className }) => {
  const [status, setStatus] = useState<SignerStatus>("unavailable");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [showInfo, setShowInfo] = useState(false);
  const enabled = getFlag("VITE_ENABLE_AMBER_SIGNING", false);

  const amber = useMemo<SignerAdapter | undefined>(() => {
    try {
      const list = (CEPS as any).getRegisteredSigners?.() as SignerAdapter[] | undefined;
      return Array.isArray(list) ? list.find((s) => s.id === "amber") : undefined;
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!enabled || !isAndroid() || !amber) return;
        const st = await amber.getStatus();
        if (mounted) setStatus(st);
      } catch {
        if (mounted) setStatus("unavailable");
      }
    })();
    return () => { mounted = false; };
  }, [enabled, amber]);

  const onConnect = async () => {
    if (!amber) return;
    setBusy(true);
    setError("");
    try {
      await amber.connect?.();
      const st = await amber.getStatus();
      setStatus(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect Amber");
    } finally {
      setBusy(false);
    }
  };

  if (!enabled || !isAndroid() || !amber) return null;
  const show = status === "available" || status === "connected";
  if (!show) return null;

  return (
    <div className={className ?? ""}>
      <div className="bg-white/10 border border-white/20 rounded-lg p-3 flex items-center justify-between">
        <div className="text-purple-200 text-sm flex items-center gap-2">
          <span className="font-semibold text-white">Amber Android Signer</span>
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            className="text-purple-200 hover:text-white transition-colors"
            aria-label="About Amber signing"
            title="About Amber signing"
          >
            ℹ️
          </button>
          <span className="ml-2">{status === "connected" ? "Connected" : "Available"}</span>
        </div>
        {status === "connected" ? (
          <span className="text-green-300 text-sm">Connected</span>
        ) : (
          <button
            onClick={onConnect}
            disabled={busy}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-3 rounded-md"
          >
            {busy ? "Connecting…" : "Connect Amber"}
          </button>
        )}
      </div>

      {/* Info modal */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-4 relative">
            <button
              onClick={() => setShowInfo(false)}
              className="absolute right-3 top-3 text-gray-500 hover:text-gray-800"
              aria-label="Close"
            >
              ✕
            </button>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">About Amber Signing</h3>
            <p className="text-sm text-gray-700 mb-2">
              Amber is an Android mobile signer app that supports Nostr Connect (NIP‑46) and Android intents (NIP‑55).
              Use Amber on Android; use NIP‑07 browser extensions like Alby or nos2x on desktop.
            </p>
            <a
              className="text-sm text-purple-700 hover:underline"
              href="/docs/amber-integration.md"
              target="_blank"
              rel="noreferrer"
            >
              Read more in the Amber integration docs
            </a>
          </div>
        </div>
      )}

      {error && <div className="text-red-300 text-xs mt-2">{error}</div>}
    </div>
  );
};

export default AmberConnectButton;

