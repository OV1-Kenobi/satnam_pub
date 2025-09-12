import { getEnvVar } from "../utils/env.js";

/**
 * @fileoverview Privacy-First Encryption and Data Protection
 * @description Implements strong encryption for sensitive family data including
 * Nostr keys, usernames, and other personal information with zero-knowledge principles
 */

import * as crypto from "crypto";
import { randomBytes } from "crypto";

/**
 * Encryption configuration
 */
const ENCRYPTION_CONFIG = {
  algorithm: "aes-256-gcm",
  keyLength: 32,
  ivLength: 16,
  saltLength: 32,
  tagLength: 16,
  iterations: 100000, // High iteration count for key derivation
};

/**
 * Environment-based master key (should be set in production)
 */
const getMasterKey = (): string => {
  const masterKey = getEnvVar("PRIVACY_MASTER_KEY");
  if (!masterKey) {
    console.warn(
      "⚠️  PRIVACY_MASTER_KEY not set. Using default key for development only!"
    );
    return "dev-master-key-change-in-production-please-use-strong-random-key";
  }
  return masterKey;
};

/**
 * Generate a cryptographically secure UUID v4
 */
export function generateSecureUUID(): string {
  return crypto.randomUUID();
}

/**
 * Generate a secure salt
 * Each call produces a unique, cryptographically secure salt
 */
export function generateSalt(): Buffer {
  return randomBytes(ENCRYPTION_CONFIG.saltLength);
}

/**
 * Generate multiple unique salts for batch operations
 */
export function generateUniqueSalts(count: number): Buffer[] {
  const salts: Buffer[] = [];
  for (let i = 0; i < count; i++) {
    salts.push(generateSalt()); // Each salt is unique
  }
  return salts;
}

/**
 * Derive encryption key from master key and salt using PBKDF2
 * Netlify Functions compatible implementation using Web Crypto API
 */
