/**
 * Feature flags for Family Federation decoupling
 * Controls which features are available based on environment configuration
 *
 * This module provides a centralized way to check feature availability
 * and enables graceful degradation when optional features are disabled.
 *
 * BIFROST-First Strategy: Supports both BIFROST and legacy Fedimint integration
 */

import { clientConfig } from "../config/env.client";

/**
 * Feature flags for Family Federation decoupling
 * Provides methods to check if specific features are enabled
 */
export const FeatureFlags = {
  /**
   * Check if BIFROST integration is enabled (preferred)
   * BIFROST is the production-ready FROSTR protocol implementation
   *
   * @returns true if BIFROST integration is enabled
   */
  isBifrostEnabled: (): boolean => {
    return clientConfig.flags.bifrostEnabled === true;
  },

  /**
   * Check if Fedimint integration is enabled (legacy)
   * When disabled: payments, wallets, and eCash features are unavailable
   *
   * @returns true if Fedimint integration is enabled
   */
  isFedimintEnabled: (): boolean => {
    return clientConfig.flags.fedimintIntegrationEnabled === true;
  },

  /**
   * Check if any payment integration is enabled (BIFROST or Fedimint)
   *
   * @returns true if either BIFROST or Fedimint is enabled
   */
  isPaymentIntegrationEnabled: (): boolean => {
    return FeatureFlags.isBifrostEnabled() || FeatureFlags.isFedimintEnabled();
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
   * Requires both payment integration (BIFROST or Fedimint) and payment automation flags
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
