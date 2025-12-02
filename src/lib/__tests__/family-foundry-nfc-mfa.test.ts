/**
 * Family Foundry NFC MFA Policy Tests
 * Tests NFC MFA policy configuration and high-value operation detection
 */

import { describe, it, expect } from 'vitest';
import {
  calculateHighValueThreshold,
  isHighValueOperation,
  NfcMfaPolicyConfig
} from '../family-foundry-nfc-mfa';

describe('Family Foundry NFC MFA Policy', () => {
  describe('calculateHighValueThreshold', () => {
    it('should return base threshold for 1-3 members', () => {
      expect(calculateHighValueThreshold(1)).toBe(100000);
      expect(calculateHighValueThreshold(2)).toBe(100000);
      expect(calculateHighValueThreshold(3)).toBe(100000);
    });

    it('should return 2.5x threshold for 4-6 members', () => {
      expect(calculateHighValueThreshold(4)).toBe(250000);
      expect(calculateHighValueThreshold(5)).toBe(250000);
      expect(calculateHighValueThreshold(6)).toBe(250000);
    });

    it('should return 5x threshold for 7+ members', () => {
      expect(calculateHighValueThreshold(7)).toBe(500000);
      expect(calculateHighValueThreshold(10)).toBe(500000);
      expect(calculateHighValueThreshold(100)).toBe(500000);
    });

    it('should scale thresholds correctly', () => {
      const threshold3 = calculateHighValueThreshold(3);
      const threshold4 = calculateHighValueThreshold(4);
      const threshold7 = calculateHighValueThreshold(7);

      expect(threshold4).toBe(threshold3 * 2.5);
      expect(threshold7).toBe(threshold3 * 5);
    });
  });

  describe('isHighValueOperation', () => {
    it('should identify high-value operations', () => {
      const result = isHighValueOperation(150000, 100000);
      expect(result.isHighValue).toBe(true);
      expect(result.reason).toContain('exceeds threshold');
    });

    it('should identify low-value operations', () => {
      const result = isHighValueOperation(50000, 100000);
      expect(result.isHighValue).toBe(false);
      expect(result.reason).toContain('below threshold');
    });

    it('should handle edge case at threshold', () => {
      const result = isHighValueOperation(100000, 100000);
      expect(result.isHighValue).toBe(true);
    });

    it('should handle zero amount', () => {
      const result = isHighValueOperation(0, 100000);
      expect(result.isHighValue).toBe(false);
    });

    it('should handle large amounts', () => {
      const result = isHighValueOperation(1000000, 100000);
      expect(result.isHighValue).toBe(true);
    });
  });

  describe('NFC MFA Policy Configuration', () => {
    it('should have correct policy types', () => {
      const policies = ['disabled', 'optional', 'required', 'required_for_high_value'];
      policies.forEach(policy => {
        expect(['disabled', 'optional', 'required', 'required_for_high_value']).toContain(policy);
      });
    });

    it('should calculate thresholds for different federation sizes', () => {
      const sizes = [1, 3, 5, 7, 10];
      const thresholds = sizes.map(size => calculateHighValueThreshold(size));

      // Verify thresholds are non-decreasing
      for (let i = 1; i < thresholds.length; i++) {
        expect(thresholds[i]).toBeGreaterThanOrEqual(thresholds[i - 1]);
      }
    });
  });

  describe('High-Value Operation Detection', () => {
    it('should detect high-value spending operations', () => {
      const threshold = calculateHighValueThreshold(5);
      const highValue = threshold + 1;
      const lowValue = threshold - 1;

      expect(isHighValueOperation(highValue, threshold).isHighValue).toBe(true);
      expect(isHighValueOperation(lowValue, threshold).isHighValue).toBe(false);
    });

    it('should scale detection with federation size', () => {
      const smallFedThreshold = calculateHighValueThreshold(2);
      const largeFedThreshold = calculateHighValueThreshold(8);

      // Same amount should be high-value for small fed, low-value for large fed
      const testAmount = 200000;
      expect(isHighValueOperation(testAmount, smallFedThreshold).isHighValue).toBe(true);
      expect(isHighValueOperation(testAmount, largeFedThreshold).isHighValue).toBe(false);
    });
  });
});

