/**
 * @fileoverview Secure Share Encryption and Management
 * @description Password-based share encryption using AES-256-GCM with PBKDF2
 * @compliance Browser-compatible, individual password protection, secure storage
 */

import {
  CryptoOperationResult,
  DEFAULT_ENCRYPTION_CONFIG,
  InvitationData,
  MemoryWipeTarget,
  SecureShare,
  TrustParticipant,
} from "../../types/zero-knowledge-nsec";
import { CryptoUtils } from "./crypto-utils";
import { type PolynomialShare } from "./polynomial";

/**
 * Encryption result interface
 * @description Result of share encryption operation
 */
interface EncryptionResult {
  /** Encrypted share data in hex format */
  encryptedShare: string;
  /** Salt used for key derivation */
  salt: string;
  /** Initialization vector for AES-GCM */
  iv: string;
  /** Authentication tag for integrity verification */
  authTag: string;
}

/**
 * Decryption context interface
 * @description Context needed for share decryption
 */
interface DecryptionContext {
  /** Participant UUID */
  participantUUID: string;
  /** Password for decryption */
  password: string;
  /** Encrypted share data */
  encryptedData: SecureShare;
}

/**
 * Share validation result interface
 * @description Result of share validation
 */
interface ShareValidation {
  /** Whether the share is valid */
  isValid: boolean;
  /** Validation errors */
  errors: string[];
  /** Integrity score (0-100) */
  integrityScore: number;
}

/**
 * ShareEncryption class - Core share encryption operations
 * @description Handles secure encryption and decryption of polynomial shares
 * @security Uses AES-256-GCM with PBKDF2 key derivation
 */
class ShareEncryption {
  private static readonly SALT_LENGTH = 16;
  private static readonly IV_LENGTH = 12;
  private static readonly AUTH_TAG_LENGTH = 16;
  private static readonly PBKDF2_ITERATIONS =
    DEFAULT_ENCRYPTION_CONFIG.pbkdf2Iterations;