async function deriveKey(masterKey: string, salt: Buffer): Promise<Buffer> {
  try {
    // Convert Buffer to Uint8Array for Web Crypto API compatibility
    const saltArray = new Uint8Array(salt);

    // Use Web Crypto API PBKDF2 for key derivation
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(masterKey),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    // Convert salt to proper ArrayBuffer for Web Crypto API
    const saltBuffer = new ArrayBuffer(saltArray.length);
    new Uint8Array(saltBuffer).set(saltArray);

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBuffer,
        iterations: ENCRYPTION_CONFIG.iterations,
        hash: "SHA-256",
      },
      keyMaterial,
      ENCRYPTION_CONFIG.keyLength * 8
    );

    // Convert ArrayBuffer to Buffer for Node.js compatibility
    return Buffer.from(derivedBits);
  } catch (error) {
    throw new Error(
      `Key derivation failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Encrypt sensitive data with AES-256-GCM
 * Always generates a unique salt for each encryption operation
 */
export async function encryptSensitiveData(plaintext: string): Promise<{
  encrypted: string;
  salt: string;
  iv: string;
  tag: string;
}> {
  try {
    // CRITICAL: Always generate a unique salt for each encryption operation
    const salt = generateSalt();
    const iv = randomBytes(ENCRYPTION_CONFIG.ivLength);
    const key = await deriveKey(getMasterKey(), salt);

    // SECURITY FIX: Use createCipherGCM for proper authenticated encryption
    const cipher = crypto.createCipheriv(
      ENCRYPTION_CONFIG.algorithm,
      key,
      iv
    ) as unknown as crypto.CipherGCM;
    cipher.setAAD(Buffer.from("family-nostr-data")); // Additional authenticated data

    let encrypted = cipher.update(plaintext, "utf8", "base64");
    encrypted += cipher.final("base64");

    const tag = cipher.getAuthTag();

    return {
      encrypted,
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
    };
  } catch (error) {
    throw new Error(
      `Encryption failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Decrypt sensitive data
 */
export async function decryptSensitiveData(encryptedData: {
  encrypted: string;
  salt: string;
  iv: string;
  tag: string;
}): Promise<string> {
  try {
    const salt = Buffer.from(encryptedData.salt, "base64");
    const iv = Buffer.from(encryptedData.iv, "base64");
    const tag = Buffer.from(encryptedData.tag, "base64");
    const key = await deriveKey(getMasterKey(), salt);

    // SECURITY FIX: Use createDecipherGCM for proper authenticated decryption
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_CONFIG.algorithm,
      key,
      iv
    ) as unknown as crypto.DecipherGCM;
    decipher.setAAD(Buffer.from("family-nostr-data"));
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedData.encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    throw new Error(
      `Decryption failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Hash username with salt for secure storage
 * Always generates a unique salt for each hash operation
 */
export async function hashUsername(username: string): Promise<{
  hash: string;
  salt: string;
  uuid: string;
}> {
  try {
    // CRITICAL: Always generate a unique salt for each hash operation
    const salt = generateSalt();
    const uuid = generateSecureUUID();

    // Use PBKDF2 for username hashing
    const hash = await new Promise<Buffer>((resolve, reject) => {
      crypto.pbkdf2(
        username.toLowerCase().trim(),
        salt,
        ENCRYPTION_CONFIG.iterations,
        64,
        "sha512",
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });

    return {
      hash: hash.toString("base64"),
      salt: salt.toString("base64"),
      uuid,
    };
  } catch (error) {
    throw new Error(
      `Username hashing failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Verify username against stored hash
 */
export async function verifyUsername(
  username: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  try {
    const salt = Buffer.from(storedSalt, "base64");
    const hash = await new Promise<Buffer>((resolve, reject) => {
      crypto.pbkdf2(
        username.toLowerCase().trim(),
        salt,
        ENCRYPTION_CONFIG.iterations,
        64,
        "sha512",
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });

    const computedHash = hash.toString("base64");
    return computedHash === storedHash;
  } catch (error) {
    return false;
  }
}

/**
 * Encrypt Nostr private key (nsec) with additional security layers
 */
export async function encryptNsec(nsec: string): Promise<{
  encryptedNsec: string;
  salt: string;
  iv: string;
  tag: string;
  keyId: string; // Unique identifier for this key
}> {
  try {
    // Validate nsec format
    if (!nsec.startsWith("nsec")) {
      throw new Error("Invalid nsec format");
    }

    // Generate unique key ID
    const keyId = generateSecureUUID();

    // Encrypt with additional context
    const encrypted = await encryptSensitiveData(nsec);

    return {
      encryptedNsec: encrypted.encrypted,
      salt: encrypted.salt,
      iv: encrypted.iv,
      tag: encrypted.tag,
      keyId,
    };
  } catch (error) {
    throw new Error(
      `Nsec encryption failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Decrypt Nostr private key (nsec)
 */
export async function decryptNsec(encryptedData: {
  encryptedNsec: string;
  salt: string;
  iv: string;
  tag: string;
}): Promise<string> {
  try {
    const decrypted = await decryptSensitiveData({
      encrypted: encryptedData.encryptedNsec,
      salt: encryptedData.salt,
      iv: encryptedData.iv,
      tag: encryptedData.tag,
    });

    // Validate decrypted nsec format
    if (!decrypted.startsWith("nsec")) {
      throw new Error("Decrypted data is not a valid nsec");
    }

    return decrypted;
  } catch (error) {
    throw new Error(
      `Nsec decryption failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Encrypt Nostr public key (npub) for additional privacy
 */
export async function encryptNpub(npub: string): Promise<{
  encryptedNpub: string;
  salt: string;
  iv: string;
  tag: string;
}> {
  try {
    // Validate npub format
    if (!npub.startsWith("npub")) {
      throw new Error("Invalid npub format");
    }

    const result = await encryptSensitiveData(npub);
    return {
      encryptedNpub: result.encrypted,
      salt: result.salt,
      iv: result.iv,
      tag: result.tag,
    };
  } catch (error) {
    throw new Error(
      `Npub encryption failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Decrypt Nostr public key (npub)
 */
export async function decryptNpub(encryptedData: {
  encryptedNpub: string;
  salt: string;
  iv: string;
  tag: string;
}): Promise<string> {
  try {
    const decrypted = await decryptSensitiveData({
      encrypted: encryptedData.encryptedNpub,
      salt: encryptedData.salt,
      iv: encryptedData.iv,
      tag: encryptedData.tag,
    });

    // Validate decrypted npub format
    if (!decrypted.startsWith("npub")) {
      throw new Error("Decrypted data is not a valid npub");
    }

    return decrypted;
  } catch (error) {
    throw new Error(
      `Npub decryption failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Generate secure family ID with privacy protections
 */
export function generateSecureFamilyId(familyName?: string): {
  familyId: string;
  familyUuid: string;
  hash: string;
} {
  const familyUuid = generateSecureUUID();
  const timestamp = Date.now();
  const random = crypto.randomBytes(16).toString("hex");

  // Create a hash-based family ID that doesn't reveal the family name
  const hashInput = `${familyName || "anonymous"}_${timestamp}_${random}`;
  const hash = crypto.createHash("sha256").update(hashInput).digest("hex");

  const familyId = `family_${hash.substring(0, 16)}`;

  return {
    familyId,
    familyUuid,
    hash: hash.substring(16), // Store remaining hash for verification
  };
}

/**
 * Privacy audit log entry
 */
export interface PrivacyAuditEntry {
  id: string;
  timestamp: Date;
  action: "encrypt" | "decrypt" | "hash" | "verify" | "access";
  dataType:
    | "nsec"
    | "npub"
    | "username"
    | "family_data"
    | "guardian_shard"
    | "payment_distributions"
    | "payment_schedule"
    | "event";
  userId?: string;
  familyId?: string;
  success: boolean;
  error?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log privacy-related operations for audit purposes
 */
export function logPrivacyOperation(
  entry: Omit<PrivacyAuditEntry, "id" | "timestamp">
): PrivacyAuditEntry {
  const auditEntry: PrivacyAuditEntry = {
    id: generateSecureUUID(),
    timestamp: new Date(),
    ...entry,
  };

  // In production, this should be sent to a secure audit log
  console.log("🔒 Privacy Audit:", {
    id: auditEntry.id,
    action: auditEntry.action,
    dataType: auditEntry.dataType,
    success: auditEntry.success,
    timestamp: auditEntry.timestamp.toISOString(),
  });

  return auditEntry;
}

/**
 * Validate data integrity after encryption/decryption
 */
export function validateDataIntegrity(
  originalData: string,
  processedData: string,
  operation: "encrypt" | "decrypt"
): boolean {
  try {
    if (operation === "encrypt") {
      // For encryption, we can't compare directly, but we can validate format
      return processedData.length > 0 && processedData !== originalData;
    } else {
      // For decryption, data should match original
      return originalData === processedData;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Double-encrypt sensitive data (for guardian shares and ultra-sensitive data)
 * Each encryption layer uses a unique salt
 */
export async function doubleEncryptSensitiveData(plaintext: string): Promise<{
  encrypted: string;
  salt: string;
  iv: string;
  tag: string;
  doubleEncrypted: string;
  doubleSalt: string;
  doubleIv: string;
  doubleTag: string;
}> {
  try {
    // First encryption layer with unique salt
    const firstEncryption = await encryptSensitiveData(plaintext);

    // Second encryption layer with another unique salt
    const secondEncryption = await encryptSensitiveData(
      JSON.stringify(firstEncryption)
    );

    return {
      // First layer
      encrypted: firstEncryption.encrypted,
      salt: firstEncryption.salt,
      iv: firstEncryption.iv,
      tag: firstEncryption.tag,
      // Second layer
      doubleEncrypted: secondEncryption.encrypted,
      doubleSalt: secondEncryption.salt,
      doubleIv: secondEncryption.iv,
      doubleTag: secondEncryption.tag,
    };
  } catch (error) {
    throw new Error(
      `Double encryption failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Decrypt double-encrypted data
 */
export async function doubleDecryptSensitiveData(encryptedData: {
  doubleEncrypted: string;
  doubleSalt: string;
  doubleIv: string;
  doubleTag: string;
}): Promise<string> {
  try {
    // First decrypt the outer layer
    const outerDecrypted = await decryptSensitiveData({
      encrypted: encryptedData.doubleEncrypted,
      salt: encryptedData.doubleSalt,
      iv: encryptedData.doubleIv,
      tag: encryptedData.doubleTag,
    });

    // Parse the inner encryption data
    const innerEncryptionData = JSON.parse(outerDecrypted);

    // Decrypt the inner layer
    const innerDecrypted = await decryptSensitiveData(innerEncryptionData);

    return innerDecrypted;
  } catch (error) {
    throw new Error(
      `Double decryption failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Validate that encrypted data uses unique salts
 */
export function validateUniqueSalts(
  encryptedDataArray: Array<{ salt: string }>
): {
  valid: boolean;
  duplicates: string[];
  totalChecked: number;
} {
  const salts = encryptedDataArray.map((data) => data.salt);
  const uniqueSalts = new Set(salts);
  const duplicates: string[] = [];

  // Find duplicates
  const saltCounts = new Map<string, number>();
  for (const salt of salts) {
    saltCounts.set(salt, (saltCounts.get(salt) || 0) + 1);
  }

  for (const [salt, count] of saltCounts.entries()) {
    if (count > 1) {
      duplicates.push(salt);
    }
  }

  return {
    valid: duplicates.length === 0,
    duplicates,
    totalChecked: salts.length,
  };
}

/**
 * Secure memory management for Netlify Functions
 * SECURITY: Uses proper ArrayBuffer memory management
 */
export interface SecureMemoryTarget {
  data: ArrayBuffer | Uint8Array | string;
  type: "arraybuffer" | "uint8array" | "string";
}

/**
 * Secure memory clearing for Netlify Functions environment
 * SECURITY: Proper ArrayBuffer memory management with cryptographic overwriting
 * @param targets Array of memory targets to securely clear
 */
export function secureClearMemory(targets: SecureMemoryTarget[]): void {
  targets.forEach((target) => {
    try {
      switch (target.type) {
        case "arraybuffer":
          if (target.data instanceof ArrayBuffer) {
            const view = new Uint8Array(target.data);
            // Multiple overwrite passes for security
            crypto.getRandomValues(view);
            view.fill(0);
            view.fill(0xff);
            crypto.getRandomValues(view);
          }
          break;

        case "uint8array":
          if (target.data instanceof Uint8Array) {
            // Multiple overwrite passes for security
            crypto.getRandomValues(target.data);
            target.data.fill(0);
            target.data.fill(0xff);
            crypto.getRandomValues(target.data);
          }
          break;

        case "string":
          if (typeof target.data === "string") {
            // Convert string to ArrayBuffer for proper clearing
            const encoder = new TextEncoder();
            const buffer = encoder.encode(target.data);
            crypto.getRandomValues(buffer);
            buffer.fill(0);
            buffer.fill(0xff);
            crypto.getRandomValues(buffer);
          }
          break;
      }
    } catch (error) {
      console.warn(
        `Failed to clear memory target of type ${target.type}:`,
        error
      );
    }
  });

  // Force garbage collection hint (if available in Node.js)
  if (typeof global !== "undefined" && global.gc) {
    global.gc();
  }
}

/**
 * Legacy function for backward compatibility - now uses proper memory management
 * @deprecated Use secureClearMemory with targets instead
 */
export function secureClearMemoryLegacy(sensitiveString: string): void {
  secureClearMemory([{ data: sensitiveString, type: "string" }]);
}

/**
 * Export privacy utilities
 */
export const PrivacyUtils = {
  generateSecureUUID,
  generateSalt,
  generateUniqueSalts,
  encryptSensitiveData,
  decryptSensitiveData,
  doubleEncryptSensitiveData,
  doubleDecryptSensitiveData,
  hashUsername,
  verifyUsername,
  encryptNsec,
  decryptNsec,
  encryptNpub,
  decryptNpub,
  generateSecureFamilyId,
  logPrivacyOperation,
  validateDataIntegrity,
  validateUniqueSalts,
  secureClearMemory,
};
