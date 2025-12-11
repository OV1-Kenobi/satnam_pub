/**
 * BoltcardKeysDisplay.tsx
 * Displays Boltcard encryption keys (K0, K1, K2) with copy buttons,
 * programming instructions, and security warnings.
 */

import { AlertTriangle, Check, Copy, CreditCard, ExternalLink, Key, Shield } from "lucide-react";
import React, { useState } from "react";

/**
 * Boltcard encryption keys returned from LNbits after card creation
 */
export interface BoltcardKeys {
  k0: string; // Authentication key (32 hex chars)
  k1: string; // Encryption key (32 hex chars)
  k2: string; // SUN/SDM CMAC key (32 hex chars)
  cardId?: string;
  lnurlw?: string; // LNURL-withdraw link for the card
}

interface BoltcardKeysDisplayProps {
  keys: BoltcardKeys;
  onComplete?: () => void;
  onBack?: () => void;
}

const BoltcardKeysDisplay: React.FC<BoltcardKeysDisplayProps> = ({
  keys,
  onComplete,
  onBack,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopyKey = async (keyName: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(keyName);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const keyItems = [
    { name: "K0", value: keys.k0, description: "Authentication Key" },
    { name: "K1", value: keys.k1, description: "Encryption Key" },
    { name: "K2", value: keys.k2, description: "SUN/SDM CMAC Key" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <Key className="h-8 w-8 text-white" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">
          Your Boltcard Encryption Keys
        </h3>
        <p className="text-purple-200 text-sm">
          Use these keys to program your NFC card with the Boltcard app
        </p>
      </div>

      {/* Critical Security Warning */}
      <div className="bg-red-500/20 border-2 border-red-500/50 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-red-300 font-bold mb-2">⚠️ CRITICAL SECURITY WARNING</h4>
            <ul className="text-red-200 text-sm space-y-1">
              <li>• <strong>Never share</strong> these keys with anyone</li>
              <li>• These keys are shown <strong>only once</strong> and cannot be retrieved again</li>
              <li>• <strong>Back up immediately</strong> to a secure password manager</li>
              <li>• Anyone with these keys can reprogram your card</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Keys Display */}
      <div className="space-y-3">
        {keyItems.map((key) => (
          <div
            key={key.name}
            className="bg-white/5 border border-white/10 rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-400" />
                <span className="text-white font-semibold">{key.name}</span>
                <span className="text-purple-300 text-xs">({key.description})</span>
              </div>
              <button
                onClick={() => handleCopyKey(key.name, key.value)}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium transition ${copiedKey === key.name
                    ? "bg-green-500/20 text-green-400"
                    : "bg-white/10 hover:bg-white/20 text-white"
                  }`}
              >
                {copiedKey === key.name ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <code className="block bg-black/40 rounded-lg p-3 text-yellow-300 text-sm font-mono break-all">
              {key.value}
            </code>
          </div>
        ))}
      </div>

      {/* LNURL-withdraw if available */}
      {keys.lnurlw && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-green-400" />
              <span className="text-white font-semibold">LNURL-withdraw</span>
            </div>
            <button
              onClick={() => handleCopyKey("lnurlw", keys.lnurlw!)}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium transition ${copiedKey === "lnurlw"
                  ? "bg-green-500/20 text-green-400"
                  : "bg-white/10 hover:bg-white/20 text-white"
                }`}
            >
              {copiedKey === "lnurlw" ? <><Check className="h-4 w-4" />Copied!</> : <><Copy className="h-4 w-4" />Copy</>}
            </button>
          </div>
          <code className="block bg-black/40 rounded-lg p-3 text-green-300 text-xs font-mono break-all">
            {keys.lnurlw}
          </code>
        </div>
      )}
    </div>
  );
};

/**
 * Programming Instructions Section - displayed below the keys
 */
export const BoltcardProgrammingInstructions: React.FC = () => (
  <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mt-6">
    <h4 className="text-blue-300 font-bold mb-3 flex items-center gap-2">
      <CreditCard className="h-5 w-5" />
      How to Program Your Boltcard
    </h4>
    <ol className="text-blue-200 text-sm space-y-2 list-decimal list-inside">
      <li>
        <strong>Install the Boltcard app</strong> from{" "}
        <a
          href="https://play.google.com/store/apps/details?id=com.lightningnfcapp"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline inline-flex items-center gap-1"
        >
          Google Play <ExternalLink className="h-3 w-3" />
        </a>{" "}
        or{" "}
        <a
          href="https://github.com/boltcard/bolt-nfc-android-app/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline inline-flex items-center gap-1"
        >
          GitHub APK <ExternalLink className="h-3 w-3" />
        </a>
      </li>
      <li>
        Open the app and go to <strong>Key Change</strong> screen
      </li>
      <li>
        Enter <strong>K0, K1, K2</strong> exactly as shown above
      </li>
      <li>
        Enable <strong>SDM/SUN</strong> for dynamic PICC/CMAC URL parameters
      </li>
      <li>
        Set the <strong>NDEF URL</strong> to your Satnam base URL
      </li>
      <li>
        Hold your NFC card <strong>completely still</strong> against your phone until success
      </li>
    </ol>
    <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
      <p className="text-yellow-200 text-xs">
        <strong>Tip:</strong> Keep keys in a password manager for future reference.
        If you lose the keys after changing them on the card, you cannot reprogram it.
      </p>
    </div>
  </div>
);

/**
 * Full Boltcard Keys Display with Instructions
 */
export const BoltcardKeysDisplayFull: React.FC<BoltcardKeysDisplayProps & { showInstructions?: boolean }> = ({
  keys,
  onComplete,
  onBack,
  showInstructions = true,
}) => (
  <div className="space-y-4">
    <BoltcardKeysDisplay keys={keys} onComplete={onComplete} onBack={onBack} />
    {showInstructions && <BoltcardProgrammingInstructions />}

    {/* Action Buttons */}
    <div className="flex gap-3 pt-4">
      {onBack && (
        <button
          onClick={onBack}
          className="flex-1 px-4 py-3 rounded-lg font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition"
        >
          Back
        </button>
      )}
      {onComplete && (
        <button
          onClick={onComplete}
          className="flex-1 px-4 py-3 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white transition"
        >
          I've Backed Up My Keys
        </button>
      )}
    </div>
  </div>
);

export default BoltcardKeysDisplay;

