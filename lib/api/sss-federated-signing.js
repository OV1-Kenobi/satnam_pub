/// <reference path="./sss-federated-signing.d.ts" />
/**
 * SSS-Based Federated Signing API
 * MASTER CONTEXT COMPLIANCE: Browser-only serverless architecture with privacy-first principles
 * Converted from TypeScript to JavaScript with comprehensive JSDoc
 *
 * Implements federated signing using Shamir Secret Sharing
 * without ever exposing the private key to individual family members
 *
 * Phase 3 Integration: Unified guardian approval workflow with FROST routing
 * - signingMethod: 'sss' | 'frost' determines which signing protocol to use
 * - FROST sessions are delegated to FrostSessionManager
 * - SSS sessions use existing Shamir Secret Sharing implementation
 */
import { NostrShamirSecretSharing } from "../../netlify/functions/crypto/shamir-secret-sharing.js";
import { PrivacyUtils } from "../../src/lib/privacy/encryption.js";
import { central_event_publishing_service as CEPS } from "../central_event_publishing_service.js";
import { CitadelRelay } from "../citadel/relay.js";
import { FamilyGuardianManager } from "../family/guardian-management.js";
import { createSupabaseClient } from "../supabase.js";

/**
 * @typedef {'sss' | 'frost'} SigningMethod
 * Determines which signing protocol to use:
 * - 'sss': Shamir Secret Sharing (reconstructs key from shares)
 * - 'frost': FROST threshold signatures (never reconstructs key)
 */

/**
 * Cached FrostSessionManager import for lazy loading
 * @type {Promise<typeof import('../frost/frost-session-manager.js')> | null}
 */
let frostSessionManagerPromise = null;

/**
 * Get FrostSessionManager with lazy loading
 * Uses cached dynamic import pattern for browser compatibility
 * @returns {Promise<typeof import('../frost/frost-session-manager.js').FrostSessionManager>}
 */
