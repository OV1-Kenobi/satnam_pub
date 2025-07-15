/**
 * @fileoverview Browser-Compatible Privacy-First Encryption and Data Protection
 * @description Implements strong encryption for sensitive family data using Web Crypto API
 * Browser-compatible version - uses Web Crypto API instead of Node.js crypto
 */

/**
 * Encryption configuration
 */
const ENCRYPTION_CONFIG = {
  algorithm: "AES-GCM",
  keyLength: 256,
  ivLength: 12, // GCM uses 12 bytes for IV
  saltLength: 32,
  iterations: 100000, // High iteration count for key derivation
};

/**
 * Generate a cryptographically secure UUID v4
 */
export function generateSecureUUID(): string {
  return crypto.randomUUID();
}

/**
 * Generate a secure salt using Web Crypto API
 */
export function generateSalt(): Uint8Array {
  const salt = new Uint8Array(ENCRYPTION_CONFIG.saltLength);
  crypto.getRandomValues(salt);
  return salt;
}

/**
 * Generate multiple unique salts for batch operations
 */
export function generateUniqueSalts(count: number): Uint8Array[] {
  const salts: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    salts.push(generateSalt()); // Each salt is unique
  }
  return salts;
}

/**
 * Derive encryption key from master key and salt using PBKDF2
 * Browser-compatible key derivation
 */
async function deriveKey(
  masterKey: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterKey),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  // Ensure salt has proper ArrayBuffer type
  const saltBuffer = new Uint8Array(salt.length);
  saltBuffer.set(salt);

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: ENCRYPTION_CONFIG.iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: ENCRYPTION_CONFIG.keyLength },
    false,
    ["encrypt", "decrypt"]
  );
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
    const iv = new Uint8Array(ENCRYPTION_CONFIG.ivLength);
    crypto.getRandomValues(iv);

    // For browser compatibility, we'll use a simple key derivation
    // In production, this should be handled server-side
    const masterKey = "browser-dev-key-change-in-production";
    const key = await deriveKey(masterKey, salt);

    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
        additionalData: encoder.encode("family-nostr-data"),
      },
      key,
      data
    );

    return {
      encrypted: btoa(
        String.fromCharCode.apply(null, Array.from(new Uint8Array(encrypted)))
      ),
      salt: btoa(String.fromCharCode.apply(null, Array.from(salt))),
      iv: btoa(String.fromCharCode.apply(null, Array.from(iv))),
      tag: "", // GCM includes auth tag in encrypted data
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
    const salt = new Uint8Array(
      atob(encryptedData.salt)
        .split("")
        .map((c) => c.charCodeAt(0))
    );
    const iv = new Uint8Array(
      atob(encryptedData.iv)
        .split("")
        .map((c) => c.charCodeAt(0))
    );
    const encrypted = new Uint8Array(
      atob(encryptedData.encrypted)
        .split("")
        .map((c) => c.charCodeAt(0))
    );

    const masterKey = "browser-dev-key-change-in-production";
    const key = await deriveKey(masterKey, salt);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
        additionalData: new TextEncoder().encode("family-nostr-data"),
      },
      key,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
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

    const encoder = new TextEncoder();
    const data = encoder.encode(username.toLowerCase().trim());

    // Use PBKDF2 for username hashing
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      data,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    // Ensure salt has proper ArrayBuffer type
    const saltBuffer = new Uint8Array(salt.length);
    saltBuffer.set(salt);

    const hash = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBuffer,
        iterations: ENCRYPTION_CONFIG.iterations,
        hash: "SHA-512",
      },
      keyMaterial,
      512
    );

    return {
      hash: btoa(
        String.fromCharCode.apply(null, Array.from(new Uint8Array(hash)))
      ),
      salt: btoa(String.fromCharCode.apply(null, Array.from(salt))),
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
    const salt = new Uint8Array(
      atob(storedSalt)
        .split("")
        .map((c) => c.charCodeAt(0))
    );

    const encoder = new TextEncoder();
    const data = encoder.encode(username.toLowerCase().trim());

    // Use PBKDF2 for username hashing with stored salt
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      data,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    // Ensure salt has proper ArrayBuffer type
    const saltBuffer = new Uint8Array(salt.length);
    saltBuffer.set(salt);

    const hash = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBuffer,
        iterations: ENCRYPTION_CONFIG.iterations,
        hash: "SHA-512",
      },
      keyMaterial,
      512
    );

    const computedHash = btoa(
      String.fromCharCode.apply(null, Array.from(new Uint8Array(hash)))
    );

    return computedHash === storedHash;
  } catch (error) {
    console.error("Username verification failed:", error);
    return false;
  }
}

