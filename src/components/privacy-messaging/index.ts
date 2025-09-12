/**
 * Privacy-First Messaging Components
 *
 * Production-ready components for NIP-05 identity disclosure management
 * with privacy-first defaults and comprehensive security features.
 */

export { default as PrivacyFirstIdentityManager } from "../PrivacyFirstIdentityManager";
export { default as MessagingIntegration } from "./MessagingIntegration";

// Hook exports
export { usePrivacyFirstMessaging } from "../../hooks/usePrivacyFirstMessaging";

// Type exports
export type {
  PrivacyMessagingActions,
  PrivacyMessagingState,
} from "../../hooks/usePrivacyFirstMessaging";
