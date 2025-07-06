/**
 * Credentialization System
 * Handles WoT mentor notarization, badge verification, and credential management
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import { nip04, nip19 } from "nostr-tools";
import { nip05VerificationService, nip05Utils } from "./nip05-verification";
import type {
  BadgeAward,
  BadgeDefinition,
  BadgeAwardRequest,
  WoTMentorNotarization,
  WoTNotarizationRequest,
  MentorRegistration,
  MentorVerification,
  VicePrincipalCoSigning,
  StudentProgress,
  PrivacyLevel,
  VerificationLevel,
  WoTVerificationUtils,
  NostrWoTIntegration
} from "../types/education";

// Browser-compatible crypto utilities
class BrowserCryptoUtils implements WoTVerificationUtils {
  async hashPubkey(pubkey: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(pubkey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async verifySignature(message: string, signature: string, pubkey: string): Promise<boolean> {
    try {
      // Simple verification for demo - in production use proper nostr-tools
      const encoder = new TextEncoder();
      const messageData = encoder.encode(message);
      const signatureData = encoder.encode(signature);
      
      // Mock verification - replace with actual nostr signature verification
      return signatureData.length > 0 && messageData.length > 0;
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  async encryptMetadata(data: any, recipientPubkey: string): Promise<string> {
    try {
      const jsonData = JSON.stringify(data);
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(jsonData);
      
      // Generate a random key for AES encryption
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        dataBuffer
      );
      
      // Export key and combine with encrypted data
      const exportedKey = await crypto.subtle.exportKey('raw', key);
      const combined = new Uint8Array(iv.length + exportedKey.length + encryptedBuffer.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(exportedKey), iv.length);
      combined.set(new Uint8Array(encryptedBuffer), iv.length + exportedKey.length);
      
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt metadata');
    }
  }

  async decryptMetadata(encryptedData: string, privateKey: string): Promise<any> {
    try {
      const combined = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)));
      
      const iv = combined.slice(0, 12);
      const keyData = combined.slice(12, 44);
      const encryptedBuffer = combined.slice(44);
      
      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encryptedBuffer
      );
      
      const decoder = new TextDecoder();
      const jsonData = decoder.decode(decryptedBuffer);
      return JSON.parse(jsonData);
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt metadata');
    }
  }

  async generateVerificationHash(data: any): Promise<string> {
    const jsonData = JSON.stringify(data, Object.keys(data).sort());
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(jsonData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

// Nostr integration for credentialization
class NostrCredentializationIntegration implements NostrWoTIntegration {
  private relays: string[] = [
    'wss://relay.satnam.pub',
    'wss://nos.lol',
    'wss://relay.damus.io'
  ];

  async publishNotarization(notarization: WoTMentorNotarization): Promise<string> {
    try {
      // Create NIP-58 badge award event
      const event = {
        kind: 8, // Badge award
        pubkey: notarization.mentor_pubkey,
        content: JSON.stringify({
          type: 'credentialization',
          badge_id: notarization.badge_id,
          student_pubkey_hash: notarization.student_pubkey_hash,
          verification_timestamp: notarization.verification_timestamp,
          verification_level: notarization.verification_level,
          mentor_signature: notarization.mentor_signature,
          verification_hash: notarization.verification_hash
        }),
        tags: [
          ['a', `30008:${notarization.mentor_pubkey}:${notarization.badge_id}`], // Badge definition
          ['p', notarization.student_pubkey_hash], // Student
          ['e', notarization.nostr_event_id || ''], // Related event
          ['verification_level', notarization.verification_level],
          ['privacy_level', notarization.privacy_level],
          ['wot_verified', 'true']
        ],
        created_at: Math.floor(Date.now() / 1000)
      };

      // Mock event ID generation - in production use proper nostr-tools
      const eventId = await this.generateEventId(event);
      
      console.log('Published notarization to Nostr:', eventId);
      return eventId;
    } catch (error) {
      console.error('Failed to publish notarization:', error);
      throw new Error('Failed to publish notarization to Nostr');
    }
  }

  async verifyNotarization(eventId: string, relays: string[]): Promise<boolean> {
    try {
      // Mock verification - in production query relays
      console.log('Verifying notarization:', eventId, 'on relays:', relays);
      return true;
    } catch (error) {
      console.error('Failed to verify notarization:', error);
      return false;
    }
  }

  subscribeToMentorEvents(mentorPubkey: string, callback: (event: any) => void): void {
    // Mock subscription - in production use proper nostr-tools
    console.log('Subscribing to mentor events:', mentorPubkey);
  }

  unsubscribeFromEvents(): void {
    // Mock unsubscription - in production use proper nostr-tools
    console.log('Unsubscribed from mentor events');
  }

  private async generateEventId(event: any): Promise<string> {
    const encoder = new TextEncoder();
    const eventData = encoder.encode(JSON.stringify(event));
    const hashBuffer = await crypto.subtle.digest('SHA-256', eventData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * Credentialization Service
 * Main service for handling WoT mentor notarization and credential management
 */