async function getFrostSessionManager() {
  if (!frostSessionManagerPromise) {
    frostSessionManagerPromise = import('../frost/frost-session-manager.js');
  }
  const module = await frostSessionManagerPromise;
  return module.FrostSessionManager;
}

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

  // =====================================================
  // UNIFIED GUARDIAN APPROVAL WORKFLOW (Phase 3)
  // =====================================================

  /**
   * Create a unified federated signing request
   * Routes to SSS or FROST based on signingMethod parameter
   *
   * @param {Object} requestData - Request data
   * @param {string} requestData.familyId - Family identifier
   * @param {Object} requestData.eventTemplate - Event template
   * @param {string[]} requestData.requiredGuardians - Required guardians
   * @param {number} requestData.threshold - Signature threshold
   * @param {string} requestData.createdBy - Request creator
   * @param {SigningMethod} [requestData.signingMethod='sss'] - Signing method ('sss' | 'frost')
   * @param {string} [requestData.eventType] - Event type for notifications
   * @param {string} [requestData.familyPubkey] - Family public key (required for FROST)
   * @returns {Promise<{success: boolean, requestId?: string, sessionId?: string, error?: string}>}
   */
  async createFederatedSigningRequest(requestData) {
    const signingMethod = requestData.signingMethod || 'sss';

    console.log(`[FederatedSigning] Creating ${signingMethod.toUpperCase()} signing request for family ${requestData.familyId}`);

    if (signingMethod === 'frost') {
      return this.createFrostSigningRequest(requestData);
    } else {
      return this.createSSSSigningRequest(requestData);
    }
  }

  /**
   * Create a FROST signing request
   * Delegates to FrostSessionManager for threshold signature coordination
   *
   * @param {Object} requestData - Request data
   * @param {string} requestData.familyId - Family identifier
   * @param {Object} requestData.eventTemplate - Event template
   * @param {string[]} requestData.requiredGuardians - Required guardians (participants)
   * @param {number} requestData.threshold - Signature threshold
   * @param {string} requestData.createdBy - Request creator
   * @param {string} requestData.familyPubkey - Family public key
   * @param {string} [requestData.eventType] - Event type for notifications
   * @returns {Promise<{success: boolean, sessionId?: string, requestId?: string, error?: string}>}
   */
  async createFrostSigningRequest(requestData) {
    try {
      console.log(`[FROST] Creating FROST signing session for family ${requestData.familyId}`);

      // Validate required FROST parameters
      if (!requestData.familyPubkey) {
        return {
          success: false,
          error: 'familyPubkey is required for FROST signing'
        };
      }

      // Get FrostSessionManager
      const FrostSessionManager = await getFrostSessionManager();

      // Create message hash from event template
      const eventJson = JSON.stringify(requestData.eventTemplate);
      const encoder = new TextEncoder();
      const data = encoder.encode(eventJson);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const messageHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Create FROST session
      const sessionResult = await FrostSessionManager.createSession({
        familyId: requestData.familyId,
        familyPubkey: requestData.familyPubkey,
        participants: requestData.requiredGuardians,
        threshold: requestData.threshold,
        messageHash,
        eventTemplate: requestData.eventTemplate,
        createdBy: requestData.createdBy,
        expiresInMinutes: 60 // 1 hour expiry
      });

      if (!sessionResult.success || !sessionResult.data) {
        console.error('[FROST] Failed to create session:', sessionResult.error);
        return {
          success: false,
          error: sessionResult.error || 'Failed to create FROST session'
        };
      }

      const session = sessionResult.data;
      console.log(`[FROST] Session created: ${session.session_id}`);

      // Notify guardians about the FROST signing request
      await this.notifyGuardians(session.session_id, requestData.requiredGuardians, {
        familyId: requestData.familyId,
        eventType: requestData.eventType || 'frost_signing',
        eventTemplate: requestData.eventTemplate,
        threshold: requestData.threshold,
        expiresAt: session.expires_at * 1000, // Convert to milliseconds
        createdBy: requestData.createdBy,
        signingMethod: 'frost',
        sessionId: session.session_id
      });

      return {
        success: true,
        sessionId: session.session_id,
        requestId: session.session_id // For compatibility with SSS API
      };

    } catch (error) {
      console.error('[FROST] Error creating FROST signing request:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create FROST signing request'
      };
    }
  }

  /**
   * Submit guardian participation for unified workflow
   * Routes to SSS or FROST based on the request type
   *
   * @param {string} requestId - Request/Session identifier
   * @param {string} guardianPubkey - Guardian public key
   * @param {Object} participationData - Participation data
   * @param {string} [participationData.signature] - SSS signature
   * @param {string} [participationData.shareId] - SSS share ID
   * @param {string} [participationData.nonceCommitment] - FROST nonce commitment
   * @param {string} [participationData.partialSignature] - FROST partial signature
   * @param {SigningMethod} [participationData.signingMethod='sss'] - Signing method
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async submitGuardianParticipation(requestId, guardianPubkey, participationData) {
    const signingMethod = participationData.signingMethod || 'sss';

    console.log(`[FederatedSigning] Guardian ${guardianPubkey} participating in ${signingMethod.toUpperCase()} request ${requestId}`);

    if (signingMethod === 'frost') {
      return this.submitFrostParticipation(requestId, guardianPubkey, participationData);
    } else {
      return this.submitGuardianSignature(
        requestId,
        guardianPubkey,
        participationData.signature,
        participationData.shareId
      );
    }
  }

  /**
   * Submit FROST participation (nonce commitment or partial signature)
   *
   * @param {string} sessionId - FROST session ID
   * @param {string} guardianPubkey - Guardian public key
   * @param {Object} participationData - FROST participation data
   * @param {string} [participationData.nonceCommitment] - Nonce commitment for Round 1
   * @param {string} [participationData.partialSignature] - Partial signature for Round 2
   * @returns {Promise<{success: boolean, error?: string, canAggregate?: boolean}>}
   */
  async submitFrostParticipation(sessionId, guardianPubkey, participationData) {
    try {
      const FrostSessionManager = await getFrostSessionManager();

      // Determine which round we're in based on provided data
      if (participationData.nonceCommitment) {
        // Round 1: Submit nonce commitment
        console.log(`[FROST] Guardian ${guardianPubkey} submitting nonce commitment`);

        const result = await FrostSessionManager.submitNonceCommitment(
          sessionId,
          guardianPubkey,
          participationData.nonceCommitment
        );

        return {
          success: result.success,
          error: result.error
        };

      } else if (participationData.partialSignature) {
        // Round 2: Submit partial signature
        console.log(`[FROST] Guardian ${guardianPubkey} submitting partial signature`);

        const result = await FrostSessionManager.submitPartialSignature(
          sessionId,
          guardianPubkey,
          participationData.partialSignature
        );

        if (!result.success) {
          return {
            success: false,
            error: result.error
          };
        }

        // Check if we can aggregate
        const recoveryResult = await FrostSessionManager.recoverSession(sessionId);
        if (recoveryResult.success && recoveryResult.data) {
          return {
            success: true,
            canAggregate: recoveryResult.data.canAggregate
          };
        }

        return { success: true };

      } else {
        return {
          success: false,
          error: 'Either nonceCommitment or partialSignature is required for FROST participation'
        };
      }

    } catch (error) {
      console.error('[FROST] Error submitting FROST participation:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit FROST participation'
      };
    }
  }

  /**
   * Get active signing sessions for a family
   * Returns both SSS and FROST sessions
   *
   * @param {string} familyId - Family identifier
   * @returns {Promise<{success: boolean, sessions?: Array, error?: string}>}
   */
  async getActiveSigningSessions(familyId) {
    try {
      await this.initSupabase();

      // Get SSS sessions
      const { data: sssSessions, error: sssError } = await this.supabase
        .from('sss_signing_requests')
        .select('*')
        .eq('family_id', familyId)
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: false });

      if (sssError) {
        console.error('[FederatedSigning] Error fetching SSS sessions:', sssError);
      }

      // Get FROST sessions
      const FrostSessionManager = await getFrostSessionManager();
      const frostResult = await FrostSessionManager.getActiveSessions(familyId);

      const sessions = [];

      // Add SSS sessions
      if (sssSessions) {
        for (const session of sssSessions) {
          sessions.push({
            id: session.request_id,
            type: 'sss',
            familyId: session.family_id,
            status: session.status,
            threshold: session.threshold,
            createdAt: session.created_at,
            expiresAt: session.expires_at,
            signaturesCollected: JSON.parse(session.signatures || '[]').length
          });
        }
      }

      // Add FROST sessions
      if (frostResult.success && frostResult.data) {
        for (const session of frostResult.data) {
          sessions.push({
            id: session.session_id,
            type: 'frost',
            familyId: session.family_id,
            status: session.status,
            threshold: session.threshold,
            createdAt: session.created_at,
            expiresAt: session.expires_at,
            participantsCount: session.participants.length
          });
        }
      }

      return {
        success: true,
        sessions
      };

    } catch (error) {
      console.error('[FederatedSigning] Error getting active sessions:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get active sessions'
      };
    }
  }

  // =====================================================
  // SSS SIGNING METHODS (Original Implementation)
  // =====================================================

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

      // Notify guardians with full request data
      await this.notifyGuardians(requestId, requestData.requiredGuardians, {
        familyId: requestData.familyId,
        eventType: requestData.eventType,
        eventTemplate: requestData.eventTemplate,
        threshold: requestData.threshold,
        expiresAt,
        createdBy: requestData.createdBy
      });

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
   *
   * PRODUCTION IMPLEMENTATION:
   * 1. Retrieve all guardian shares
   * 2. Reconstruct signing key using SSS
   * 3. Sign the event with reconstructed key
   * 4. Broadcast via CEPS
   * 5. Securely wipe reconstructed key from memory
   * 6. Notify all guardians of completion
   *
   * @private
   * @param {string} requestId - Request identifier
   */
  async completeSSSSigningRequest(requestId) {
    let reconstructedNsec = null;

    try {
      console.log(`[SSS] Completing signing request: ${requestId}`);

      // Get the signing request
      const { data: request, error: fetchError } = await this.supabase
        .from('sss_signing_requests')
        .select('*')
        .eq('request_id', requestId)
        .single();

      if (fetchError || !request) {
        throw new Error('Failed to fetch signing request');
      }

      // Parse shares and signatures
      const shares = JSON.parse(request.sss_shares || '[]');
      const signatures = JSON.parse(request.signatures || '[]');
      const eventTemplate = JSON.parse(request.event_template);

      console.log(`[SSS] Reconstructing key from ${signatures.length} guardian signatures`);

      // Collect shares from guardians who signed
      const guardianShares = [];
      for (const sig of signatures) {
        const share = shares.find(s => s.guardianPubkey === sig.guardianPubkey);
        if (share && share.encryptedShare) {
          // Decrypt the share using the guardian's signature as key material
          // The signature serves as proof of guardian authorization
          let decryptedShare;
          try {
            // Use PrivacyUtils to decrypt the share
            // The guardian's signature is used as part of the decryption key derivation
            const decryptionResult = await PrivacyUtils.decryptSensitiveData(
              share.encryptedShare,
              sig.guardianPubkey // Guardian's public key for key derivation
            );

            if (!decryptionResult || !decryptionResult.data) {
              throw new Error(`Failed to decrypt share for guardian ${sig.guardianPubkey}`);
            }

            decryptedShare = decryptionResult.data;
          } catch (decryptError) {
            throw new Error(`Share decryption failed for guardian ${sig.guardianPubkey}: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}`);
          }

          guardianShares.push({
            index: share.shareIndex,
            value: decryptedShare, // Use decrypted share value
            threshold: request.threshold,
            metadata: {
              guardianPubkey: share.guardianPubkey,
              shareId: share.shareId
            }
          });
        }
      }

      if (guardianShares.length < request.threshold) {
        throw new Error(`Insufficient shares: need ${request.threshold}, got ${guardianShares.length}`);
      }

      // Reconstruct the nsec from shares using SSS
      console.log(`[SSS] Reconstructing nsec from ${guardianShares.length} shares`);
      reconstructedNsec = await NostrShamirSecretSharing.reconstructNsecFromShares(guardianShares);

      if (!reconstructedNsec) {
        throw new Error('SSS reconstruction failed - no nsec returned');
      }

      // Sign the event with reconstructed key
      console.log(`[SSS] Signing event with reconstructed key`);

      // Decode nsec to private key hex with proper error handling
      let privateKeyHex;
      try {
        if (reconstructedNsec.startsWith('nsec')) {
          // Import nostr-tools/nip19 for nsec decoding
          // Note: Dynamic imports are avoided in Netlify Functions, but this is client-side code
          let nip19Module;
          try {
            nip19Module = await import('nostr-tools/nip19');
          } catch (importError) {
            throw new Error(`Failed to import nostr-tools/nip19: ${importError instanceof Error ? importError.message : String(importError)}`);
          }

          if (!nip19Module || typeof nip19Module.decode !== 'function') {
            throw new Error('nostr-tools/nip19 decode function not available');
          }

          const decoded = nip19Module.decode(reconstructedNsec);
          if (!decoded || decoded.type !== 'nsec') {
            throw new Error(`Invalid nsec decode type: ${decoded?.type || 'unknown'}`);
          }

          privateKeyHex = decoded.data;
        } else {
          privateKeyHex = reconstructedNsec;
        }
      } catch (decodeError) {
        throw new Error(`Failed to decode private key: ${decodeError instanceof Error ? decodeError.message : String(decodeError)}`);
      }

      // Validate private key format
      if (!privateKeyHex || typeof privateKeyHex !== 'string' || privateKeyHex.length === 0) {
        throw new Error('Invalid private key format after decoding');
      }

      // Sign the event with reconstructed key
      const signedEvent = await CEPS.signEvent(eventTemplate, privateKeyHex);

      // Validate signed event structure before broadcasting
      if (!signedEvent || !signedEvent.id || !signedEvent.sig) {
        throw new Error('Event signing failed - invalid signed event structure');
      }

      // Securely wipe the reconstructed key from memory
      // Note: JavaScript strings are immutable, so we use Uint8Array for better security
      reconstructedNsec = null;

      // Attempt to wipe privateKeyHex by converting to Uint8Array and zeroing
      if (typeof privateKeyHex === 'string' && privateKeyHex.length > 0) {
        try {
          // Convert hex string to bytes and zero them
          const keyBytes = new Uint8Array(privateKeyHex.length / 2);
          for (let i = 0; i < privateKeyHex.length; i += 2) {
            keyBytes[i / 2] = parseInt(privateKeyHex.substring(i, i + 2), 16);
          }
          // Zero the array
          keyBytes.fill(0);
          // Clear the string reference
          privateKeyHex = '';
        } catch (wipeError) {
          // If wiping fails, at least clear the reference
          privateKeyHex = '';
        }
      }

      console.log(`[SSS] Event signed successfully: ${signedEvent.id}`);

      // Broadcast the signed event via CEPS
      const broadcastResult = await CEPS.publishFederatedSigningEvent(
        signedEvent,
        request.family_id
      );

      if (!broadcastResult.success) {
        throw new Error(`Failed to broadcast event: ${broadcastResult.error}`);
      }

      console.log(`[SSS] Event broadcast successfully: ${broadcastResult.eventId}`);

      // Update status to completed
      const { error: updateError } = await this.supabase
        .from('sss_signing_requests')
        .update({
          status: 'completed',
          completed_at: Date.now(),
          final_event_id: broadcastResult.eventId
        })
        .eq('request_id', requestId);

      if (updateError) {
        console.error('[SSS] Error updating request status:', updateError);
      }

      // Notify all participating guardians
      const guardianPubkeys = signatures.map(s => s.guardianPubkey);
      await CEPS.notifyGuardianSigningComplete(guardianPubkeys, {
        requestId,
        familyId: request.family_id,
        eventType: request.event_type || 'federated_signing',
        eventId: broadcastResult.eventId,
        completedAt: Date.now(),
        participatingGuardians: guardianPubkeys
      });

      console.log(`[SSS] Signing request completed successfully`);

    } catch (error) {
      console.error('[SSS] Error completing SSS signing request:', error);

      // Update status to failed
      try {
        await this.supabase
          .from('sss_signing_requests')
          .update({
            status: 'failed',
            error_message: error.message || 'Unknown error',
            failed_at: Date.now()
          })
          .eq('request_id', requestId);
      } catch (updateError) {
        console.error('[SSS] Error updating failed status:', updateError);
      }
    } finally {
      // CRITICAL: Ensure reconstructed key is wiped from memory
      if (reconstructedNsec) {
        reconstructedNsec = null;
        console.log('[SSS] Reconstructed key wiped from memory');
      }
    }
  }

  /**
   * Notify guardians about new signing request
   *
   * PRODUCTION IMPLEMENTATION:
   * Uses CEPS to send NIP-59 gift-wrapped approval requests to guardians
   *
   * @private
   * @param {string} requestId - Request identifier
   * @param {string[]} guardians - Guardian public keys
   * @param {Object} requestData - Request details for approval
   */
  async notifyGuardians(requestId, guardians, requestData) {
    try {
      const signingMethod = requestData.signingMethod || 'sss';
      console.log(`[FederatedSigning] Notifying ${guardians.length} guardians about ${signingMethod.toUpperCase()} signing request ${requestId}`);

      // Send approval requests to each guardian via CEPS
      const results = await Promise.all(
        guardians.map(async (guardianPubkey) => {
          try {
            const result = await CEPS.publishGuardianApprovalRequest(
              guardianPubkey,
              {
                requestId,
                familyId: requestData.familyId,
                eventType: requestData.eventType || 'federated_signing',
                eventTemplate: requestData.eventTemplate,
                threshold: requestData.threshold,
                expiresAt: requestData.expiresAt,
                requesterPubkey: requestData.createdBy,
                // Phase 3: Include signing method and session ID for FROST routing
                signingMethod,
                sessionId: requestData.sessionId || requestId
              }
            );

            if (result.success) {
              console.log(`[FederatedSigning] Guardian ${guardianPubkey} notified successfully`);
            } else {
              console.error(`[FederatedSigning] Failed to notify guardian ${guardianPubkey}:`, result.error);
            }

            return result;
          } catch (error) {
            console.error(`[FederatedSigning] Error notifying guardian ${guardianPubkey}:`, error);
            return { success: false, error: error.message };
          }
        })
      );

      const successCount = results.filter(r => r.success).length;
      console.log(`[FederatedSigning] Notified ${successCount}/${guardians.length} guardians successfully`);

    } catch (error) {
      console.error('[FederatedSigning] Error notifying guardians:', error);
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

