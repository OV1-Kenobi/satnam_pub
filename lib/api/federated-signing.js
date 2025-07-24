/**
 * Federated Family Nostr Account Event Signing API
 * MASTER CONTEXT COMPLIANCE: Browser-only serverless architecture with privacy-first principles
 * Converted from TypeScript to JavaScript with comprehensive JSDoc
 * 
 * MERGED FUNCTIONALITY:
 * - Combines federated-signing.ts and federated-signing-simple.ts
 * - Handles multi-signature Nostr events for family coordination
 * - Privacy-first and secure signing workflows
 * - Both complex and simplified signing patterns
 */

import { CitadelRelay } from "../citadel/relay.js";
import createDatabase from "../db.js";

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

// Initialize database
const db = createDatabase();

/**
 * @typedef {Object} FederatedNostrEvent
 * @property {string} id - Event ID
 * @property {string} familyId - Family identifier
 * @property {string} eventType - Event type (family_announcement|payment_request|member_update|coordination)
 * @property {string} content - Event content
 * @property {string} author - Member ID who created the event
 * @property {string} authorPubkey - Author's public key
 * @property {Date} timestamp - Event timestamp
 * @property {string} status - Event status (pending|signed|broadcast|expired)
 * @property {number} signaturesRequired - Number of signatures required
 * @property {number} signaturesReceived - Number of signatures received
 * @property {Object<string, MemberSignature>} memberSignatures - Member signatures
 * @property {string} [nostrEventId] - Nostr event ID after broadcast
 */

/**
 * @typedef {Object} MemberSignature
 * @property {string} memberId - Member identifier
 * @property {string} pubkey - Member's public key
 * @property {string} signature - Generated signature
 * @property {number} timestamp - Signature timestamp
 * @property {boolean} verified - Whether signature is verified
 */

/**
 * @typedef {Object} SigningRequest
 * @property {string} requestId - Request identifier
 * @property {string} familyId - Family identifier
 * @property {Object} eventTemplate - Event template to sign
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
 * @property {string} [eventId] - Event identifier
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
 * Federated Signing API - Full Featured Version
 * Handles complex multi-signature workflows with full database integration
 */
export class FederatedSigningAPI {
  constructor() {
    this.relay = new CitadelRelay();
  }

