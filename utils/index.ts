import * as validation from "./validation";

export { Logger, createLogger, defaultLogger } from "./logger";
export type { LogContext, LogEntry, LogLevel, LoggerConfig } from "./logger";

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
