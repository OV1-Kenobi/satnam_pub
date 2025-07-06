/**
 * @fileoverview Family Guardian Management System
 * @description Manages guardians, share distribution, and key reconstruction
 * for flexible family configurations from 2-of-2 to 5-of-7
 */

import { generateSecretKey, nip19 } from "../../src/lib/nostr-browser";
import {
  FamilyGuardian,
  FamilySSLConfig,
  NostrShamirSecretSharing,
  SecretShare,
} from "../../netlify/functions/crypto/shamir-secret-sharing";
import db from "../../netlify/functions/db";
import { PrivacyUtils } from "../../src/lib/privacy/encryption";

/**
 * Guardian share with encryption for secure storage
 */
export interface EncryptedGuardianShare {
  shareId: string;
  guardianId: string;
  encryptedShare: string;
  shareSalt: string;
  shareIv: string;
  shareTag: string;
  shareIndex: number;
  threshold: number;
  totalShares: number;
  familyId: string;
  keyId: string;
  createdAt: Date;
  expiresAt?: Date;
}

/**
 * Key reconstruction request tracking
 */
export interface KeyReconstructionRequest {
  requestId: string;
  familyId: string;
  keyId: string;
  requesterId: string;
  reason: "key_rotation" | "recovery" | "inheritance" | "emergency" | "signing";
  requiredThreshold: number;
  currentSignatures: string[];
  guardianResponses: Array<{
    guardianId: string;
    approved: boolean;
    shareProvided: boolean;
    timestamp: Date;
    deviceInfo?: any;
  }>;
  status: "pending" | "threshold_met" | "completed" | "failed" | "expired";
  createdAt: Date;
  expiresAt: Date;
  completedAt?: Date;
}

/**
 * Family Guardian Management System
 */
