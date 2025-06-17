/**
 * Privacy Module Index - Centralized Privacy & Security Exports
 *
 * This module provides a unified interface for all privacy-related functionality
 * including encryption, LNProxy integration, and secure data handling.
 */

// Re-export all encryption functionality
export * from "./encryption";

// Re-export LNProxy privacy layer
export * from "./lnproxy-privacy";

// Convenience exports for most common use cases
export {
  SatnamPrivacyLayer,
  createPrivacyLayer,
  wrapInvoiceForPrivacy,
  type PrivacyServiceHealth,
  type PrivacyWrappedInvoice,
} from "./lnproxy-privacy";

export {
  decryptNsec,
  decryptSensitiveData,
  encryptNsec,
  encryptSensitiveData,
  generateSalt,
  generateSecureUUID,
  logPrivacyOperation,
  type PrivacyAuditEntry,
} from "./encryption";