  /**
   * Encrypt a single share with password
   * @param share Polynomial share to encrypt
   * @param password Password for encryption
   * @param participantUUID Participant identifier
   * @returns Encrypted secure share
   */
  static async encryptShare(
    share: PolynomialShare,
    password: string,
    participantUUID: string
  ): Promise<SecureShare> {
    try {
      // Validate password strength
      const passwordValidation = CryptoUtils.validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        throw new Error(
          `Weak password: ${passwordValidation.errors.join(", ")}`
        );
      }

      // Generate salt and IV
      const salt = CryptoUtils.generateSecureRandom(this.SALT_LENGTH);
      const iv = CryptoUtils.generateSecureRandom(this.IV_LENGTH);

      // Derive encryption key from password
      const encryptionKey = await CryptoUtils.deriveKeyFromPassword(
        password,
        salt
      );

      // Prepare share data for encryption
      const shareData = JSON.stringify({
        x: share.x.toString(16),
        y: share.y.toString(16),
        publicShare: share.publicShare,
        participantUUID,
        timestamp: Date.now(),
      });

      // Encrypt share data
      const { ciphertext, authTag } = await CryptoUtils.encryptAESGCM(
        shareData,
        encryptionKey,
        iv
      );

      return {
        participantUUID,
        encryptedShare: CryptoUtils.bytesToHex(ciphertext),
        shareIndex: Number(share.x),
        salt: CryptoUtils.bytesToHex(salt),
        iv: CryptoUtils.bytesToHex(iv),
        authTag: CryptoUtils.bytesToHex(authTag),
        createdAt: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to encrypt share: ${error}`);
    }
  }

  /**
   * Decrypt a share with password
   * @param context Decryption context
   * @returns Decrypted polynomial share
   */
  static async decryptShare(
    context: DecryptionContext
  ): Promise<PolynomialShare> {
    try {
      const { password, encryptedData } = context;

      // Convert hex strings back to bytes
      const salt = CryptoUtils.hexToBytes(encryptedData.salt);
      const iv = CryptoUtils.hexToBytes(encryptedData.iv);
      const ciphertext = CryptoUtils.hexToBytes(encryptedData.encryptedShare);
      const authTag = CryptoUtils.hexToBytes(encryptedData.authTag);

      // Derive decryption key from password
      const decryptionKey = await CryptoUtils.deriveKeyFromPassword(
        password,
        salt
      );

      // Decrypt share data
      const decryptedData = await CryptoUtils.decryptAESGCM(
        ciphertext,
        authTag,
        decryptionKey,
        iv
      );

      // Parse decrypted share
      const shareData = JSON.parse(decryptedData);

      return {
        x: BigInt("0x" + shareData.x),
        y: BigInt("0x" + shareData.y),
        publicShare: shareData.publicShare,
      };
    } catch (error) {
      throw new Error(
        "Failed to decrypt share: invalid password or corrupted data"
      );
    }
  }

  /**
   * Encrypt shares for multiple participants
   * @param shares Array of polynomial shares
   * @param participants Array of trust participants
   * @param founderPassword Founder's password
   * @param founderUUID Founder's UUID
   * @returns Array of encrypted secure shares
   */
  static async encryptSharesForParticipants(
    shares: PolynomialShare[],
    participants: TrustParticipant[],
    founderPassword: string,
    founderUUID: string
  ): Promise<SecureShare[]> {
    try {
      if (shares.length !== participants.length + 1) {
        throw new Error(
          "Share count must match participant count plus founder"
        );
      }

      const encryptedShares: SecureShare[] = [];

      // Encrypt founder's share
      const founderShare = shares[0];
      const founderEncrypted = await this.encryptShare(
        founderShare,
        founderPassword,
        founderUUID
      );
      encryptedShares.push(founderEncrypted);

      // Encrypt participant shares
      for (let i = 0; i < participants.length; i++) {
        const participant = participants[i];
        const share = shares[i + 1]; // Skip founder's share

        // Generate temporary password for invitation if not provided
        const tempPassword =
          participant.invitationCode || CryptoUtils.generateTemporaryPassword();

        // Update participant with invitation code
        participant.invitationCode = tempPassword;
        participant.shareIndex = Number(share.x);

        const encryptedShare = await this.encryptShare(
          share,
          tempPassword,
          participant.saltedUUID || `pending_${i}`
        );

        encryptedShares.push(encryptedShare);
      }

      return encryptedShares;
    } catch (error) {
      throw new Error(`Failed to encrypt shares for participants: ${error}`);
    }
  }

  /**
   * Batch decrypt shares for reconstruction
   * @param contexts Array of decryption contexts
   * @returns Array of decrypted polynomial shares
   */
  static async batchDecryptShares(
    contexts: DecryptionContext[]
  ): Promise<PolynomialShare[]> {
    const decryptedShares: PolynomialShare[] = [];
    const errors: string[] = [];

    for (const context of contexts) {
      try {
        const decryptedShare = await this.decryptShare(context);
        decryptedShares.push(decryptedShare);
      } catch (error) {
        errors.push(
          `Failed to decrypt share for ${context.participantUUID}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(`Decryption errors: ${errors.join("; ")}`);
    }

    return decryptedShares;
  }

