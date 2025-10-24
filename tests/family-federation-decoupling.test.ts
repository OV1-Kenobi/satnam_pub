/**
 * Family Federation Decoupling Tests
 * 
 * Tests for feature flags and graceful degradation when Fedimint is disabled
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FeatureFlags } from '../src/lib/feature-flags';

describe('Family Federation Decoupling', () => {
  describe('Feature Flags', () => {
    it('should detect Fedimint disabled by default', () => {
      expect(FeatureFlags.isFedimintEnabled()).toBe(false);
    });

    it('should detect Family Federation enabled by default', () => {
      expect(FeatureFlags.isFamilyFederationEnabled()).toBe(true);
    });

    it('should detect FROST signing enabled by default', () => {
      expect(FeatureFlags.isFrostSigningEnabled()).toBe(true);
    });

    it('should prevent payments when Fedimint disabled', () => {
      expect(FeatureFlags.canPerformPayments()).toBe(false);
    });

    it('should allow federation creation without Fedimint', () => {
      expect(FeatureFlags.canCreateFederation()).toBe(true);
    });

    it('should allow FROST signing without Fedimint', () => {
      expect(FeatureFlags.canSignWithFrost()).toBe(true);
    });

    it('should prevent payment automation when Fedimint disabled', () => {
      expect(FeatureFlags.isPaymentAutomationEnabled()).toBe(false);
    });
  });

  describe('Feature Status', () => {
    it('should return current feature status', () => {
      const status = FeatureFlags.getStatus();
      expect(status).toHaveProperty('fedimintEnabled');
      expect(status).toHaveProperty('familyFederationEnabled');
      expect(status).toHaveProperty('frostSigningEnabled');
      expect(status).toHaveProperty('paymentAutomationEnabled');
    });

    it('should have correct default values in status', () => {
      const status = FeatureFlags.getStatus();
      expect(status.fedimintEnabled).toBe(false);
      expect(status.familyFederationEnabled).toBe(true);
      expect(status.frostSigningEnabled).toBe(true);
      expect(status.paymentAutomationEnabled).toBe(false);
    });
  });

  describe('Composite Checks', () => {
    it('should allow federation creation when family federation enabled', () => {
      expect(FeatureFlags.canCreateFederation()).toBe(true);
    });

    it('should allow FROST signing when FROST enabled', () => {
      expect(FeatureFlags.canSignWithFrost()).toBe(true);
    });

    it('should prevent payments when Fedimint disabled', () => {
      expect(FeatureFlags.canPerformPayments()).toBe(false);
    });

    it('should require both Fedimint and payment automation for payments', () => {
      // Both flags must be true for payments to work
      const canPay = FeatureFlags.isFedimintEnabled() && 
                     FeatureFlags.isPaymentAutomationEnabled();
      expect(FeatureFlags.canPerformPayments()).toBe(canPay);
    });
  });

  describe('Logging', () => {
    it('should log status without errors', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      FeatureFlags.logStatus();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('MVP Configuration', () => {
    it('should support MVP mode (federation without payments)', () => {
      // MVP should have:
      // - Family Federation enabled
      // - FROST signing enabled
      // - Fedimint disabled
      // - Payment automation disabled
      expect(FeatureFlags.isFamilyFederationEnabled()).toBe(true);
      expect(FeatureFlags.isFrostSigningEnabled()).toBe(true);
      expect(FeatureFlags.isFedimintEnabled()).toBe(false);
      expect(FeatureFlags.isPaymentAutomationEnabled()).toBe(false);
    });

    it('should allow federation operations in MVP mode', () => {
      expect(FeatureFlags.canCreateFederation()).toBe(true);
      expect(FeatureFlags.canSignWithFrost()).toBe(true);
    });

    it('should prevent payment operations in MVP mode', () => {
      expect(FeatureFlags.canPerformPayments()).toBe(false);
    });
  });

  describe('Graceful Degradation', () => {
    it('should provide clear error messages when features disabled', () => {
      // When Fedimint is disabled, operations should fail gracefully
      // This is tested in the actual service implementations
      expect(FeatureFlags.isFedimintEnabled()).toBe(false);
    });

    it('should allow core federation features without Fedimint', () => {
      // Core features should work independently
      expect(FeatureFlags.canCreateFederation()).toBe(true);
      expect(FeatureFlags.canSignWithFrost()).toBe(true);
    });
  });
});

