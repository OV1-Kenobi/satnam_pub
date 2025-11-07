/**
 * Tapsigner Setup Flow Component
 * Phase 3: Multi-step wizard for Tapsigner card registration and LNbits linking
 *
 * Steps:
 * 1. Card Detection (Web NFC API)
 * 2. Card Registration (API call)
 * 3. LNbits Wallet Linking (API call)
 * 4. Spend Limit Configuration (API call)
 * 5. Completion
 */

import React, { useCallback, useState } from "react";
import { getEnvVar } from "../config/env.client";
import { useTapsigner } from "../hooks/useTapsigner";
import { useTapsignerLnbits } from "../hooks/useTapsignerLnbits";

interface TapsignerSetupFlowProps {
  onComplete?: (cardId: string) => void;
  onCancel?: () => void;
  onSkip?: () => void;
  onError?: (error: string) => void;
}

type SetupStep = "detect" | "register" | "link-wallet" | "spend-limit" | "complete";

/**
 * Tapsigner Setup Flow Component
 * Guides user through card registration and wallet linking
 */
export const TapsignerSetupFlow: React.FC<TapsignerSetupFlowProps> = ({
  onComplete,
  onCancel,
  onSkip,
  onError,
}) => {
  // Feature flag checks
  const TAPSIGNER_ENABLED =
    (getEnvVar("VITE_TAPSIGNER_ENABLED") || "true").toLowerCase() === "true";
  const LNBITS_ENABLED =
    (getEnvVar("VITE_TAPSIGNER_LNBITS_ENABLED") || "true").toLowerCase() ===
    "true";
  const TAP_TO_SPEND_ENABLED =
    (getEnvVar("VITE_TAPSIGNER_TAP_TO_SPEND_ENABLED") || "true").toLowerCase() ===
    "true";
  const DEBUG_ENABLED =
    (getEnvVar("VITE_TAPSIGNER_DEBUG") || "false").toLowerCase() === "true";

  if (!TAPSIGNER_ENABLED) {
    return null;
  }

  const { registerCard } = useTapsigner();
  const { linkWallet, setSpendLimit: updateSpendLimit } = useTapsignerLnbits();

  const [currentStep, setCurrentStep] = useState<SetupStep>("detect");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [walletId, setWalletId] = useState("");
  const [spendLimit, setSpendLimit] = useState(50000);

  // Debug logging
  const debugLog = useCallback(
    (message: string, data?: any) => {
      if (DEBUG_ENABLED) {
        console.log(`[TapsignerSetupFlow] ${message}`, data || "");
      }
    },
    [DEBUG_ENABLED]
  );

  /**
   * Handle card detection with Web NFC API
   */
  const handleDetectCard = useCallback(async () => {
    setIsProcessing(true);
    setError(null);
    debugLog("Starting card detection...");

    try {
      // Check if Web NFC API is available
      if (!("NDEFReader" in window)) {
        throw new Error(
          "Web NFC API not supported on this device. Please use Chrome/Edge on Android or iOS."
        );
      }

      debugLog("Web NFC API available, initiating scan...");

      // Create NFC reader and scan for cards
      const reader = new (window as any).NDEFReader();

      // Set up timeout for card detection (10 seconds)
      const detectionTimeout = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reader.abort?.();
          reject(new Error("Card detection timeout - please try again"));
        }, 10000);
      });

      // Set up card reading handler
      const cardDetectionPromise = new Promise<void>((resolve, reject) => {
        reader.onreading = (event: any) => {
          try {
            debugLog("Card detected, reading NDEF message...");

            // Parse NDEF message to extract card data
            const message = event.message;
            if (message && message.records && message.records.length > 0) {
              // Extract card ID from NDEF records
              const cardIdRecord = message.records[0];
              const newCardId = new TextDecoder().decode(cardIdRecord.data);

              setCardId(newCardId);
              setPublicKey("0".repeat(64)); // Will be read from card in full implementation
              setCurrentStep("register");

              debugLog("Card detected successfully", { cardId: newCardId });
              resolve();
            }
          } catch (err) {
            reject(err);
          }
        };

        reader.onerror = () => {
          reject(new Error("Failed to read card - please try again"));
        };

        // Start scanning
        reader.scan().catch(reject);
      });

      // Race between detection and timeout
      await Promise.race([cardDetectionPromise, detectionTimeout]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Card detection failed";
      setError(errorMsg);
      debugLog("Card detection error", errorMsg);
    } finally {
      setIsProcessing(false);
    }
  }, [debugLog]);

  /**
   * Handle card registration
   */
  const handleRegisterCard = useCallback(async () => {
    if (!cardId || !publicKey) {
      setError("Card data missing");
      return;
    }

    setIsProcessing(true);
    setError(null);
    debugLog("Registering card...");

    try {
      // Call the API to register the card
      await registerCard(cardId, publicKey, "private");

      debugLog("Card registered successfully", { cardId });

      if (LNBITS_ENABLED) {
        setCurrentStep("link-wallet");
      } else {
        setCurrentStep("complete");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Registration failed";
      setError(errorMsg);
      debugLog("Registration error", errorMsg);
    } finally {
      setIsProcessing(false);
    }
  }, [cardId, publicKey, registerCard, LNBITS_ENABLED, debugLog]);

  /**
   * Handle wallet linking
   */
  const handleLinkWallet = useCallback(async () => {
    if (!walletId || !cardId) {
      setError("Please select a wallet");
      return;
    }

    setIsProcessing(true);
    setError(null);
    debugLog("Linking wallet...");

    try {
      // Call the API to link the wallet
      await linkWallet(cardId, walletId, spendLimit, false);

      debugLog("Wallet linked successfully", { walletId });

      if (TAP_TO_SPEND_ENABLED) {
        setCurrentStep("spend-limit");
      } else {
        setCurrentStep("complete");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Wallet linking failed";
      setError(errorMsg);
      debugLog("Wallet linking error", errorMsg);
    } finally {
      setIsProcessing(false);
    }
  }, [walletId, cardId, spendLimit, linkWallet, TAP_TO_SPEND_ENABLED, debugLog]);

  /**
   * Handle spend limit configuration
   */
  const handleSetSpendLimit = useCallback(async () => {
    if (!cardId) {
      setError("Card not found");
      return;
    }

    setIsProcessing(true);
    setError(null);
    debugLog("Setting spend limit...");

    try {
      // Call the API to update spend limit
      await updateSpendLimit(cardId, spendLimit);

      debugLog("Spend limit configured", { spendLimit });
      setCurrentStep("complete");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Configuration failed";
      setError(errorMsg);
      debugLog("Configuration error", errorMsg);
    } finally {
      setIsProcessing(false);
    }
  }, [cardId, spendLimit, updateSpendLimit, debugLog]);

  /**
   * Handle completion
   */
  const handleComplete = useCallback(() => {
    if (cardId) {
      debugLog("Setup completed", { cardId });
      onComplete?.(cardId);
    }
  }, [cardId, debugLog, onComplete]);

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow">
      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          <span className="text-sm font-semibold">Setup Progress</span>
          <span className="text-sm text-gray-600">
            {["detect", "register", "link-wallet", "spend-limit", "complete"].indexOf(
              currentStep
            ) + 1}{" "}
            / 5
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{
              width: `${(["detect", "register", "link-wallet", "spend-limit", "complete"].indexOf(
                currentStep
              ) + 1) * 20
                }%`,
            }}
          ></div>
        </div>
      </div>

      {/* Step Content */}
      <div className="space-y-6">
        {/* Detect Card Step */}
        {currentStep === "detect" && (
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-bold">Detect Tapsigner Card</h2>
            <div className="text-6xl">📱</div>
            <p className="text-gray-600">
              Tap your Tapsigner card to the back of your device to begin setup
            </p>
            <button
              onClick={handleDetectCard}
              disabled={isProcessing}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isProcessing ? "Detecting..." : "Detect Card"}
            </button>
          </div>
        )}

        {/* Register Card Step */}
        {currentStep === "register" && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Register Card</h2>
            <div className="bg-blue-50 border border-blue-200 rounded p-4">
              <p className="text-sm text-blue-800">
                <strong>Card ID:</strong> {cardId?.substring(0, 20)}...
              </p>
              <p className="text-sm text-blue-800 mt-2">
                <strong>Public Key:</strong> {publicKey?.substring(0, 20)}...
              </p>
            </div>
            <p className="text-gray-600">
              Your Tapsigner card has been detected. Click below to register it with your account.
            </p>
            <button
              onClick={handleRegisterCard}
              disabled={isProcessing}
              className="w-full bg-green-600 text-white py-3 px-4 rounded hover:bg-green-700 disabled:bg-gray-400"
            >
              {isProcessing ? "Registering..." : "Register Card"}
            </button>
          </div>
        )}

        {/* Link Wallet Step */}
        {currentStep === "link-wallet" && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Link LNbits Wallet</h2>
            <p className="text-gray-600">
              Select an LNbits wallet to link with your Tapsigner card for payments.
            </p>
            <select
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
              disabled={isProcessing}
            >
              <option value="">Select a wallet...</option>
              <option value="wallet_1">Main Wallet</option>
              <option value="wallet_2">Secondary Wallet</option>
            </select>
            <button
              onClick={handleLinkWallet}
              disabled={isProcessing || !walletId}
              className="w-full bg-purple-600 text-white py-3 px-4 rounded hover:bg-purple-700 disabled:bg-gray-400"
            >
              {isProcessing ? "Linking..." : "Link Wallet"}
            </button>
          </div>
        )}

        {/* Spend Limit Step */}
        {currentStep === "spend-limit" && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Set Daily Spend Limit</h2>
            <p className="text-gray-600">
              Configure the maximum amount your card can spend per day.
            </p>
            <div className="space-y-2">
              <label className="block text-sm font-semibold">
                Daily Limit: {spendLimit.toLocaleString()} sats
              </label>
              <input
                type="range"
                min="1000"
                max="1000000"
                step="1000"
                value={spendLimit}
                onChange={(e) => setSpendLimit(parseInt(e.target.value))}
                className="w-full"
                disabled={isProcessing}
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>1,000 sats</span>
                <span>1,000,000 sats</span>
              </div>
            </div>
            <button
              onClick={handleSetSpendLimit}
              disabled={isProcessing}
              className="w-full bg-orange-600 text-white py-3 px-4 rounded hover:bg-orange-700 disabled:bg-gray-400"
            >
              {isProcessing ? "Saving..." : "Continue"}
            </button>
          </div>
        )}

        {/* Complete Step */}
        {currentStep === "complete" && (
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-bold">Setup Complete!</h2>
            <div className="text-6xl">✓</div>
            <p className="text-gray-600">
              Your Tapsigner card has been successfully set up and is ready to use.
            </p>
            <button
              onClick={handleComplete}
              className="w-full bg-green-600 text-white py-3 px-4 rounded hover:bg-green-700"
            >
              Finish
            </button>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-gray-200 flex justify-between">
        <button
          onClick={() => (onSkip ? onSkip() : onCancel?.())}
          disabled={isProcessing}
          className="text-gray-600 hover:text-gray-800 disabled:text-gray-400"
        >
          {onSkip ? "Skip" : "Cancel"}
        </button>
        <p className="text-xs text-gray-500">Tapsigner • Physical MFA</p>
      </div>
    </div>
  );
};

export default TapsignerSetupFlow;

