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
  generateRandomHex,
  getConnectionStatus,
  isConnected as checkIsConnected,
  loadPairingState,
  NIP46_PAIRING_TIMEOUT_MS,
  savePairingState,
  type Nip46ConnectionStatus,
  type Nip46PairingStorage,
} from "../lib/nip46/nostr-connect-client";
import { central_event_publishing_service as CEPS } from "../../lib/central_event_publishing_service";

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
        // Resume waiting state if not expired
        setStatus("waiting");
        setPairingUri(null); // Will need to regenerate URI
        startCountdown(stored.expiresAt);
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
   * Start countdown timer
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
        setStatus("expired");
        setError("Pairing timed out. Please try again.");
      }
    };

    updateRemaining();
    countdownIntervalRef.current = setInterval(updateRemaining, 1000);
  }, []);

  /**
   * Start new pairing process
   */
  const startPairing = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Generate new pairing credentials
      const result = generatePairingUri();

      // Create storage state
      const state: Nip46PairingStorage = {
        clientPrivKeyHex: generateRandomHex(32),
        clientPubKeyHex: result.clientPubKeyHex,
        signerPubKeyHex: null,
        secretHex: result.secretHex,
        relays: result.relays,
        connectedAt: null,
        expiresAt: result.expiresAt,
        createdAt: Date.now(),
      };

      // We need to regenerate with the same private key
      const clientPrivKeyHex = generateRandomHex(32);
      const clientPubKeyHex = CEPS.getPublicKeyHex(clientPrivKeyHex);
      state.clientPrivKeyHex = clientPrivKeyHex;
      state.clientPubKeyHex = clientPubKeyHex;

      // Build the final URI with correct client pubkey
      const params = new URLSearchParams();
      params.set("relay", result.relays[0]);
      params.set("secret", result.secretHex);
      params.set("name", "Satnam");
      params.set("perms", "sign_event,nip44_encrypt,nip44_decrypt");
      params.set("url", "https://satnam.pub");

      const uri = `nostrconnect://${clientPubKeyHex}?${params.toString()}`;

      // Save state
      storedStateRef.current = state;
      savePairingState(state);

      // Update UI
      setPairingUri(uri);
      setStatus("waiting");
      startCountdown(result.expiresAt);

      // Start listening for connection
      connectionPromiseRef.current = establishConnection(
        clientPrivKeyHex,
        clientPubKeyHex,
        result.secretHex,
        result.relays[0],
        { timeoutMs: NIP46_PAIRING_TIMEOUT_MS }
      );

      // Wait for connection (non-blocking, handled in background)
      connectionPromiseRef.current
        .then((connResult) => {
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
          // Only set error if we're still in waiting state
          if (status === "waiting") {
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
  }, [startCountdown, status]);

  /**
   * Cancel pairing attempt
   */
  const cancelPairing = useCallback(() => {
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
    clearPairingState();
    storedStateRef.current = null;

    setStatus("idle");
    setPairingUri(null);
    setSignerPubKeyHex(null);
    setTimeRemaining(0);
    setError(null);
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
