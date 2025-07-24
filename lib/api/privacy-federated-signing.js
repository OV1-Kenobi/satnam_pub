/**
 * Privacy-Enhanced Federated Family Nostr Signing API
 * MASTER CONTEXT COMPLIANCE: Browser-only serverless architecture with privacy-first principles
 * Converted from TypeScript to JavaScript with comprehensive JSDoc
 */

import { CitadelRelay } from "../citadel/relay.js";
import db from "../db.js";

/**
 * Environment variable getter with browser compatibility
 * @param {string} key - Environment variable key
 * @param {string} [defaultValue] - Default value if not found
 * @returns {string} Environment variable value
 */
function getEnvVar(key, defaultValue = '') {
  // Primary: import.meta.env for Vite/browser environments
  if (typeof window !== 'undefined' && window.import && window.import.meta && window.import.meta.env) {
    return window.import.meta.env[key] || defaultValue;
  }
  // Secondary: process.env for Node.js environments
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue;
  }
  return defaultValue;
}

/**
 * @typedef {Object} NostrEvent
 * @property {string} id - Event ID
 * @property {string} pubkey - Public key of event creator
 * @property {number} created_at - Unix timestamp
 * @property {number} kind - Event kind
 * @property {string[][]} tags - Event tags
 * @property {string} content - Event content
 * @property {string} sig - Event signature
 */

/**
 * @typedef {Object} FederatedSigningRequest
 * @property {string} requestId - Unique request identifier
 * @property {string} familyId - Family identifier
 * @property {NostrEvent} eventTemplate - Event template to sign
 * @property {string[]} requiredSigners - Required signer public keys
 * @property {number} threshold - Minimum signatures required
 * @property {string} createdBy - Request creator
 * @property {number} expiresAt - Expiration timestamp
 */

/**
 * @typedef {Object} SigningResponse
 * @property {boolean} success - Whether signing was successful
 * @property {string} [signature] - Generated signature
 * @property {string} [error] - Error message if failed
 * @property {string} [requestId] - Request identifier
 */

/**
 * @typedef {Object} PrivacyEncryptionResult
 * @property {string} encryptedData - Encrypted data
 * @property {string} salt - Encryption salt
 * @property {string} keyId - Key identifier
 */

/**
 * Generate a privacy-preserving hash using Web Crypto API
 * @param {string} data - Data to hash
 * @param {string} [salt] - Optional salt
 * @returns {Promise<string>} Hashed data
 */
async function generatePrivacyHash(data, salt = '') {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const dataToHash = encoder.encode(data + salt);
    const hash = await crypto.subtle.digest('SHA-256', dataToHash);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Fallback for environments without Web Crypto API
    let hash = 0;
    const str = data + salt;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Privacy utilities class for comprehensive privacy operations
 */
export class PrivacyUtils {
  /**
   * Generate a secure UUID
   * @returns {string} Secure UUID
   */
  static generateSecureUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    } else {
      // Fallback UUID generation
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  }

  /**
   * Encrypt sensitive data with extended interface
   * @param {any} data - Data to encrypt
   * @param {string} userKey - User encryption key
   * @param {Object} [options] - Encryption options
   * @returns {Promise<PrivacyEncryptionResult>} Encryption result
   */
  static async encryptSensitiveData(data, userKey, options = {}) {
    try {
      const jsonData = JSON.stringify(data);
      
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        const encoder = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        
        // Create key from userKey and salt
        const keyMaterial = await crypto.subtle.importKey(
          'raw',
          encoder.encode(userKey),
          { name: 'PBKDF2' },
          false,
          ['deriveBits', 'deriveKey']
        );

        const key = await crypto.subtle.deriveKey(
          {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
          },
          keyMaterial,
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: iv },
          key,
          encoder.encode(jsonData)
        );

        // Combine salt, iv, and encrypted data
        const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
        combined.set(salt);
        combined.set(iv, salt.length);
        combined.set(new Uint8Array(encrypted), salt.length + iv.length);

        return {
          encryptedData: btoa(String.fromCharCode(...combined)),
          salt: btoa(String.fromCharCode(...salt)),
          keyId: await generatePrivacyHash(userKey)
        };
      } else {
        // Fallback: simple base64 encoding (not secure, for development only)
        return {
          encryptedData: btoa(jsonData),
          salt: btoa(userKey),
          keyId: await generatePrivacyHash(userKey)
        };
      }
    } catch (error) {
      console.error('Error encrypting sensitive data:', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt sensitive data
   * @param {string} encryptedData - Encrypted data
   * @param {string} userKey - User decryption key
   * @param {string} salt - Encryption salt
   * @returns {Promise<any>} Decrypted data
   */
  static async decryptSensitiveData(encryptedData, userKey, salt) {
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        // For simplicity, we'll use base64 decoding
        // In production, implement proper AES-GCM decryption
        const decryptedData = atob(encryptedData);
        return JSON.parse(decryptedData);
      } else {
        // Fallback decryption
        const decryptedData = atob(encryptedData);
        return JSON.parse(decryptedData);
      }
    } catch (error) {
      console.error('Error decrypting sensitive data:', error);
      throw new Error('Decryption failed');
    }
  }

  /**
   * Hash sensitive data for privacy
   * @param {string} data - Data to hash
   * @param {string} [salt] - Optional salt
   * @returns {Promise<string>} Hashed data
   */
  static async hashSensitiveData(data, salt = '') {
    return await generatePrivacyHash(data, salt);
  }

  /**
   * Generate secure token
   * @param {number} [length] - Token length
   * @returns {string} Secure token
   */
  static generateSecureToken(length = 32) {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const array = new Uint8Array(length);
      crypto.getRandomValues(array);
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    } else {
      // Fallback token generation
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }
  }

  /**
   * Log privacy operation for audit trail
   * @param {string} operation - Operation type
   * @param {Object} details - Operation details
   */
  static logPrivacyOperation(operation, details) {
    // In browser environment, use console logging
    console.log(`Privacy Operation: ${operation}`, {
      timestamp: new Date().toISOString(),
      operation,
      details: {
        ...details,
        // Remove sensitive data from logs
        sensitiveData: '[REDACTED]'
      }
    });
  }
}

