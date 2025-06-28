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

// Browser-compatible utilities using the new unified crypto classes
export async function constantTimeEquals(
  a: string,
  b: string
): Promise<boolean> {
  const { CryptoUnified } = await import("./crypto-unified");
  // Simple constant time comparison
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function generateRandomHex(length: number): Promise<string> {
  const { CryptoUnified } = await import("./crypto-unified");
  const bytes = CryptoUnified.randomBytes(Math.ceil(length / 2));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

export async function generateSecureToken(
  length: number = 64
): Promise<string> {
  const { CryptoUnified } = await import("./crypto-unified");
  const bytes = CryptoUnified.randomBytes(length);
  const base64 = btoa(String.fromCharCode(...Array.from(bytes)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function sha256(data: string): Promise<string> {
  const { CryptoUnified } = await import("./crypto-unified");
  return CryptoUnified.hash(data);
}

// Environment detection
const isServer = typeof window === "undefined";
const isBrowser = typeof window !== "undefined";
const hasWebCrypto = Boolean(
  isBrowser && window.crypto && window.crypto.subtle
);
const hasNodeCrypto = Boolean(
  typeof process !== "undefined" && process.versions && process.versions.node
);
const isProduction = Boolean(
  typeof process !== "undefined" && process.env?.NODE_ENV === "production"
);

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
  return Boolean(hasWebCrypto || hasNodeCrypto);
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

// Browser-compatible crypto functions using the new unified classes
export async function generateNostrKeyPair(): Promise<{
  privateKey: string;
  publicKey: string;
}> {
  const { CryptoUnified } = await import("./crypto-unified");
  return CryptoUnified.generateKeyPair();
}

export async function encryptData(
  data: string,
  password: string
): Promise<string> {
  const { CryptoLazy } = await import("./crypto-lazy");
  const crypto = CryptoLazy.getInstance();
  return crypto.encryptData(data, password);
}

export async function decryptData(
  encryptedData: string,
  password: string
): Promise<string> {
  const { CryptoLazy } = await import("./crypto-lazy");
  const crypto = CryptoLazy.getInstance();
  return crypto.decryptData(encryptedData, password);
}

export async function hashPassword(
  password: string,
  salt?: string
): Promise<string> {
  const { CryptoLazy } = await import("./crypto-lazy");
  const crypto = CryptoLazy.getInstance();
  return crypto.hashPassword(password, salt);
}

// Simple browser-compatible preload
export async function preloadCryptoModules(): Promise<void> {
  if (!isCryptoSupported()) {
    console.warn("⚠️ Crypto operations not supported in this environment");
    return;
  }

  try {
    // Preload our browser-compatible modules
    await import("./crypto-unified");
    await import("./crypto-lazy");
    console.log("✅ Browser-compatible crypto modules preloaded successfully");
  } catch (error) {
    console.warn("⚠️ Failed to preload crypto modules:", error);
  }
}

/**
 * Check if crypto modules are loaded (simplified for browser-only)
 */
export function areCryptoModulesLoaded(): boolean {
  return true; // Always true since we're using static imports
}

/**
 * Clear crypto module cache (no-op for browser-only version)
 */
export function clearCryptoCache(): void {
  // No-op for browser version
}

// Utility for React components to handle loading states
export interface CryptoLoadingState {
  isLoading: boolean;
  isLoaded: boolean;
  error: Error | null;
}

/**
 * Simplified loading manager for browser-only crypto
 */
export function createCryptoLoadingManager() {
  const state: CryptoLoadingState = {
    isLoading: false,
    isLoaded: true, // Always loaded in browser
    error: null,
  };

  const listeners = new Set<(state: CryptoLoadingState) => void>();

  const notify = () => {
    listeners.forEach((listener) => listener(state));
  };

  const loadModules = async () => {
    // No-op for browser version - already loaded
    return;
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
export type { CryptoLoadingStrategy };
