// Browser-compatible encryption module using Web Crypto API
// NO Node.js crypto module usage - only Web Crypto API

// Removed vault import - using environment variables directly

// Encryption interface
export interface EncryptionResult {
  encrypted: string;
  iv: string;
  tag: string;
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
 */
export async function encryptSensitiveData(
  data: string,
  key?: string
): Promise<EncryptionResult> {
  try {
    // Get encryption key from parameter or generate one
    const encryptionKey = key || (await generateEncryptionKey());

    // Convert key to CryptoKey
    const cryptoKey = await importKey(encryptionKey);

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
      encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      iv: btoa(String.fromCharCode(...iv)),
      tag: "", // GCM tag is included in encrypted data
    };
  } catch (error) {
    console.error("Encryption failed:", error);
    throw new Error("Failed to encrypt sensitive data");
  }
}

/**
 * Decrypt sensitive data using AES-256-GCM
 */
export async function decryptSensitiveData(
  encrypted: string,
  iv: string,
  key?: string
): Promise<string> {
  try {
    // Get encryption key from parameter
    if (!key) {
      throw new Error("Encryption key must be provided for decryption");
    }
    const encryptionKey = key;

    // Convert key to CryptoKey
    const cryptoKey = await importKey(encryptionKey);

    // Decode encrypted data and IV
    const encryptedData = new Uint8Array(
      atob(encrypted)
        .split("")
        .map((char) => char.charCodeAt(0))
    );
    const ivData = new Uint8Array(
      atob(iv)
        .split("")
        .map((char) => char.charCodeAt(0))
    );

    // Decrypt data
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivData },
      cryptoKey,
      encryptedData
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Decryption failed:", error);
    throw new Error("Failed to decrypt sensitive data");
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
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

/**
 * Import encryption key
 */
async function importKey(keyString: string): Promise<CryptoKey> {
  const keyData = new Uint8Array(
    atob(keyString)
      .split("")
      .map((char) => char.charCodeAt(0))
  );

  return await crypto.subtle.importKey(
    "raw",
    keyData,
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
 */
export async function hashSensitiveData(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

/**
 * Generate secure random token
 */
export function generateSecureToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}