  /**
   * Create a federated signing request
   * @param {Object} requestData - Request data
   * @param {string} requestData.familyId - Family identifier
   * @param {Object} requestData.eventTemplate - Event template
   * @param {string[]} requestData.requiredSigners - Required signers
   * @param {number} requestData.threshold - Signature threshold
   * @param {string} requestData.createdBy - Request creator
   * @returns {Promise<{success: boolean, requestId?: string, error?: string}>} Request result
   */
  async createSigningRequest(requestData) {
    try {
      const requestId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

      const federatedEvent = {
        id: requestId,
        familyId: requestData.familyId,
        eventType: requestData.eventTemplate.kind === 1 ? 'family_announcement' : 'coordination',
        content: requestData.eventTemplate.content,
        author: requestData.createdBy,
        authorPubkey: requestData.eventTemplate.pubkey,
        timestamp: new Date(),
        status: 'pending',
        signaturesRequired: requestData.threshold,
        signaturesReceived: 0,
        memberSignatures: {},
        requiredSigners: requestData.requiredSigners,
        expiresAt
      };

      // Store in database
      await db.query(
        'INSERT INTO federated_events (id, family_id, event_type, content, author, author_pubkey, timestamp, status, signatures_required, signatures_received, member_signatures, required_signers, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          federatedEvent.id,
          federatedEvent.familyId,
          federatedEvent.eventType,
          federatedEvent.content,
          federatedEvent.author,
          federatedEvent.authorPubkey,
          federatedEvent.timestamp.toISOString(),
          federatedEvent.status,
          federatedEvent.signaturesRequired,
          federatedEvent.signaturesReceived,
          JSON.stringify(federatedEvent.memberSignatures),
          JSON.stringify(federatedEvent.requiredSigners),
          federatedEvent.expiresAt
        ]
      );

      // Notify required signers
      await this.notifySigners(requestId, requestData.requiredSigners);

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
   * Sign a federated event
   * @param {string} eventId - Event identifier
   * @param {string} signerPubkey - Signer's public key
   * @param {string} signature - Generated signature
   * @returns {Promise<SigningResponse>} Signing result
   */
  async signEvent(eventId, signerPubkey, signature) {
    try {
      // Get event from database
      const result = await db.query(
        'SELECT * FROM federated_events WHERE id = ?',
        [eventId]
      );

      if (!result.rows || result.rows.length === 0) {
        return {
          success: false,
          error: 'Event not found'
        };
      }

      const event = result.rows[0];
      const requiredSigners = JSON.parse(event.required_signers);
      const memberSignatures = JSON.parse(event.member_signatures);

      // Verify signer is authorized
      if (!requiredSigners.includes(signerPubkey)) {
        return {
          success: false,
          error: 'Unauthorized signer'
        };
      }

      // Check if already signed
      if (memberSignatures[signerPubkey]) {
        return {
          success: false,
          error: 'Already signed by this member'
        };
      }

      // Add signature
      memberSignatures[signerPubkey] = {
        memberId: signerPubkey,
        pubkey: signerPubkey,
        signature,
        timestamp: Date.now(),
        verified: true // In production, verify the signature
      };

      const signaturesReceived = Object.keys(memberSignatures).length;

      // Update database
      await db.query(
        'UPDATE federated_events SET member_signatures = ?, signatures_received = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(memberSignatures), signaturesReceived, new Date().toISOString(), eventId]
      );

      // Check if threshold is met
      if (signaturesReceived >= event.signatures_required) {
        await this.completeEvent(eventId);
      }

      return {
        success: true,
        signature,
        eventId
      };

    } catch (error) {
      console.error('Error signing event:', error);
      return {
        success: false,
        error: 'Failed to sign event'
      };
    }
  }

  /**
   * Complete event when threshold is met
   * @private
   * @param {string} eventId - Event identifier
   */
  async completeEvent(eventId) {
    try {
      // Update status to signed
      await db.query(
        'UPDATE federated_events SET status = ?, completed_at = ? WHERE id = ?',
        ['signed', new Date().toISOString(), eventId]
      );

      // TODO: Broadcast to Nostr network
      console.log(`Event ${eventId} completed and ready for broadcast`);

    } catch (error) {
      console.error('Error completing event:', error);
    }
  }

  /**
   * Notify signers about new signing request
   * @private
   * @param {string} eventId - Event identifier
   * @param {string[]} signers - Signer public keys
   */
  async notifySigners(eventId, signers) {
    try {
      for (const signerPubkey of signers) {
        await this.relay.sendDM(
          signerPubkey,
          `New signing request: ${eventId}. Please review and sign if appropriate.`
        );
      }
    } catch (error) {
      console.error('Error notifying signers:', error);
    }
  }

  /**
   * Get federated event details
   * @param {string} eventId - Event identifier
   * @returns {Promise<{success: boolean, data?: FederatedNostrEvent, error?: string}>} Event details
   */
  async getEvent(eventId) {
    try {
      const result = await db.query(
        'SELECT * FROM federated_events WHERE id = ?',
        [eventId]
      );

      if (!result.rows || result.rows.length === 0) {
        return {
          success: false,
          error: 'Event not found'
        };
      }

      const row = result.rows[0];
      const event = {
        id: row.id,
        familyId: row.family_id,
        eventType: row.event_type,
        content: row.content,
        author: row.author,
        authorPubkey: row.author_pubkey,
        timestamp: new Date(row.timestamp),
        status: row.status,
        signaturesRequired: row.signatures_required,
        signaturesReceived: row.signatures_received,
        memberSignatures: JSON.parse(row.member_signatures),
        nostrEventId: row.nostr_event_id
      };

      return {
        success: true,
        data: event
      };

    } catch (error) {
      console.error('Error getting event:', error);
      return {
        success: false,
        error: 'Failed to get event'
      };
    }
  }

  /**
   * List federated events for a family
   * @param {string} familyId - Family identifier
   * @param {Object} [options] - Query options
   * @returns {Promise<{success: boolean, data?: FederatedNostrEvent[], error?: string}>} Event list
   */
  async listEvents(familyId, options = {}) {
    try {
      const { status = 'pending', limit = 50, offset = 0 } = options;

      const result = await db.query(
        'SELECT * FROM federated_events WHERE family_id = ? AND status = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?',
        [familyId, status, limit, offset]
      );

      const events = result.rows.map(row => ({
        id: row.id,
        familyId: row.family_id,
        eventType: row.event_type,
        content: row.content,
        author: row.author,
        authorPubkey: row.author_pubkey,
        timestamp: new Date(row.timestamp),
        status: row.status,
        signaturesRequired: row.signatures_required,
        signaturesReceived: row.signatures_received,
        memberSignatures: JSON.parse(row.member_signatures),
        nostrEventId: row.nostr_event_id
      }));

      return {
        success: true,
        data: events
      };

    } catch (error) {
      console.error('Error listing events:', error);
      return {
        success: false,
        error: 'Failed to list events'
      };
    }
  }
}

/**
 * Simplified Federated Signing API
 * Handles basic multi-signature workflows with minimal overhead
 */
export class SimpleFederatedSigningAPI {
  constructor() {
    this.relay = new CitadelRelay();
    this.pendingEvents = new Map(); // In-memory storage for simplicity
  }

