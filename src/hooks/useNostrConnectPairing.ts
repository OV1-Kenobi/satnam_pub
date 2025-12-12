/**
 * React Hook for NIP-46 Nostr Connect Pairing
 *
 * Manages the pairing lifecycle for connecting to external signers
 * like Amber via QR code scanning.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearPairingState,
  establishConnection,
  generatePairingUri,
  loadPairingState,
  savePairingState,
  type Nip46ConnectionStatus,
  type Nip46PairingStorage,
} from "../lib/nip46/nostr-connect-client";

/** Hook return type */
export interface UseNostrConnectPairingReturn {
  /** Current connection status */
  status: Nip46ConnectionStatus;
  /** Generated pairing URI (nostrconnect://) */
  pairingUri: string | null;
  /** Time remaining until pairing expires (seconds) */
  timeRemaining: number;
  /** Connected signer's public key (hex) */
  signerPubKeyHex: string | null;
  /** Error message if any */
  error: string | null;
  /** Loading state */
  isLoading: boolean;
  /** Generate new pairing URI and start waiting for connection */
  startPairing: () => Promise<void>;
  /** Cancel pairing attempt */
  cancelPairing: () => void;
  /** Disconnect from connected signer */
  disconnect: () => void;
  /** Retry connection with existing credentials */
  retryConnection: () => Promise<void>;
}

/**
 * Hook for managing NIP-46 Nostr Connect pairing
 */
export function useNostrConnectPairing(): UseNostrConnectPairingReturn {
  const [status, setStatus] = useState<Nip46ConnectionStatus>("idle");
  const [pairingUri, setPairingUri] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [signerPubKeyHex, setSignerPubKeyHex] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Refs for managing async operations
  const connectionPromiseRef = useRef<Promise<{
    signerPubKeyHex: string;
  }> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const storedStateRef = useRef<Nip46PairingStorage | null>(null);
  // Ref to track current status for async handlers (avoids stale closure)
  const statusRef = useRef<Nip46ConnectionStatus>(status);
  // Ref to track if pairing was cancelled
  const cancelledRef = useRef<boolean>(false);

  // Keep statusRef in sync with status state
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  /**
   * Start countdown timer (defined before useEffect that uses it)
   */
  const startCountdown = useCallback((expiresAt: number) => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    const updateRemaining = () => {
      const remaining = Math.max(
        0,
        Math.floor((expiresAt - Date.now()) / 1000)
      );
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        // Only transition to expired if still waiting
        if (statusRef.current === "waiting") {
          setStatus("expired");
          setError("Pairing timed out. Please try again.");
        }
      }
    };

    updateRemaining();
    countdownIntervalRef.current = setInterval(updateRemaining, 1000);
  }, []);

  /**
   * Initialize state from localStorage on mount
   */
  useEffect(() => {
    const stored = loadPairingState();
    if (stored) {
      storedStateRef.current = stored;

      if (stored.connectedAt && stored.signerPubKeyHex) {
        setStatus("connected");
        setSignerPubKeyHex(stored.signerPubKeyHex);
      } else if (stored.expiresAt && Date.now() < stored.expiresAt) {
        // Stored state exists but no connection - prompt user to restart
        // Don't resume waiting without a valid URI
        setStatus("idle");
        setError(
          "Previous pairing attempt expired. Please start a new pairing."
        );
        clearPairingState();
        storedStateRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  /**
   * Start new pairing process
   */
  const startPairing = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    cancelledRef.current = false;

    try {
      // Generate pairing credentials (includes clientPrivKeyHex now)
      const result = generatePairingUri();

      // Create storage state using credentials from generatePairingUri
      const state: Nip46PairingStorage = {
        clientPrivKeyHex: result.clientPrivKeyHex,
        clientPubKeyHex: result.clientPubKeyHex,
        signerPubKeyHex: null,
        secretHex: result.secretHex,
        relays: result.relays,
        connectedAt: null,
        expiresAt: result.expiresAt,
        createdAt: Date.now(),
      };

      // Save state
      storedStateRef.current = state;
      savePairingState(state);

      // Update UI with the generated URI
      setPairingUri(result.uri);
      setStatus("waiting");
      startCountdown(result.expiresAt);

      // Start listening for connection
      connectionPromiseRef.current = establishConnection(
        result.clientPrivKeyHex,
        result.clientPubKeyHex,
        result.secretHex,
        result.relays[0]
      );

      // Wait for connection (non-blocking, handled in background)
      connectionPromiseRef.current
        .then((connResult) => {
          // Check if cancelled before processing success
          if (cancelledRef.current) {
            return;
          }

          // Success! Update state
          if (storedStateRef.current) {
            storedStateRef.current.signerPubKeyHex = connResult.signerPubKeyHex;
            storedStateRef.current.connectedAt = Date.now();
            savePairingState(storedStateRef.current);
          }

          setSignerPubKeyHex(connResult.signerPubKeyHex);
          setStatus("connected");
          setError(null);

          // Stop countdown
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
        })
        .catch((err) => {
          // Check if cancelled before processing error
          if (cancelledRef.current) {
            return;
          }

          // Only set error if we're still in waiting state (using ref to avoid stale closure)
          if (statusRef.current === "waiting") {
            const message =
              err instanceof Error ? err.message : "Connection failed";
            if (message.includes("timeout") || message.includes("expired")) {
              setStatus("expired");
              setError("Pairing timed out. Please try again.");
            } else {
              setStatus("error");
              setError(message);
            }
          }
        })
        .finally(() => {
          setIsLoading(false);
        });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start pairing";
      setError(message);
      setStatus("error");
      setIsLoading(false);
    }
  }, [startCountdown]);

  /**
   * Cancel pairing attempt
   */
  const cancelPairing = useCallback(() => {
    // Mark as cancelled to prevent async handlers from updating state
    cancelledRef.current = true;

    // Clear state
    clearPairingState();
    storedStateRef.current = null;
    connectionPromiseRef.current = null;

    // Stop countdown
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // Reset UI
    setStatus("idle");
    setPairingUri(null);
    setTimeRemaining(0);
    setError(null);
    setIsLoading(false);
  }, []);

  /**
   * Disconnect from connected signer
   */
  const disconnect = useCallback(() => {
    // Mark as cancelled to prevent any pending async handlers
    cancelledRef.current = true;

    clearPairingState();
    storedStateRef.current = null;
    connectionPromiseRef.current = null;

    // Stop countdown if any
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    setStatus("idle");
    setPairingUri(null);
    setSignerPubKeyHex(null);
    setTimeRemaining(0);
    setError(null);
    setIsLoading(false);
  }, []);

  /**
   * Retry connection with existing or new credentials
   */
  const retryConnection = useCallback(async () => {
    // Just start a fresh pairing
    await startPairing();
  }, [startPairing]);

  return {
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
  };
}
