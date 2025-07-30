/**
 * SSS-Based Federated Signing API
 * MASTER CONTEXT COMPLIANCE: Browser-only serverless architecture with privacy-first principles
 * Converted from TypeScript to JavaScript with comprehensive JSDoc
 *
 * Implements federated signing using Shamir Secret Sharing
 * without ever exposing the private key to individual family members
 */
import { PrivacyUtils } from "../../src/lib/privacy/encryption.js";
import { CitadelRelay } from "../citadel/relay.js";
import { FamilyGuardianManager } from "../family/guardian-management.js";
import { createSupabaseClient } from "../supabase.js";

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
 * @typedef {Object} SSSFederatedEvent
 * @property {string} id - Event ID
 * @property {string} eventUuid - Event UUID
 * @property {string} familyId - Family identifier
 * @property {string} eventType - Event type (family_announcement|payment_request|member_update|coordination|key_rotation)
 * @property {Object} eventTemplate - Nostr event template
 * @property {string[]} requiredGuardians - Required guardian public keys
 * @property {number} threshold - Minimum signatures required
 * @property {string} createdBy - Event creator
 * @property {number} expiresAt - Expiration timestamp
 * @property {string} status - Event status
 * @property {Object[]} shares - SSS shares
 * @property {Object[]} signatures - Collected signatures
 */

/**
 * @typedef {Object} SSSShare
 * @property {string} shareId - Share identifier
 * @property {string} guardianPubkey - Guardian public key
 * @property {string} encryptedShare - Encrypted share data
 * @property {string} shareIndex - Share index
 * @property {boolean} used - Whether share has been used
 */

/**
 * @typedef {Object} GuardianSignature
 * @property {string} guardianPubkey - Guardian public key
 * @property {string} signature - Generated signature
 * @property {string} shareId - Associated share ID
 * @property {number} timestamp - Signature timestamp
 */

/**
 * @typedef {Object} SSSSigningRequest
 * @property {string} requestId - Request identifier
 * @property {string} familyId - Family identifier
 * @property {Object} eventTemplate - Event template to sign
 * @property {string[]} requiredGuardians - Required guardians
 * @property {number} threshold - Signature threshold
 * @property {string} createdBy - Request creator
 * @property {number} expiresAt - Expiration timestamp
 * @property {string} status - Request status
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
 * SSS Federated Signing API
 * Handles federated signing using Shamir Secret Sharing
 */
export class SSSFederatedSigningAPI {
  constructor() {
    this.relay = new CitadelRelay();
    this.guardianManager = new FamilyGuardianManager();
    this.supabase = null;
  }

  /**
   * Initialize Supabase client
   * @private
   */
  async initSupabase() {
    if (!this.supabase) {
      this.supabase = await createSupabaseClient();
    }
  }

  /**
   * Create a federated signing request using SSS
   * @param {Object} requestData - Request data
   * @param {string} requestData.familyId - Family identifier
   * @param {Object} requestData.eventTemplate - Event template
   * @param {string[]} requestData.requiredGuardians - Required guardians
   * @param {number} requestData.threshold - Signature threshold
   * @param {string} requestData.createdBy - Request creator
   * @returns {Promise<{success: boolean, requestId?: string, error?: string}>} Request result
   */
  async createSSSSigningRequest(requestData) {
    try {
      await this.initSupabase();

      const requestId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

      // Generate SSS shares for the event
      const shares = await this.generateSSSShares(
        requestData.eventTemplate,
        requestData.requiredGuardians,
        requestData.threshold
      );

      if (!shares.success) {
        return {
          success: false,
          error: shares.error
        };
      }

      // Create signing request
      const signingRequest = {
        request_id: requestId,
        family_id: requestData.familyId,
        event_template: JSON.stringify(requestData.eventTemplate),
        required_guardians: JSON.stringify(requestData.requiredGuardians),
        threshold: requestData.threshold,
        created_by: requestData.createdBy,
        expires_at: expiresAt,
        status: 'pending',
        sss_shares: JSON.stringify(shares.data),
        created_at: Date.now()
      };

      // Store signing request
      const { error: insertError } = await this.supabase
        .from('sss_signing_requests')
        .insert([signingRequest]);

      if (insertError) {
        console.error('Error storing SSS signing request:', insertError);
        return {
          success: false,
          error: 'Failed to create signing request'
        };
      }

      // Notify guardians
      await this.notifyGuardians(requestId, requestData.requiredGuardians);

      return {
        success: true,
        requestId
      };

    } catch (error) {
      console.error('Error creating SSS signing request:', error);
      return {
        success: false,
        error: 'Failed to create signing request'
      };
    }
  }

  /**
   * Generate SSS shares for an event
   * @private
   * @param {Object} eventTemplate - Event template
   * @param {string[]} guardians - Guardian public keys
   * @param {number} threshold - Signature threshold
   * @returns {Promise<{success: boolean, data?: SSSShare[], error?: string}>} Share generation result
   */
  async generateSSSShares(eventTemplate, guardians, threshold) {
    try {
      // For this implementation, we'll create mock SSS shares
      // In production, this would use a proper SSS library
      const shares = [];

      for (let i = 0; i < guardians.length; i++) {
        const guardianPubkey = guardians[i];
        const shareId = await generatePrivacyHash(`${guardianPubkey}-${Date.now()}-${i}`);
        
        // Mock share data (in production, this would be actual SSS share)
        const shareData = {
          index: i + 1,
          threshold,
          eventHash: await generatePrivacyHash(JSON.stringify(eventTemplate)),
          guardianPubkey
        };

        // Encrypt share for guardian
        const encryptedShare = await PrivacyUtils.encryptSensitiveData(
          shareData,
          guardianPubkey
        );

        shares.push({
          shareId,
          guardianPubkey,
          encryptedShare: encryptedShare.encryptedData,
          shareIndex: i + 1,
          used: false
        });
      }

      return {
        success: true,
        data: shares
      };

    } catch (error) {
      console.error('Error generating SSS shares:', error);
      return {
        success: false,
        error: 'Failed to generate SSS shares'
      };
    }
  }

