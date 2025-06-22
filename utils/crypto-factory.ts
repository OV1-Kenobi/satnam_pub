// Crypto utilities factory with smart loading strategy and browser compatibility
// File: utils/crypto-factory.ts
//
// This factory automatically detects the environment and uses the most appropriate
// crypto implementation:
// - Browser: Uses Web Crypto API for maximum compatibility and security
// - Node.js: Uses Node.js crypto module for optimal performance
// - Fallback: Gracefully handles environments without crypto support
//
// Features:
// - Automatic environment detection
// - Browser-compatible Web Crypto API support
// - Lazy loading for optimal bundle size
// - Configurable loading strategies
// - Error handling with helpful diagnostics

import type {
  decryptData as DecryptDataType,
  deriveKey as DeriveKeyType,
  encryptData as EncryptDataType,
  generateHOTP as GenerateHOTPType,
  generateNostrKeyPair as GenerateNostrKeyPairType,
  generateRecoveryPhrase as GenerateRecoveryPhraseType,
  generateTOTP as GenerateTOTPType,
  privateKeyFromPhrase as PrivateKeyFromPhraseType,
  privateKeyFromPhraseWithAccount as PrivateKeyFromPhraseWithAccountType,
} from "./crypto-lazy";

// Lightweight utilities (always available) - re-exported to avoid static imports
export async function constantTimeEquals(
  a: string,
  b: string
): Promise<boolean> {
  const { constantTimeEquals } = await import("./crypto-lazy");
  return constantTimeEquals(a, b);
}

export async function decodeBase32(base32: string): Promise<Buffer> {
  const { decodeBase32 } = await import("./crypto-lazy");
  return decodeBase32(base32);
}

export async function generateRandomHex(length: number): Promise<string> {
  const { generateRandomHex } = await import("./crypto-lazy");
  return generateRandomHex(length);
}

export async function generateSecureToken(length?: number): Promise<string> {
  const { generateSecureToken } = await import("./crypto-lazy");
  return generateSecureToken(length);
}

export async function isBase32(str: string): Promise<boolean> {
  const { isBase32 } = await import("./crypto-lazy");
  return isBase32(str);
}

export async function sha256(data: string): Promise<string> {
  const { sha256 } = await import("./crypto-lazy");
  return sha256(data);
}

// Environment detection
const isServer = typeof window === "undefined";
const isBrowser = typeof window !== "undefined";
const hasWebCrypto = isBrowser && window.crypto && window.crypto.subtle;
const hasNodeCrypto =
  typeof process !== "undefined" && process.versions && process.versions.node;
const isProduction =
  typeof process !== "undefined" && process.env?.NODE_ENV === "production";

// Strategy configuration
interface CryptoLoadingStrategy {
  useSync: boolean;
  preloadModules: boolean;
  enableCaching: boolean;
  preferBrowserCrypto: boolean;
}

const defaultStrategy: CryptoLoadingStrategy = {
  useSync: isServer && hasNodeCrypto, // Use sync only on server with Node.js crypto
  preloadModules: !isProduction, // Preload in development for better DX
  enableCaching: true,
  preferBrowserCrypto: hasWebCrypto, // Prefer Web Crypto API when available
};

let currentStrategy = { ...defaultStrategy };

/**
 * Configure the crypto loading strategy
 */
export function configureCryptoStrategy(
  strategy: Partial<CryptoLoadingStrategy>
): void {
  currentStrategy = { ...currentStrategy, ...strategy };
}

/**
 * Automatically configure the best crypto strategy for the current environment
 */
export function configureOptimalCryptoStrategy(): void {
  const optimalStrategy: CryptoLoadingStrategy = {
    useSync: isServer && hasNodeCrypto,
    preloadModules: !isProduction,
    enableCaching: true,
    preferBrowserCrypto: hasWebCrypto,
  };

  currentStrategy = optimalStrategy;

  const implementation = optimalStrategy.useSync
    ? "Node.js crypto"
    : "Web Crypto API";
  console.log(`🔧 Configured optimal crypto strategy for ${implementation}`);
}

