/**
 * Family Foundry Utils Tests
 * 
 * Unit tests for utility functions:
 * - Input validation
 * - Error formatting
 * - Charter validation
 * - RBAC validation
 */

import {
  validateFederationInput,
  validateCharter,
  validateRBAC,
  formatFederationError,
  hashFederationData,
  CharterDefinition,
  RBACDefinition,
} from '../family-foundry-utils';

describe('Family Foundry Utils - Phase 1', () => {
  
  const validCharter: CharterDefinition = {
    familyName: 'Smith Family',
    foundingDate: '2024-01-01',
    coreValues: ['Trust', 'Integrity', 'Family'],
  };
  
  const validRBAC: RBACDefinition = {
    roles: [
      {
        id: 'guardian',
        name: 'Guardian',
        hierarchyLevel: 4,
        rights: ['manage_family', 'approve_spending'],
        responsibilities: ['oversee_federation'],
      },
      {
        id: 'steward',
        name: 'Steward',
        hierarchyLevel: 3,
        rights: ['approve_spending'],
        responsibilities: ['manage_operations'],
      },
    ],
  };
  
  describe('validateFederationInput', () => {
    it('should accept valid charter and RBAC', () => {
      const errors = validateFederationInput(validCharter, validRBAC);
      expect(errors).toHaveLength(0);
    });
    
    it('should reject empty family name', () => {
      const charter = { ...validCharter, familyName: '' };
      const errors = validateFederationInput(charter, validRBAC);
      expect(errors.some(e => e.field === 'familyName')).toBe(true);
    });
    
    it('should reject missing founding date', () => {
      const charter = { ...validCharter, foundingDate: '' };
      const errors = validateFederationInput(charter, validRBAC);
      expect(errors.some(e => e.field === 'foundingDate')).toBe(true);
    });
    
    it('should reject invalid founding date', () => {
      const charter = { ...validCharter, foundingDate: 'invalid-date' };
      const errors = validateFederationInput(charter, validRBAC);
      expect(errors.some(e => e.field === 'foundingDate')).toBe(true);
    });
    
    it('should reject empty core values', () => {
      const charter = { ...validCharter, coreValues: [] };
      const errors = validateFederationInput(charter, validRBAC);
      expect(errors.some(e => e.field === 'coreValues')).toBe(true);
    });
    
    it('should reject RBAC without roles', () => {
      const rbac = { roles: [] };
      const errors = validateFederationInput(validCharter, rbac);
      expect(errors.some(e => e.field === 'roles')).toBe(true);
    });
    
    it('should reject RBAC without guardian', () => {
      const rbac: RBACDefinition = {
        roles: [
          {
            id: 'steward',
            name: 'Steward',
            hierarchyLevel: 3,
            rights: [],
            responsibilities: [],
          },
        ],
      };
      const errors = validateFederationInput(validCharter, rbac);
      expect(errors.some(e => e.code === 'NO_GUARDIAN_ROLE')).toBe(true);
    });
    
    it('should reject family name over 100 characters', () => {
      const charter = {
        ...validCharter,
        familyName: 'A'.repeat(101),
      };
      const errors = validateFederationInput(charter, validRBAC);
      expect(errors.some(e => e.code === 'FAMILY_NAME_TOO_LONG')).toBe(true);
    });
  });
  
  describe('validateCharter', () => {
    it('should accept valid charter', () => {
      const errors = validateCharter(validCharter);
      expect(errors).toHaveLength(0);
    });
    
    it('should reject empty family name', () => {
      const errors = validateCharter({ ...validCharter, familyName: '' });
      expect(errors.length).toBeGreaterThan(0);
    });
    
    it('should reject missing founding date', () => {
      const errors = validateCharter({ ...validCharter, foundingDate: '' });
      expect(errors.length).toBeGreaterThan(0);
    });
  });
  
  describe('validateRBAC', () => {
    it('should accept valid RBAC', () => {
      const errors = validateRBAC(validRBAC);
      expect(errors).toHaveLength(0);
    });
    
    it('should reject empty roles', () => {
      const errors = validateRBAC({ roles: [] });
      expect(errors.length).toBeGreaterThan(0);
    });
    
    it('should reject RBAC without guardian', () => {
      const rbac: RBACDefinition = {
        roles: [
          {
            id: 'adult',
            name: 'Adult',
            hierarchyLevel: 2,
            rights: [],
            responsibilities: [],
          },
        ],
      };
      const errors = validateRBAC(rbac);
      expect(errors.some(e => e.message.includes('guardian'))).toBe(true);
    });
  });
  
  describe('formatFederationError', () => {
    it('should format Error object', () => {
      const error = new Error('Test error message');
      const formatted = formatFederationError(error);
      expect(formatted).toBe('Test error message');
    });
    
    it('should format object with message property', () => {
      const error = { message: 'Custom error' };
      const formatted = formatFederationError(error);
      expect(formatted).toBe('Custom error');
    });
    
    it('should handle unknown error type', () => {
      const formatted = formatFederationError('string error');
      expect(formatted).toContain('unknown error');
    });
  });
  
  describe('hashFederationData', () => {
    it('should generate consistent hash', async () => {
      const hash1 = await hashFederationData('test_duid');
      const hash2 = await hashFederationData('test_duid');
      expect(hash1).toBe(hash2);
    });
    
    it('should generate different hash for different input', async () => {
      const hash1 = await hashFederationData('duid1');
      const hash2 = await hashFederationData('duid2');
      expect(hash1).not.toBe(hash2);
    });
    
    it('should include timestamp in hash when provided', async () => {
      const hash1 = await hashFederationData('duid', 1000);
      const hash2 = await hashFederationData('duid', 2000);
      expect(hash1).not.toBe(hash2);
    });
  });
});

