/**
 * Contact Discovery Tests
 * Tests NIP-17 gift-wrapped contact discovery and synchronization
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContactDiscoveryManager,
  ContactDiscoveryRequest,
  ContactDiscoveryResponse,
} from '../../lib/privacy/contact-discovery';

describe('ContactDiscoveryManager', () => {
  const requesterNpub = 'npub1requester1234567890abcdef1234567890abcdef1234567890abcdef';
  const targetNpub = 'npub1target1234567890abcdef1234567890abcdef1234567890abcdef';
  const responderNpub = 'npub1responder1234567890abcdef1234567890abcdef1234567890abcdef';

  let testRequest: ContactDiscoveryRequest;
  let testResponse: ContactDiscoveryResponse;

  beforeEach(async () => {
    testRequest = await ContactDiscoveryManager.createContactDiscoveryRequest(
      requesterNpub,
      targetNpub,
      24
    );

    testResponse = {
      responderId: 'responder123',
      responderNpub,
      requesterId: testRequest.requesterId,
      contacts: [
        {
          npub: 'npub1contact1',
          displayName: 'Contact 1',
          trustLevel: 'family',
          familyRole: 'adult',
        },
        {
          npub: 'npub1contact2',
          displayName: 'Contact 2',
          trustLevel: 'trusted',
        },
      ],
      respondedAt: Math.floor(Date.now() / 1000),
    };
  });

  describe('createContactDiscoveryRequest', () => {
    it('should create a valid contact discovery request', async () => {
      const request = await ContactDiscoveryManager.createContactDiscoveryRequest(
        requesterNpub,
        targetNpub,
        24
      );

      expect(request).toHaveProperty('requesterId');
      expect(request).toHaveProperty('requesterNpub', requesterNpub);
      expect(request).toHaveProperty('targetNpub', targetNpub);
      expect(request).toHaveProperty('requestedAt');
      expect(request).toHaveProperty('expiresAt');
    });

    it('should set correct expiration time', async () => {
      const request = await ContactDiscoveryManager.createContactDiscoveryRequest(
        requesterNpub,
        targetNpub,
        24
      );

      const expectedExpiry = request.requestedAt + 24 * 3600;
      expect(request.expiresAt).toBe(expectedExpiry);
    });

    it('should generate unique request IDs', async () => {
      const request1 = await ContactDiscoveryManager.createContactDiscoveryRequest(
        requesterNpub,
        targetNpub,
        24
      );
      const request2 = await ContactDiscoveryManager.createContactDiscoveryRequest(
        requesterNpub,
        targetNpub,
        24
      );

      expect(request1.requesterId).not.toBe(request2.requesterId);
    });
  });

  describe('prepareContactDiscoveryResponse', () => {
    it('should prepare a valid response', async () => {
      const userContacts = [
        {
          encrypted_npub: 'npub1aaa',
          display_name_hash: 'Contact A',
          trust_level: 'family',
          family_role: 'adult',
        },
        {
          encrypted_npub: 'npub1bbb',
          display_name_hash: 'Contact B',
          trust_level: 'trusted',
        },
      ];

      const response = await ContactDiscoveryManager.prepareContactDiscoveryResponse(
        responderNpub,
        testRequest.requesterId,
        requesterNpub,
        userContacts,
        'private'
      );

      expect(response).toHaveProperty('responderId');
      expect(response).toHaveProperty('responderNpub', responderNpub);
      expect(response).toHaveProperty('requesterId', testRequest.requesterId);
      expect(response).toHaveProperty('contacts');
      expect(response).toHaveProperty('respondedAt');
    });

    it('should filter contacts based on privacy level', async () => {
      const userContacts = [
        {
          encrypted_npub: 'npub1aaa',
          display_name_hash: 'Contact A',
          trust_level: 'family',
        },
        {
          encrypted_npub: 'npub1bbb',
          display_name_hash: 'Contact B',
          trust_level: 'trusted',
        },
        {
          encrypted_npub: 'npub1ccc',
          display_name_hash: 'Contact C',
          trust_level: 'known',
        },
      ];

      const privateResponse = await ContactDiscoveryManager.prepareContactDiscoveryResponse(
        responderNpub,
        testRequest.requesterId,
        requesterNpub,
        userContacts,
        'private'
      );

      // Private level should only include family contacts
      expect(privateResponse.contacts.every((c) => c.trustLevel === 'family')).toBe(true);
    });

    it('should include all contact fields in response', async () => {
      const userContacts = [
        {
          encrypted_npub: 'npub1aaa',
          display_name_hash: 'Contact A',
          trust_level: 'family',
          family_role: 'adult',
        },
      ];

      const response = await ContactDiscoveryManager.prepareContactDiscoveryResponse(
        responderNpub,
        testRequest.requesterId,
        requesterNpub,
        userContacts,
        'private'
      );

      const contact = response.contacts[0];
      expect(contact).toHaveProperty('npub');
      expect(contact).toHaveProperty('displayName');
      expect(contact).toHaveProperty('trustLevel');
    });
  });

  describe('validateContactDiscoveryRequest', () => {
    it('should validate a valid request', async () => {
      const result = ContactDiscoveryManager.validateContactDiscoveryRequest(testRequest);
      expect(result.valid).toBe(true);
    });

    it('should reject expired requests', async () => {
      const expiredRequest = {
        ...testRequest,
        expiresAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };

      const result = ContactDiscoveryManager.validateContactDiscoveryRequest(expiredRequest);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject requests with missing npubs', async () => {
      const invalidRequest = {
        ...testRequest,
        requesterNpub: '',
      };

      const result = ContactDiscoveryManager.validateContactDiscoveryRequest(invalidRequest);
      expect(result.valid).toBe(false);
    });

    it('should reject requests with future timestamps', async () => {
      const futureRequest = {
        ...testRequest,
        requestedAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour in future
      };

      const result = ContactDiscoveryManager.validateContactDiscoveryRequest(futureRequest);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateContactDiscoveryResponse', () => {
    it('should validate a valid response', async () => {
      const result = ContactDiscoveryManager.validateContactDiscoveryResponse(
        testResponse,
        testRequest
      );
      expect(result.valid).toBe(true);
    });

    it('should reject response with mismatched request ID', async () => {
      const invalidResponse = {
        ...testResponse,
        requesterId: 'wrong-id',
      };

      const result = ContactDiscoveryManager.validateContactDiscoveryResponse(
        invalidResponse,
        testRequest
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('request ID');
    });

    it('should reject response where responder is requester', async () => {
      const invalidResponse = {
        ...testResponse,
        responderNpub: requesterNpub,
      };

      const result = ContactDiscoveryManager.validateContactDiscoveryResponse(
        invalidResponse,
        testRequest
      );
      expect(result.valid).toBe(false);
    });

    it('should reject response with invalid contacts', async () => {
      const invalidResponse = {
        ...testResponse,
        contacts: [
          {
            npub: 'npub1aaa',
            displayName: '',
            trustLevel: 'family' as const,
          },
        ],
      };

      const result = ContactDiscoveryManager.validateContactDiscoveryResponse(
        invalidResponse,
        testRequest
      );
      expect(result.valid).toBe(false);
    });
  });

  describe('mergeContactDiscoveryResponses', () => {
    it('should merge multiple responses', async () => {
      const response1: ContactDiscoveryResponse = {
        ...testResponse,
        contacts: [
          {
            npub: 'npub1aaa',
            displayName: 'Contact A',
            trustLevel: 'family',
          },
        ],
      };

      const response2: ContactDiscoveryResponse = {
        ...testResponse,
        responderId: 'responder456',
        contacts: [
          {
            npub: 'npub1aaa',
            displayName: 'Contact A',
            trustLevel: 'family',
          },
          {
            npub: 'npub1bbb',
            displayName: 'Contact B',
            trustLevel: 'trusted',
          },
        ],
      };

      const merged = ContactDiscoveryManager.mergeContactDiscoveryResponses([response1, response2]);

      expect(merged).toHaveLength(2);
      const contactA = merged.find((c) => c.npub === 'npub1aaa');
      expect(contactA?.sources).toBe(2);
    });

    it('should deduplicate contacts', async () => {
      const response1: ContactDiscoveryResponse = {
        ...testResponse,
        contacts: [
          {
            npub: 'npub1aaa',
            displayName: 'Contact A',
            trustLevel: 'family',
          },
        ],
      };

      const response2: ContactDiscoveryResponse = {
        ...testResponse,
        responderId: 'responder456',
        contacts: [
          {
            npub: 'npub1aaa',
            displayName: 'Contact A',
            trustLevel: 'family',
          },
        ],
      };

      const merged = ContactDiscoveryManager.mergeContactDiscoveryResponses([response1, response2]);

      expect(merged).toHaveLength(1);
    });

    it('should upgrade trust level when multiple sources agree', async () => {
      const response1: ContactDiscoveryResponse = {
        ...testResponse,
        contacts: [
          {
            npub: 'npub1aaa',
            displayName: 'Contact A',
            trustLevel: 'known',
          },
        ],
      };

      const response2: ContactDiscoveryResponse = {
        ...testResponse,
        responderId: 'responder456',
        contacts: [
          {
            npub: 'npub1aaa',
            displayName: 'Contact A',
            trustLevel: 'family',
          },
        ],
      };

      const merged = ContactDiscoveryManager.mergeContactDiscoveryResponses([response1, response2]);

      expect(merged[0].trustLevel).toBe('family');
    });
  });

  describe('shouldEnableContactDiscovery', () => {
    it('should enable by default', () => {
      const result = ContactDiscoveryManager.shouldEnableContactDiscovery({});
      expect(result).toBe(true);
    });

    it('should respect explicit disable', () => {
      const result = ContactDiscoveryManager.shouldEnableContactDiscovery({
        contactDiscoveryEnabled: false,
      });
      expect(result).toBe(false);
    });

    it('should respect explicit enable', () => {
      const result = ContactDiscoveryManager.shouldEnableContactDiscovery({
        contactDiscoveryEnabled: true,
      });
      expect(result).toBe(true);
    });
  });
});

