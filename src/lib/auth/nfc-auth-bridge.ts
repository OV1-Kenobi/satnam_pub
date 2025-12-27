// NFC Authentication Bridge
// Orchestrates the existing NTAG424AuthModal for vault NFC checks.
// Browser-only. Uses React portal to mount the modal on demand.
//
// IMPORTANT: NTAG424AuthModal is dynamically imported to break circular dependency:
// NTAG424AuthModal → AuthProvider → unified-auth-system → nfc-auth-bridge → NTAG424AuthModal

import React from "react";
import { createRoot } from "react-dom/client";
import { showToast } from "../../services/toastService";

// Cached dynamic import for NTAG424AuthModal to break circular dependency
let NTAG424ModalPromise: Promise<
  typeof import("../../components/NTAG424AuthModal")
> | null = null;
function getNTAG424Modal() {
  if (!NTAG424ModalPromise) {
    NTAG424ModalPromise = import("../../components/NTAG424AuthModal");
  }
  return NTAG424ModalPromise;
}

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

  // Dynamically import NTAG424AuthModal to break circular dependency
  const { default: NTAG424AuthModal } = await getNTAG424Modal();

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