  /**
   * Verify encrypted share integrity
   * @param encryptedShare Encrypted share to verify
   * @returns Share validation result
   */
  static async verifyEncryptedShare(
    encryptedShare: SecureShare
  ): Promise<ShareValidation> {
    const errors: string[] = [];
    let integrityScore = 0;

    try {
      // Verify hex format
      if (!CryptoUtils.isValidHex(encryptedShare.encryptedShare)) {
        errors.push("Invalid encrypted share format");
      } else {
        integrityScore += 20;
      }

      if (!CryptoUtils.isValidHex(encryptedShare.salt)) {
        errors.push("Invalid salt format");
      } else {
        integrityScore += 20;
      }

      if (!CryptoUtils.isValidHex(encryptedShare.iv)) {
        errors.push("Invalid IV format");
      } else {
        integrityScore += 20;
      }

      if (!CryptoUtils.isValidHex(encryptedShare.authTag)) {
        errors.push("Invalid auth tag format");
      } else {
        integrityScore += 20;
      }

      // Verify lengths
      if (encryptedShare.salt.length !== this.SALT_LENGTH * 2) {
        errors.push(
          `Invalid salt length: expected ${this.SALT_LENGTH * 2}, got ${
            encryptedShare.salt.length
          }`
        );
      }

      if (encryptedShare.iv.length !== this.IV_LENGTH * 2) {
        errors.push(
          `Invalid IV length: expected ${this.IV_LENGTH * 2}, got ${
            encryptedShare.iv.length
          }`
        );
      }

      if (encryptedShare.authTag.length !== this.AUTH_TAG_LENGTH * 2) {
        errors.push(
          `Invalid auth tag length: expected ${this.AUTH_TAG_LENGTH * 2}, got ${
            encryptedShare.authTag.length
          }`
        );
      }

      // Verify share index
      if (encryptedShare.shareIndex < 1 || encryptedShare.shareIndex > 7) {
        errors.push(
          `Invalid share index: ${encryptedShare.shareIndex} (must be 1-7)`
        );
      } else {
        integrityScore += 10;
      }

      // Verify participant UUID format
      if (
        !encryptedShare.participantUUID ||
        encryptedShare.participantUUID.length < 10
      ) {
        errors.push("Invalid participant UUID");
      } else {
        integrityScore += 10;
      }

      // Verify creation timestamp
      if (
        !encryptedShare.createdAt ||
        encryptedShare.createdAt.getTime() > Date.now()
      ) {
        errors.push("Invalid creation timestamp");
      }

      return {
        isValid: errors.length === 0,
        errors,
        integrityScore: Math.min(integrityScore, 100),
      };
    } catch (error) {
      errors.push(
        `Verification failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      return {
        isValid: false,
        errors,
        integrityScore: 0,
      };
    }
  }

  /**
   * Generate share verification hash
   * @param encryptedShare Encrypted share
   * @returns Verification hash
   */
  static async generateShareHash(encryptedShare: SecureShare): Promise<string> {
    try {
      const shareData = `${encryptedShare.participantUUID}_${encryptedShare.encryptedShare}_${encryptedShare.salt}_${encryptedShare.shareIndex}`;
      return await CryptoUtils.sha256(shareData);
    } catch (error) {
      throw new Error(`Failed to generate share hash: ${error}`);
    }
  }

  /**
   * Re-encrypt share with new password
   * @param encryptedShare Existing encrypted share
   * @param oldPassword Current password
   * @param newPassword New password
   * @returns Re-encrypted share
   */
  static async reEncryptShare(
    encryptedShare: SecureShare,
    oldPassword: string,
    newPassword: string
  ): Promise<SecureShare> {
    try {
      // Decrypt with old password
      const decryptedShare = await this.decryptShare({
        participantUUID: encryptedShare.participantUUID,
        password: oldPassword,
        encryptedData: encryptedShare,
      });

      // Encrypt with new password
      return await this.encryptShare(
        decryptedShare,
        newPassword,
        encryptedShare.participantUUID
      );
    } catch (error) {
      throw new Error(`Failed to re-encrypt share: ${error}`);
    }
  }

  /**
   * Secure cleanup of decrypted shares
   * @param shares Array of polynomial shares to wipe
   */
  static secureCleanupShares(shares: PolynomialShare[]): void {
    try {
      const wipeTargets: MemoryWipeTarget[] = [];

      shares.forEach((share) => {
        wipeTargets.push(
          { data: share.x, type: "bigint" },
          { data: share.y, type: "bigint" },
          { data: share.publicShare, type: "string" }
        );
      });

      CryptoUtils.secureWipe(wipeTargets);
    } catch (error) {
      console.error("Failed to securely cleanup shares:", error);
    }
  }

  /**
   * Generate invitation data for participants
   * @param participant Trust participant
   * @param encryptedShare Encrypted share
   * @param federationName Federation name
   * @returns Invitation data as JSON string
   */
  static generateInvitationData(
    participant: TrustParticipant,
    encryptedShare: SecureShare,
    federationName: string,
    federationId?: string
  ): string {
    try {
      const invitationData: InvitationData = {
        // Required properties (contact handled via Nostr or other channels)
        recipientName: participant.displayName,
        role: participant.role,
        invitationCode: participant.invitationCode || "",
        encryptedShare: encryptedShare.encryptedShare,
        shareIndex: encryptedShare.shareIndex,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        federationId: federationId || encryptedShare.participantUUID,

        // Optional properties
        federationName,
        participantRole: participant.role,
        displayName: participant.displayName,
        instructions: [
          "1. Accept the Family Federation invitation",
          "2. Create your account using the provided invitation code",
          "3. Set a strong personal password for your share",
          "4. Complete the onboarding process",
          "5. Your encrypted share will be automatically stored securely",
        ],
        securityWarnings: [
          "Never share your invitation code with anyone",
          "Choose a strong, unique password for your share",
          "Store your password securely - it cannot be recovered",
          "Contact the Federation Founder if you have any concerns",
          "This invitation expires in 7 days",
        ],
      };

      return JSON.stringify(invitationData, null, 2);
    } catch (error) {
      throw new Error(`Failed to generate invitation data: ${error}`);
    }
  }

  /**
   * Validate invitation code format
   * @param invitationCode Code to validate
   * @returns True if valid invitation code
   */
  static validateInvitationCode(invitationCode: string): boolean {
    // Should be alphanumeric, 16 characters long
    return /^[A-Z0-9]{16}$/.test(invitationCode);
  }

  /**
   * Generate batch invitation data for multiple participants
   * @param participants Array of trust participants
   * @param encryptedShares Array of encrypted shares
   * @param federationName Federation name
   * @returns Array of invitation data
   */
  static generateBatchInvitations(
    participants: TrustParticipant[],
    encryptedShares: SecureShare[],
    federationName: string,
    federationId?: string
  ): string[] {
    try {
      const invitations: string[] = [];

      for (let i = 0; i < participants.length; i++) {
        const participant = participants[i];
        const encryptedShare = encryptedShares.find(
          (share) => share.participantUUID === participant.saltedUUID
        );

        if (encryptedShare) {
          const invitationData = this.generateInvitationData(
            participant,
            encryptedShare,
            federationName,
            federationId
          );
          invitations.push(invitationData);
        }
      }

      return invitations;
    } catch (error) {
      throw new Error(`Failed to generate batch invitations: ${error}`);
    }
  }

  /**
   * Verify share decryption without fully decrypting
   * @param encryptedShare Encrypted share
   * @param password Password to test
   * @returns True if password is correct
   */
  static async verifySharePassword(
    encryptedShare: SecureShare,
    password: string
  ): Promise<boolean> {
    try {
      await this.decryptShare({
        participantUUID: encryptedShare.participantUUID,
        password,
        encryptedData: encryptedShare,
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create backup of encrypted shares
   * @param encryptedShares Array of encrypted shares
   * @param backupPassword Password for backup encryption
   * @returns Encrypted backup data
   */
  static async createShareBackup(
    encryptedShares: SecureShare[],
    backupPassword: string
  ): Promise<CryptoOperationResult<string>> {
    try {
      // Validate backup password
      const passwordValidation =
        CryptoUtils.validatePasswordStrength(backupPassword);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          error: `Weak backup password: ${passwordValidation.errors.join(
            ", "
          )}`,
        };
      }

      // Create backup data
      const backupData = {
        shares: encryptedShares,
        createdAt: new Date(),
        version: "1.0",
      };

      // Encrypt backup
      const salt = CryptoUtils.generateSecureRandom(16);
      const iv = CryptoUtils.generateSecureRandom(12);
      const backupKey = await CryptoUtils.deriveKeyFromPassword(
        backupPassword,
        salt
      );

      const { ciphertext, authTag } = await CryptoUtils.encryptAESGCM(
        JSON.stringify(backupData),
        backupKey,
        iv
      );

      // Combine all data
      const encryptedBackup = {
        salt: CryptoUtils.bytesToHex(salt),
        iv: CryptoUtils.bytesToHex(iv),
        ciphertext: CryptoUtils.bytesToHex(ciphertext),
        authTag: CryptoUtils.bytesToHex(authTag),
      };

      return {
        success: true,
        data: JSON.stringify(encryptedBackup),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create backup: ${error}`,
      };
    }
  }