export class FamilyGuardianManager {
  /**
   * Initialize a new family with guardians and SSS configuration
   */
  static async initializeFamilySSS(params: {
    familyId: string;
    familyName: string;
    guardians: Array<{
      id: string;
      role: "parent" | "trusted_adult" | "family_member" | "recovery_contact";
      publicKey: string;
      contactInfo?: any;
      trustLevel: 1 | 2 | 3 | 4 | 5;
    }>;
    threshold?: number;
    totalShares?: number;
    privacyLevel?: 1 | 2 | 3;
  }): Promise<{
    success: boolean;
    data?: {
      familyConfig: FamilySSLConfig;
      guardians: FamilyGuardian[];
      nsec: string;
      npub: string;
    };
    error?: string;
  }> {
    try {
      const { familyId, familyName, guardians, privacyLevel = 3 } = params;

      if (guardians.length < 2 || guardians.length > 7) {
        return {
          success: false,
          error: "Family must have between 2 and 7 guardians",
        };
      }

      // Get recommended configuration based on family size
      const recommendation =
        NostrShamirSecretSharing.recommendShareDistribution(guardians.length);
      const threshold = params.threshold || recommendation.threshold;
      const totalShares = params.totalShares || recommendation.totalShares;

      if (threshold > guardians.length) {
        return {
          success: false,
          error: `Threshold (${threshold}) cannot exceed number of guardians (${guardians.length})`,
        };
      }

      // Generate new Nostr key pair for the family
      const privateKeyBytes = generateSecretKey();
      const nsec = nip19.nsecEncode(Array.from(privateKeyBytes).map(b => b.toString(16).padStart(2, '0')).join(''));
      const npub = nip19.npubEncode(Array.from(privateKeyBytes).map(b => b.toString(16).padStart(2, '0')).join(''));

      // Create guardians in database
      const familyGuardians: FamilyGuardian[] = [];

      for (let i = 0; i < guardians.length; i++) {
        const guardian = guardians[i];
        const guardianUuid = PrivacyUtils.generateSecureUUID();

        // Encrypt guardian data
        const encryptedGuardianId = await PrivacyUtils.encryptSensitiveData(
          guardian.id,
        );
        const encryptedFamilyId =
          await PrivacyUtils.encryptSensitiveData(familyId);
        const encryptedPublicKey = await PrivacyUtils.encryptSensitiveData(
          guardian.publicKey,
        );

        let encryptedContactInfo = null;
        if (guardian.contactInfo) {
          const contactData = await PrivacyUtils.encryptSensitiveData(
            JSON.stringify(guardian.contactInfo),
          );
          encryptedContactInfo = {
            encrypted: contactData.encrypted,
            salt: contactData.salt,
            iv: contactData.iv,
            tag: contactData.tag,
          };
        }

        // Store encrypted guardian
        await db.query(
          `
          INSERT INTO secure_family_guardians (
            guardian_uuid, encrypted_guardian_id, guardian_id_salt, guardian_id_iv, guardian_id_tag,
            encrypted_family_id, family_salt, family_iv, family_tag,
            encrypted_public_key, pubkey_salt, pubkey_iv, pubkey_tag,
            encrypted_email, email_salt, email_iv, email_tag,
            role, active, created_at, privacy_consent_given, consent_timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        `,
          [
            guardianUuid,
            encryptedGuardianId.encrypted,
            encryptedGuardianId.salt,
            encryptedGuardianId.iv,
            encryptedGuardianId.tag,
            encryptedFamilyId.encrypted,
            encryptedFamilyId.salt,
            encryptedFamilyId.iv,
            encryptedFamilyId.tag,
            encryptedPublicKey.encrypted,
            encryptedPublicKey.salt,
            encryptedPublicKey.iv,
            encryptedPublicKey.tag,
            encryptedContactInfo?.encrypted || null,
            encryptedContactInfo?.salt || null,
            encryptedContactInfo?.iv || null,
            encryptedContactInfo?.tag || null,
            guardian.role,
            true,
            new Date().toISOString(),
            true,
            new Date().toISOString(),
          ],
        );

        // Assign shares (distribute evenly, with some guardians getting extra shares if needed)
        const baseShares = Math.floor(totalShares / guardians.length);
        const extraShares = totalShares % guardians.length;
        const shareCount = baseShares + (i < extraShares ? 1 : 0);

        const shareIndices: number[] = [];
        let shareStartIndex = 1;
        for (let j = 0; j < i; j++) {
          const prevShareCount = baseShares + (j < extraShares ? 1 : 0);
          shareStartIndex += prevShareCount;
        }

        for (let j = 0; j < shareCount; j++) {
          shareIndices.push(shareStartIndex + j);
        }

        familyGuardians.push({
          guardianId: guardian.id,
          guardianUuid,
          familyId,
          role: guardian.role,
          publicKey: guardian.publicKey,
          contactInfo: guardian.contactInfo,
          shareIndices,
          active: true,
          createdAt: new Date(),
          trustLevel: guardian.trustLevel,
        });
      }

      // Create family SSL configuration
      const shareDistribution = familyGuardians.map((g) => ({
        guardianId: g.guardianId,
        shareIndices: g.shareIndices,
      }));

      const familyConfig: FamilySSLConfig = {
        familyId,
        threshold,
        totalShares,
        shareDistribution,
        emergencyRecovery: {
          enabled: true,
          emergencyThreshold: Math.max(2, threshold - 1),
          emergencyGuardians: guardians
            .filter((g) => g.trustLevel >= 4)
            .map((g) => g.id),
        },
        keyRotation: {
          enabled: true,
          rotationIntervalDays: 180, // 6 months
          nextRotation: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        },
        privacyLevel,
      };

      // Split the nsec into shares
      const shares = await NostrShamirSecretSharing.splitNsecIntoShares(
        nsec,
        threshold,
        totalShares,
        familyId,
        { expiresInDays: 365, keyId: PrivacyUtils.generateSecureUUID() },
      );

      // Distribute shares to guardians and store them encrypted
      await this.distributeSharesToGuardians(shares, familyGuardians);

      // Store family configuration
      await this.storeFamilyConfig(familyConfig);

      // Clear sensitive data from memory
      privateKeyBytes.fill(0);
      PrivacyUtils.secureClearMemory(nsec);

      return {
        success: true,
        data: {
          familyConfig,
          guardians: familyGuardians,
          nsec: "[REDACTED - Stored as encrypted shares]",
          npub,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to initialize family SSS: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Distribute shares to guardians with encryption
   */
  private static async distributeSharesToGuardians(
    shares: SecretShare[],
    guardians: FamilyGuardian[],
  ): Promise<void> {
    for (const guardian of guardians) {
      for (const shareIndex of guardian.shareIndices) {
        const share = shares.find((s) => s.shareIndex === shareIndex);
        if (!share) continue;

        // Encrypt the share for storage with double encryption for maximum security
        const shareData = JSON.stringify({
          shareId: share.shareId,
          shareIndex: share.shareIndex,
          shareValue: Array.from(share.shareValue), // Convert Uint8Array to regular array
          threshold: share.threshold,
          totalShares: share.totalShares,
          metadata: share.metadata,
        });

        // Use double encryption for guardian shares - each with unique salts
        const doubleEncryptedShare =
          await PrivacyUtils.doubleEncryptSensitiveData(shareData);
        const encryptedGuardianId = await PrivacyUtils.encryptSensitiveData(
          guardian.guardianId,
        );
        const encryptedFamilyId = await PrivacyUtils.encryptSensitiveData(
          guardian.familyId,
        );

        // Store double-encrypted share with unique salts for each encryption layer
        await db.query(
          `
          INSERT INTO secure_guardian_shards (
            shard_uuid, encrypted_guardian_id, guardian_id_salt, guardian_id_iv, guardian_id_tag,
            encrypted_federation_id, federation_salt, federation_iv, federation_tag,
            encrypted_shard_data, shard_salt, shard_iv, shard_tag,
            double_encrypted_shard, double_salt, double_iv, double_tag,
            shard_index, threshold_required, created_at, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        `,
          [
            PrivacyUtils.generateSecureUUID(),
            encryptedGuardianId.encrypted,
            encryptedGuardianId.salt,
            encryptedGuardianId.iv,
            encryptedGuardianId.tag,
            encryptedFamilyId.encrypted,
            encryptedFamilyId.salt,
            encryptedFamilyId.iv,
            encryptedFamilyId.tag,
            doubleEncryptedShare.encrypted, // First encryption layer
            doubleEncryptedShare.salt,
            doubleEncryptedShare.iv,
            doubleEncryptedShare.tag,
            doubleEncryptedShare.doubleEncrypted, // Second encryption layer with unique salt
            doubleEncryptedShare.doubleSalt,
            doubleEncryptedShare.doubleIv,
            doubleEncryptedShare.doubleTag,
            shareIndex,
            share.threshold,
            new Date().toISOString(),
            share.expiresAt ? share.expiresAt.toISOString() : null,
          ],
        );
      }
    }
  }

  /**
   * Store family configuration in database
   */
  private static async storeFamilyConfig(
    config: FamilySSLConfig,
  ): Promise<void> {
    const encryptedFamilyId = await PrivacyUtils.encryptSensitiveData(
      config.familyId,
    );
    const encryptedConfig = await PrivacyUtils.encryptSensitiveData(
      JSON.stringify(config),
    );

    await db.query(
      `
      INSERT INTO secure_family_nostr_protection (
        protection_uuid, encrypted_family_member_id, member_id_salt, member_id_iv, member_id_tag,
        encrypted_user_id, user_salt, user_iv, user_tag,
        encrypted_federation_id, federation_salt, federation_iv, federation_tag,
        guardian_count, threshold_required, protection_active, nsec_shards_stored,
        created_at, zero_knowledge_recovery
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    `,
      [
        PrivacyUtils.generateSecureUUID(),
        encryptedFamilyId.encrypted,
        encryptedFamilyId.salt,
        encryptedFamilyId.iv,
        encryptedFamilyId.tag,
        encryptedFamilyId.encrypted,
        encryptedFamilyId.salt,
        encryptedFamilyId.iv,
        encryptedFamilyId.tag, // Same as family for now
        encryptedConfig.encrypted,
        encryptedConfig.salt,
        encryptedConfig.iv,
        encryptedConfig.tag,
        config.shareDistribution.length,
        config.threshold,
        true,
        true,
        new Date().toISOString(),
        true,
      ],
    );
  }

  /**
   * Request key reconstruction (for signing or key rotation)
   */
  static async requestKeyReconstruction(params: {
    familyId: string;
    requesterId: string;
    reason: KeyReconstructionRequest["reason"];
    expiresInHours?: number;
  }): Promise<{
    success: boolean;
    data?: {
      requestId: string;
      requiredThreshold: number;
      availableGuardians: string[];
    };
    error?: string;
  }> {
    try {
      const { familyId, requesterId, reason, expiresInHours = 24 } = params;

      // Get family configuration
      const configResult = await this.getFamilyConfig(familyId);
      if (!configResult.success || !configResult.data) {
        return { success: false, error: "Family configuration not found" };
      }

      const config = configResult.data;
      const keyId = `key_${Date.now()}_${PrivacyUtils.generateSecureUUID()}`;

      // Determine threshold based on reason
      let requiredThreshold = config.threshold;
      if (reason === "emergency" && config.emergencyRecovery.enabled) {
        requiredThreshold =
          config.emergencyRecovery.emergencyThreshold || config.threshold;
      }

      // Create reconstruction request
      const requestId = PrivacyUtils.generateSecureUUID();
      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

      const encryptedFamilyId =
        await PrivacyUtils.encryptSensitiveData(familyId);
      const encryptedRequesterId =
        await PrivacyUtils.encryptSensitiveData(requesterId);
      const encryptedKeyId = await PrivacyUtils.encryptSensitiveData(keyId);

      await db.query(
        `
        INSERT INTO family_key_reconstruction_requests (
          request_id, encrypted_family_id, family_salt, family_iv, family_tag,
          encrypted_key_id, key_salt, key_iv, key_tag,
          encrypted_requester_id, requester_salt, requester_iv, requester_tag,
          reason, required_threshold, current_signatures, guardian_responses,
          status, created_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      `,
        [
          requestId,
          encryptedFamilyId.encrypted,
          encryptedFamilyId.salt,
          encryptedFamilyId.iv,
          encryptedFamilyId.tag,
          encryptedKeyId.encrypted,
          encryptedKeyId.salt,
          encryptedKeyId.iv,
          encryptedKeyId.tag,
          encryptedRequesterId.encrypted,
          encryptedRequesterId.salt,
          encryptedRequesterId.iv,
          encryptedRequesterId.tag,
          reason,
          requiredThreshold,
          JSON.stringify([]),
          JSON.stringify([]),
          "pending",
          new Date().toISOString(),
          expiresAt.toISOString(),
        ],
      );

      // Get available guardians
      const guardianIds = config.shareDistribution.map((d: { guardianId: string }) => d.guardianId);

      return {
        success: true,
        data: {
          requestId,
          requiredThreshold,
          availableGuardians: guardianIds,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to request key reconstruction: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Guardian provides their share for reconstruction
   */
  static async provideGuardianShare(params: {
    requestId: string;
    guardianId: string;
    shareIndices: number[];
    deviceInfo?: any;
  }): Promise<{
    success: boolean;
    data?: {
      sharesProvided: number;
      thresholdMet: boolean;
      remainingNeeded: number;
    };
    error?: string;
  }> {
    try {
      const { requestId, guardianId, shareIndices, deviceInfo } = params;

      // Get reconstruction request
      const requestResult = await db.query(
        `
        SELECT * FROM family_key_reconstruction_requests WHERE request_id = $1
      `,
        [requestId],
      );

      if (requestResult.rows.length === 0) {
        return { success: false, error: "Reconstruction request not found" };
      }

      const request = requestResult.rows[0];

      if (request.status !== "pending") {
        return { success: false, error: "Request is no longer pending" };
      }

      if (new Date(request.expires_at) < new Date()) {
        return { success: false, error: "Request has expired" };
      }

      // Decrypt family ID to get shares
      const familyId = await PrivacyUtils.decryptSensitiveData({
        encrypted: request.encrypted_family_id,
        salt: request.family_salt,
        iv: request.family_iv,
        tag: request.family_tag,
      });

      // Get guardian shares
      const shares = await this.getGuardianShares(
        guardianId,
        familyId,
        shareIndices,
      );

      if (shares.length === 0) {
        return { success: false, error: "No shares found for guardian" };
      }

      // Update guardian responses
      const guardianResponses = JSON.parse(request.guardian_responses || "[]");
      const existingResponse = guardianResponses.find(
        (r: any) => r.guardianId === guardianId,
      );

      if (existingResponse) {
        return {
          success: false,
          error: "Guardian has already provided shares",
        };
      }

      // Create SHA-256 hash using Web Crypto API
      const createHash = async (data: string): Promise<string> => {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      };

      guardianResponses.push({
        guardianId,
        approved: true,
        shareProvided: true,
        timestamp: new Date(),
        deviceInfo: deviceInfo
          ? {
              userAgent: deviceInfo.userAgent
                ? await createHash(deviceInfo.userAgent)
                : "",
              ipAddress: deviceInfo.ipAddress
                ? await createHash(deviceInfo.ipAddress)
                : "",
            }
          : undefined,
      });

      // Check if threshold is met
      const approvedShares = guardianResponses.filter(
        (r: any) => r.shareProvided,
      ).length;
      const thresholdMet = approvedShares >= request.required_threshold;
      const newStatus = thresholdMet ? "threshold_met" : "pending";

      // Update request
      await db.query(
        `
        UPDATE family_key_reconstruction_requests 
        SET guardian_responses = $1, status = $2
        WHERE request_id = $3
      `,
        [JSON.stringify(guardianResponses), newStatus, requestId],
      );

      return {
        success: true,
        data: {
          sharesProvided: shares.length,
          thresholdMet,
          remainingNeeded: Math.max(
            0,
            request.required_threshold - approvedShares,
          ),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to provide guardian share: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Get guardian shares for reconstruction
   */
  private static async getGuardianShares(
    guardianId: string,
    familyId: string,
    shareIndices: number[],
  ): Promise<SecretShare[]> {
    const encryptedGuardianId =
      await PrivacyUtils.encryptSensitiveData(guardianId);
    const encryptedFamilyId = await PrivacyUtils.encryptSensitiveData(familyId);

    const result = await db.query(
      `
      SELECT * FROM secure_guardian_shards 
      WHERE encrypted_guardian_id = $1 AND encrypted_federation_id = $2 AND shard_index = ANY($3)
    `,
      [
        encryptedGuardianId.encrypted,
        encryptedFamilyId.encrypted,
        JSON.stringify(shareIndices),
      ],
    );

    const shares: SecretShare[] = [];

    for (const row of result.rows) {
      try {
        // Use double decryption for guardian shares - each layer has unique salts
        const decryptedShareData =
          await PrivacyUtils.doubleDecryptSensitiveData({
            doubleEncrypted: row.double_encrypted_shard,
            doubleSalt: row.double_salt,
            doubleIv: row.double_iv,
            doubleTag: row.double_tag,
          });

        const shareData = JSON.parse(decryptedShareData);
        shares.push({
          shareId: shareData.shareId,
          shareIndex: shareData.shareIndex,
          shareValue: new Uint8Array(shareData.shareValue),
          threshold: shareData.threshold,
          totalShares: shareData.totalShares,
          createdAt: new Date(row.created_at),
          expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
          metadata: shareData.metadata,
        });
      } catch (decryptError) {
        console.warn(
          `Failed to decrypt double-encrypted share for guardian ${guardianId}:`,
          decryptError,
        );
      }
    }

    return shares;
  }

  /**
   * Get family configuration
   */
  private static async getFamilyConfig(familyId: string): Promise<{
    success: boolean;
    data?: FamilySSLConfig;
    error?: string;
  }> {
    try {
      const encryptedFamilyId =
        await PrivacyUtils.encryptSensitiveData(familyId);

      const result = await db.query(
        `
        SELECT * FROM secure_family_nostr_protection 
        WHERE encrypted_family_member_id = $1 OR encrypted_user_id = $1
        LIMIT 1
      `,
        [encryptedFamilyId.encrypted],
      );

      if (result.rows.length === 0) {
        return { success: false, error: "Family configuration not found" };
      }

      const row = result.rows[0];
      const decryptedConfig = await PrivacyUtils.decryptSensitiveData({
        encrypted: row.encrypted_federation_id,
        salt: row.federation_salt,
        iv: row.federation_iv,
        tag: row.federation_tag,
      });

      const config: FamilySSLConfig = JSON.parse(decryptedConfig);

      return { success: true, data: config };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get family config: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Reconstruct key when threshold is met (for signing operations)
   */
  static async reconstructKeyForSigning(params: {
    requestId: string;
    operation: "sign_event" | "key_rotation" | "recovery";
  }): Promise<{
    success: boolean;
    data?: {
      nsec: string;
      expiresIn: number; // milliseconds
    };
    error?: string;
  }> {
    try {
      const { requestId, operation } = params;

      // Get reconstruction request
      const requestResult = await db.query(
        `
        SELECT * FROM family_key_reconstruction_requests WHERE request_id = $1
      `,
        [requestId],
      );

      if (requestResult.rows.length === 0) {
        return { success: false, error: "Reconstruction request not found" };
      }

      const request = requestResult.rows[0];

      if (request.status !== "threshold_met") {
        return {
          success: false,
          error: "Threshold not yet met for reconstruction",
        };
      }

      // Decrypt family ID
      const familyId = await PrivacyUtils.decryptSensitiveData({
        encrypted: request.encrypted_family_id,
        salt: request.family_salt,
        iv: request.family_iv,
        tag: request.family_tag,
      });

      // Get all guardian responses that provided shares
      const guardianResponses = JSON.parse(request.guardian_responses || "[]");
      const approvedResponses = guardianResponses.filter(
        (r: any) => r.shareProvided,
      );

      // Collect shares from all approved guardians
      const allShares: SecretShare[] = [];

      for (const response of approvedResponses) {
        const guardianShares = await this.getGuardianShares(
          response.guardianId,
          familyId,
          [], // Get all shares for this guardian
        );
        allShares.push(...guardianShares);
      }

      if (allShares.length < request.required_threshold) {
        return {
          success: false,
          error: "Insufficient shares for reconstruction",
        };
      }

      // Reconstruct the private key
      const nsec =
        await NostrShamirSecretSharing.reconstructNsecFromShares(allShares);

      // Mark request as completed
      await db.query(
        `
        UPDATE family_key_reconstruction_requests 
        SET status = 'completed', completed_at = NOW()
        WHERE request_id = $1
      `,
        [requestId],
      );

      // Log the reconstruction
      PrivacyUtils.logPrivacyOperation({
        action: "decrypt",
        dataType: "nsec",
        userId: request.encrypted_requester_id,
        familyId,
        success: true,
      });

      // Return key with short expiration for security
      const expiresIn =
        operation === "sign_event" ? 5 * 60 * 1000 : 30 * 60 * 1000; // 5 min for signing, 30 min for rotation

      return {
        success: true,
        data: {
          nsec,
          expiresIn,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to reconstruct key: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }
}

// Add the missing table to schema if needed
export const GUARDIAN_RECONSTRUCTION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS family_key_reconstruction_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id TEXT NOT NULL UNIQUE,
    
    encrypted_family_id TEXT NOT NULL,
    family_salt TEXT NOT NULL,
    family_iv TEXT NOT NULL,
    family_tag TEXT NOT NULL,
    
    encrypted_key_id TEXT NOT NULL,
    key_salt TEXT NOT NULL,
    key_iv TEXT NOT NULL,
    key_tag TEXT NOT NULL,
    
    encrypted_requester_id TEXT NOT NULL,
    requester_salt TEXT NOT NULL,
    requester_iv TEXT NOT NULL,
    requester_tag TEXT NOT NULL,
    
    reason TEXT NOT NULL CHECK (reason IN ('key_rotation', 'recovery', 'inheritance', 'emergency', 'signing')),
    required_threshold INTEGER NOT NULL,
    current_signatures JSONB NOT NULL DEFAULT '[]',
    guardian_responses JSONB NOT NULL DEFAULT '[]',
    
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'threshold_met', 'completed', 'failed', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit fields
    ip_address_hash TEXT,
    user_agent_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_reconstruction_requests_request_id ON family_key_reconstruction_requests(request_id);
CREATE INDEX IF NOT EXISTS idx_reconstruction_requests_status ON family_key_reconstruction_requests(status);
CREATE INDEX IF NOT EXISTS idx_reconstruction_requests_expires_at ON family_key_reconstruction_requests(expires_at);
`;
