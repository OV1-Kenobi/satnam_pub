/**
 * Attestation Components Index
 * Phase 2 Week 3: NIP-03 OpenTimestamps Attestation Integration
 *
 * Centralized exports for all attestation-related UI components.
 */

export { default as NIP03AttestationDetailsModal } from "./NIP03AttestationDetailsModal";
export { default as NIP03AttestationProgressIndicator } from "./NIP03AttestationProgressIndicator";
export { default as NIP03AttestationStatusDisplay } from "./NIP03AttestationStatusDisplay";

export type {
  NIP03AttestationDetailsModalProps,
  NIP03AttestationProgressIndicatorProps,
  NIP03AttestationStatusDisplayProps,
} from "../../types/attestation";
