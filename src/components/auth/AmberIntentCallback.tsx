import React, { useEffect, useState } from "react";
/**
 * Amber NIP-55 intent callback handler.
 *
 * This component reads URLSearchParams from the Android deep-link/intent response,
 * forwards them to the registered Amber adapter via CEPS, then navigates back.
 */

import { central_event_publishing_service as CEPS } from "../../../lib/central_event_publishing_service";

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

const AmberIntentCallback: React.FC = () => {
  const [status, setStatus] = useState<"processing" | "done" | "error">(
    "processing"
  );
  const [message, setMessage] = useState<string>(
    "Processing Amber response..."
  );

  useEffect(() => {
    try {
      const strict = getFlag("VITE_AMBER_STRICT_NIP55_VALIDATION", true);
      if (strict) {
        const expectedOrigin = "https://www.satnam.pub";
        if (typeof window !== "undefined" && window.location.origin !== expectedOrigin) {
          setStatus("error");
          setMessage("Amber callback origin invalid");
          return;
        }
      }

      const params = new URLSearchParams(window.location.search);
      const signers = (CEPS as any).getRegisteredSigners?.() as any[] | undefined;
      const amber = Array.isArray(signers)
        ? (signers.find((s) => s.id === "amber") as any)
        : undefined;
      if (amber && typeof amber.nip55HandleCallbackParams === "function") {
        amber.nip55HandleCallbackParams(params);
      }
      setStatus("done");
      setMessage("Processed. Returning...");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Unknown error");
    }

    // Clean URL and navigate back or to landing
    const t = setTimeout(() => {
      try {
        const base = window.location.origin + "/";
        window.history.replaceState({}, document.title, base);
      } catch { }
      try {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.dispatchEvent(
            new CustomEvent("satnam:navigate", {
              detail: { view: "landing" },
            } as any)
          );
        }
      } catch { }
    }, 500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black/60">
      <div className="rounded-lg bg-white/10 border border-white/20 p-6 text-center text-white max-w-sm w-full">
        <div className="text-lg font-semibold mb-2">
          {status === "processing" && "Contacting Amber..."}
          {status === "done" && "Amber response processed"}
          {status === "error" && "Amber callback error"}
        </div>
        <div className="text-purple-200 text-sm">{message}</div>
      </div>
    </div>
  );
};

export default AmberIntentCallback;