  /**
   * Restore shares from backup
   * @param backupData Encrypted backup data
   * @param backupPassword Password for backup
   * @returns Restored encrypted shares
   */
  static async restoreFromBackup(
    backupData: string,
    backupPassword: string
  ): Promise<CryptoOperationResult<SecureShare[]>> {
    try {
      // Parse backup data
      const backup = JSON.parse(backupData);

      // Extract components
      const salt = CryptoUtils.hexToBytes(backup.salt);
      const iv = CryptoUtils.hexToBytes(backup.iv);
      const ciphertext = CryptoUtils.hexToBytes(backup.ciphertext);
      const authTag = CryptoUtils.hexToBytes(backup.authTag);

      // Derive key and decrypt
      const backupKey = await CryptoUtils.deriveKeyFromPassword(
        backupPassword,
        salt
      );
      const decryptedData = await CryptoUtils.decryptAESGCM(
        ciphertext,
        authTag,
        backupKey,
        iv
      );

      // Parse restored data
      const restoredData = JSON.parse(decryptedData);

      // Convert dates back to Date objects
      const shares: SecureShare[] = restoredData.shares.map((share: any) => ({
        ...share,
        createdAt: new Date(share.createdAt),
      }));

      return {
        success: true,
        data: shares,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to restore from backup: ${error}`,
      };
    }
  }
}

export {
  ShareEncryption,
  type DecryptionContext,
  type EncryptionResult,
  type ShareValidation,
};