export class CredentializationService {
  private cryptoUtils: WoTVerificationUtils;
  private nostrIntegration: NostrWoTIntegration;
  private userPubkey: string;
  private userNsec?: string;

  constructor(userPubkey: string, userNsec?: string) {
    this.userPubkey = userPubkey;
    this.userNsec = userNsec;
    this.cryptoUtils = new BrowserCryptoUtils();
    this.nostrIntegration = new NostrCredentializationIntegration();
  }

  /**
   * Award a badge with WoT mentor verification
   */
  async awardBadge(request: BadgeAwardRequest): Promise<BadgeAward> {
    try {
      // Validate request
      if (!request.badgeId || !request.recipientPubkey) {
        throw new Error('Invalid badge award request');
      }

      // Hash recipient pubkey for privacy
      const recipientPubkeyHash = await this.cryptoUtils.hashPubkey(request.recipientPubkey);

      // Create badge award
      const badgeAward: BadgeAward = {
        id: this.generateId(),
        award_id: this.generateAwardId(),
        badge_id: request.badgeId,
        recipient_pubkey_hash: recipientPubkeyHash,
        issuer_pubkey: this.userPubkey,
        awarded_at: Math.floor(Date.now() / 1000),
        encrypted_evidence: await this.cryptoUtils.encryptMetadata(request.evidence, request.recipientPubkey),
        verification_status: 'pending',
        privacy_encrypted: true,
        wot_verified: false,
        institutional_cosigned: false,
        evidence: {
          lessons_completed: request.evidence.lessons_completed,
          quiz_scores: request.evidence.quiz_scores.map(qs => ({
            ...qs,
            completion_date: Math.floor(Date.now() / 1000)
          })),
          practical_work: request.evidence.practical_work || [],
          guardian_approvals: [],
          mentor_verification: request.mentorVerification ? {
            mentor_pubkey: request.mentorVerification.mentor_pubkey,
            mentor_nip05: request.mentorVerification.mentor_nip05,
            verification_timestamp: Math.floor(Date.now() / 1000),
            verification_notes: request.mentorVerification.verification_notes,
            verification_level: 'basic',
            competency_verified: [],
            mentor_signature: request.mentorVerification.mentor_signature
          } : undefined
        },
        created_at: Math.floor(Date.now() / 1000)
      };

      // If mentor verification is provided, create WoT notarization
      if (request.mentorVerification) {
        await this.createWoTNotarization({
          badgeId: request.badgeId,
          studentPubkey: request.recipientPubkey,
          mentorPubkey: request.mentorVerification.mentor_pubkey,
          verificationNotes: request.mentorVerification.verification_notes,
          privacyLevel: request.privacyLevel,
          guardianApproval: undefined
        });

        badgeAward.wot_verified = true;
        badgeAward.verification_status = 'verified';
        badgeAward.mentor_pubkey = request.mentorVerification.mentor_pubkey;
        badgeAward.verification_level = 'basic';
      }

      console.log('✅ Badge awarded successfully:', badgeAward.award_id);
      return badgeAward;
    } catch (error) {
      console.error('❌ Failed to award badge:', error);
      throw new Error('Failed to award badge');
    }
  }

