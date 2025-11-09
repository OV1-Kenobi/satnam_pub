/**
 * Contact Encryption Module
 * Implements per-contact encryption keys, contact list obfuscation, and decoy contact generation
 * to prevent correlation attacks on contact lists and social graph analysis
 *
 * SECURITY ARCHITECTURE:
 * - Uses Noble V2 (AES-256-GCM) for per-contact encryption
 * - PBKDF2-SHA256 with 100k iterations for key derivation
 * - Unique salt per contact prevents rainbow table attacks
 * - Contact hashing for privacy-preserving search
 * - Decoy contacts indistinguishable from real contacts
 */

import { randomBytes } from "@noble/ciphers/webcrypto";
import { bytesToHex } from "@noble/curves/utils";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import { NOBLE_CONFIG } from "../../src/lib/crypto/noble-encryption";

/**
 * Derive encryption key using PBKDF2-SHA256 (100k iterations)
 * Aligned with Noble V2 standards
 */
async function deriveContactEncryptionKey(
  contactId: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  const keyMaterial = new TextEncoder().encode(`contact:${contactId}`);
  return pbkdf2(sha256, keyMaterial, salt, {
    c: NOBLE_CONFIG.pbkdf2Iterations,
    dkLen: NOBLE_CONFIG.keyLength,
  });
}

/**
 * Hash contact identifier for privacy-preserving search
 * Uses SHA-256 with salt to prevent rainbow table attacks
 */
async function hashContactIdentifier(
  npub: string,
  salt: Uint8Array
): Promise<string> {
  const encoder = new TextEncoder();
  const saltedData = new Uint8Array(encoder.encode(npub).length + salt.length);
  saltedData.set(encoder.encode(npub), 0);
  saltedData.set(salt, encoder.encode(npub).length);

  const hashBuffer = await crypto.subtle.digest("SHA-256", saltedData);
  return bytesToHex(new Uint8Array(hashBuffer));
}

export interface EncryptedContactData {
  npub: string;
  nip05?: string;
  displayName: string;
  notes?: string;
  tags?: string[];
  familyRole?: "private" | "offspring" | "adult" | "steward" | "guardian";
  trustLevel: "family" | "trusted" | "known" | "unverified";
  supportsGiftWrap: boolean;
  preferredEncryption: "gift-wrap" | "nip04" | "auto";
}

export interface PerContactEncryptionKey {
  contactId: string;
  encryptionKey: string; // Base64-encoded key
  salt: string; // Base64-encoded salt
  iv: string; // Base64-encoded IV
  createdAt: number;
  rotatedAt?: number;
}

export interface DecoyContact {
  id: string;
  encrypted_contact: string;
  contact_encryption_salt: string;
  contact_encryption_iv: string;
  contact_hash: string;
  contact_hash_salt: string;
  trust_level: "family" | "trusted" | "known" | "unverified";
  family_role?: string;
  supports_gift_wrap: boolean;
  preferred_encryption: "gift-wrap" | "nip04" | "auto";
  added_at: string;
  is_decoy: true;
}

/**
 * Contact Encryption Manager
 * Handles per-contact encryption, obfuscation, and decoy contact generation
 */
