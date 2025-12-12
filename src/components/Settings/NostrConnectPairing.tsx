/**
 * NIP-46 Nostr Connect Pairing Component
 * 
 * Displays QR code and copyable URI for pairing with external signers
 * like Amber on Android devices.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useNostrConnectPairing } from "../../hooks/useNostrConnectPairing";
import { generateQRCodeSVG, getRecommendedErrorCorrection } from "../../utils/qr-code-browser";
import { showToast } from "../../services/toastService";

/** Format seconds as MM:SS */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Truncate hex string for display */
function truncateHex(hex: string, chars: number = 8): string {
  if (!hex || hex.length <= chars * 2) return hex;
  return `${hex.slice(0, chars)}...${hex.slice(-chars)}`;
}

/**
 * NostrConnectPairing Component
 */
export const NostrConnectPairing: React.FC = () => {
  const {
    status,
    pairingUri,
    timeRemaining,
    signerPubKeyHex,
    error,
    isLoading,
    startPairing,
    cancelPairing,
    disconnect,
    retryConnection,
  } = useNostrConnectPairing();

  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Generate QR code when URI changes
  useEffect(() => {
    if (!pairingUri) {
      setQrCodeSvg(null);
      return;
    }

    generateQRCodeSVG(pairingUri, {
      size: 256,
      margin: 4,
      errorCorrectionLevel: getRecommendedErrorCorrection("url"),
      foregroundColor: "#000000",
      backgroundColor: "#FFFFFF",
    })
      .then((svg) => setQrCodeSvg(svg))
      .catch((err) => {
        console.error("[NostrConnectPairing] QR generation failed:", err);
        setQrCodeSvg(null);
      });
  }, [pairingUri]);

  // Copy URI to clipboard
  const handleCopy = useCallback(async () => {
    if (!pairingUri) return;

    try {
      await navigator.clipboard.writeText(pairingUri);
      setCopied(true);
      showToast.success("Pairing URI copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      showToast.error("Failed to copy to clipboard");
    }
  }, [pairingUri]);

  // Handle start pairing
  const handleStartPairing = useCallback(async () => {
    try {
      await startPairing();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to start pairing");
    }
  }, [startPairing]);

  // Handle disconnect
  const handleDisconnect = useCallback(() => {
    disconnect();
    showToast.info("Disconnected from external signer");
  }, [disconnect]);

  // Render based on status
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">
          External Signer Connection
        </h3>
        {status === "connected" && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
            <span className="w-2 h-2 mr-1.5 bg-green-400 rounded-full animate-pulse"></span>
            Connected
          </span>
        )}
      </div>

      <p className="text-sm text-purple-200">
        Connect to an external Nostr signer app (like Amber on Android) using NIP-46 Nostr Connect.
        Scan the QR code with your signer app to establish a secure connection.
      </p>

      {/* Idle State - Show start button */}
      {status === "idle" && (
        <button
          onClick={handleStartPairing}
          disabled={isLoading}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Generate Pairing QR Code
            </>
          )}
        </button>
      )}

      {/* Waiting State - Show QR code and countdown */}
      {status === "waiting" && (
        <div className="space-y-4">
          {/* Countdown timer */}
          <div className="flex items-center justify-center gap-2 text-yellow-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-mono text-lg">{formatTime(timeRemaining)}</span>
            <span className="text-sm text-purple-300">remaining</span>
          </div>

          {/* QR Code */}
          {qrCodeSvg ? (
            <div className="flex justify-center">
              <div
                className="bg-white p-4 rounded-lg shadow-lg"
                dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
              />
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="w-64 h-64 bg-gray-700 rounded-lg animate-pulse flex items-center justify-center">
                <span className="text-gray-400">Generating QR...</span>
              </div>
            </div>
          )}

          {/* Copyable URI */}
          {pairingUri && (
            <div className="space-y-2">
              <label className="block text-sm text-purple-300">Or copy pairing URI:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={pairingUri}
                  className="flex-1 bg-gray-800 border border-purple-500/30 rounded-lg px-3 py-2 text-sm text-gray-300 font-mono truncate"
                />
                <button
                  onClick={handleCopy}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-1"
                >
                  {copied ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {/* Cancel button */}
          <button
            onClick={cancelPairing}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Connected State - Show status and disconnect */}
      {status === "connected" && signerPubKeyHex && (
        <div className="space-y-4">
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-green-400 font-medium">Connected to External Signer</p>
                <p className="text-sm text-purple-300 mt-1">
                  Signer pubkey: <code className="text-purple-200">{truncateHex(signerPubKeyHex, 12)}</code>
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleDisconnect}
            className="w-full bg-red-600/80 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Disconnect Signer
          </button>
        </div>
      )}

      {/* Error/Expired State */}
      {(status === "error" || status === "expired") && (
        <div className="space-y-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-red-400 font-medium">
                  {status === "expired" ? "Pairing Expired" : "Connection Error"}
                </p>
                {error && <p className="text-sm text-purple-300 mt-1">{error}</p>}
              </div>
            </div>
          </div>

          <button
            onClick={retryConnection}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
};

export default NostrConnectPairing;

