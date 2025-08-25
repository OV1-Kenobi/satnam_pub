/**
 * FROST API Client - Frontend Integration Layer
 * 
 * Connects to existing FROST backend infrastructure without duplicating
 * server-side functionality. Provides a clean interface for UI components
 * to interact with production FROST signature services.
 * 
 * MASTER CONTEXT COMPLIANCE:
 * - Uses existing API endpoints and data structures
 * - Maintains authentication and authorization flows
 * - Follows established error handling patterns
 * - Privacy-first approach with no sensitive data logging
 */

// Types for API responses (matching backend contracts)
export interface FrostSignatureRequest {
  transactionId: string;
  userDuid: string;
}

export interface FrostSignatureResponse {
  success: boolean;
  message?: string;
  error?: string;
  signatureId?: string;
  currentSignatures?: number;
  requiredSignatures?: number;
  thresholdMet?: boolean;
  transactionHash?: string;
}

export interface FrostTransactionStatus {
  transactionId: string;
  status: 'pending_signatures' | 'threshold_met' | 'completed' | 'failed' | 'expired';
  currentSignatures: number;
  requiredSignatures: number;
  participants: Array<{
    userDuid: string;
    hasSigned: boolean;
    signedAt?: string;
  }>;
  createdAt: string;
  expiresAt?: string;
  completedAt?: string;
  transactionHash?: string;
}

/**
 * FROST API Client Class
 * Handles all communication with backend FROST services
 */
class FrostApiClient {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor() {
    // Use environment variables for API configuration
    this.baseUrl = process.env.VITE_API_BASE_URL || '/api';
  }

  /**
   * Set authentication token for API requests
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Make authenticated API request
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add authentication if available
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || 
          errorData.error || 
          `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error(`FROST API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * Submit FROST signature for a transaction
   * Connects to existing backend signature submission endpoint
   */
  async submitSignature(request: FrostSignatureRequest): Promise<FrostSignatureResponse> {
    return this.makeRequest<FrostSignatureResponse>('/family/frost/sign', {
      method: 'POST',
      body: JSON.stringify({
        transaction_id: request.transactionId,
        user_duid: request.userDuid,
      }),
    });
  }

  /**
   * Get FROST transaction status
   * Retrieves current signature status from backend
   */
  async getTransactionStatus(transactionId: string): Promise<FrostTransactionStatus> {
    return this.makeRequest<FrostTransactionStatus>(
      `/family/frost/transaction/${transactionId}/status`
    );
  }

  /**
   * Get pending FROST transactions for a family
   * Connects to existing backend transaction listing endpoint
   */
  async getPendingTransactions(familyId: string): Promise<FrostTransactionStatus[]> {
    return this.makeRequest<FrostTransactionStatus[]>(
      `/family/frost/transactions/pending?family_id=${familyId}`
    );
  }

  /**
   * Check if user can sign a specific transaction
   * Validates user permissions through backend
   */
  async canUserSign(transactionId: string, userDuid: string): Promise<{
    canSign: boolean;
    reason?: string;
    alreadySigned?: boolean;
  }> {
    return this.makeRequest(`/family/frost/transaction/${transactionId}/can-sign`, {
      method: 'POST',
      body: JSON.stringify({ user_duid: userDuid }),
    });
  }

  /**
   * Get user's FROST signing history
   * Retrieves signature history from backend
   */
  async getUserSigningHistory(userDuid: string, limit = 50): Promise<Array<{
    transactionId: string;
    signedAt: string;
    transactionType: string;
    amount: number;
    status: string;
  }>> {
    return this.makeRequest(
      `/family/frost/user/${userDuid}/signing-history?limit=${limit}`
    );
  }

  /**
   * Cancel a pending FROST transaction (if user has permission)
   * Connects to existing backend cancellation endpoint
   */
  async cancelTransaction(transactionId: string, userDuid: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    return this.makeRequest('/family/frost/transaction/cancel', {
      method: 'POST',
      body: JSON.stringify({
        transaction_id: transactionId,
        user_duid: userDuid,
      }),
    });
  }
}

// Singleton instance for use across the application
const frostApiClient = new FrostApiClient();

// Export convenience functions that match the existing interface
export const frostApi = {
  /**
   * Submit FROST signature - replaces mock implementation
   */
  submitSignature: async (transactionId: string, userDuid: string): Promise<FrostSignatureResponse> => {
    return frostApiClient.submitSignature({ transactionId, userDuid });
  },

  /**
   * Get transaction status - replaces mock implementation
   */
  getTransactionStatus: async (transactionId: string): Promise<FrostTransactionStatus> => {
    return frostApiClient.getTransactionStatus(transactionId);
  },

  /**
   * Get pending transactions - replaces mock implementation
   */
  getPendingTransactions: async (familyId: string): Promise<FrostTransactionStatus[]> => {
    return frostApiClient.getPendingTransactions(familyId);
  },

  /**
   * Check signing permissions - new functionality
   */
  canUserSign: async (transactionId: string, userDuid: string) => {
    return frostApiClient.canUserSign(transactionId, userDuid);
  },

  /**
   * Get signing history - new functionality
   */
  getUserSigningHistory: async (userDuid: string, limit?: number) => {
    return frostApiClient.getUserSigningHistory(userDuid, limit);
  },

  /**
   * Cancel transaction - new functionality
   */
  cancelTransaction: async (transactionId: string, userDuid: string) => {
    return frostApiClient.cancelTransaction(transactionId, userDuid);
  },

  /**
   * Set authentication token
   */
  setAuthToken: (token: string) => {
    frostApiClient.setAuthToken(token);
  },
};

// Export the client instance for advanced usage
export default frostApiClient;

// Helper function to handle API errors consistently
export const handleFrostApiError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return 'An unexpected error occurred while processing your request';
};

// Type guards for API responses
export const isFrostSignatureResponse = (obj: any): obj is FrostSignatureResponse => {
  return obj && typeof obj === 'object' && typeof obj.success === 'boolean';
};

export const isFrostTransactionStatus = (obj: any): obj is FrostTransactionStatus => {
  return obj && 
         typeof obj === 'object' && 
         typeof obj.transactionId === 'string' &&
         typeof obj.status === 'string' &&
         typeof obj.currentSignatures === 'number' &&
         typeof obj.requiredSignatures === 'number';
};