/**
 * Get the current crypto loading strategy
 */
export function getCryptoStrategy(): CryptoLoadingStrategy {
  return { ...currentStrategy };
}

/**
 * Get detailed environment information for debugging
 */
export function getCryptoEnvironmentInfo() {
  return {
    isServer,
    isBrowser,
    hasWebCrypto,
    hasNodeCrypto,
    isProduction,
    strategy: { ...currentStrategy },
    recommendedStrategy: {
      useSync: isServer && hasNodeCrypto,
      preloadModules: !isProduction,
      enableCaching: true,
      preferBrowserCrypto: hasWebCrypto,
    },
  };
}

/**
 * Check if the current environment supports crypto operations
 */
export function isCryptoSupported(): boolean {
  return hasWebCrypto || hasNodeCrypto;
}

/**
 * Get the preferred crypto implementation for the current environment
 */
export function getPreferredCryptoImplementation():
  | "sync"
  | "async"
  | "unsupported" {
  if (!isCryptoSupported()) {
    return "unsupported";
  }

  if (isServer && hasNodeCrypto) {
    return "sync";
  }

  return "async";
}

// Lazy-loaded function wrappers
let lazyFunctions: {
  generateNostrKeyPair?: typeof GenerateNostrKeyPairType;
  generateRecoveryPhrase?: typeof GenerateRecoveryPhraseType;
  privateKeyFromPhrase?: typeof PrivateKeyFromPhraseType;
  privateKeyFromPhraseWithAccount?: typeof PrivateKeyFromPhraseWithAccountType;
  generateTOTP?: typeof GenerateTOTPType;
  generateHOTP?: typeof GenerateHOTPType;
  encryptData?: typeof EncryptDataType;
  decryptData?: typeof DecryptDataType;
  deriveKey?: typeof DeriveKeyType;
} = {};

/**
 * Load crypto functions based on current strategy and environment
 */
async function loadCryptoFunctions() {
  if (Object.keys(lazyFunctions).length > 0 && currentStrategy.enableCaching) {
    return lazyFunctions;
  }

  // Determine the best crypto implementation based on environment
  const shouldUseSync = currentStrategy.useSync && hasNodeCrypto && isServer;
  const shouldUseBrowserCrypto =
    currentStrategy.preferBrowserCrypto && hasWebCrypto;

  if (shouldUseSync) {
    // Load synchronous versions (for server-side with Node.js crypto)
    try {
      // Use dynamic import with string concatenation to avoid Vite static analysis
      const cryptoModulePath = "./crypto";
      const syncCrypto = await import(/* @vite-ignore */ cryptoModulePath);
      lazyFunctions = {
        generateNostrKeyPair: syncCrypto.generateNostrKeyPair,
        generateRecoveryPhrase: () =>
          Promise.resolve(syncCrypto.generateRecoveryPhrase()),
        privateKeyFromPhrase: (phrase: string) =>
          Promise.resolve(syncCrypto.privateKeyFromPhrase(phrase)),
        privateKeyFromPhraseWithAccount: (phrase: string, account?: number) =>
          Promise.resolve(
            syncCrypto.privateKeyFromPhraseWithAccount(phrase, account)
          ),
        generateTOTP: (secret: string, window?: number) =>
          Promise.resolve(syncCrypto.generateTOTP(secret, window)),
        generateHOTP: (secret: string, counter: number) =>
          Promise.resolve(syncCrypto.generateHOTP(secret, counter)),
        encryptData: syncCrypto.encryptData,
        decryptData: syncCrypto.decryptData,
        deriveKey: syncCrypto.deriveKey,
      };
    } catch (error) {
      console.warn(
        "⚠️ Failed to load Node.js crypto, falling back to browser-compatible version:",
        error
      );
      // Fallback to async crypto
      const asyncCrypto = await import("./crypto-lazy");
      lazyFunctions = createAsyncCryptoFunctions(asyncCrypto);
    }
  } else {
    // Load asynchronous versions (for client-side or when browser crypto is preferred)
    const asyncCrypto = await import("./crypto-lazy");
    lazyFunctions = createAsyncCryptoFunctions(asyncCrypto);

    if (shouldUseBrowserCrypto) {
      console.log(
        "✅ Using browser-compatible crypto implementations with Web Crypto API"
      );
    }
  }

  return lazyFunctions;
}

