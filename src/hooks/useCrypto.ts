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
    if (loadingRef.current || state.isLoaded) {
      return;
    }

    loadingRef.current = true;

    if (mountedRef.current) {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
    }

    try {
      const { preloadCryptoModules } = await import(
        "../../utils/crypto-factory"
      );
      await preloadCryptoModules();

      if (mountedRef.current) {
        setState({
          isLoading: false,
          isLoaded: true,
          error: null,
        });
      }
    } catch (error) {
      if (mountedRef.current) {
        setState({
          isLoading: false,
          isLoaded: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    } finally {
      loadingRef.current = false;
    }
  }, [state.isLoaded]);

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
      if (!cryptoState.isLoaded && !cryptoState.isLoading) {
        await cryptoState.loadCrypto();
      }

      // Wait for loading to complete if in progress
      if (cryptoState.isLoading) {
        return new Promise((resolve, reject) => {
          const checkLoaded = () => {
            if (cryptoState.error) {
              reject(cryptoState.error);
            } else if (cryptoState.isLoaded) {
              resolve(operation());
            } else if (cryptoState.isLoading) {
              // Check again on next tick
              setTimeout(checkLoaded, 0);
            }
          };
          checkLoaded();
        });
      }

      if (cryptoState.error) {
        throw cryptoState.error;
      }

      return operation();
    },
    [cryptoState]
  );

  return {
    ...cryptoState,

    // Wrapped crypto operations that handle loading automatically
    async generateNostrKeyPair(recoveryPhrase?: string, account?: number) {
      return executeWithLoading(async () => {
        const cryptoFactory = await import("../../utils/crypto-factory");
        return cryptoFactory.generateNostrKeyPair(recoveryPhrase, account);
      });
    },

    async generateRecoveryPhrase() {
      return executeWithLoading(async () => {
        const cryptoFactory = await import("../../utils/crypto-factory");
        return cryptoFactory.generateRecoveryPhrase();
      });
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
