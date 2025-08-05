import * as validation from "./validation";

export type {
  LogContext,
  LogEntry,
  LogLevel,
  Logger,
  LoggerConfig,
  createLogger,
  defaultLogger,
} from "./logger";

// Export browser-compatible crypto functions from crypto-factory
export {
  areCryptoModulesLoaded,
  clearCryptoCache,
  // Environment detection and configuration
  configureCryptoStrategy,
  configureCryptoStrategy as configureOptimalCryptoStrategy,
  // Lightweight utilities (always available)
  constantTimeEquals,
  createCryptoLoadingManager,
  decryptData,
  encryptData,
  // High-level crypto functions (async, browser-compatible)
  generateNostrKeyPair,
  generateRandomHex,
  generateSecureToken,
  getCryptoEnvironmentInfo,
  getCryptoStrategy,
  getPreferredCryptoImplementation,
  hashPassword,
  isCryptoSupported,
  // Module loading utilities
  preloadCryptoModules,
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
  AUTH_CRYPTO_CONFIG, // @deprecated - not needed with database-backed rate limiting
  CORS_HEADERS,
  SECURITY_HEADERS,
  checkRateLimit, // @deprecated - use checkRateLimitDB for production
  checkRateLimitDB, // Production-ready database-backed rate limiting
  cleanupRateLimitStore,
  generateSecureChallenge,
  generateSessionToken,
  getClientIP,
  getCorsHeaders,
  getSecurityHeaders,
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