  /**
   * Submit guardian signature for SSS signing
   * @param {string} requestId - Request identifier
   * @param {string} guardianPubkey - Guardian public key
   * @param {string} signature - Guardian signature
   * @param {string} shareId - Share identifier
   * @returns {Promise<{success: boolean, error?: string}>} Signature submission result
   */
  async submitGuardianSignature(requestId, guardianPubkey, signature, shareId) {
    try {
      await this.initSupabase();

      // Get signing request
      const { data: request, error: fetchError } = await this.supabase
        .from('sss_signing_requests')
        .select('*')
        .eq('request_id', requestId)
        .single();

      if (fetchError || !request) {
        return {
          success: false,
          error: 'Signing request not found'
        };
      }

      // Verify guardian is authorized
      const requiredGuardians = JSON.parse(request.required_guardians);
      if (!requiredGuardians.includes(guardianPubkey)) {
        return {
          success: false,
          error: 'Unauthorized guardian'
        };
      }

      // Verify share belongs to guardian
      const shares = JSON.parse(request.sss_shares);
      const guardianShare = shares.find(share => 
        share.shareId === shareId && share.guardianPubkey === guardianPubkey
      );

      if (!guardianShare) {
        return {
          success: false,
          error: 'Invalid share for guardian'
        };
      }

      if (guardianShare.used) {
        return {
          success: false,
          error: 'Share already used'
        };
      }

      // Mark share as used
      guardianShare.used = true;

      // Add signature
      const existingSignatures = JSON.parse(request.signatures || '[]');
      existingSignatures.push({
        guardianPubkey,
        signature,
        shareId,
        timestamp: Date.now()
      });

      // Update request
      const { error: updateError } = await this.supabase
        .from('sss_signing_requests')
        .update({
          sss_shares: JSON.stringify(shares),
          signatures: JSON.stringify(existingSignatures),
          updated_at: Date.now()
        })
        .eq('request_id', requestId);

      if (updateError) {
        console.error('Error updating signing request:', updateError);
        return {
          success: false,
          error: 'Failed to submit signature'
        };
      }

      // Check if threshold is met
      if (existingSignatures.length >= request.threshold) {
        await this.completeSSSSigningRequest(requestId);
      }

      return {
        success: true
      };

    } catch (error) {
      console.error('Error submitting guardian signature:', error);
      return {
        success: false,
        error: 'Failed to submit signature'
      };
    }
  }

  /**
   * Complete SSS signing request when threshold is met
   * @private
   * @param {string} requestId - Request identifier
   */
  async completeSSSSigningRequest(requestId) {
    try {
      // Update status to completed
      const { error } = await this.supabase
        .from('sss_signing_requests')
        .update({
          status: 'completed',
          completed_at: Date.now()
        })
        .eq('request_id', requestId);

      if (error) {
        console.error('Error completing SSS signing request:', error);
      }

      // TODO: Reconstruct the final signature from SSS shares
      // This would involve combining the guardian signatures using SSS reconstruction

    } catch (error) {
      console.error('Error completing SSS signing request:', error);
    }
  }

  /**
   * Notify guardians about new signing request
   * @private
   * @param {string} requestId - Request identifier
   * @param {string[]} guardians - Guardian public keys
   */
  async notifyGuardians(requestId, guardians) {
    try {
      // Send notifications to guardians via Nostr DMs
      for (const guardianPubkey of guardians) {
        await this.relay.sendDM(
          guardianPubkey,
          `New SSS signing request: ${requestId}. Please review and sign if appropriate.`
        );
      }
    } catch (error) {
      console.error('Error notifying guardians:', error);
    }
  }

  /**
   * Get SSS signing request details
   * @param {string} requestId - Request identifier
   * @returns {Promise<{success: boolean, data?: SSSSigningRequest, error?: string}>} Request details
   */
  async getSSSSigningRequest(requestId) {
    try {
      await this.initSupabase();

      const { data: request, error } = await this.supabase
        .from('sss_signing_requests')
        .select('*')
        .eq('request_id', requestId)
        .single();

      if (error || !request) {
        return {
          success: false,
          error: 'Signing request not found'
        };
      }

      return {
        success: true,
        data: {
          requestId: request.request_id,
          familyId: request.family_id,
          eventTemplate: JSON.parse(request.event_template),
          requiredGuardians: JSON.parse(request.required_guardians),
          threshold: request.threshold,
          createdBy: request.created_by,
          expiresAt: request.expires_at,
          status: request.status,
          signatures: JSON.parse(request.signatures || '[]'),
          createdAt: request.created_at
        }
      };

    } catch (error) {
      console.error('Error getting SSS signing request:', error);
      return {
        success: false,
        error: 'Failed to get signing request'
      };
    }
  }
}

// Export utility functions
export { generatePrivacyHash };

