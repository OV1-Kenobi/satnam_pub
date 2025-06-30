// Privacy Components Exports for Satnam.pub
// File: src/components/privacy/index.ts

export { default as PrivacyControls } from "./PrivacyControls";

// Re-export privacy utilities
export { DataSanitizer } from "../../lib/privacy/data-sanitizer";
export type {
  PrivacyMetrics,
  PrivacySafeData,
  PrivacySafeFamilyTreasury,
  PrivacySafeTransaction,
} from "../../lib/privacy/data-sanitizer";
