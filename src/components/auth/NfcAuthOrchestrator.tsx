import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import NTAG424AuthModal from "../NTAG424AuthModal";

/**
 * Global NFC Auth orchestrator
 * - Listens for 'satnam:open-ntag-auth' CustomEvents
 * - Presents NTAG424AuthModal and dispatches 'satnam:ntag-auth-result'
 * - Mountable once via mountNfcAuthOrchestrator() to ensure it's always listening
 */

type OpenDetail = {
  requestId: string;
  mode?: "authentication" | "registration" | "both";
  operation?: "event" | "payment" | "threshold" | string;
};

type ResultDetail = {
  requestId: string;
  success: boolean;
  error?: string;
  authResult?: unknown;
};

function titleFor(op?: string): string {
  switch (op) {
    case "payment":
      return "Confirm Payment with NFC";
    case "threshold":
      return "Confirm Threshold Signing with NFC";
    case "event":
    default:
      return "Confirm Signing with NFC";
  }
}

function purposeFor(op?: string): string {
  switch (op) {
    case "payment":
      return "Tap your Name Tag and enter your PIN to authorize this payment.";
    case "threshold":
      return "Tap your Name Tag and enter your PIN to approve this federated operation.";
    case "event":
    default:
      return "Tap your Name Tag and enter your PIN to continue.";
  }
}

const NfcAuthOrchestrator: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<OpenDetail | null>(null);
  const activeRef = useRef<OpenDetail | null>(null);
  const timerRef = useRef<number | null>(null);

  const closeWith = useCallback((detail: ResultDetail) => {
    try {
      window.dispatchEvent(new CustomEvent<ResultDetail>("satnam:ntag-auth-result", { detail }));
    } finally {
      setOpen(false);
      setActive(null);
      activeRef.current = null;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    const handler = (evt: Event) => {
      try {
        const e = evt as CustomEvent<OpenDetail>;
        if (!e?.detail || !e.detail.requestId) return;
        // If a previous request is pending, cancel it as user-cancelled
        if (activeRef.current?.requestId && activeRef.current.requestId !== e.detail.requestId) {
          closeWith({ requestId: activeRef.current.requestId, success: false, error: "Superseded by new request" });
        }
        activeRef.current = e.detail;
        setActive(e.detail);
        setOpen(true);
        // Safety timeout (120s) – orchestrator will auto-close and report cancel
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          if (!activeRef.current?.requestId) return;
          closeWith({ requestId: activeRef.current.requestId, success: false, error: "User cancelled NFC authentication" });
        }, 120_000);
      } catch (err) {
        // Swallow errors; no crash
      }
    };
    window.addEventListener("satnam:open-ntag-auth", handler as EventListener);
    return () => window.removeEventListener("satnam:open-ntag-auth", handler as EventListener);
  }, [closeWith]);

  const onClose = useCallback(() => {
    if (!activeRef.current?.requestId) {
      setOpen(false);
      setActive(null);
      activeRef.current = null;
      return;
    }
    closeWith({ requestId: activeRef.current.requestId, success: false, error: "User cancelled NFC authentication" });
  }, [closeWith]);

  const onAuthSuccess = useCallback((authResult: unknown) => {
    if (!activeRef.current?.requestId) return onClose();
    closeWith({ requestId: activeRef.current.requestId, success: true, authResult });
  }, [closeWith, onClose]);

  return (
    <NTAG424AuthModal
      isOpen={open}
      onClose={onClose}
      onAuthSuccess={onAuthSuccess}
      mode={(active?.mode as any) || "authentication"}
      title={titleFor(active?.operation)}
      purpose={purposeFor(active?.operation)}
    />
  );
};

// --- Mount helper (singleton) ---
let mounted = false;
let root: Root | null = null;
export function mountNfcAuthOrchestrator(): void {
  if (mounted) return;
  if (typeof document === "undefined") return;
  try {
    const id = "satnam-nfc-auth-root";
    let host = document.getElementById(id);
    if (!host) {
      host = document.createElement("div");
      host.id = id;
      document.body.appendChild(host);
    }
    root = createRoot(host);
    root.render(<NfcAuthOrchestrator />);
    mounted = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("Failed to mount NFC Auth Orchestrator", e);
  }
}

export function unmountNfcAuthOrchestrator(): void {
  if (!mounted || !root) return;
  try {
    root.unmount();
    const host = document.getElementById("satnam-nfc-auth-root");
    if (host) {
      document.body.removeChild(host);
    }
  } finally {
    root = null;
    mounted = false;
  }
}

export default NfcAuthOrchestrator;

