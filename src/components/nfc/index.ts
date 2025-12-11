/**
 * NFC Components Barrel Export
 * Unified NFC Setup Flow components for Boltcard and Tapsigner
 */

// Main orchestrator
export { UnifiedNFCSetupFlow } from "./UnifiedNFCSetupFlow";
export type {
  UnifiedNFCSetupFlowProps,
  NFCSetupResult,
} from "./UnifiedNFCSetupFlow";

// Card type selector
export { NFCCardTypeSelector } from "./NFCCardTypeSelector";
export type { NFCCardType } from "./NFCCardTypeSelector";

// MFA configuration
export { NFCMFAConfigurationStep } from "./NFCMFAConfigurationStep";
export type { MFAConfiguration } from "./NFCMFAConfigurationStep";

// Boltcard keys display
export {
  default as BoltcardKeysDisplay,
  BoltcardKeysDisplayFull,
  BoltcardProgrammingInstructions,
} from "./BoltcardKeysDisplay";
export type { BoltcardKeys } from "./BoltcardKeysDisplay";

// Default export for lazy loading
export { default as UnifiedNFCSetupFlowDefault } from "./UnifiedNFCSetupFlow";