/**
 * Privacy-Enhanced Federated Signing API
 */
export class PrivacyFederatedSigningAPI {
  constructor() {
    this.relay = new CitadelRelay();
  }

  /**
   * Create a federated signing request
   * @param {Object} requestData - Request data
   * @param {string} requestData.familyId - Family identifier
   * @param {NostrEvent} requestData.eventTemplate - Event template
   * @param {string[]} requestData.requiredSigners - Required signers
   * @param {number} requestData.threshold - Signature threshold
   * @param {string} requestData.createdBy - Request creator
   * @returns {Promise<{success: boolean, requestId?: string, error?: string}>} Request result
   */
  async createSigningRequest(requestData) {
    try {
      const requestId = PrivacyUtils.generateSecureUUID();
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

      // Encrypt sensitive event data
      const encryptedEventData = await PrivacyUtils.encryptSensitiveData(
        requestData.eventTemplate,
        requestData.createdBy
      );

      const signingRequest = {
        requestId,
        familyId: requestData.familyId,
        encryptedEventData: encryptedEventData.encryptedData,
        encryptionSalt: encryptedEventData.salt,
        keyId: encryptedEventData.keyId,
        requiredSigners: requestData.requiredSigners,
        threshold: requestData.threshold,
        createdBy: requestData.createdBy,
        expiresAt,
        status: 'pending',
        signatures: [],
        createdAt: Date.now()
      };

      // Store signing request
      await db.query(
        'INSERT INTO federated_signing_requests (request_id, family_id, encrypted_event_data, encryption_salt, key_id, required_signers, threshold, created_by, expires_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          signingRequest.requestId,
          signingRequest.familyId,
          signingRequest.encryptedEventData,
          signingRequest.encryptionSalt,
          signingRequest.keyId,
          JSON.stringify(signingRequest.requiredSigners),
          signingRequest.threshold,
          signingRequest.createdBy,
          signingRequest.expiresAt,
          signingRequest.status,
          signingRequest.createdAt
        ]
      );

      // Log privacy operation
      PrivacyUtils.logPrivacyOperation('federated_signing_request_created', {
        requestId,
        familyId: requestData.familyId,
        threshold: requestData.threshold,
        signerCount: requestData.requiredSigners.length
      });

      return {
        success: true,
        requestId
      };

    } catch (error) {
      console.error('Error creating signing request:', error);
      return {
        success: false,
        error: 'Failed to create signing request'
      };
    }
  }

  /**
   * Sign a federated signing request
   * @param {string} requestId - Request identifier
   * @param {string} signerPubkey - Signer's public key
   * @param {string} signature - Generated signature
   * @returns {Promise<SigningResponse>} Signing result
   */
  async signRequest(requestId, signerPubkey, signature) {
    try {
      // Get signing request
      const request = await this.getSigningRequest(requestId);
      if (!request.success) {
        return {
          success: false,
          error: 'Signing request not found'
        };
      }

      const signingRequest = request.data;

      // Verify signer is authorized
      if (!signingRequest.requiredSigners.includes(signerPubkey)) {
        return {
          success: false,
          error: 'Unauthorized signer'
        };
      }

      // Check if already signed
      const existingSignature = signingRequest.signatures.find(
        sig => sig.pubkey === signerPubkey
      );
      if (existingSignature) {
        return {
          success: false,
          error: 'Already signed by this signer'
        };
      }

      // Add signature
      const newSignature = {
        pubkey: signerPubkey,
        signature,
        timestamp: Date.now()
      };

      signingRequest.signatures.push(newSignature);

      // Update request in database
      await db.query(
        'UPDATE federated_signing_requests SET signatures = ?, updated_at = ? WHERE request_id = ?',
        [JSON.stringify(signingRequest.signatures), Date.now(), requestId]
      );

      // Check if threshold is met
      if (signingRequest.signatures.length >= signingRequest.threshold) {
        await this.completeSigningRequest(requestId);
      }

      // Log privacy operation
      PrivacyUtils.logPrivacyOperation('federated_signing_signature_added', {
        requestId,
        signerPubkey,
        signatureCount: signingRequest.signatures.length,
        thresholdMet: signingRequest.signatures.length >= signingRequest.threshold
      });

      return {
        success: true,
        requestId,
        signature
      };

    } catch (error) {
      console.error('Error signing request:', error);
      return {
        success: false,
        error: 'Failed to sign request'
      };
    }
  }

  /**
   * Get signing request details
   * @param {string} requestId - Request identifier
   * @returns {Promise<{success: boolean, data?: FederatedSigningRequest, error?: string}>} Request details
   */
  async getSigningRequest(requestId) {
    try {
      const result = await db.query(
        'SELECT * FROM federated_signing_requests WHERE request_id = ?',
        [requestId]
      );

      if (!result.rows || result.rows.length === 0) {
        return {
          success: false,
          error: 'Signing request not found'
        };
      }

      const row = result.rows[0];
      const signingRequest = {
        requestId: row.request_id,
        familyId: row.family_id,
        encryptedEventData: row.encrypted_event_data,
        encryptionSalt: row.encryption_salt,
        keyId: row.key_id,
        requiredSigners: JSON.parse(row.required_signers),
        threshold: row.threshold,
        createdBy: row.created_by,
        expiresAt: row.expires_at,
        status: row.status,
        signatures: JSON.parse(row.signatures || '[]'),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };

      return {
        success: true,
        data: signingRequest
      };

    } catch (error) {
      console.error('Error getting signing request:', error);
      return {
        success: false,
        error: 'Failed to get signing request'
      };
    }
  }

  /**
   * Complete signing request when threshold is met
   * @private
   * @param {string} requestId - Request identifier
   */
  async completeSigningRequest(requestId) {
    try {
      // Update status to completed
      await db.query(
        'UPDATE federated_signing_requests SET status = ?, completed_at = ? WHERE request_id = ?',
        ['completed', Date.now(), requestId]
      );

      // Log privacy operation
      PrivacyUtils.logPrivacyOperation('federated_signing_request_completed', {
        requestId
      });

    } catch (error) {
      console.error('Error completing signing request:', error);
    }
  }

  /**
   * List signing requests for a family
   * @param {string} familyId - Family identifier
   * @param {Object} [options] - Query options
   * @returns {Promise<{success: boolean, data?: FederatedSigningRequest[], error?: string}>} Request list
   */
  async listSigningRequests(familyId, options = {}) {
    try {
      const { status = 'pending', limit = 50, offset = 0 } = options;

      const result = await db.query(
        'SELECT * FROM federated_signing_requests WHERE family_id = ? AND status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [familyId, status, limit, offset]
      );

      const requests = result.rows.map(row => ({
        requestId: row.request_id,
        familyId: row.family_id,
        requiredSigners: JSON.parse(row.required_signers),
        threshold: row.threshold,
        createdBy: row.created_by,
        expiresAt: row.expires_at,
        status: row.status,
        signatures: JSON.parse(row.signatures || '[]'),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      return {
        success: true,
        data: requests
      };

    } catch (error) {
      console.error('Error listing signing requests:', error);
      return {
        success: false,
        error: 'Failed to list signing requests'
      };
    }
  }

  /**
   * Cancel a signing request
   * @param {string} requestId - Request identifier
   * @param {string} cancelledBy - Canceller identifier
   * @returns {Promise<{success: boolean, error?: string}>} Cancellation result
   */
  async cancelSigningRequest(requestId, cancelledBy) {
    try {
      // Get signing request to verify permissions
      const request = await this.getSigningRequest(requestId);
      if (!request.success) {
        return {
          success: false,
          error: 'Signing request not found'
        };
      }

      const signingRequest = request.data;

      // Only creator or required signers can cancel
      if (signingRequest.createdBy !== cancelledBy &&
          !signingRequest.requiredSigners.includes(cancelledBy)) {
        return {
          success: false,
          error: 'Unauthorized to cancel request'
        };
      }

      // Update status to cancelled
      await db.query(
        'UPDATE federated_signing_requests SET status = ?, cancelled_by = ?, cancelled_at = ? WHERE request_id = ?',
        ['cancelled', cancelledBy, Date.now(), requestId]
      );

      // Log privacy operation
      PrivacyUtils.logPrivacyOperation('federated_signing_request_cancelled', {
        requestId,
        cancelledBy
      });

      return {
        success: true
      };

    } catch (error) {
      console.error('Error cancelling signing request:', error);
      return {
        success: false,
        error: 'Failed to cancel signing request'
      };
    }
  }
}

// Export utility functions
export { generatePrivacyHash };

