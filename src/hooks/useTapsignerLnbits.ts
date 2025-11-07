/**
 * Tapsigner LNbits Integration Hook
 * Phase 3: Frontend integration for wallet linking and tap-to-spend
 *
 * Features:
 * - Link Tapsigner card to LNbits wallet
 * - Configure spend limits
 * - Unlink wallet from card
 * - Error handling with retry logic
 * - JWT session token authentication
 * - Feature flag gating
 */

import { useCallback, useState } from "react";
import type {
  TapsignerLnbitsLink,
  TapsignerLnbitsLinkRequest,
  TapsignerLnbitsLinkResponse,
} from "../../types/tapsigner";
import { useAuth } from "../components/auth/AuthProvider";
import { getEnvVar } from "../config/env.client";

/**
 * Hook state interface
 */
interface UseTapsignerLnbitsState {
  link: TapsignerLnbitsLink | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook return interface
 */
interface UseTapsignerLnbitsReturn extends UseTapsignerLnbitsState {
  linkWallet: (
    cardId: string,
    walletId: string,
    spendLimit?: number,
    tapToSpendEnabled?: boolean
  ) => Promise<TapsignerLnbitsLink>;
  setSpendLimit: (cardId: string, spendLimit: number) => Promise<void>;
  unlinkWallet: (cardId: string) => Promise<void>;
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
 * Tapsigner LNbits Hook - Wallet linking and tap-to-spend
 */
export const useTapsignerLnbits = (): UseTapsignerLnbitsReturn => {
  const { sessionToken } = useAuth();
  const [state, setState] = useState<UseTapsignerLnbitsState>({
    link: null,
    loading: false,
    error: null,
  });

  // Feature flag checks
  const TAPSIGNER_ENABLED =
    (getEnvVar("VITE_TAPSIGNER_ENABLED") || "true").toLowerCase() === "true";
  const LNBITS_ENABLED =
    (getEnvVar("VITE_TAPSIGNER_LNBITS_ENABLED") || "true").toLowerCase() ===
    "true";
  const DEBUG_ENABLED =
    (getEnvVar("VITE_TAPSIGNER_DEBUG") || "false").toLowerCase() === "true";

  // Debug logging
  const debugLog = useCallback(
    (message: string, data?: any) => {
      if (DEBUG_ENABLED) {
        console.log(`[useTapsignerLnbits] ${message}`, data || "");
      }
    },
    [DEBUG_ENABLED]
  );

  /**
   * Link Tapsigner card to LNbits wallet
   */
  const linkWallet = useCallback(
    async (
      cardId: string,
      walletId: string,
      spendLimit: number = 50000,
      tapToSpendEnabled: boolean = false
    ): Promise<TapsignerLnbitsLink> => {
      if (!TAPSIGNER_ENABLED || !LNBITS_ENABLED) {
        throw new Error("Tapsigner LNbits integration is not enabled");
      }

      if (!sessionToken) {
        throw new Error("Not authenticated");
      }

      setState((s) => ({ ...s, loading: true, error: null }));
      debugLog("Linking wallet to card", { cardId, walletId });

      try {
        const response = await retryOperation(async () => {
          const res = await fetch("/api/tapsigner/lnbits-link", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${sessionToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              cardId,
              walletId,
              spendLimitSats: spendLimit,
              tapToSpendEnabled,
            } as TapsignerLnbitsLinkRequest),
          });

          if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || "Wallet linking failed");
          }

          return res.json() as Promise<TapsignerLnbitsLinkResponse>;
        });

        if (!response.success) {
          throw new Error(response.error || "Wallet linking failed");
        }

        debugLog("Wallet linked successfully", response.link);
        const linkedWallet = response.link || null;
        setState((s) => ({ ...s, link: linkedWallet, loading: false }));
        return linkedWallet as TapsignerLnbitsLink;
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Wallet linking failed";
        debugLog("Wallet linking error", errorMsg);
        setState((s) => ({ ...s, error: errorMsg, loading: false }));
        throw err;
      }
    },
    [TAPSIGNER_ENABLED, LNBITS_ENABLED, sessionToken, debugLog]
  );

  /**
   * Set spend limit for card
   */
  const setSpendLimit = useCallback(
    async (cardId: string, spendLimit: number): Promise<void> => {
      if (!TAPSIGNER_ENABLED || !LNBITS_ENABLED) {
        throw new Error("Tapsigner LNbits integration is not enabled");
      }

      if (!sessionToken) {
        throw new Error("Not authenticated");
      }

      setState((s) => ({ ...s, loading: true, error: null }));
      debugLog("Setting spend limit", { cardId, spendLimit });

      try {
        await retryOperation(async () => {
          const res = await fetch("/api/tapsigner/lnbits-link", {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${sessionToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              cardId,
              spendLimitSats: spendLimit,
            }),
          });

          if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || "Failed to set spend limit");
          }

          return res.json();
        });

        debugLog("Spend limit set successfully");
        setState((s) => ({ ...s, loading: false }));
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to set spend limit";
        debugLog("Spend limit error", errorMsg);
        setState((s) => ({ ...s, error: errorMsg, loading: false }));
        throw err;
      }
    },
    [TAPSIGNER_ENABLED, LNBITS_ENABLED, sessionToken, debugLog]
  );

  /**
   * Unlink wallet from card
   */
  const unlinkWallet = useCallback(
    async (cardId: string): Promise<void> => {
      if (!TAPSIGNER_ENABLED || !LNBITS_ENABLED) {
        throw new Error("Tapsigner LNbits integration is not enabled");
      }

      if (!sessionToken) {
        throw new Error("Not authenticated");
      }

      setState((s) => ({ ...s, loading: true, error: null }));
      debugLog("Unlinking wallet from card", { cardId });

      try {
        await retryOperation(async () => {
          const res = await fetch(`/api/tapsigner/lnbits-link/${cardId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${sessionToken}`,
              "Content-Type": "application/json",
            },
          });

          if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || "Wallet unlinking failed");
          }

          return res.json();
        });

        debugLog("Wallet unlinked successfully");
        setState((s) => ({ ...s, link: null, loading: false }));
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Wallet unlinking failed";
        debugLog("Wallet unlinking error", errorMsg);
        setState((s) => ({ ...s, error: errorMsg, loading: false }));
        throw err;
      }
    },
    [TAPSIGNER_ENABLED, LNBITS_ENABLED, sessionToken, debugLog]
  );

  /**
   * Reset hook state
   */
  const reset = useCallback(() => {
    setState({
      link: null,
      loading: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    linkWallet,
    setSpendLimit,
    unlinkWallet,
    reset,
  };
};

export default useTapsignerLnbits;
