/**
 * Invitation Token Storage Utility
 *
 * Provides encrypted sessionStorage for family invitation tokens
 * that survive page refresh during the Identity Forge registration flow.
 *
 * Security Features:
 * - AES-256-GCM encryption with Web Crypto API
 * - Random session key generated per browser session
 * - Automatic cleanup on successful registration or cancellation
 * - SSR/Privacy Mode compatible with graceful fallback
 */

const STORAGE_KEY = "satnam_family_invitation_enc";
const SESSION_KEY_STORAGE = "satnam_invitation_session_key";

// Text encoder/decoder for UTF-8 conversion
const te = new TextEncoder();
const td = new TextDecoder();

// Base64 URL-safe encoding/decoding
function b64encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function b64decode(str: string): Uint8Array {
  // Restore standard base64
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Convert Uint8Array to ArrayBuffer for Web Crypto API compatibility
 * Fixes TypeScript strict mode issues with BufferSource types
 */
function toAB(viewOrBuf: ArrayBuffer | Uint8Array): ArrayBuffer {
  return viewOrBuf instanceof Uint8Array ? viewOrBuf.slice().buffer : viewOrBuf;
}

/**
 * Get or create a session key for encryption
 * Key is stored in sessionStorage and regenerated per browser session
 */
async function getSessionKey(): Promise<CryptoKey> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("Web Crypto API not available");
  }

  try {
    // Try to recover existing key
    const storedKey = sessionStorage.getItem(SESSION_KEY_STORAGE);
    if (storedKey) {
      const keyBytes = b64decode(storedKey);
      return await crypto.subtle.importKey(
        "raw",
        toAB(keyBytes),
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
      );
    }

    // Generate new session key
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    sessionStorage.setItem(SESSION_KEY_STORAGE, b64encode(keyBytes));

    return await crypto.subtle.importKey(
      "raw",
      toAB(keyBytes),
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  } catch (error) {
    throw new Error(
      `Session key management failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Encrypt and store a family invitation token in sessionStorage
 * @param token The invitation token to store (e.g., 'inv_xxx...')
 */
export async function storeEncryptedInvitationToken(
  token: string
): Promise<void> {
  if (!token) return;

  try {
    const key = await getSessionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toAB(iv) },
      key,
      toAB(te.encode(token))
    );

    // Store as: iv_b64.ciphertext_b64
    const payload = `${b64encode(iv)}.${b64encode(new Uint8Array(ciphertext))}`;
    sessionStorage.setItem(STORAGE_KEY, payload);

    console.log("📦 Family invitation token stored securely");
  } catch (error) {
    console.warn("Failed to store invitation token:", error);
    // Graceful degradation - token will be lost on refresh but registration can still proceed
  }
}

/**
 * Recover and decrypt a family invitation token from sessionStorage
 * @returns The decrypted token, or null if not found/invalid
 */
export async function recoverEncryptedInvitationToken(): Promise<
  string | null
> {
  try {
    const payload = sessionStorage.getItem(STORAGE_KEY);
    if (!payload) return null;

    const [ivB64, ctB64] = payload.split(".");
    if (!ivB64 || !ctB64) return null;

    const key = await getSessionKey();
    const iv = b64decode(ivB64);
    const ciphertext = b64decode(ctB64);

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toAB(iv) },
      key,
      toAB(ciphertext)
    );

    const token = td.decode(plaintext);

    // Validate it's a family invitation token
    if (!token.startsWith("inv_")) {
      console.warn("Recovered token is not a family invitation token");
      return null;
    }

    console.log("📦 Family invitation token recovered from storage");
    return token;
  } catch (error) {
    console.warn("Failed to recover invitation token:", error);
    return null;
  }
}

/**
 * Clear the stored invitation token from sessionStorage
 * Call after successful registration, federation join, or user cancellation
 */
export function clearInvitationToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    // Don't remove the session key - it may be used for other purposes
    console.log("📦 Family invitation token cleared from storage");
  } catch (error) {
    console.warn("Failed to clear invitation token:", error);
  }
}

/**
 * Check if there's a pending family invitation token in storage
 * @returns true if a token exists, false otherwise
 */
export function hasPendingInvitationToken(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
