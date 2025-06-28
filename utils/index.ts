import * as validation from "./validation";

export { createLogger, defaultLogger, Logger } from "./logger";
export type { LogContext, LogEntry, LoggerConfig, LogLevel } from "./logger";

// Export browser-compatible crypto functions from crypto-factory
export {
  areCryptoModulesLoaded,
  clearCryptoCache,
  // Environment detection and configuration
  configureCryptoStrategy,
  configureOptimalCryptoStrategy,
  // Lightweight utilities (always available)
  constantTimeEquals,
  createCryptoLoadingManager,
  decodeBase32,
  decryptData,
  deriveKey,
  encryptData,
  generateHOTP,
  // High-level crypto functions (async, browser-compatible)
  generateNostrKeyPair,
  generateRandomHex,
  generateRecoveryPhrase,
  generateSecureToken,
  generateTOTP,
  getCryptoEnvironmentInfo,
  getCryptoStrategy,
  getPreferredCryptoImplementation,
  isBase32,
  isCryptoSupported,
  // Module loading utilities
  preloadCryptoModules,
  privateKeyFromPhrase,
  privateKeyFromPhraseWithAccount,
  sha256,
} from "./crypto-factory";

// Export crypto factory types
export type {
  CryptoLoadingState,
  CryptoLoadingStrategy,
} from "./crypto-factory";

export { validation };

// Export authentication crypto utilities
export {
  AUTH_CRYPTO_CONFIG,
  checkRateLimit,
  cleanupRateLimitStore,
  CORS_HEADERS,
  generateSecureChallenge,
  generateSessionToken,
  getClientIP,
  getCorsHeaders,
  getSecurityHeaders,
  SECURITY_HEADERS,
  validateOrigin,
  validators,
} from "./auth-crypto";

export type { RateLimitResult } from "./auth-crypto";

// Export enhanced CORS utilities
export {
  ALLOWED_ORIGINS,
  getAllowedOrigins,
  getCorsHeadersForAnyAPI,
  setCorsHeaders,
  setCorsHeadersFromShared,
} from "./cors";
