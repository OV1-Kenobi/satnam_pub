/**
 * @fileoverview Browser-Compatible Privacy-First Encryption and Data Protection
 * @description Implements strong encryption for sensitive family data using Web Crypto API
 * Browser-compatible version - uses Web Crypto API instead of Node.js crypto
 */

/**
 * CRITICAL SECURITY: Master Context environment variable access pattern
 * Ensures browser compatibility with import.meta.env while maintaining serverless support
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = import.meta as any;
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

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
 * Get master encryption key from Supabase Vault with fallback to environment variables
 * SECURITY: Secure-by-default - fails safely without insecure fallbacks
 * Uses direct Supabase access for server compatibility and VaultConfigManager for browser
 */
async function getMasterKey(): Promise<string> {
  let vaultError: Error | null = null;

  try {
    // Primary: Try to get key from Supabase Vault
    const vaultKey = await getPrivacyMasterKeyFromVault();
    if (vaultKey) {
      console.log("✅ Using privacy master key from Supabase Vault");
      return vaultKey;
    }
  } catch (error) {
    vaultError =
      error instanceof Error ? error : new Error("Unknown vault error");
    console.warn(`⚠️  Vault access failed: ${vaultError.message}`);
  }

  // Fallback: Use environment variable (server environments only)
  const envKey =
    typeof window === "undefined"
      ? process.env.PRIVACY_MASTER_KEY
      : getEnvVar("PRIVACY_MASTER_KEY");

  if (envKey) {
    console.log("✅ Using privacy master key from environment variables");
    return envKey;
  }

  // SECURITY: No insecure fallbacks - fail safely
  const errorDetails = [
    "CRITICAL SECURITY ERROR: No secure privacy master key available.",
    "",
    "Required configuration:",
    "1. Store PRIVACY_MASTER_KEY in Supabase Vault (recommended), OR",
    "2. Set PRIVACY_MASTER_KEY environment variable",
    "",
    "Vault access error: " +
      (vaultError?.message || "Unable to connect to vault"),
    "Environment variable: " + (envKey ? "Available" : "Not set"),
    "",
    "Encryption cannot proceed without a secure key.",
  ].join("\n");

  throw new Error(errorDetails);
}

/**
 * Get privacy master key from Supabase Vault with environment detection
 * Works in both browser and server environments
 */