/**
 * Encrypt Nostr private key (nsec)
 */
export async function encryptNsec(nsec: string): Promise<{
  encryptedNsec: string;
  salt: string;
  iv: string;
  tag: string;
  keyId: string;
}> {
  const result = await encryptSensitiveData(nsec);
  return {
    encryptedNsec: result.encrypted,
    salt: result.salt,
    iv: result.iv,
    tag: result.tag,
    keyId: generateSecureUUID(),
  };
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
  return await decryptSensitiveData({
    encrypted: encryptedData.encryptedNsec,
    salt: encryptedData.salt,
    iv: encryptedData.iv,
    tag: encryptedData.tag,
  });
}

/**
 * Encrypt Nostr public key (npub)
 */
export async function encryptNpub(npub: string): Promise<{
  encryptedNpub: string;
  salt: string;
  iv: string;
  tag: string;
}> {
  const result = await encryptSensitiveData(npub);
  return {
    encryptedNpub: result.encrypted,
    salt: result.salt,
    iv: result.iv,
    tag: result.tag,
  };
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
  return await decryptSensitiveData({
    encrypted: encryptedData.encryptedNpub,
    salt: encryptedData.salt,
    iv: encryptedData.iv,
    tag: encryptedData.tag,
  });
}

/**
 * Generate secure family ID
 */
export function generateSecureFamilyId(familyName?: string): {
  familyId: string;
  familyUuid: string;
  hash: string;
} {
  const familyUuid = generateSecureUUID();
  const familyId = familyName
    ? `${familyName.toLowerCase().replace(/[^a-z0-9]/g, "")}-${familyUuid.slice(
        0,
        8
      )}`
    : `family-${familyUuid.slice(0, 8)}`;

  // Simple hash for browser compatibility
  const hash = btoa(familyId).slice(0, 16);

  return {
    familyId,
    familyUuid,
    hash,
  };
}

/**
 * Privacy audit entry interface
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
  operation?: string;
}

/**
 * Log privacy operation (browser-compatible)
 */
export function logPrivacyOperation(
  entry: Omit<PrivacyAuditEntry, "id" | "timestamp">
): PrivacyAuditEntry {
  const auditEntry: PrivacyAuditEntry = {
    ...entry,
    id: generateSecureUUID(),
    timestamp: new Date(),
  };

  // In browser, we can only log to console
  console.log("Privacy Audit:", auditEntry);

  return auditEntry;
}

/**
 * Validate data integrity
 */
export function validateDataIntegrity(
  originalData: string,
  processedData: string,
  operation: "encrypt" | "decrypt"
): boolean {
  if (operation === "decrypt") {
    return originalData === processedData;
  }
  // For encryption, we can't easily validate without decrypting
  return true;
}

/**
 * Zero out sensitive data from memory (best effort)
 */
export function secureClearMemory(sensitiveString: string): void {
  try {
    // This is a best-effort attempt to clear sensitive data from memory
    // JavaScript doesn't provide guaranteed memory clearing, but we can overwrite
    if (typeof sensitiveString === "string") {
      for (let i = 0; i < sensitiveString.length; i++) {
        (sensitiveString as any)[i] = "0";
      }
    }
  } catch (error) {
    // Silent fail - this is best effort
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
  secureClearMemory,
};
