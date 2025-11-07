/**
 * Tapsigner React Hook
 * Phase 3: Frontend integration for Tapsigner NFC card operations
 *
 * Features:
 * - Card registration with public key
 * - Card verification with ECDSA signature
 * - Nostr event signing with card
 * - Error handling with retry logic
 * - JWT session token authentication
 * - Feature flag gating
 */

import { useCallback, useState } from "react";
import type {
  ECDSASignature,
  TapsignerAuthResponse,
  TapsignerCard,
  TapsignerRegistrationRequest,
  TapsignerVerificationRequest,
} from "../../types/tapsigner";
import { useAuth } from "../components/auth/AuthProvider";
import { getEnvVar } from "../config/env.client";
import {
  type CardData,
  handleNFCError,
  isNFCSupported,
  scanForCard,
  validateCardData,
} from "../lib/tapsigner/nfc-reader";

/**
 * Hook state interface
 */
interface UseTapsignerState {
  card: TapsignerCard | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook return interface
 */
interface UseTapsignerReturn extends UseTapsignerState {
  registerCard: (
    cardId: string,
    publicKey: string,
    familyRole?: string
  ) => Promise<TapsignerCard>;
  verifyCard: (
    cardId: string,
    signature: ECDSASignature,
    challenge: string
  ) => Promise<TapsignerAuthResponse>;
  signEvent: (cardId: string, event: any) => Promise<string>;
  detectCard: (timeoutMs?: number) => Promise<CardData>;
  isNFCAvailable: () => boolean;
  reset: () => void;
}

/**
 * Retry logic with exponential backoff
 */
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        const delay = initialDelay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Tapsigner Hook - Comprehensive card operations
 */
export const useTapsigner = (): UseTapsignerReturn => {
  const { sessionToken } = useAuth();
  const [state, setState] = useState<UseTapsignerState>({
    card: null,
    loading: false,
    error: null,
  });

  // Feature flag check
  const TAPSIGNER_ENABLED =
    (getEnvVar("VITE_TAPSIGNER_ENABLED") || "true").toLowerCase() === "true";
  const DEBUG_ENABLED =
    (getEnvVar("VITE_TAPSIGNER_DEBUG") || "false").toLowerCase() === "true";

  // Debug logging
  const debugLog = useCallback(
    (message: string, data?: any) => {
      if (DEBUG_ENABLED) {
        console.log(`[useTapsigner] ${message}`, data || "");
      }
    },
    [DEBUG_ENABLED]
  );

  /**
   * Register a new Tapsigner card
   */
  const registerCard = useCallback(
    async (
      cardId: string,
      publicKey: string,
      familyRole: string = "private"
    ): Promise<TapsignerCard> => {
      if (!TAPSIGNER_ENABLED) {
        throw new Error("Tapsigner is not enabled");
      }

      if (!sessionToken) {
        throw new Error("Not authenticated");
      }

      setState((s) => ({ ...s, loading: true, error: null }));
      debugLog("Registering card", { cardId });

      try {
        const response = await retryOperation(async () => {
          const res = await fetch("/api/tapsigner/register", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${sessionToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              cardId,
              publicKey,
              familyRole,
            } as TapsignerRegistrationRequest),
          });

          if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || "Registration failed");
          }

          return res.json();
        });

        if (!response.success) {
          throw new Error(response.error || "Registration failed");
        }

        debugLog("Card registered successfully", response.card);
        setState((s) => ({ ...s, card: response.card, loading: false }));
        return response.card;
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Registration failed";
        debugLog("Registration error", errorMsg);
        setState((s) => ({ ...s, error: errorMsg, loading: false }));
        throw err;
      }
    },
    [TAPSIGNER_ENABLED, sessionToken, debugLog]
  );

  /**
   * Verify a Tapsigner card with ECDSA signature
   */
  const verifyCard = useCallback(
    async (
      cardId: string,
      signature: ECDSASignature,
      challenge: string
    ): Promise<TapsignerAuthResponse> => {
      if (!TAPSIGNER_ENABLED) {
        throw new Error("Tapsigner is not enabled");
      }

      if (!sessionToken) {
        throw new Error("Not authenticated");
      }

      setState((s) => ({ ...s, loading: true, error: null }));
      debugLog("Verifying card", { cardId });

      try {
        const response = await retryOperation(async () => {
          const res = await fetch("/api/tapsigner/verify", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${sessionToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              cardId,
              signature,
              challenge,
            } as TapsignerVerificationRequest),
          });

          if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || "Verification failed");
          }

          return res.json();
        });

        if (!response.success) {
          throw new Error(response.error || "Verification failed");
        }

        debugLog("Card verified successfully", response);
        setState((s) => ({ ...s, loading: false }));
        return response;
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Verification failed";
        debugLog("Verification error", errorMsg);
        setState((s) => ({ ...s, error: errorMsg, loading: false }));
        throw err;
      }
    },
    [TAPSIGNER_ENABLED, sessionToken, debugLog]
  );

  /**
   * Sign a Nostr event with Tapsigner card
   */
  const signEvent = useCallback(
    async (cardId: string, event: any): Promise<string> => {
      if (!TAPSIGNER_ENABLED) {
        throw new Error("Tapsigner is not enabled");
      }

      if (!sessionToken) {
        throw new Error("Not authenticated");
      }

      setState((s) => ({ ...s, loading: true, error: null }));
      debugLog("Signing event with card", { cardId });

      try {
        const response = await retryOperation(async () => {
          const res = await fetch("/api/tapsigner/sign", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${sessionToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              cardId,
              event,
            }),
          });

          if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || "Signing failed");
          }

          return res.json();
        });

        if (!response.success) {
          throw new Error(response.error || "Signing failed");
        }

        debugLog("Event signed successfully");
        setState((s) => ({ ...s, loading: false }));
        return response.signature;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Signing failed";
        debugLog("Signing error", errorMsg);
        setState((s) => ({ ...s, error: errorMsg, loading: false }));
        throw err;
      }
    },
    [TAPSIGNER_ENABLED, sessionToken, debugLog]
  );

  /**
   * Detect NFC card using Web NFC API
   * Phase 3 Task 3.2: Real NFC reading
   */
  const detectCard = useCallback(
    async (timeoutMs: number = 10000): Promise<CardData> => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        debugLog("Starting card detection with timeout:", timeoutMs);

        // Scan for card using Web NFC API
        const cardData = await scanForCard(timeoutMs);

        // Validate card data
        if (!validateCardData(cardData)) {
          throw new Error("Invalid card data format");
        }

        debugLog("Card detected successfully:", cardData.cardId);

        setState((prev) => ({ ...prev, loading: false }));
        return cardData;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Card detection failed";
        const userMessage = handleNFCError(error);

        debugLog("Card detection error:", errorMessage);

        setState((prev) => ({ ...prev, loading: false, error: userMessage }));
        throw error;
      }
    },
    [debugLog]
  );

  /**
   * Check if NFC is available on this device
   */
  const isNFCAvailable = useCallback(() => {
    return isNFCSupported();
  }, []);

  /**
   * Reset hook state
   */
  const reset = useCallback(() => {
    setState({
      card: null,
      loading: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    registerCard,
    verifyCard,
    signEvent,
    detectCard,
    isNFCAvailable,
    reset,
  };
};

export default useTapsigner;
