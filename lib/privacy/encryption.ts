// Browser-compatible encryption module using Web Crypto API
// NO Node.js crypto module usage - only Web Crypto API

// Removed vault import - using environment variables directly

// Encryption interface
export interface EncryptionResult {
  encrypted: string;
  iv: string;
  tag: string;
}

/**
 * Convert Uint8Array or ArrayBuffer to base64 string
 * Uses chunked approach to avoid stack overflow on large buffers
 */
function bytesToBase64(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const chunkSize = 0x8000; // 32KB chunks
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(parts.join(""));
}

/**
 * Convert base64 string to Uint8Array
 * Handles large buffers safely
 */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Privacy operation logging
export interface PrivacyOperation {
  action: string;
  dataType: string;
  familyId?: string;
  success: boolean;
  timestamp?: string;
}

/**
 * Encrypt sensitive data using AES-256-GCM
 * CRITICAL: key parameter is mandatory to prevent data loss
 * If key is omitted, encryption key is generated but never returned, making ciphertext undecryptable
 */
export async function encryptSensitiveData(
  data: string,
  key: string
): Promise<EncryptionResult> {
  try {
    // Validate key is provided
    if (!key) {
      throw new Error(
        "Encryption key is mandatory. Omitting key would generate an unrecoverable key, making data undecryptable."
      );
    }

    // Convert key to CryptoKey
    const cryptoKey = await importKey(key);

    // Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt data
    const encodedData = new TextEncoder().encode(data);
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      encodedData
    );

    return {
      encrypted: bytesToBase64(new Uint8Array(encrypted)),
      iv: bytesToBase64(iv),
      tag: "", // GCM tag is included in encrypted data
    };
  } catch (error) {
    console.error("Encryption failed:", error);
    throw new Error(
      `Failed to encrypt sensitive data: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Decrypt sensitive data using AES-256-GCM
 */
export async function decryptSensitiveData(
  encrypted: string,
  iv: string,
  key: string
): Promise<string> {
  try {
    // Validate key is provided
    if (!key) {
      throw new Error("Encryption key must be provided for decryption");
    }

    // Convert key to CryptoKey
    const cryptoKey = await importKey(key);

    // Decode encrypted data and IV using safe base64 helpers
    const encryptedData = base64ToBytes(encrypted);
    const ivData = base64ToBytes(iv);

    // Decrypt data
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivData },
      cryptoKey,
      encryptedData
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Decryption failed:", error);
    throw new Error(
      `Failed to decrypt sensitive data: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Generate a new encryption key
 */
async function generateEncryptionKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const exported = await crypto.subtle.exportKey("raw", key);
  return bytesToBase64(new Uint8Array(exported));
}

/**
 * Import encryption key
 */
async function importKey(keyString: string): Promise<CryptoKey> {
  const keyData = base64ToBytes(keyString);

  return await crypto.subtle.importKey(
    "raw",
    keyData as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Log privacy operations for audit trail
 */
export function logPrivacyOperation(operation: PrivacyOperation): void {
  const logEntry = {
    ...operation,
    timestamp: operation.timestamp || new Date().toISOString(),
    sessionId: crypto.randomUUID(),
  };

  // Store in browser storage for user-controlled audit logs
  const auditLogs = JSON.parse(
    localStorage.getItem("privacy_audit_logs") || "[]"
  );
  auditLogs.push(logEntry);

  // Keep only last 100 entries
  if (auditLogs.length > 100) {
    auditLogs.splice(0, auditLogs.length - 100);
  }

  localStorage.setItem("privacy_audit_logs", JSON.stringify(auditLogs));

  // Log to console for development (remove in production)
  console.log("🔒 Privacy operation:", logEntry);
}

/**
 * Hash sensitive data for comparison without revealing original
 * SECURITY: Supports optional pepper for HMAC-based hashing to prevent dictionary attacks
 * Plain SHA-256 enables dictionary/re-identification attacks; prefer HMAC when pepper is available
 */
export async function hashSensitiveData(
  data: string,
  pepper?: string
): Promise<string> {
  const enc = new TextEncoder();
  const payload = enc.encode(data);

  if (pepper) {
    // Use HMAC-SHA256 when pepper is provided for stronger security
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(pepper),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, payload);
    return bytesToBase64(new Uint8Array(mac));
  }

  // Fallback to plain SHA-256 if no pepper provided
  const hash = await crypto.subtle.digest("SHA-256", payload);
  return bytesToBase64(new Uint8Array(hash));
}

/**
 * Generate secure random token
 */
export function generateSecureToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return bytesToBase64(array);
}
