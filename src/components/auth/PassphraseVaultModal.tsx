import React, { useState } from "react";
import {
  getVaultStatus,
  isWebAuthnAvailable,
  tryWebAuthnOnlyUnlock,
} from "../../lib/auth/client-session-vault";
import { showToast } from "../../services/toastService";

interface PassphraseVaultModalProps {
  open: boolean;
  onSubmit: (passphrase: string) => void;
  onCancel: () => void;
}

const PassphraseVaultModal: React.FC<PassphraseVaultModalProps> = ({ open, onSubmit, onCancel }) => {
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const lastClosedAtRef = React.useRef<number | null>(null);
  const [webauthnReady, setWebauthnReady] = useState(false);

  React.useEffect(() => {
    setShow(open);
    if (open) {
      setPass("");
      // Heuristic: if reopened quickly after last close, count as failure
      const now = Date.now();
      if (lastClosedAtRef.current && now - lastClosedAtRef.current < 5000) {
        setFailCount((c) => {
          const next = c + 1;
          if (next >= 2) {
            showToast.error("Multiple incorrect passphrase attempts", {
              title: "Vault Unlock",
            });
          }
          return next;
        });
      } else {
        // Fresh open; reset failures
        setFailCount(0);
      }
      // Discover WebAuthn availability + existing WebAuthn record
      (async () => {
        const available = isWebAuthnAvailable();
        if (!available) return setWebauthnReady(false);
        const status = await getVaultStatus().catch(() => "none");
        setWebauthnReady(available && status === "webauthn");
      })();
    } else {
      lastClosedAtRef.current = Date.now();
    }
  }, [open]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Unlock Device Vault</h2>
        {webauthnReady && (
          <button
            className="w-full mb-3 px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700"
            onClick={async () => {
              const ok = await tryWebAuthnOnlyUnlock();
              if (ok) {
                showToast.success("Unlocked with biometrics/security key", { title: "Vault" });
                onCancel(); // resolves provider with null; outer flow will retry unlock path
              } else {
                showToast.error("Biometric/security key unlock failed", { title: "Vault" });
              }
            }}
          >
            Unlock with Biometrics/Security Key
          </button>
        )}
        <p className="text-sm text-gray-600 mb-2">
          Enter your device passphrase to unlock the secure signing session.
        </p>
        <input
          type="password"
          className="w-full border border-gray-300 rounded px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Device passphrase"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && pass) onSubmit(pass);
          }}
        />
        <p className="text-xs text-gray-500 mb-3">
          If the passphrase is incorrect, you'll be prompted again
        </p>
        <div className="flex justify-end space-x-2">
          <button
            className="px-3 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
            onClick={() => {
              setPass("");
              onCancel();
            }}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
            onClick={() => pass && onSubmit(pass)}
            disabled={!pass}
          >
            Unlock
          </button>
        </div>
      </div>
    </div>
  );
};

export default PassphraseVaultModal;