  /**
   * Create a simple signing request
   * @param {Object} requestData - Request data
   * @param {string} requestData.familyId - Family identifier
   * @param {string} requestData.content - Event content
   * @param {string[]} requestData.requiredSigners - Required signers
   * @param {number} requestData.threshold - Signature threshold
   * @param {string} requestData.createdBy - Request creator
   * @returns {Promise<{success: boolean, eventId?: string, error?: string}>} Request result
   */
  async createSimpleSigningRequest(requestData) {
    try {
      const eventId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();

      const simpleEvent = {
        id: eventId,
        familyId: requestData.familyId,
        eventType: 'coordination',
        content: requestData.content,
        author: requestData.createdBy,
        authorPubkey: requestData.createdBy, // Simplified - assume pubkey = author
        timestamp: new Date(),
        status: 'pending',
        signaturesRequired: requestData.threshold,
        signaturesReceived: 0,
        memberSignatures: {},
        requiredSigners: requestData.requiredSigners,
        expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
      };

      // Store in memory (simplified)
      this.pendingEvents.set(eventId, simpleEvent);

      return {
        success: true,
        eventId
      };

    } catch (error) {
      console.error('Error creating simple signing request:', error);
      return {
        success: false,
        error: 'Failed to create signing request'
      };
    }
  }

  /**
   * Sign a simple event
   * @param {string} eventId - Event identifier
   * @param {string} signerPubkey - Signer's public key
   * @param {string} signature - Generated signature
   * @returns {Promise<SigningResponse>} Signing result
   */
  async signSimpleEvent(eventId, signerPubkey, signature) {
    try {
      const event = this.pendingEvents.get(eventId);
      if (!event) {
        return {
          success: false,
          error: 'Event not found'
        };
      }

      // Verify signer is authorized
      if (!event.requiredSigners.includes(signerPubkey)) {
        return {
          success: false,
          error: 'Unauthorized signer'
        };
      }

      // Check if already signed
      if (event.memberSignatures[signerPubkey]) {
        return {
          success: false,
          error: 'Already signed by this member'
        };
      }

      // Add signature
      event.memberSignatures[signerPubkey] = {
        memberId: signerPubkey,
        pubkey: signerPubkey,
        signature,
        timestamp: Date.now(),
        verified: true
      };

      event.signaturesReceived = Object.keys(event.memberSignatures).length;

      // Check if threshold is met
      if (event.signaturesReceived >= event.signaturesRequired) {
        event.status = 'signed';
        console.log(`Simple event ${eventId} completed`);
      }

      return {
        success: true,
        signature,
        eventId
      };

    } catch (error) {
      console.error('Error signing simple event:', error);
      return {
        success: false,
        error: 'Failed to sign event'
      };
    }
  }

