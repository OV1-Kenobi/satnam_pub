/**
 * FROST API Client Integration Tests
 * 
 * Tests the frontend integration layer that connects to existing
 * FROST backend infrastructure without duplicating server functionality.
 */

import { frostApi, handleFrostApiError, isFrostSignatureResponse, isFrostTransactionStatus } from '../src/services/frostApiClient';

// Mock fetch for testing
global.fetch = jest.fn();

describe('FROST API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
  });

  describe('Authentication', () => {
    it('should set and use authentication token', async () => {
      const mockResponse = {
        success: true,
        message: 'Signature submitted successfully',
        signatureId: 'sig-123',
        currentSignatures: 2,
        requiredSignatures: 3
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      // Set auth token
      frostApi.setAuthToken('test-jwt-token');

      // Make API call
      await frostApi.submitSignature('tx-123', 'user-456');

      // Verify auth header was included
      expect(fetch).toHaveBeenCalledWith(
        '/api/family/frost/sign',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-jwt-token'
          })
        })
      );
    });
  });

  describe('submitSignature', () => {
    it('should submit FROST signature successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Signature submitted successfully',
        signatureId: 'sig-123',
        currentSignatures: 2,
        requiredSignatures: 3,
        thresholdMet: false
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await frostApi.submitSignature('tx-123', 'user-456');

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        '/api/family/frost/sign',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            transaction_id: 'tx-123',
            user_duid: 'user-456'
          })
        })
      );
    });

    it('should handle signature submission errors', async () => {
      const mockError = {
        message: 'User has already signed this transaction',
        error: 'ALREADY_SIGNED'
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve(mockError)
      });

      await expect(frostApi.submitSignature('tx-123', 'user-456'))
        .rejects.toThrow('User has already signed this transaction');
    });

    it('should handle network errors', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(frostApi.submitSignature('tx-123', 'user-456'))
        .rejects.toThrow('Network error');
    });
  });

  describe('getTransactionStatus', () => {
    it('should retrieve transaction status', async () => {
      const mockStatus = {
        transactionId: 'tx-123',
        status: 'pending_signatures',
        currentSignatures: 2,
        requiredSignatures: 3,
        participants: [
          { userDuid: 'user-1', hasSigned: true, signedAt: '2024-12-24T10:00:00Z' },
          { userDuid: 'user-2', hasSigned: true, signedAt: '2024-12-24T10:05:00Z' },
          { userDuid: 'user-3', hasSigned: false }
        ],
        createdAt: '2024-12-24T09:00:00Z',
        expiresAt: '2024-12-25T09:00:00Z'
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStatus)
      });

      const result = await frostApi.getTransactionStatus('tx-123');

      expect(result).toEqual(mockStatus);
      expect(fetch).toHaveBeenCalledWith(
        '/api/family/frost/transaction/tx-123/status',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });
  });

  describe('getPendingTransactions', () => {
    it('should retrieve pending transactions for family', async () => {
      const mockTransactions = [
        {
          transactionId: 'tx-123',
          status: 'pending_signatures',
          currentSignatures: 1,
          requiredSignatures: 2,
          participants: [
            { userDuid: 'user-1', hasSigned: true, signedAt: '2024-12-24T10:00:00Z' },
            { userDuid: 'user-2', hasSigned: false }
          ],
          createdAt: '2024-12-24T09:00:00Z'
        }
      ];

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTransactions)
      });

      const result = await frostApi.getPendingTransactions('family-456');

      expect(result).toEqual(mockTransactions);
      expect(fetch).toHaveBeenCalledWith(
        '/api/family/frost/transactions/pending?family_id=family-456',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });
  });

  describe('canUserSign', () => {
    it('should check if user can sign transaction', async () => {
      const mockResponse = {
        canSign: true,
        alreadySigned: false
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await frostApi.canUserSign('tx-123', 'user-456');

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        '/api/family/frost/transaction/tx-123/can-sign',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ user_duid: 'user-456' })
        })
      );
    });

    it('should handle permission denied', async () => {
      const mockResponse = {
        canSign: false,
        reason: 'User not authorized for this transaction',
        alreadySigned: false
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await frostApi.canUserSign('tx-123', 'user-456');

      expect(result.canSign).toBe(false);
      expect(result.reason).toBe('User not authorized for this transaction');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors with proper error messages', () => {
      const error1 = new Error('Network timeout');
      const error2 = 'String error message';
      const error3 = { message: 'Object error' };
      const error4 = null;

      expect(handleFrostApiError(error1)).toBe('Network timeout');
      expect(handleFrostApiError(error2)).toBe('String error message');
      expect(handleFrostApiError(error3)).toBe('An unexpected error occurred while processing your request');
      expect(handleFrostApiError(error4)).toBe('An unexpected error occurred while processing your request');
    });

    it('should handle HTTP error responses', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve({})
      });

      await expect(frostApi.submitSignature('tx-123', 'user-456'))
        .rejects.toThrow('HTTP 403: Forbidden');
    });

    it('should handle malformed JSON responses', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Invalid JSON'))
      });

      await expect(frostApi.submitSignature('tx-123', 'user-456'))
        .rejects.toThrow('HTTP 500: Internal Server Error');
    });
  });

  describe('Type Guards', () => {
    it('should validate FrostSignatureResponse objects', () => {
      const validResponse = {
        success: true,
        message: 'Signature submitted',
        signatureId: 'sig-123'
      };

      const invalidResponse1 = {
        message: 'Missing success field'
      };

      const invalidResponse2 = {
        success: 'not a boolean'
      };

      expect(isFrostSignatureResponse(validResponse)).toBe(true);
      expect(isFrostSignatureResponse(invalidResponse1)).toBe(false);
      expect(isFrostSignatureResponse(invalidResponse2)).toBe(false);
      expect(isFrostSignatureResponse(null)).toBe(false);
      expect(isFrostSignatureResponse(undefined)).toBe(false);
    });

    it('should validate FrostTransactionStatus objects', () => {
      const validStatus = {
        transactionId: 'tx-123',
        status: 'pending_signatures',
        currentSignatures: 2,
        requiredSignatures: 3,
        participants: [],
        createdAt: '2024-12-24T09:00:00Z'
      };

      const invalidStatus1 = {
        status: 'pending_signatures',
        currentSignatures: 2,
        requiredSignatures: 3
        // Missing transactionId
      };

      const invalidStatus2 = {
        transactionId: 'tx-123',
        status: 'pending_signatures',
        currentSignatures: 'not a number',
        requiredSignatures: 3
      };

      expect(isFrostTransactionStatus(validStatus)).toBe(true);
      expect(isFrostTransactionStatus(invalidStatus1)).toBe(false);
      expect(isFrostTransactionStatus(invalidStatus2)).toBe(false);
      expect(isFrostTransactionStatus(null)).toBe(false);
    });
  });

  describe('Integration with Family Financials Dashboard', () => {
    it('should format backend responses for frontend consumption', async () => {
      const backendResponse = [
        {
          transactionId: 'tx-123',
          status: 'pending_signatures',
          currentSignatures: 2,
          requiredSignatures: 3,
          participants: [
            { userDuid: 'user-1', hasSigned: true, signedAt: '2024-12-24T10:00:00Z' },
            { userDuid: 'user-2', hasSigned: true, signedAt: '2024-12-24T10:05:00Z' },
            { userDuid: 'user-3', hasSigned: false }
          ],
          createdAt: '2024-12-24T09:00:00Z',
          expiresAt: '2024-12-25T09:00:00Z'
        }
      ];

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(backendResponse)
      });

      const result = await frostApi.getPendingTransactions('family-456');

      // Verify the response can be transformed for frontend use
      const frontendFormat = result.map(tx => ({
        id: tx.transactionId,
        type: 'frost_signature' as const,
        amount: 0,
        description: 'FROST Multi-Signature Transaction',
        status: tx.status,
        current_signatures: tx.currentSignatures,
        required_signatures: tx.requiredSignatures,
        created_at: tx.createdAt,
        deadline: tx.expiresAt || '',
        participants: tx.participants.map(p => p.userDuid),
        signatures: tx.participants.filter(p => p.hasSigned).map(p => ({
          participant: p.userDuid,
          signed_at: p.signedAt || ''
        }))
      }));

      expect(frontendFormat[0]).toMatchObject({
        id: 'tx-123',
        type: 'frost_signature',
        current_signatures: 2,
        required_signatures: 3,
        participants: ['user-1', 'user-2', 'user-3'],
        signatures: [
          { participant: 'user-1', signed_at: '2024-12-24T10:00:00Z' },
          { participant: 'user-2', signed_at: '2024-12-24T10:05:00Z' }
        ]
      });
    });
  });
});
