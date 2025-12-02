/**
 * Family Foundry Integration Tests
 * 
 * Unit tests for Phase 1 foundation functions:
 * - DUID generation
 * - Role validation
 * - FROST threshold calculation
 * - Federation data hashing
 */

import {
  generateFederationDuid,
  validateRoleHierarchy,
  canManageRole,
  calculateFrostThreshold,
  hashFederationData,
  ROLE_HIERARCHY,
} from '../family-foundry-integration';

describe('Family Foundry Integration - Phase 1', () => {
  
  describe('generateFederationDuid', () => {
    it('should generate a 32-character DUID', async () => {
      const duid = await generateFederationDuid('TestFamily', 'user123');
      expect(duid).toHaveLength(32);
      expect(/^[a-f0-9]{32}$/.test(duid)).toBe(true);
    });
    
    it('should generate unique DUIDs for same family (different timestamps)', async () => {
      const duid1 = await generateFederationDuid('TestFamily', 'user123');
      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
      const duid2 = await generateFederationDuid('TestFamily', 'user123');
      
      expect(duid1).not.toBe(duid2);
    });
    
    it('should generate different DUIDs for different families', async () => {
      const duid1 = await generateFederationDuid('Family1', 'user123');
      const duid2 = await generateFederationDuid('Family2', 'user123');
      
      expect(duid1).not.toBe(duid2);
    });
    
    it('should generate different DUIDs for different creators', async () => {
      const duid1 = await generateFederationDuid('TestFamily', 'user1');
      const duid2 = await generateFederationDuid('TestFamily', 'user2');
      
      expect(duid1).not.toBe(duid2);
    });
  });
  
  describe('validateRoleHierarchy', () => {
    it('should accept valid role hierarchy with guardian', () => {
      const result = validateRoleHierarchy(['guardian', 'steward', 'adult', 'offspring']);
      expect(result).toBe(true);
    });
    
    it('should reject hierarchy without guardian', () => {
      const result = validateRoleHierarchy(['steward', 'adult', 'offspring']);
      expect(result).toBe(false);
    });
    
    it('should reject invalid roles', () => {
      const result = validateRoleHierarchy(['guardian', 'invalid_role']);
      expect(result).toBe(false);
    });
    
    it('should accept single guardian', () => {
      const result = validateRoleHierarchy(['guardian']);
      expect(result).toBe(true);
    });
    
    it('should reject empty array', () => {
      const result = validateRoleHierarchy([]);
      expect(result).toBe(false);
    });
  });
  
  describe('canManageRole', () => {
    it('guardian should manage steward', () => {
      expect(canManageRole('guardian', 'steward')).toBe(true);
    });
    
    it('guardian should manage adult', () => {
      expect(canManageRole('guardian', 'adult')).toBe(true);
    });
    
    it('steward should not manage guardian', () => {
      expect(canManageRole('steward', 'guardian')).toBe(false);
    });
    
    it('adult should not manage steward', () => {
      expect(canManageRole('adult', 'steward')).toBe(false);
    });
    
    it('should handle invalid roles', () => {
      expect(canManageRole('invalid', 'guardian')).toBe(false);
    });
  });
  
  describe('calculateFrostThreshold', () => {
    it('should calculate 1-of-1 for single guardian', () => {
      const result = calculateFrostThreshold(1);
      expect(result.threshold).toBe(1);
      expect(result.total).toBe(1);
    });
    
    it('should calculate 2-of-2 for two guardians (balanced)', () => {
      const result = calculateFrostThreshold(2, 'balanced');
      expect(result.threshold).toBe(2);
      expect(result.total).toBe(2);
    });
    
    it('should calculate 2-of-3 for three guardians (balanced)', () => {
      const result = calculateFrostThreshold(3, 'balanced');
      expect(result.threshold).toBe(2);
      expect(result.total).toBe(3);
    });
    
    it('should calculate 3-of-4 for four guardians (balanced)', () => {
      const result = calculateFrostThreshold(4, 'balanced');
      expect(result.threshold).toBe(3);
      expect(result.total).toBe(4);
    });
    
    it('should use conservative policy', () => {
      const result = calculateFrostThreshold(5, 'conservative');
      expect(result.threshold).toBe(3);
      expect(result.total).toBe(5);
    });
    
    it('should use aggressive policy', () => {
      const result = calculateFrostThreshold(5, 'aggressive');
      expect(result.threshold).toBe(3);
      expect(result.total).toBe(5);
    });
    
    it('should fallback to 66% for unknown guardian count', () => {
      const result = calculateFrostThreshold(10);
      expect(result.threshold).toBe(7); // ceil(10 * 0.66) = 7
      expect(result.total).toBe(10);
    });
  });
  
  describe('hashFederationData', () => {
    it('should generate consistent hash for same DUID', async () => {
      const duid = 'test_federation_duid_12345';
      const hash1 = await hashFederationData(duid);
      const hash2 = await hashFederationData(duid);
      
      expect(hash1).toBe(hash2);
    });
    
    it('should generate different hash for different DUID', async () => {
      const hash1 = await hashFederationData('duid1');
      const hash2 = await hashFederationData('duid2');
      
      expect(hash1).not.toBe(hash2);
    });
    
    it('should return 64-character hex string', async () => {
      const hash = await hashFederationData('test_duid');
      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
    });
  });
  
  describe('ROLE_HIERARCHY', () => {
    it('should have correct hierarchy levels', () => {
      expect(ROLE_HIERARCHY['offspring']).toBe(1);
      expect(ROLE_HIERARCHY['adult']).toBe(2);
      expect(ROLE_HIERARCHY['steward']).toBe(3);
      expect(ROLE_HIERARCHY['guardian']).toBe(4);
    });
  });
});

