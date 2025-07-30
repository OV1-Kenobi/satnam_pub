// React hook for managing crypto utilities with lazy loading
// File: src/hooks/useCrypto.ts

import { useCallback, useEffect, useRef, useState } from "react";

// Dynamic import types to avoid static imports
type CryptoLoadingState = {
  isLoading: boolean;
  isLoaded: boolean;
  error: Error | null;
};

interface UseCryptoOptions {
  preload?: boolean;
  autoLoad?: boolean;
  strategy?: {
    useSync?: boolean;
    preloadModules?: boolean;
    enableCaching?: boolean;
  };
}

interface UseCryptoReturn extends CryptoLoadingState {
  loadCrypto: () => Promise<void>;
  retry: () => Promise<void>;
}

/**
 * React hook for managing crypto utilities with lazy loading
 *
 * @param options Configuration options for crypto loading
 * @returns Object with loading state and control functions
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isLoading, isLoaded, error, loadCrypto } = useCrypto({
 *     preload: true,
 *     autoLoad: false
 *   });
 *
 *   const handleGenerateKeys = async () => {
 *     if (!isLoaded) {
 *       await loadCrypto();
 *     }
 *     // Use crypto functions...
 *   };
 *
 *   return (
 *     <div>
 *       {isLoading && <div>Loading crypto modules...</div>}
 *       {error && <div>Error: {error.message}</div>}
 *       <button onClick={handleGenerateKeys} disabled={isLoading}>
 *         Generate Keys
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useCrypto(options: UseCryptoOptions = {}): UseCryptoReturn {
  const { preload = false, autoLoad = false, strategy } = options;

  const [state, setState] = useState<CryptoLoadingState>(() => ({
    isLoading: false,
    isLoaded: false, // Will be checked dynamically
    error: null,
  }));

  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  // Configure strategy if provided
  useEffect(() => {
    if (strategy) {
      import("../../utils/crypto-factory").then(
        ({ configureCryptoStrategy }) => {
          configureCryptoStrategy(strategy);
        }
      );
    }
  }, [strategy]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadCrypto = useCallback(async () => {
    // Prevent multiple simultaneous loads
    if (loadingRef.current) {
      console.log("🔄 Load already in progress, skipping...");
      return;
    }

    // Check current state without dependency issues
    if (state.isLoaded) {
      console.log("✅ Crypto already loaded, skipping...");
      return;
    }

    console.log("🔄 Starting crypto loading...");
    loadingRef.current = true;

    if (mountedRef.current) {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
    }

    try {
      const { preloadCryptoModules } = await import(
        "../../utils/crypto-factory"
      );
      console.log("🔄 Calling preloadCryptoModules...");
      await preloadCryptoModules();
      console.log("✅ preloadCryptoModules completed successfully");

      if (mountedRef.current) {
        console.log("✅ Setting crypto state to loaded");
        setState({
          isLoading: false,
          isLoaded: true,
          error: null,
        });
      }
    } catch (error) {
      console.error("❌ Crypto loading failed:", error);
      if (mountedRef.current) {
        setState({
          isLoading: false,
          isLoaded: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    } finally {
      loadingRef.current = false;
      console.log("🔄 Crypto loading process completed");
    }
  }, []); // Remove state.isLoaded dependency to fix stale closure

  const retry = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null }));
    await loadCrypto();
  }, [loadCrypto]);

  // Auto-load or preload on mount
  useEffect(() => {
    if (autoLoad || preload) {
      loadCrypto();
    }
  }, [autoLoad, preload, loadCrypto]);

  return {
    ...state,
    loadCrypto,
    retry,
  };
}

/**
 * Hook for crypto operations with automatic loading
 * Provides a higher-level interface that handles loading automatically
 *
 * @example
 * ```tsx
 * function KeyGenerator() {
 *   const crypto = useCryptoOperations();
 *
 *   const handleGenerate = async () => {
 *     try {
 *       const keyPair = await crypto.generateNostrKeyPair();
 *       console.log('Generated:', keyPair);
 *     } catch (error) {
 *       console.error('Failed to generate keys:', error);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       {crypto.isLoading && <div>Loading...</div>}
 *       <button onClick={handleGenerate} disabled={crypto.isLoading}>
 *         Generate Keys
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useCryptoOperations() {
  const cryptoState = useCrypto({ preload: true });

  const executeWithLoading = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      console.log("🔄 executeWithLoading called, current state:", {
        isLoaded: cryptoState.isLoaded,
        isLoading: cryptoState.isLoading,
        hasError: !!cryptoState.error,
      });

      // Simplified approach - just ensure loading is attempted
      if (!cryptoState.isLoaded && !cryptoState.isLoading) {
        console.log("🔄 Triggering crypto load...");
        await cryptoState.loadCrypto();
      }

      // Skip complex polling - just execute the operation
      if (cryptoState.error) {
        console.error("❌ Crypto error detected:", cryptoState.error);
        throw cryptoState.error;
      }

      console.log("✅ Executing operation directly");
      return operation();
    },
    [
      cryptoState.isLoaded,
      cryptoState.isLoading,
      cryptoState.error,
      cryptoState.loadCrypto,
    ]
  );

  return {
    ...cryptoState,

    // Wrapped crypto operations that handle loading automatically
    async generateNostrKeyPair(recoveryPhrase?: string, account?: number) {
      console.log("🔑 generateNostrKeyPair called");

      // Use direct import approach (same as working debug test)
      try {
        console.log("🔄 Using direct crypto factory import...");
        const cryptoFactory = await import("../../utils/crypto-factory");
        const result = await cryptoFactory.generateNostrKeyPair(
          recoveryPhrase,
          account
        );
        console.log("✅ Direct crypto factory import successful");
        return result;
      } catch (error) {
        console.error("❌ Direct crypto factory import failed:", error);

        // Fallback to executeWithLoading approach
        try {
          console.log("🔄 Falling back to executeWithLoading...");
          return await executeWithLoading(async () => {
            const cryptoFactory = await import("../../utils/crypto-factory");
            return cryptoFactory.generateNostrKeyPair(recoveryPhrase, account);
          });
        } catch (fallbackError) {
          console.error("❌ Fallback also failed:", fallbackError);
          throw fallbackError;
        }
      }
    },

    async generateRecoveryPhrase() {
      // For essential functions, try direct loading if preloading fails
      try {
        return await executeWithLoading(async () => {
          const cryptoFactory = await import("../../utils/crypto-factory");
          return cryptoFactory.generateRecoveryPhrase();
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("timeout")) {
          // If timeout, try direct import without waiting for preloading
          console.warn(
            "⚠️ Crypto preloading timed out, trying direct import..."
          );
          const cryptoFactory = await import("../../utils/crypto-factory");
          return cryptoFactory.generateRecoveryPhrase();
        }
        throw error;
      }
    },

    async privateKeyFromPhrase(phrase: string) {
      return executeWithLoading(async () => {
        const cryptoFactory = await import("../../utils/crypto-factory");
        return cryptoFactory.privateKeyFromPhrase(phrase);
      });
    },

    async generateTOTP(secret: string, window?: number) {
      return executeWithLoading(async () => {
        const cryptoFactory = await import("../../utils/crypto-factory");
        return cryptoFactory.generateTOTP(secret, window);
      });
    },

    async encryptData(data: string, password: string) {
      return executeWithLoading(async () => {
        const cryptoFactory = await import("../../utils/crypto-factory");
        return cryptoFactory.encryptData(data, password);
      });
    },

    async decryptData(encryptedData: string, password: string) {
      return executeWithLoading(async () => {
        const cryptoFactory = await import("../../utils/crypto-factory");
        return cryptoFactory.decryptData(encryptedData, password);
      });
    },

    // Additional crypto utilities
    async generateRandomHex(length: number) {
      return executeWithLoading(async () => {
        const cryptoFactory = await import("../../utils/crypto-factory");
        return cryptoFactory.generateRandomHex(length);
      });
    },

    async generateSecureToken(length?: number) {
      return executeWithLoading(async () => {
        const cryptoFactory = await import("../../utils/crypto-factory");
        return cryptoFactory.generateSecureToken(length);
      });
    },

    async sha256(data: string) {
      return executeWithLoading(async () => {
        const cryptoFactory = await import("../../utils/crypto-factory");
        return cryptoFactory.sha256(data);
      });
    },
  };
}

/**
 * Hook for preloading crypto modules in the background
 * Useful for components that will likely need crypto operations
 *
 * @example
 * ```tsx
 * function App() {
 *   // Preload crypto modules when the app starts
 *   useCryptoPreloader();
 *
 *   return <div>App content...</div>;
 * }
 * ```
 */
export function useCryptoPreloader() {
  const [preloaded, setPreloaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const preload = async () => {
      try {
        const { preloadCryptoModules } = await import(
          "../../utils/crypto-factory"
        );
        await preloadCryptoModules();
        if (!cancelled) {
          setPreloaded(true);
        }
      } catch (error) {
        console.warn("Failed to preload crypto modules:", error);
      }
    };

    preload();

    return () => {
      cancelled = true;
    };
  }, []);

  return { preloaded };
}
