/**
 * Payments API Client
 * Type-safe API client for P2P Lightning payments and eCash bridge operations
 * 
 * @fileoverview Master Context compliant JavaScript API client with JSDoc types
 */

/**
 * CRITICAL SECURITY: Master Context environment variable access pattern
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key) {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = import.meta;
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

/**
 * @typedef {Object} P2PPaymentRequest
 * @property {string} toUser - User UUID or Lightning address
 * @property {number} amount - Amount in satoshis
 * @property {string} [memo] - Optional payment memo
 * @property {'P2P_INTERNAL_LIGHTNING'|'P2P_EXTERNAL_LIGHTNING'} paymentType - Payment type
 * @property {boolean} [enablePrivacy] - Optional privacy protection for external payments
 */

/**
 * @typedef {Object} P2PPaymentResponse
 * @property {boolean} success - Whether the payment was successful
 * @property {string} [paymentId] - Database payment record ID
 * @property {string} [paymentHash] - Lightning payment hash
 * @property {Object} [routing] - Node routing information
 * @property {string} routing.preferredNode - Selected Lightning node
 * @property {string} routing.reason - Reason for node selection
 * @property {Object} [privacy] - Privacy protection information
 * @property {boolean} privacy.enabled - Whether privacy was enabled
 * @property {string} [privacy.serviceUrl] - Privacy service URL
 * @property {Object} [security] - Security validation information
 * @property {boolean} security.validated - Whether security validation passed
 * @property {string} security.environment - Environment (development/production)
 * @property {string} [error] - Error message if payment failed
 */

/**
 * @typedef {Object} ECashBridgeRequest
 * @property {string} sourceToken - Source eCash token (Fedimint or Cashu)
 * @property {string} targetDestination - Target mint URL or federation
 * @property {'ECASH_FEDIMINT_TO_CASHU'|'ECASH_CASHU_TO_FEDIMINT'|'ECASH_FEDIMINT_TO_FEDIMINT'|'ECASH_CASHU_EXTERNAL_SWAP'} operationType - Operation type
 * @property {boolean} [isMultiNut] - For external Cashu swaps
 * @property {boolean} [enablePrivacy] - Optional privacy protection
 */

/**
 * @typedef {Object} ECashBridgeResponse
 * @property {boolean} success - Whether the operation was successful
 * @property {string} [operationId] - Database operation record ID
 * @property {string} [conversionId] - Conversion/swap ID
 * @property {string} [resultToken] - Hashed result token for privacy
 * @property {number} [conversionFee] - Conversion fee in satoshis
 * @property {Object} [routing] - Node routing information
 * @property {string} routing.preferredNode - Selected Lightning node
 * @property {string} routing.reason - Reason for node selection
 * @property {Object} [privacy] - Privacy protection information
 * @property {boolean} privacy.enabled - Whether privacy was enabled
 * @property {string} [privacy.serviceUrl] - Privacy service URL
 * @property {string} [expiresAt] - Operation expiration timestamp
 * @property {string} [error] - Error message if operation failed
 */

/**
 * @typedef {Object} ApiError
 * @property {string} message - Error message
 * @property {number} status - HTTP status code
 * @property {string} [code] - Error code
 * @property {Object} [details] - Additional error details
 */

/**
 * Payments API Client Class
 */
class PaymentsClient {
  constructor() {
    this.baseUrl = getEnvVar('VITE_API_BASE_URL') || '';
    this.authToken = null;
  }

  /**
   * Set authentication token
   * @param {string} token - JWT authentication token
   */
  setAuthToken(token) {
    this.authToken = token;
  }

