import React, { useEffect, useState } from "react";
import { ProfileVisibilityProvider } from "../contexts/ProfileVisibilityContext";
import { useProfileVisibility } from "../hooks/useProfileVisibility";
import { useAuth } from "./auth/AuthProvider";
import KeyRotationWizard from "./KeyRotationWizard";
import ProfileVisibilitySettings from "./ProfileVisibilitySettings";

import { central_event_publishing_service as CEPS } from "../../lib/central_event_publishing_service";
import { showToast } from "../services/toastService";
import AmberConnectButton from "./auth/AmberConnectButton";
import SignerMethodSettings from "./auth/SignerMethodSettings";
import IrohNodeManager from "./iroh/IrohNodeManager";
import AttestationsTab from "./Settings/AttestationsTab";




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

  // Feature flags
  const publicProfilesEnabled = getFlag("VITE_PUBLIC_PROFILES_ENABLED", false);
  const pkarrEnabled = getFlag("VITE_PKARR_ENABLED", false);
  const irohEnabled = getFlag("VITE_IROH_ENABLED", false);

  // Iroh verification state
  const [irohVerificationEnabled, setIrohVerificationEnabled] = useState<boolean>(false);
  const [userIrohNodeId, setUserIrohNodeId] = useState<string | undefined>(undefined);

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

  // Iroh verification handlers
  const handleToggleIrohVerification = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked;
    setIrohVerificationEnabled(enabled);

    // Save to user preferences (placeholder - implement API call)
    try {
      // TODO: API call to update user preferences
      // await updateUserPreferences({ iroh_verification_enabled: enabled });
      showToast.success(
        enabled ? 'Iroh verification enabled' : 'Iroh verification disabled',
        { duration: 2000 }
      );
    } catch (error) {
      showToast.error('Failed to update Iroh verification settings', { duration: 3000 });
      setIrohVerificationEnabled(!enabled); // Revert on error
    }
  };

  const handleIrohNodeIdChange = async (nodeId: string | undefined) => {
    setUserIrohNodeId(nodeId);

    // Save to user profile metadata (placeholder - implement API call)
    try {
      // TODO: API call to update user profile
      // await updateUserProfile({ iroh_node_id: nodeId });
      showToast.success('Iroh node ID updated', { duration: 2000 });
    } catch (error) {
      showToast.error('Failed to update Iroh node ID', { duration: 3000 });
    }
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
    <ProfileVisibilityProvider authToken={auth.sessionToken || ""} userId={auth.user?.id}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-white mb-6">Settings</h1>

        {/* Profile Visibility Settings (Feature Flag Gated) */}
        {publicProfilesEnabled && (
          <div className="grid grid-cols-1 gap-6 mb-6">
            <section className="bg-purple-900/60 border border-purple-500/30 rounded-2xl p-6">
              <SettingsProfileVisibilitySection authToken={auth.sessionToken || ""} />
            </section>
          </div>
        )}

        {/* PKARR Attestations Settings (Feature Flag Gated - Phase 2A Day 7) */}
        {pkarrEnabled && (
          <div className="grid grid-cols-1 gap-6 mb-6">
            <section className="bg-purple-900/60 border border-purple-500/30 rounded-2xl p-6">
              <AttestationsTab />
            </section>
          </div>
        )}

        {/* Iroh Verification Settings (Feature Flag Gated - Phase 2B-2 Week 2 Task 3 Day 2 - ALL ROLES) */}
        {irohEnabled && (
          <div className="grid grid-cols-1 gap-6 mb-6">
            <section className="bg-purple-900/60 border border-purple-500/30 rounded-2xl p-6">
              <h2 className="text-xl font-semibold text-white mb-2">
                Iroh DHT Verification
              </h2>
              <p className="text-purple-200 text-sm mb-6">
                Iroh provides decentralized peer-to-peer verification using DHT (Distributed Hash Table) technology.
                Configure your Iroh node ID to enable P2P discovery and verification.
              </p>

              {/* Toggle for enabling/disabling Iroh verification */}
              <div className="mb-6">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={irohVerificationEnabled}
                    onChange={handleToggleIrohVerification}
                    className="w-5 h-5 text-purple-600 bg-purple-900 border-purple-400 rounded focus:ring-purple-500"
                  />
                  <span className="text-white font-medium">Enable Iroh DHT Verification</span>
                </label>
                <p className="text-purple-300 text-xs mt-2 ml-8">
                  When enabled, your Iroh node will be discoverable via the DHT network
                </p>
              </div>

              {/* IrohNodeManager component (full view) */}
              {irohVerificationEnabled && (
                <div className="mt-4">
                  <IrohNodeManager
                    nodeId={userIrohNodeId}
                    onChange={handleIrohNodeIdChange}
                    compact={false}
                    showTestButton={true}
                  />
                </div>
              )}
            </section>
          </div>
        )}

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

          <section className="bg-purple-900/60 border border-yellow-400/20 rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-yellow-300 mb-4">📚 Help & Documentation</h2>
            <div className="space-y-2">
              <a href="/docs/satnam-nfc-provisioning-guide.html" target="_blank" rel="noopener noreferrer" className="block w-full text-left bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                📖 NFC Provisioning Guide
              </a>
              <a href="/docs/NFC_TROUBLESHOOTING.md" target="_blank" rel="noopener noreferrer" className="block w-full text-left bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                ❓ Troubleshooting Guide
              </a>
              <a href="/docs/NFC_API_ENDPOINTS.md" target="_blank" rel="noopener noreferrer" className="block w-full text-left bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                ⚙️ API Reference
              </a>
              <a href="/docs/NFC_SECURITY_ARCHITECTURE.md" target="_blank" rel="noopener noreferrer" className="block w-full text-left bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                🔒 Security Architecture
              </a>
              <a href="/docs/NFC_FEATURE_FLAGS.md" target="_blank" rel="noopener noreferrer" className="block w-full text-left bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                🚩 Feature Flags
              </a>
              <a href="/docs/ntag424-blob-viewer.html" target="_blank" rel="noopener noreferrer" className="block w-full text-left bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                🔧 Blob Viewer Tool
              </a>
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
    </ProfileVisibilityProvider>
  );
};

// Inner component to use the ProfileVisibilityContext
const SettingsProfileVisibilitySection: React.FC<{ authToken: string }> = ({ authToken }) => {
  const { settings, loading } = useProfileVisibility();

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-400">Loading profile settings...</p>
      </div>
    );
  }

  return (
    <ProfileVisibilitySettings
      currentVisibility={settings?.profile_visibility || 'private'}
      currentIsDiscoverable={settings?.is_discoverable || false}
      currentAnalyticsEnabled={settings?.analytics_enabled || false}
      authToken={authToken}
      onSettingsChange={(newSettings) => {
        console.log("Profile settings updated:", newSettings);
      }}
    />
  );
};

export default Settings;