  /**
   * Get simple event details
   * @param {string} eventId - Event identifier
   * @returns {Promise<{success: boolean, data?: FederatedNostrEvent, error?: string}>} Event details
   */
  async getSimpleEvent(eventId) {
    try {
      const event = this.pendingEvents.get(eventId);
      if (!event) {
        return {
          success: false,
          error: 'Event not found'
        };
      }

      return {
        success: true,
        data: event
      };

    } catch (error) {
      console.error('Error getting simple event:', error);
      return {
        success: false,
        error: 'Failed to get event'
      };
    }
  }

  /**
   * List simple events for a family
   * @param {string} familyId - Family identifier
   * @returns {Promise<{success: boolean, data?: FederatedNostrEvent[], error?: string}>} Event list
   */
  async listSimpleEvents(familyId) {
    try {
      const events = Array.from(this.pendingEvents.values())
        .filter(event => event.familyId === familyId)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      return {
        success: true,
        data: events
      };

    } catch (error) {
      console.error('Error listing simple events:', error);
      return {
        success: false,
        error: 'Failed to list events'
      };
    }
  }

  /**
   * Clear expired events from memory
   */
  clearExpiredEvents() {
    const now = Date.now();
    for (const [eventId, event] of this.pendingEvents.entries()) {
      if (now > event.expiresAt) {
        this.pendingEvents.delete(eventId);
      }
    }
  }
}

/**
 * Unified Federated Signing Manager
 * Provides both full-featured and simplified signing capabilities
 */
export class UnifiedFederatedSigningManager {
  constructor() {
    this.fullAPI = new FederatedSigningAPI();
    this.simpleAPI = new SimpleFederatedSigningAPI();
  }

  /**
   * Create signing request with automatic complexity detection
   * @param {Object} requestData - Request data
   * @param {boolean} [useSimple] - Force simple mode
   * @returns {Promise<{success: boolean, requestId?: string, error?: string}>} Request result
   */
  async createSigningRequest(requestData, useSimple = false) {
    if (useSimple || requestData.threshold <= 3) {
      return await this.simpleAPI.createSimpleSigningRequest(requestData);
    } else {
      return await this.fullAPI.createSigningRequest(requestData);
    }
  }

  /**
   * Sign event with automatic API detection
   * @param {string} eventId - Event identifier
   * @param {string} signerPubkey - Signer's public key
   * @param {string} signature - Generated signature
   * @param {boolean} [useSimple] - Force simple mode
   * @returns {Promise<SigningResponse>} Signing result
   */
  async signEvent(eventId, signerPubkey, signature, useSimple = false) {
    if (useSimple || this.simpleAPI.pendingEvents.has(eventId)) {
      return await this.simpleAPI.signSimpleEvent(eventId, signerPubkey, signature);
    } else {
      return await this.fullAPI.signEvent(eventId, signerPubkey, signature);
    }
  }

  /**
   * Get event details with automatic API detection
   * @param {string} eventId - Event identifier
   * @param {boolean} [useSimple] - Force simple mode
   * @returns {Promise<{success: boolean, data?: FederatedNostrEvent, error?: string}>} Event details
   */
  async getEvent(eventId, useSimple = false) {
    if (useSimple || this.simpleAPI.pendingEvents.has(eventId)) {
      return await this.simpleAPI.getSimpleEvent(eventId);
    } else {
      return await this.fullAPI.getEvent(eventId);
    }
  }
}

// Export utility functions
export { generatePrivacyHash };

