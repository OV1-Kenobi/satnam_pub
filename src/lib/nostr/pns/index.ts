/**
 * NIP-PNS (Private Notes to Self) Module
 *
 * Exports key derivation and encryption utilities for NIP-PNS with
 * optional Noise-FS forward secrecy layer.
 *
 * @module src/lib/nostr/pns
 */

// Key derivation functions
export {
  derivePnsKeypair,
  derivePnsNip44Key,
  derivePnsFsRoot,
  validatePnsKeys,
} from "./pns-keys";

// Re-export predefined tags from noise/types for convenience
export { PNS_PREDEFINED_TAGS, type PnsPredefinedTag } from "../../noise/types";

// Event creation, parsing, and publishing
export {
  // Constants
  PNS_EVENT_KIND,
  // Types
  type PnsPublishResult,
  type ParsedPnsContent,
  type UnsignedPnsEvent,
  // Envelope functions
  createNoisePnsEnvelope,
  parseNoisePnsEnvelope,
  // NIP-44 encryption
  encryptNip44Pns,
  decryptNip44Pns,
  // Event creation and parsing
  createPnsEvent,
  parsePnsEvent,
  validatePnsEvent,
  getPnsSecurityMode,
  // CEPS publishing
  publishPnsEvent,
  queryPnsEvents,
  publishPnsDeletion,
} from "./pns-events";

// High-level PNS service
export {
  PnsService,
  type ParsedPnsNote,
  type PnsServiceConfig,
  type PnsNoteFilters,
} from "./pns-service";

// Ephemeral policy management
export {
  EphemeralPolicyManager,
  type CleanupHandle,
  type EphemeralPolicyOptions,
  type DeleteCallback,
  type CleanupStats,
  // Convenience functions
  createEphemeralPolicy,
  isExpired,
  getTimeUntilExpiry,
  scheduleCleanup,
  cancelCleanup,
  cleanupExpiredNotes,
} from "./ephemeral-policy";