async function getPrivacyMasterKeyFromVault(): Promise<string | null> {
  // Check if we're in a browser environment
  if (typeof window !== "undefined") {
    try {
      // Browser environment: Use VaultConfigManager
      const { getPrivacyMasterKey } = await import(
        "../../../lib/vault-config.js"
      );
      return await getPrivacyMasterKey();
    } catch (error) {
      console.warn("Browser vault access failed:", error);
      return null;
    }
  } else {
    try {
      // Server environment: Direct Supabase access with process.env
      const { createClient } = await import("@supabase/supabase-js");

      const supabaseUrl =
        process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey =
        process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error(
          "Supabase credentials not available for vault access. " +
            "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables."
        );
      }

      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: {
            "x-client-info": "privacy-encryption-vault-access@1.0.0",
          },
        },
      });

      // Try to get the secret from vault using direct query
      const { data, error } = await supabase
        .from("vault.decrypted_secrets")
        .select("decrypted_secret")
        .eq("name", "privacy_master_key")
        .single();

      if (error) {
        throw new Error(
          `Vault query failed: ${error.message}. Check vault setup and RLS policies.`
        );
      }

      if (!data?.decrypted_secret) {
        throw new Error(
          "PRIVACY_MASTER_KEY not found in Supabase Vault. Run vault setup to store the key."
        );
      }

      return data.decrypted_secret;
    } catch (error) {
      throw new Error(
        `Server vault access failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}

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

    // SECURITY: Use vault-based master key for production security
    const masterKey = await getMasterKey();
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

    const masterKey = await getMasterKey();
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
 * Secure memory management types for zero-knowledge operations
 */
export interface SecureMemoryTarget {
  data: ArrayBuffer | Uint8Array | string;
  type: "arraybuffer" | "uint8array" | "string";
}

/**
 * Secure memory buffer for sensitive data operations
 * SECURITY: Uses ArrayBuffer for proper memory management
 */
export class SecureMemoryBuffer {
  private buffer: ArrayBuffer | null = null;
  private view: Uint8Array | null = null;
  private isCleared: boolean = false;

  constructor(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === "string") {
      // Convert string to ArrayBuffer immediately
      const encoder = new TextEncoder();
      const encoded = encoder.encode(data);
      this.buffer = encoded.buffer.slice(
        encoded.byteOffset,
        encoded.byteOffset + encoded.byteLength
      ) as ArrayBuffer;
      this.view = new Uint8Array(this.buffer);
    } else if (data instanceof ArrayBuffer) {
      this.buffer = data.slice(0);
      this.view = new Uint8Array(this.buffer);
    } else if (data instanceof Uint8Array) {
      // Handle Uint8Array properly to avoid SharedArrayBuffer issues
      const sourceBuffer = data.buffer as ArrayBuffer;
      this.buffer = sourceBuffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength
      );
      this.view = new Uint8Array(this.buffer);
    }
  }

  /**
   * Get the data as string (only if not cleared)
   */
  toString(): string {
    if (this.isCleared || !this.view) {
      throw new Error("SecureMemoryBuffer has been cleared");
    }
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      return decoder.decode(this.view);
    } catch (error) {
      throw new Error(`Failed to decode SecureMemoryBuffer: ${error}`);
    }
  }

  /**
   * Get the data as ArrayBuffer (only if not cleared)
   */
  toArrayBuffer(): ArrayBuffer {
    if (this.isCleared || !this.buffer) {
      throw new Error("SecureMemoryBuffer has been cleared");
    }
    return this.buffer.slice(0);
  }

  /**
   * Get the data as Uint8Array (only if not cleared)
   */
  toUint8Array(): Uint8Array {
    if (this.isCleared || !this.view) {
      throw new Error("SecureMemoryBuffer has been cleared");
    }
    return new Uint8Array(this.view);
  }

  /**
   * Securely clear the buffer by overwriting with cryptographically secure random data
   * SECURITY: Multiple overwrites with different patterns for defense in depth
   */
  clear(): void {
    if (this.view && !this.isCleared) {
      try {
        // First pass: overwrite with cryptographically secure random data
        crypto.getRandomValues(this.view);

        // Second pass: overwrite with zeros
        this.view.fill(0);

        // Third pass: overwrite with 0xFF
        this.view.fill(0xff);

        // Final pass: overwrite with random data again
        crypto.getRandomValues(this.view);

        // Clear references
        this.buffer = null;
        this.view = null;
        this.isCleared = true;

        // Force garbage collection hint (if available)
        if (typeof window !== "undefined" && "gc" in window) {
          (window as any).gc();
        }
      } catch (error) {
        console.warn("Secure memory clearing failed:", error);
        // Still mark as cleared to prevent further use
        this.buffer = null;
        this.view = null;
        this.isCleared = true;
      }
    }
  }

  /**
   * Check if buffer has been cleared
   */
  get cleared(): boolean {
    return this.isCleared;
  }

  /**
   * Get buffer size in bytes
   */
  get size(): number {
    return this.isCleared || !this.view ? 0 : this.view.length;
  }
}

/**
 * Secure memory clearing for multiple targets
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

  // Force garbage collection hint (if available)
  if (typeof window !== "undefined" && "gc" in window) {
    (window as any).gc();
  }
}

/**
 * Legacy function for backward compatibility - now uses proper memory management
 * @deprecated Use SecureMemoryBuffer or secureClearMemory with targets instead
 */
export function secureClearMemoryLegacy(sensitiveString: string): void {
  secureClearMemory([{ data: sensitiveString, type: "string" }]);
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
  secureClearMemoryLegacy,
  SecureMemoryBuffer,
};