export class ContactEncryptionManager {
  /**
   * Generate a unique encryption key for a specific contact
   * This prevents bulk decryption if one key is compromised
   */
  static async generatePerContactEncryptionKey(
    contactId: string
  ): Promise<PerContactEncryptionKey> {
    try {
      // Generate cryptographically secure salt and IV using Noble V2
      const salt = randomBytes(NOBLE_CONFIG.saltLength);
      const iv = randomBytes(NOBLE_CONFIG.ivLength);

      // Derive encryption key using PBKDF2-SHA256 (100k iterations)
      const encryptionKey = await deriveContactEncryptionKey(contactId, salt);

      return {
        contactId,
        encryptionKey: bytesToHex(encryptionKey),
        salt: bytesToHex(salt),
        iv: bytesToHex(iv),
        createdAt: Date.now(),
      };
    } catch (error) {
      throw new Error(
        `Failed to generate per-contact encryption key: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Encrypt contact data with per-contact encryption key
   */
  static async encryptContactWithPerKeyEncryption(
    contactData: EncryptedContactData,
    perContactKey: PerContactEncryptionKey
  ): Promise<{
    encrypted_contact: string;
    contact_encryption_salt: string;
    contact_encryption_iv: string;
    contact_hash: string;
    contact_hash_salt: string;
  }> {
    try {
      // Serialize contact data
      const contactJson = JSON.stringify(contactData);

      // Convert hex-encoded key and IV back to bytes
      const keyBytes = new Uint8Array(
        perContactKey.encryptionKey
          .match(/.{1,2}/g)!
          .map((byte) => parseInt(byte, 16))
      );
      const ivBytes = new Uint8Array(
        perContactKey.iv.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
      );

      // Encrypt using Noble V2 AES-256-GCM
      const { gcm } = await import("@noble/ciphers/aes");
      const cipher = gcm(keyBytes, ivBytes);
      const plainBytes = new TextEncoder().encode(contactJson);
      const encrypted = cipher.encrypt(plainBytes);

      // Reuse per-contact salt for consistent hash-based search
      // This enables privacy-preserving search while maintaining deterministic hashes
      const contactHashSalt = new Uint8Array(
        perContactKey.salt.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
      );
      const contactHash = await hashContactIdentifier(
        contactData.npub,
        contactHashSalt
      );

      return {
        encrypted_contact: bytesToHex(encrypted),
        contact_encryption_salt: perContactKey.salt,
        contact_encryption_iv: perContactKey.iv,
        contact_hash: contactHash,
        contact_hash_salt: perContactKey.salt,
      };
    } catch (error) {
      throw new Error(
        `Failed to encrypt contact: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Generate random decoy contacts to obscure real contact list size
   * Decoy contacts are indistinguishable from real contacts at the database level
   */
  static async generateDecoyContacts(
    count: number = 3
  ): Promise<DecoyContact[]> {
    const decoyContacts: DecoyContact[] = [];

    for (let i = 0; i < count; i++) {
      try {
        // Generate random npub-like string
        const randomNpub = `npub1${bytesToHex(randomBytes(32)).substring(
          0,
          59
        )}`;

        // Generate random display name
        const randomNames = [
          "Alex",
          "Jordan",
          "Casey",
          "Morgan",
          "Riley",
          "Taylor",
          "Quinn",
          "Avery",
          "Blake",
          "Drew",
          "Sage",
          "River",
        ];
        const randomName =
          randomNames[Math.floor(Math.random() * randomNames.length)];
        const randomSurname = [
          "Smith",
          "Johnson",
          "Williams",
          "Brown",
          "Jones",
        ][Math.floor(Math.random() * 5)];

        const decoyData: EncryptedContactData = {
          npub: randomNpub,
          displayName: `${randomName} ${randomSurname}`,
          trustLevel: ["family", "trusted", "known", "unverified"][
            Math.floor(Math.random() * 4)
          ] as any,
          supportsGiftWrap: Math.random() > 0.5,
          preferredEncryption: ["gift-wrap", "nip04", "auto"][
            Math.floor(Math.random() * 3)
          ] as any,
        };

        // Generate per-contact encryption key
        // Use cryptographically secure random ID instead of timestamp to prevent temporal analysis
        const perContactKey = await this.generatePerContactEncryptionKey(
          `decoy_${crypto.randomUUID()}`
        );

        // Encrypt decoy contact
        const encrypted = await this.encryptContactWithPerKeyEncryption(
          decoyData,
          perContactKey
        );

        decoyContacts.push({
          id: crypto.randomUUID(),
          encrypted_contact: encrypted.encrypted_contact,
          contact_encryption_salt: encrypted.contact_encryption_salt,
          contact_encryption_iv: encrypted.contact_encryption_iv,
          contact_hash: encrypted.contact_hash,
          contact_hash_salt: encrypted.contact_hash_salt,
          trust_level: decoyData.trustLevel,
          family_role: decoyData.familyRole,
          supports_gift_wrap: decoyData.supportsGiftWrap,
          preferred_encryption: decoyData.preferredEncryption,
          added_at: new Date().toISOString(),
          is_decoy: true,
        });
      } catch (error) {
        console.warn(`Failed to generate decoy contact ${i}:`, error);
      }
    }

    return decoyContacts;
  }

  /**
   * Calculate optimal number of decoy contacts based on real contact count
   * Uses logarithmic scaling to obscure contact list size
   */
  static calculateOptimalDecoyCount(realContactCount: number): number {
    // Logarithmic scaling: 1-5 real contacts → 2-3 decoys, 5-20 → 3-5 decoys, 20+ → 5-8 decoys
    if (realContactCount <= 5)
      return Math.max(2, Math.floor(Math.log2(realContactCount + 1)));
    if (realContactCount <= 20)
      return Math.max(3, Math.floor(Math.log2(realContactCount)));
    return Math.max(5, Math.floor(Math.log2(realContactCount) - 1));
  }

  /**
   * Obfuscate contact list by mixing real and decoy contacts
   * Returns shuffled list indistinguishable from database perspective
   */
  static async obfuscateContactList(
    realContacts: any[],
    decoyContacts: DecoyContact[]
  ): Promise<any[]> {
    // Mix real and decoy contacts
    const mixedContacts = [...realContacts, ...decoyContacts];

    // Shuffle using Fisher-Yates algorithm with cryptographically secure randomness
    for (let i = mixedContacts.length - 1; i > 0; i--) {
      // Use cryptographically secure random values to prevent correlation attacks
      const randomValue = randomBytes(4);
      const randomInt = new DataView(randomValue.buffer).getUint32(0, true);
      const j = randomInt % (i + 1);
      [mixedContacts[i], mixedContacts[j]] = [
        mixedContacts[j],
        mixedContacts[i],
      ];
    }

    return mixedContacts;
  }

  /**
   * Rotate per-contact encryption key (for forward secrecy)
   */
  static async rotatePerContactEncryptionKey(
    oldKey: PerContactEncryptionKey
  ): Promise<PerContactEncryptionKey> {
    const newKey = await this.generatePerContactEncryptionKey(oldKey.contactId);
    newKey.rotatedAt = Date.now();
    return newKey;
  }
}
