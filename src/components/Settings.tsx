import React, { useEffect, useState } from "react";
import { useAuth } from "./auth/AuthProvider";
import KeyRotationWizard from "./KeyRotationWizard";

import { central_event_publishing_service as CEPS } from "../../lib/central_event_publishing_service";
import AmberConnectButton from "./auth/AmberConnectButton";
import SignerMethodSettings from "./auth/SignerMethodSettings";




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

const Settings: React.FC = () => {
  const auth = useAuth();
  const [showRotationWizard, setShowRotationWizard] = useState<{
    open: boolean;
    mode: "import" | "rotate";
  }>({ open: false, mode: "rotate" });

  // Amber preference and availability state
  const [preferNip55, setPreferNip55] = useState<boolean>(() => {
    try {
      if (typeof window !== "undefined") {
        const v = window.localStorage.getItem("amberPreferNip55");
        return v ? ["1", "true", "yes"].includes(v.toLowerCase()) : false;
      }
    } catch { }
    return false;
  });
  const [amberConnected, setAmberConnected] = useState(false);
  const enableAmber = getFlag("VITE_ENABLE_AMBER_SIGNING", false);
  const onAndroid = isAndroid();

  useEffect(() => {
    try {
      const list = (CEPS as any).getRegisteredSigners?.() as any[] | undefined;
      const amber = Array.isArray(list) ? list.find((s) => s.id === "amber") : undefined;
      if (!amber) {
        setAmberConnected(false);
        return;
      }
      Promise.resolve(amber.getStatus?.())
        .then((st: any) => setAmberConnected(st === "connected"))
        .catch(() => setAmberConnected(false));
    } catch {
      setAmberConnected(false);
    }
  }, [enableAmber]);

  const onTogglePrefer = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = !!e.target.checked;
    setPreferNip55(val);
    try { if (typeof window !== "undefined") window.localStorage.setItem("amberPreferNip55", val ? "true" : "false"); } catch { }
  };

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showRotationWizard.open) {
        setShowRotationWizard({ open: false, mode: showRotationWizard.mode });
      }
    };

    if (showRotationWizard.open) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [showRotationWizard.open, showRotationWizard.mode]);

  const closeModal = () => {
    setShowRotationWizard({ open: false, mode: showRotationWizard.mode });
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    // Close modal when clicking on backdrop (not the modal content)
    if (event.target === event.currentTarget) {
      closeModal();
    }
  };

  if (!auth.authenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Authentication Required</h2>
          <p className="text-gray-600">Please sign in to access Settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-white mb-6">Settings</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <section className="bg-purple-900/60 border border-yellow-400/20 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-yellow-300 mb-4">Security & Identity</h2>
          <div className="space-y-3">
            <button
              onClick={() => setShowRotationWizard({ open: true, mode: "import" })}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Migrate Existing Nostr Identity
            </button>
            <button
              onClick={() => setShowRotationWizard({ open: true, mode: "rotate" })}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Recover/Rotate Nostr Keys
            </button>
            <button
              onClick={() => {
                // Placeholder: navigate to password change flow if available
                alert("Password change flow coming soon.");
              }}
              className="w-full bg-gray-700 hover:bg-gray-800 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Change Password
            </button>
            <button
              onClick={() => {
                // Placeholder for NFC PIN modal trigger
                alert("NFC PIN update coming soon.");
              }}
              className="w-full bg-gray-700 hover:bg-gray-800 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Update NFC PIN
            </button>
            <button
              onClick={() => {
                // Placeholder for nsec recovery modal trigger
                alert("Nsec recovery flow coming soon.");
              }}
              className="w-full bg-gray-700 hover:bg-gray-800 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Recover Nsec
            </button>
          </div>
        </section>

        <section className="bg-purple-900/60 border border-yellow-400/20 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-yellow-300 mb-4">NFC Management</h2>
          <div className="space-y-3">
            <button
              disabled
              title="Coming Soon"
              className="w-full bg-gray-600 text-white font-medium py-2 px-4 rounded-lg opacity-60 cursor-not-allowed"
            >
              Reprogram NFC Name Tag (Coming Soon)
            </button>
          </div>
        </section>

        <section className="bg-purple-900/60 border border-yellow-400/20 rounded-2xl p-6 md:col-span-1">
          <h2 className="text-xl font-semibold text-yellow-300 mb-4">Signing Methods</h2>
          {/* Quick Amber Connect (Android only, feature-flagged) */}
          <AmberConnectButton className="mb-3" />


          {/* Amber NIP-55 vs NIP-46 preference (Android + feature flag + connected) */}
          {onAndroid && enableAmber && amberConnected && (
            <div className="mb-4 p-3 rounded-lg border border-white/20 bg-white/5">
              <div className="flex items-center justify-between">
                <label className="text-sm text-purple-100 mr-3">
                  Prefer Android Intent (NIP-55) over Nostr Connect (NIP-46) for Amber
                </label>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={preferNip55}
                    onChange={onTogglePrefer}
                  />
                  <div className="w-11 h-6 bg-gray-500 rounded-full relative transition peer-checked:bg-purple-600">
                    <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
                  </div>
                </label>
              </div>
              <p className="text-xs text-purple-200 mt-2">
                NIP-55 uses Android intents for faster signing; NIP-46 uses relay-based remote signing. Enable this for debugging or if NIP-46 pairing fails.
              </p>
            </div>
          )}

          <div className="space-y-3">
            <SignerMethodSettings />
          </div>
        </section>

      </div>

      {showRotationWizard.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={handleBackdropClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl relative">
            <button
              onClick={closeModal}
              className="absolute right-3 top-3 text-gray-500 hover:text-gray-800 z-10"
              aria-label="Close modal"
            >
              ✕
            </button>
            <div id="modal-title" className="sr-only">Key Rotation Settings</div>
            <KeyRotationWizard onClose={closeModal} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;