/**
 * Create async crypto function wrappers
 */
function createAsyncCryptoFunctions(asyncCrypto: any) {
  return {
    generateNostrKeyPair: asyncCrypto.generateNostrKeyPair,
    generateRecoveryPhrase: asyncCrypto.generateRecoveryPhrase,
    privateKeyFromPhrase: asyncCrypto.privateKeyFromPhrase,
    privateKeyFromPhraseWithAccount:
      asyncCrypto.privateKeyFromPhraseWithAccount,
    generateTOTP: asyncCrypto.generateTOTP,
    generateHOTP: asyncCrypto.generateHOTP,
    encryptData: asyncCrypto.encryptData,
    decryptData: asyncCrypto.decryptData,
    deriveKey: asyncCrypto.deriveKey,
  };
}

/**
 * Generate a secp256k1 key pair for Nostr
 */
export async function generateNostrKeyPair(
  recoveryPhrase?: string,
  account: number = 0
) {
  const functions = await loadCryptoFunctions();
  if (!functions.generateNostrKeyPair) {
    throw new Error("Crypto module failed to load: generateNostrKeyPair");
  }
  return functions.generateNostrKeyPair(recoveryPhrase, account);
}

/**
 * Generate a recovery phrase (mnemonic) for a private key
 */
export async function generateRecoveryPhrase(): Promise<string> {
  const functions = await loadCryptoFunctions();
  if (!functions.generateRecoveryPhrase) {
    throw new Error("Crypto module failed to load: generateRecoveryPhrase");
  }
  return functions.generateRecoveryPhrase();
}

/**
 * Derive a private key from a recovery phrase following NIP-06 standard
 */
export async function privateKeyFromPhrase(phrase: string): Promise<string> {
  const functions = await loadCryptoFunctions();
  if (!functions.privateKeyFromPhrase) {
    throw new Error("Crypto module failed to load: privateKeyFromPhrase");
  }
  return functions.privateKeyFromPhrase(phrase);
}

/**
 * Derive a private key from a recovery phrase with a specific account index
 */
export async function privateKeyFromPhraseWithAccount(
  phrase: string,
  account: number = 0
): Promise<string> {
  const functions = await loadCryptoFunctions();
  if (!functions.privateKeyFromPhraseWithAccount) {
    throw new Error(
      "Crypto module failed to load: privateKeyFromPhraseWithAccount"
    );
  }
  return functions.privateKeyFromPhraseWithAccount(phrase, account);
}

/**
 * Generate a time-based one-time password (TOTP)
 */
export async function generateTOTP(
  secret: string,
  window = 0
): Promise<string> {
  const functions = await loadCryptoFunctions();
  if (!functions.generateTOTP) {
    throw new Error("Crypto module failed to load: generateTOTP");
  }
  return functions.generateTOTP(secret, window);
}

/**
 * Generate an HMAC-based one-time password (HOTP)
 */
export async function generateHOTP(
  secret: string,
  counter: number
): Promise<string> {
  const functions = await loadCryptoFunctions();
  if (!functions.generateHOTP) {
    throw new Error("Crypto module failed to load: generateHOTP");
  }
  return functions.generateHOTP(secret, counter);
}

/**
 * Encrypt data with a password (legacy function)
 * @deprecated Use encryptCredentials from lib/security.ts
 */
export async function encryptData(
  data: string,
  password: string
): Promise<string> {
  const functions = await loadCryptoFunctions();
  if (!functions.encryptData) {
    throw new Error("Crypto module failed to load: encryptData");
  }
  return functions.encryptData(data, password);
}

