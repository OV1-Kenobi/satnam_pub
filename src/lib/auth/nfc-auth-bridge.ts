// NFC Authentication Bridge
// Orchestrates the existing NTAG424AuthModal for vault NFC checks.
// Browser-only. Uses React portal to mount the modal on demand.

import React from "react";
import { createRoot } from "react-dom/client";
import NTAG424AuthModal from "../../components/NTAG424AuthModal";
import { showToast } from "../../services/toastService";

function mountTransientModal(element: React.ReactElement): {
  dispose: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(element);
  return {
    dispose: () => {
      try {
        root.unmount();
      } catch {
        /* noop */
      }
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
}

export async function openNFCModalAndAwaitResult(
  mode: "authentication" | "registration" | "both" = "authentication"
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("NDEFReader" in window)) {
    showToast.error("NFC not supported on this device/browser", {
      title: "Physical MFA",
    });
    return false;
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const handleClose = () => {
      if (!settled) {
        settled = true;
        disposer.dispose();
        resolve(false);
      }
    };
    const handleSuccess = () => {
      if (!settled) {
        settled = true;
        disposer.dispose();
        resolve(true);
      }
    };

    const element = React.createElement(NTAG424AuthModal, {
      isOpen: true,
      onClose: handleClose,
      onAuthSuccess: handleSuccess,
      mode,
      title: "NFC Physical MFA",
      purpose: "Authenticate using your NTAG424 NFC tag",
    });

    const disposer = mountTransientModal(element);
  });
}

export async function awaitNFC(): Promise<boolean> {
  try {
    const ok = await openNFCModalAndAwaitResult("authentication");
    if (!ok) {
      showToast.error("NFC authentication failed or cancelled", {
        title: "Physical MFA",
      });
    }
    return ok;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    showToast.error(`NFC authentication error: ${msg}`, {
      title: "Physical MFA",
    });
    return false;
  }
}