  /**
   * Create WoT mentor notarization
   */
  async createWoTNotarization(request: WoTNotarizationRequest): Promise<WoTMentorNotarization> {
    try {
      // Validate request
      if (!request.badgeId || !request.studentPubkey || !request.mentorPubkey) {
        throw new Error('Invalid WoT notarization request');
      }

      // Hash student pubkey for privacy
      const studentPubkeyHash = await this.cryptoUtils.hashPubkey(request.studentPubkey);

      // Generate verification hash
      const verificationData = {
        badge_id: request.badgeId,
        student_pubkey_hash: studentPubkeyHash,
        mentor_pubkey: request.mentorPubkey,
        verification_timestamp: Math.floor(Date.now() / 1000),
        verification_notes: request.verificationNotes
      };
      const verificationHash = await this.cryptoUtils.generateVerificationHash(verificationData);

      // Create WoT notarization
      const notarization: WoTMentorNotarization = {
        id: this.generateId(),
        redemption_id: this.generateRedemptionId(),
        badge_id: request.badgeId,
        student_pubkey_hash: studentPubkeyHash,
        mentor_pubkey: request.mentorPubkey,
        mentor_nip05: `${request.mentorPubkey}@satnam.pub`, // Mock NIP-05
        mentor_signature: await this.generateMentorSignature(verificationData),
        verification_timestamp: Math.floor(Date.now() / 1000),
        verification_notes: request.verificationNotes,
        verification_level: 'basic',
        competency_verified: [],
        institutional_verification: false,
        verification_hash: verificationHash,
        privacy_level: request.privacyLevel,
        transferable: false,
        revoked: false,
        nostr_relay_published: [],
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000)
      };

      // Publish to Nostr
      const nostrEventId = await this.nostrIntegration.publishNotarization(notarization);
      notarization.nostr_event_id = nostrEventId;
      notarization.nostr_relay_published = ['wss://relay.satnam.pub'];

      console.log('✅ WoT notarization created successfully:', notarization.id);
      return notarization;
    } catch (error) {
      console.error('❌ Failed to create WoT notarization:', error);
      throw new Error('Failed to create WoT notarization');
    }
  }

  /**
   * Register as a mentor
   */
  async registerMentor(registration: {
    mentorPubkey: string;
    nip05: string;
    competencyAreas: string[];
    verificationLevel: VerificationLevel;
    bio?: string;
    institutionAffiliation?: string;
    yearsExperience?: number;
  }): Promise<MentorRegistration> {
    try {
      // Verify NIP-05 identifier
      const nip05Verification = await nip05VerificationService.verifyMentorNIP05(
        registration.mentorPubkey,
        registration.nip05
      );

      if (!nip05Verification.verified) {
        throw new Error(`NIP-05 verification failed: ${nip05Verification.error}`);
      }

      const mentorRegistration: MentorRegistration = {
        id: this.generateId(),
        mentor_pubkey: registration.mentorPubkey,
        nip05_identifier: registration.nip05,
        nip05_verified: true,
        nip05_verification_date: Math.floor(Date.now() / 1000),
        competency_areas: registration.competencyAreas,
        verification_level: registration.verificationLevel,
        bio: registration.bio,
        institution_affiliation: registration.institutionAffiliation,
        years_experience: registration.yearsExperience,
        active: true,
        verified_by_institution: false,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000)
      };

      console.log('✅ Mentor registration successful:', mentorRegistration.id);
      return mentorRegistration;
    } catch (error) {
      console.error('❌ Failed to register mentor:', error);
      throw new Error('Failed to register mentor');
    }
  }

  /**
   * Verify a student's work as a mentor
   */
  async verifyStudentWork(verification: {
    studentPubkey: string;
    badgeId: string;
    verificationNotes?: string;
    competencyVerified: string[];
    qualityScore?: number;
    timeSpentMinutes?: number;
  }): Promise<MentorVerification> {
    try {
      const mentorVerification: MentorVerification = {
        mentor_pubkey: this.userPubkey,
        mentor_nip05: `${this.userPubkey}@satnam.pub`,
        verification_timestamp: Math.floor(Date.now() / 1000),
        verification_notes: verification.verificationNotes,
        verification_level: 'basic',
        competency_verified: verification.competencyVerified,
        mentor_signature: await this.generateMentorSignature({
          student_pubkey: verification.studentPubkey,
          badge_id: verification.badgeId,
          verification_timestamp: Math.floor(Date.now() / 1000)
        }),
        quality_score: verification.qualityScore,
        time_spent_minutes: verification.timeSpentMinutes
      };

      console.log('✅ Student work verification completed:', verification.badgeId);
      return mentorVerification;
    } catch (error) {
      console.error('❌ Failed to verify student work:', error);
      throw new Error('Failed to verify student work');
    }
  }

  /**
   * Get student dashboard data
   */
  async getStudentDashboardData(studentPubkey: string): Promise<{
    progress: StudentProgress;
    availableBadges: BadgeDefinition[];
    achievementsSummary: any;
    mentorInteractions: any[];
    wotNotarizations: WoTMentorNotarization[];
  }> {
    try {
      // Mock data - in production fetch from API
      const studentPubkeyHash = await this.cryptoUtils.hashPubkey(studentPubkey);
      
      const progress: StudentProgress = {
        id: this.generateId(),
        student_pubkey_hash: studentPubkeyHash,
        encrypted_progress: await this.cryptoUtils.encryptMetadata({
          current_level: 'apprentice',
          learning_streak_days: 5,
          total_study_hours: 24,
          badges_earned_count: 3
        }, studentPubkey),
        current_level: 'apprentice',
        learning_streak_days: 5,
        total_study_hours: 24,
        badges_earned_count: 3,
        privacy_settings: {
          progress_visibility: 'family',
          badge_visibility: 'public',
          mentor_interaction: 'family'
        },
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        badges_earned: [],
        subjects_progress: []
      };

      return {
        progress,
        availableBadges: [],
        achievementsSummary: {
          total_badges: 3,
          wot_verified_badges: 2,
          institutional_cosigned_badges: 1
        },
        mentorInteractions: [],
        wotNotarizations: []
      };
    } catch (error) {
      console.error('❌ Failed to get student dashboard data:', error);
      throw new Error('Failed to get student dashboard data');
    }
  }

  /**
   * Generate unique identifiers
   */
  private generateId(): string {
    return `cred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateAwardId(): string {
    return `award_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRedemptionId(): string {
    return `redemption_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate mentor signature
   */
  private async generateMentorSignature(data: any): Promise<string> {
    try {
      const message = JSON.stringify(data, Object.keys(data).sort());
      const encoder = new TextEncoder();
      const messageData = encoder.encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', messageData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.error('Failed to generate mentor signature:', error);
      return 'mock_signature_' + Date.now();
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.nostrIntegration.unsubscribeFromEvents();
  }
}

// Export utility functions for direct use
export const credentializationUtils = {
  hashPubkey: async (pubkey: string): Promise<string> => {
    const utils = new BrowserCryptoUtils();
    return utils.hashPubkey(pubkey);
  },

  verifySignature: async (message: string, signature: string, pubkey: string): Promise<boolean> => {
    const utils = new BrowserCryptoUtils();
    return utils.verifySignature(message, signature, pubkey);
  },

  encryptMetadata: async (data: any, recipientPubkey: string): Promise<string> => {
    const utils = new BrowserCryptoUtils();
    return utils.encryptMetadata(data, recipientPubkey);
  },

  decryptMetadata: async (encryptedData: string, privateKey: string): Promise<any> => {
    const utils = new BrowserCryptoUtils();
    return utils.decryptMetadata(encryptedData, privateKey);
  },

  generateVerificationHash: async (data: any): Promise<string> => {
    const utils = new BrowserCryptoUtils();
    return utils.generateVerificationHash(data);
  }
}; 