  /**
   * Get authentication headers
   * @returns {Object} Headers object
   */
  getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Make API request with error handling
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} API response
   * @throws {ApiError} API error
   */
  async makeRequest(endpoint, options = {}) {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        headers: this.getAuthHeaders(),
        ...options,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new ApiError(
          data.error || 'API request failed',
          response.status,
          data.code,
          data
        );
      }

      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      // Network or parsing error
      throw new ApiError(
        error.message || 'Network error occurred',
        0,
        'NETWORK_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Send P2P Lightning payment
   * @param {P2PPaymentRequest} paymentRequest - Payment request
   * @returns {Promise<P2PPaymentResponse>} Payment response
   * @throws {ApiError} Payment error
   */
  async sendP2PPayment(paymentRequest) {
    // Client-side validation
    if (!paymentRequest.toUser || typeof paymentRequest.toUser !== 'string') {
      throw new ApiError('toUser is required and must be a string', 400, 'VALIDATION_ERROR');
    }

    if (!paymentRequest.amount || typeof paymentRequest.amount !== 'number' || paymentRequest.amount <= 0) {
      throw new ApiError('amount is required and must be a positive number', 400, 'VALIDATION_ERROR');
    }

    if (!['P2P_INTERNAL_LIGHTNING', 'P2P_EXTERNAL_LIGHTNING'].includes(paymentRequest.paymentType)) {
      throw new ApiError('Invalid payment type', 400, 'VALIDATION_ERROR');
    }

    return await this.makeRequest('/api/payments/p2p-lightning.js', {
      method: 'POST',
      body: JSON.stringify(paymentRequest),
    });
  }

  /**
   * Execute eCash bridge operation
   * @param {ECashBridgeRequest} bridgeRequest - Bridge request
   * @returns {Promise<ECashBridgeResponse>} Bridge response
   * @throws {ApiError} Bridge error
   */
  async executeECashBridge(bridgeRequest) {
    // Client-side validation
    if (!bridgeRequest.sourceToken || typeof bridgeRequest.sourceToken !== 'string') {
      throw new ApiError('sourceToken is required and must be a string', 400, 'VALIDATION_ERROR');
    }

    if (!bridgeRequest.targetDestination || typeof bridgeRequest.targetDestination !== 'string') {
      throw new ApiError('targetDestination is required and must be a string', 400, 'VALIDATION_ERROR');
    }

    const validOperationTypes = [
      'ECASH_FEDIMINT_TO_CASHU',
      'ECASH_CASHU_TO_FEDIMINT',
      'ECASH_FEDIMINT_TO_FEDIMINT',
      'ECASH_CASHU_EXTERNAL_SWAP'
    ];

    if (!validOperationTypes.includes(bridgeRequest.operationType)) {
      throw new ApiError('Invalid operation type', 400, 'VALIDATION_ERROR');
    }

    return await this.makeRequest('/api/payments/ecash-bridge.js', {
      method: 'POST',
      body: JSON.stringify(bridgeRequest),
    });
  }

  /**
   * Get payment history
   * @param {Object} options - Query options
   * @param {number} [options.page] - Page number
   * @param {number} [options.limit] - Items per page
   * @param {string} [options.type] - Payment type filter
   * @returns {Promise<Object>} Payment history
   */
  async getPaymentHistory(options = {}) {
    const params = new URLSearchParams();
    
    if (options.page) params.append('page', options.page.toString());
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.type) params.append('type', options.type);

    const queryString = params.toString();
    const endpoint = `/api/payments/history.js${queryString ? `?${queryString}` : ''}`;

    return await this.makeRequest(endpoint, {
      method: 'GET',
    });
  }

  /**
   * Get eCash bridge operation history
   * @param {Object} options - Query options
   * @param {number} [options.page] - Page number
   * @param {number} [options.limit] - Items per page
   * @param {string} [options.operationType] - Operation type filter
   * @returns {Promise<Object>} Operation history
   */
  async getECashBridgeHistory(options = {}) {
    const params = new URLSearchParams();
    
    if (options.page) params.append('page', options.page.toString());
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.operationType) params.append('operationType', options.operationType);

    const queryString = params.toString();
    const endpoint = `/api/payments/ecash-history.js${queryString ? `?${queryString}` : ''}`;

    return await this.makeRequest(endpoint, {
      method: 'GET',
    });
  }

  /**
   * Get user spending limits
   * @returns {Promise<Object>} Spending limits
   */
  async getSpendingLimits() {
    return await this.makeRequest('/api/payments/spending-limits.js', {
      method: 'GET',
    });
  }

  /**
   * Get Lightning node health status
   * @returns {Promise<Object>} Node health status
   */
  async getNodeHealthStatus() {
    return await this.makeRequest('/api/lightning/node-health.js', {
      method: 'GET',
    });
  }
}

/**
 * Custom API Error class
 */
class ApiError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} status - HTTP status code
   * @param {string} [code] - Error code
   * @param {Object} [details] - Additional error details
   */
  constructor(message, status, code, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /**
   * Check if error is a network error
   * @returns {boolean} True if network error
   */
  isNetworkError() {
    return this.code === 'NETWORK_ERROR';
  }

  /**
   * Check if error is a validation error
   * @returns {boolean} True if validation error
   */
  isValidationError() {
    return this.code === 'VALIDATION_ERROR' || this.status === 400;
  }

  /**
   * Check if error is an authentication error
   * @returns {boolean} True if authentication error
   */
  isAuthError() {
    return this.status === 401 || this.status === 403;
  }

  /**
   * Get user-friendly error message
   * @returns {string} User-friendly message
   */
  getUserFriendlyMessage() {
    if (this.isNetworkError()) {
      return 'Network connection error. Please check your internet connection and try again.';
    }

    if (this.isAuthError()) {
      return 'Authentication error. Please log in again.';
    }

    if (this.isValidationError()) {
      return this.message || 'Invalid input. Please check your data and try again.';
    }

    return this.message || 'An unexpected error occurred. Please try again.';
  }
}

// Create singleton instance
const paymentsClient = new PaymentsClient();

export { PaymentsClient, ApiError, paymentsClient };
export default paymentsClient;
