/**
 * Test Suite for FROST Signature Service
 * 
 * Tests the production-ready FROST (Flexible Round-Optimized Schnorr Threshold) 
 * signature implementation for family federation multi-signature operations.
 */

import {
  generateFrostSignatureShare,
  submitFrostSignatureShare,
  checkAndExecuteFrostTransaction
} from '../src/services/frostSignatureService';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn()
        })),
        single: jest.fn()
      })),
      single: jest.fn()
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn()
      }))
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn()
      }))
    }))
  }))
};

// Mock createClient
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase)
}));

// Mock crypto for deterministic testing
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: jest.fn((arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = i % 256;
      }
      return arr;
    }),
    subtle: {
      digest: jest.fn((algorithm, data) => {
        // Return deterministic hash for testing
        const hash = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          hash[i] = (i * 7) % 256;
        }
        return Promise.resolve(hash.buffer);
      })
    }
  }
});

describe('FROST Signature Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateFrostSignatureShare', () => {
    it('should generate signature share for valid transaction and user', async () => {
      // Mock successful transaction lookup
      const mockTransaction = {
        id: 'test-tx-id',
        transaction_data: { amount: 10000, recipient: 'test@example.com' },
        signing_context: 'test-context',
        status: 'pending_signatures',
        frost_transaction_participants: [{
          participant_duid: 'test-user-duid',
          role: 'steward',
          signature_required: true,
          has_signed: false
        }]
      };

      mockSupabase.from().select().eq().eq().eq().single.mockResolvedValue({
        data: mockTransaction,
        error: null
      });

      // Mock key share retrieval
      mockSupabase.from().select().eq().eq().single.mockResolvedValue({
        data: { encrypted_key_share: 'encrypted-key-share' },
        error: null
      });

      const result = await generateFrostSignatureShare('test-tx-id', 'test-user-duid');

      expect(result.success).toBe(true);
      expect(result.signatureShare).toBeDefined();
      expect(result.signatureShare?.participantId).toBe('test-user-duid');
      expect(result.signatureShare?.signatureShare).toBeDefined();
      expect(result.signatureShare?.nonce).toBeDefined();
    });

    it('should fail when transaction not found', async () => {
      mockSupabase.from().select().eq().eq().eq().single.mockResolvedValue({
        data: null,
        error: { message: 'Transaction not found' }
      });

      const result = await generateFrostSignatureShare('invalid-tx-id', 'test-user-duid');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transaction not found or user not authorized to sign');
    });

    it('should fail when user has already signed', async () => {
      const mockTransaction = {
        id: 'test-tx-id',
        frost_transaction_participants: [{
          participant_duid: 'test-user-duid',
          has_signed: true
        }]
      };

      mockSupabase.from().select().eq().eq().eq().single.mockResolvedValue({
        data: mockTransaction,
        error: null
      });

      const result = await generateFrostSignatureShare('test-tx-id', 'test-user-duid');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User has already signed this transaction');
    });

    it('should fail when signature not required from user', async () => {
      const mockTransaction = {
        id: 'test-tx-id',
        frost_transaction_participants: [{
          participant_duid: 'test-user-duid',
          signature_required: false,
          has_signed: false
        }]
      };

      mockSupabase.from().select().eq().eq().eq().single.mockResolvedValue({
        data: mockTransaction,
        error: null
      });

      const result = await generateFrostSignatureShare('test-tx-id', 'test-user-duid');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User signature not required for this transaction');
    });

    it('should fail when key share not found', async () => {
      const mockTransaction = {
        id: 'test-tx-id',
        frost_transaction_participants: [{
          participant_duid: 'test-user-duid',
          signature_required: true,
          has_signed: false
        }]
      };

      mockSupabase.from().select().eq().eq().eq().single.mockResolvedValue({
        data: mockTransaction,
        error: null
      });

      // Mock key share not found
      mockSupabase.from().select().eq().eq().single.mockResolvedValue({
        data: null,
        error: { message: 'Key share not found' }
      });

      const result = await generateFrostSignatureShare('test-tx-id', 'test-user-duid');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to retrieve key share');
    });
  });

  describe('submitFrostSignatureShare', () => {
    const mockSignatureShare = {
      participantId: 'test-user-duid',
      signatureShare: 'test-signature-share',
      nonce: 'test-nonce',
      timestamp: '2024-12-24T10:00:00Z'
    };

    it('should successfully submit signature share', async () => {
      // Mock successful insertion
      mockSupabase.from().insert().select().single.mockResolvedValue({
        data: { id: 'submission-id' },
        error: null
      });

      // Mock successful participant update
      mockSupabase.from().update().eq().eq.mockResolvedValue({
        error: null
      });

      // Mock signature count query
      mockSupabase.from().select().eq.mockResolvedValue({
        data: [
          { has_signed: true, signature_required: true },
          { has_signed: false, signature_required: true },
          { has_signed: true, signature_required: true }
        ],
        error: null
      });

      const result = await submitFrostSignatureShare('test-tx-id', 'test-user-duid', mockSignatureShare);

      expect(result.success).toBe(true);
      expect(result.submissionId).toBe('submission-id');
      expect(result.currentSignatureCount).toBe(2);
      expect(result.requiredSignatureCount).toBe(3);
    });

    it('should fail when signature share insertion fails', async () => {
      mockSupabase.from().insert().select().single.mockResolvedValue({
        data: null,
        error: { message: 'Insertion failed' }
      });

      const result = await submitFrostSignatureShare('test-tx-id', 'test-user-duid', mockSignatureShare);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to store signature share');
    });

    it('should fail when participant update fails', async () => {
      mockSupabase.from().insert().select().single.mockResolvedValue({
        data: { id: 'submission-id' },
        error: null
      });

      mockSupabase.from().update().eq().eq.mockResolvedValue({
        error: { message: 'Update failed' }
      });

      const result = await submitFrostSignatureShare('test-tx-id', 'test-user-duid', mockSignatureShare);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to update participant status');
    });
  });

  describe('checkAndExecuteFrostTransaction', () => {
    it('should execute transaction when threshold is met', async () => {
      const mockTransaction = {
        id: 'test-tx-id',
        transaction_type: 'lightning_payment',
        amount: 10000,
        required_signatures: 2,
        frost_transaction_participants: [
          { participant_duid: 'user1', signature_required: true, has_signed: true },
          { participant_duid: 'user2', signature_required: true, has_signed: true }
        ],
        frost_signature_shares: [
          { signature_share: 'share1', nonce: 'nonce1', participant_duid: 'user1' },
          { signature_share: 'share2', nonce: 'nonce2', participant_duid: 'user2' }
        ]
      };

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: mockTransaction,
        error: null
      });

      // Mock transaction status update
      mockSupabase.from().update().eq.mockResolvedValue({
        error: null
      });

      const result = await checkAndExecuteFrostTransaction('test-tx-id');

      expect(result.success).toBe(true);
      expect(result.thresholdMet).toBe(true);
      expect(result.executed).toBe(true);
      expect(result.transactionHash).toBeDefined();
      expect(result.transactionHash).toContain('ln_');
    });

    it('should not execute when threshold is not met', async () => {
      const mockTransaction = {
        id: 'test-tx-id',
        required_signatures: 3,
        frost_transaction_participants: [
          { participant_duid: 'user1', signature_required: true, has_signed: true },
          { participant_duid: 'user2', signature_required: true, has_signed: false },
          { participant_duid: 'user3', signature_required: true, has_signed: false }
        ]
      };

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: mockTransaction,
        error: null
      });

      const result = await checkAndExecuteFrostTransaction('test-tx-id');

      expect(result.success).toBe(true);
      expect(result.thresholdMet).toBe(false);
      expect(result.executed).toBe(false);
    });

    it('should handle different transaction types', async () => {
      const testCases = [
        { type: 'lightning_payment', expectedPrefix: 'ln_' },
        { type: 'fedimint_spend', expectedPrefix: 'fm_' },
        { type: 'bitcoin_transaction', expectedPrefix: 'btc_' }
      ];

      for (const testCase of testCases) {
        const mockTransaction = {
          id: 'test-tx-id',
          transaction_type: testCase.type,
          required_signatures: 1,
          frost_transaction_participants: [
            { participant_duid: 'user1', signature_required: true, has_signed: true }
          ],
          frost_signature_shares: [
            { signature_share: 'share1', nonce: 'nonce1', participant_duid: 'user1' }
          ]
        };

        mockSupabase.from().select().eq().single.mockResolvedValue({
          data: mockTransaction,
          error: null
        });

        mockSupabase.from().update().eq.mockResolvedValue({
          error: null
        });

        const result = await checkAndExecuteFrostTransaction('test-tx-id');

        expect(result.success).toBe(true);
        expect(result.executed).toBe(true);
        expect(result.transactionHash).toContain(testCase.expectedPrefix);
      }
    });

    it('should fail when transaction not found', async () => {
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: null,
        error: { message: 'Transaction not found' }
      });

      const result = await checkAndExecuteFrostTransaction('invalid-tx-id');

      expect(result.success).toBe(false);
      expect(result.thresholdMet).toBe(false);
      expect(result.executed).toBe(false);
      expect(result.error).toBe('Transaction not found');
    });

    it('should handle unsupported transaction types', async () => {
      const mockTransaction = {
        id: 'test-tx-id',
        transaction_type: 'unsupported_type',
        required_signatures: 1,
        frost_transaction_participants: [
          { participant_duid: 'user1', signature_required: true, has_signed: true }
        ],
        frost_signature_shares: [
          { signature_share: 'share1', nonce: 'nonce1', participant_duid: 'user1' }
        ]
      };

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: mockTransaction,
        error: null
      });

      const result = await checkAndExecuteFrostTransaction('test-tx-id');

      expect(result.success).toBe(false);
      expect(result.thresholdMet).toBe(true);
      expect(result.executed).toBe(false);
      expect(result.error).toContain('Unsupported transaction type');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle database connection errors gracefully', async () => {
      mockSupabase.from().select().eq().eq().eq().single.mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await generateFrostSignatureShare('test-tx-id', 'test-user-duid');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
    });

    it('should handle cryptographic errors in signature generation', async () => {
      // Mock crypto.subtle.digest to throw an error
      global.crypto.subtle.digest = jest.fn().mockRejectedValue(new Error('Crypto operation failed'));

      const mockTransaction = {
        id: 'test-tx-id',
        transaction_data: { amount: 10000 },
        signing_context: 'test-context',
        frost_transaction_participants: [{
          participant_duid: 'test-user-duid',
          signature_required: true,
          has_signed: false
        }]
      };

      mockSupabase.from().select().eq().eq().eq().single.mockResolvedValue({
        data: mockTransaction,
        error: null
      });

      mockSupabase.from().select().eq().eq().single.mockResolvedValue({
        data: { encrypted_key_share: 'encrypted-key-share' },
        error: null
      });

      const result = await generateFrostSignatureShare('test-tx-id', 'test-user-duid');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Crypto operation failed');
    });

    it('should validate signature share data integrity', async () => {
      const invalidSignatureShare = {
        participantId: '',
        signatureShare: '',
        nonce: '',
        timestamp: 'invalid-timestamp'
      };

      const result = await submitFrostSignatureShare('test-tx-id', 'test-user-duid', invalidSignatureShare);

      // The function should handle invalid data gracefully
      expect(result.success).toBe(false);
    });
  });
});
