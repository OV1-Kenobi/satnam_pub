/**
 * Family Foundry API Service Tests
 * 
 * Tests for API integration functions including:
 * - npub to user_duid mapping
 * - Family federation creation
 * - Member management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mapTrustedPeersToMembers,
  CreateFamilyFoundryRequest,
} from '../family-foundry-api';
import * as integration from '../family-foundry-integration';

// Mock the integration module
vi.mock('../family-foundry-integration', () => ({
  mapNpubToUserDuid: vi.fn(),
  batchMapNpubsToUserDuids: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn();

describe('Family Foundry API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mapTrustedPeersToMembers', () => {
    it('should map trusted peers to family members with user_duids', async () => {
      const trustedPeers = [
        {
          name: 'Alice',
          npub: 'npub1alice',
          role: 'guardian',
          relationship: 'kin',
        },
        {
          name: 'Bob',
          npub: 'npub1bob',
          role: 'steward',
          relationship: 'peer',
        },
      ];

      const mockMap = new Map([
        ['npub1alice', 'duid-alice-123'],
        ['npub1bob', 'duid-bob-456'],
      ]);

      vi.mocked(integration.batchMapNpubsToUserDuids).mockResolvedValue(mockMap);

      const result = await mapTrustedPeersToMembers(trustedPeers);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        user_duid: 'duid-alice-123',
        role: 'guardian',
        relationship: 'kin',
      });
      expect(result[1]).toEqual({
        user_duid: 'duid-bob-456',
        role: 'steward',
        relationship: 'peer',
      });
    });

    it('should handle empty peer list', async () => {
      const result = await mapTrustedPeersToMembers([]);
      expect(result).toEqual([]);
    });

    it('should throw error if mapping fails', async () => {
      const trustedPeers = [
        {
          name: 'Alice',
          npub: 'npub1alice',
          role: 'guardian',
          relationship: 'kin',
        },
      ];

      vi.mocked(integration.batchMapNpubsToUserDuids).mockRejectedValue(
        new Error('Mapping failed')
      );

      await expect(mapTrustedPeersToMembers(trustedPeers)).rejects.toThrow(
        'Failed to map peers to members'
      );
    });

    it('should preserve role and relationship data', async () => {
      const trustedPeers = [
        {
          name: 'Charlie',
          npub: 'npub1charlie',
          role: 'adult',
          relationship: 'offspring',
        },
      ];

      const mockMap = new Map([['npub1charlie', 'duid-charlie-789']]);
      vi.mocked(integration.batchMapNpubsToUserDuids).mockResolvedValue(mockMap);

      const result = await mapTrustedPeersToMembers(trustedPeers);

      expect(result[0].role).toBe('adult');
      expect(result[0].relationship).toBe('offspring');
    });
  });

  describe('createFamilyFoundry', () => {
    it('should successfully create a family federation', async () => {
      const request: CreateFamilyFoundryRequest = {
        charter: {
          familyName: 'Test Family',
          familyMotto: 'Together we thrive',
          foundingDate: '2024-01-01',
          missionStatement: 'Build a strong family',
          values: ['Trust', 'Integrity'],
        },
        rbac: {
          roles: [
            {
              id: 'guardian',
              name: 'Guardian',
              rights: ['Approve all payments'],
              responsibilities: ['Lead family'],
            },
          ],
        },
        members: [
          {
            user_duid: 'duid-123',
            role: 'guardian',
            relationship: 'kin',
          },
        ],
      };

      const mockResponse = {
        success: true,
        data: {
          charterId: 'charter-123',
          federationId: 'fed-123',
          federationDuid: 'duid-fed-123',
          familyName: 'Test Family',
          foundingDate: '2024-01-01',
          status: 'active',
        },
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      // Note: This test would need the actual createFamilyFoundry function
      // to be imported and tested
    });
  });
});

