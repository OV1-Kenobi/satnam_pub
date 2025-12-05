/**
 * Feature flags for Family Federation decoupling
 * Controls which features are available based on environment configuration
 *
 * This module provides a centralized way to check feature availability
 * and enables graceful degradation when optional features are disabled.
 *
 * Payment Integration Strategy:
 * - LNbits and NWC are primary payment backends (production-ready)
 * - BIFROST and Fedimint are optional enhancements when available
 */

import { clientConfig } from "../config/env.client";

/**
 * Feature flags for Family Federation decoupling
 * Provides methods to check if specific features are enabled
 */
export const FeatureFlags = {
  /**
   * Check if LNbits integration is enabled (primary payment backend)
   * When enabled: wallet provisioning, Lightning Address, and payments are available
   *
   * @returns true if LNbits integration is enabled
   */
  isLnbitsEnabled: (): boolean => {
    return clientConfig.flags.lnbitsIntegrationEnabled === true;
  },

  /**
   * Check if NWC (Nostr Wallet Connect) is enabled (primary payment backend)
   * When enabled: remote wallet payments via NWC protocol are available
   *
   * @returns true if NWC integration is enabled
   */
  isNwcEnabled: (): boolean => {
    return clientConfig.flags.nwcEnabled === true;
  },

  /**
   * Check if BIFROST integration is enabled (optional enhancement)
   * BIFROST is the production-ready FROSTR protocol implementation
   *
   * @returns true if BIFROST integration is enabled
   */
  isBifrostEnabled: (): boolean => {
    return clientConfig.flags.bifrostEnabled === true;
  },

  /**
   * Check if Fedimint integration is enabled (optional enhancement)
   * When enabled: eCash and Fedimint-specific features are available
   *
   * @returns true if Fedimint integration is enabled
   */
  isFedimintEnabled: (): boolean => {
    return clientConfig.flags.fedimintIntegrationEnabled === true;
  },

  /**
   * Check if any payment integration is enabled
   * Payment automation requires at least one payment backend:
   * - Primary: LNbits or NWC (production-ready)
   * - Optional: BIFROST or Fedimint (enhancements)
   *
   * @returns true if any payment integration is enabled
   */
  isPaymentIntegrationEnabled: (): boolean => {
    return (
      FeatureFlags.isLnbitsEnabled() ||
      FeatureFlags.isNwcEnabled() ||
      FeatureFlags.isBifrostEnabled() ||
      FeatureFlags.isFedimintEnabled()
    );
  },

  /**
   * Check if Family Federation core is enabled
   * When disabled: federation creation and management are unavailable
   *
   * @returns true if Family Federation is enabled
   */
  isFamilyFederationEnabled: (): boolean => {
    return clientConfig.flags.familyFederationEnabled !== false;
  },

  /**
   * Check if FROST signing is enabled
   * When disabled: multi-signature operations are unavailable
   *
   * @returns true if FROST signing is enabled
   */
  isFrostSigningEnabled: (): boolean => {
    return clientConfig.flags.frostSigningEnabled !== false;
  },

  /**
   * Check if payment automation is enabled
   * Requires both payment integration (LNbits, NWC, BIFROST, or Fedimint)
   * AND the payment automation flag to be enabled
   *
   * @returns true if payment automation is enabled
   */
  isPaymentAutomationEnabled: (): boolean => {
    return (
      FeatureFlags.isPaymentIntegrationEnabled() &&
      clientConfig.flags.paymentAutomationEnabled === true
    );
  },

  /**
   * Composite check: Can create family federation
   *
   * @returns true if family federation creation is available
   */
  canCreateFederation: (): boolean => {
    return FeatureFlags.isFamilyFederationEnabled();
  },

  /**
   * Composite check: Can perform payments
   *
   * @returns true if payment operations are available
   */
  canPerformPayments: (): boolean => {
    return FeatureFlags.isPaymentAutomationEnabled();
  },

  /**
   * Composite check: Can sign with FROST
   *
   * @returns true if FROST signing is available
   */
  canSignWithFrost: (): boolean => {
    return FeatureFlags.isFrostSigningEnabled();
  },

  /**
   * Get feature status for debugging
   * Returns an object with all feature flag states
   *
   * @returns object with all feature flag states
   */
  getStatus: () => ({
    lnbitsEnabled: FeatureFlags.isLnbitsEnabled(),
    nwcEnabled: FeatureFlags.isNwcEnabled(),
    bifrostEnabled: FeatureFlags.isBifrostEnabled(),
    fedimintEnabled: FeatureFlags.isFedimintEnabled(),
    paymentIntegrationEnabled: FeatureFlags.isPaymentIntegrationEnabled(),
    familyFederationEnabled: FeatureFlags.isFamilyFederationEnabled(),
    frostSigningEnabled: FeatureFlags.isFrostSigningEnabled(),
    paymentAutomationEnabled: FeatureFlags.isPaymentAutomationEnabled(),
  }),

  /**
   * Log feature status for debugging
   * Useful for troubleshooting feature flag configuration
   */
  logStatus: (): void => {
    const status = FeatureFlags.getStatus();
    console.log("📋 Feature Flags Status:", status);
  },
};

export default FeatureFlags;