/**
 * Decrypt data with a password (legacy function)
 * @deprecated Use decryptCredentials from lib/security.ts
 */
export async function decryptData(
  encryptedData: string,
  password: string
): Promise<string> {
  const functions = await loadCryptoFunctions();
  if (!functions.decryptData) {
    throw new Error("Crypto module failed to load: decryptData");
  }
  return functions.decryptData(encryptedData, password);
}

/**
 * Derive a cryptographic key from password and salt using PBKDF2
 */
export async function deriveKey(
  password: string,
  salt: string | Buffer,
  iterations: number = 100000,
  keyLength: number = 32
): Promise<Buffer> {
  const functions = await loadCryptoFunctions();
  if (!functions.deriveKey) {
    throw new Error("Crypto module failed to load: deriveKey");
  }
  return functions.deriveKey(password, salt, iterations, keyLength);
}

/**
 * Preload crypto modules for better performance
 * Call this during app initialization or when crypto operations are likely to be needed
 */
export async function preloadCryptoModules(): Promise<void> {
  if (!isCryptoSupported()) {
    console.warn("⚠️ Crypto operations not supported in this environment");
    return;
  }

  if (currentStrategy.preloadModules) {
    try {
      const startTime = performance?.now?.() || Date.now();

      await loadCryptoFunctions();

      // Also preload the lazy modules if using async strategy
      const shouldUseSync =
        currentStrategy.useSync && hasNodeCrypto && isServer;
      if (!shouldUseSync) {
        const { preloadCryptoModules } = await import("./crypto-lazy");
        await preloadCryptoModules();
      }

      const endTime = performance?.now?.() || Date.now();
      const loadTime = Math.round(endTime - startTime);

      const implementation = shouldUseSync
        ? "Node.js crypto"
        : "Web Crypto API";
      console.log(
        `✅ Crypto modules preloaded successfully using ${implementation} (${loadTime}ms)`
      );
    } catch (error) {
      console.warn("⚠️ Failed to preload crypto modules:", error);

      // Try to provide helpful error information
      if (isBrowser && !hasWebCrypto) {
        console.warn(
          "💡 Web Crypto API not available. Ensure you're running in a secure context (HTTPS)"
        );
      } else if (isServer && !hasNodeCrypto) {
        console.warn(
          "💡 Node.js crypto module not available. Ensure you're running in a Node.js environment"
        );
      }
    }
  }
}

/**
 * Check if crypto modules are loaded
 */
export function areCryptoModulesLoaded(): boolean {
  return Object.keys(lazyFunctions).length > 0;
}

/**
 * Clear crypto module cache (useful for testing or memory management)
 */
export function clearCryptoCache(): void {
  lazyFunctions = {};
}

// Utility for React components to handle loading states
export interface CryptoLoadingState {
  isLoading: boolean;
  isLoaded: boolean;
  error: Error | null;
}

/**
 * Hook-like utility for managing crypto loading state
 * (Can be used in React components or other contexts)
 */
export function createCryptoLoadingManager() {
  let state: CryptoLoadingState = {
    isLoading: false,
    isLoaded: areCryptoModulesLoaded(),
    error: null,
  };

  const listeners = new Set<(state: CryptoLoadingState) => void>();

  const notify = () => {
    listeners.forEach((listener) => listener(state));
  };

  const loadModules = async () => {
    if (state.isLoaded || state.isLoading) return;

    state = { isLoading: true, isLoaded: false, error: null };
    notify();

    try {
      await preloadCryptoModules();
      state = { isLoading: false, isLoaded: true, error: null };
    } catch (error) {
      state = {
        isLoading: false,
        isLoaded: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }

    notify();
  };

  return {
    getState: () => ({ ...state }),
    loadModules,
    subscribe: (listener: (state: CryptoLoadingState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// Export types for TypeScript users
export type { CryptoLoadingState, CryptoLoadingStrategy };
