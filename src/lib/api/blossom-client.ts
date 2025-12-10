/**
 * Blossom Client - Nostr.build Blob Storage Protocol
 * Phase 4B: Banner Management
 * Phase 5A: Multi-Server Support with Automatic Failover
 * Phase NIP-96: Encrypted Media Storage for DMs and PNS Notes
 *
 * Implements Blossom protocol (BUD-02) for uploading images and encrypted media
 * https://github.com/hzrd149/blossom/blob/master/buds/02.md
 *
 * Features:
 * - Nostr signature-based authentication (NIP-98 style)
 * - Anonymous uploads (fallback)
 * - Multi-server support with automatic failover (Phase 5A)
 * - Retry logic with exponential backoff
 * - Timeout handling (configurable)
 * - Server health tracking
 * - AES-256-GCM file encryption (NIP-96 integration)
 * - Encrypted media upload/download for DMs and PNS notes
 */

import { clientConfig } from "../../config/env.client";
import type { BannerUploadResponse } from "../../types/profile";

// ============================================================================
// Type Definitions for Encrypted Media (NIP-96 Integration)
// ============================================================================

/**
 * Encryption parameters for AES-256-GCM encrypted media.
 * Used to decrypt files downloaded from Blossom.
 */
export interface MediaEncryptionParams {
  /** Encryption algorithm (always "AES-GCM" for Satnam) */
  algo: "AES-GCM";
  /** Base64-encoded 256-bit AES key */
  key: string;
  /** Base64-encoded 96-bit IV/nonce */
  iv: string;
}

/**
 * Result from uploading encrypted media to Blossom.
 * Contains all information needed to embed in DM or PNS note.
 */
export interface BlossomUploadResult {
  /** Whether upload succeeded */
  success: boolean;
  /** Blossom URL to the encrypted blob (if success) */
  url?: string;
  /** SHA-256 hash of the ciphertext (hex) for integrity verification */
  sha256?: string;
  /** Ciphertext size in bytes */
  size?: number;
  /** Original MIME type of the file */
  mimeType?: string;
  /** Base64-encoded 256-bit AES key for decryption */
  encryptionKey?: string;
  /** Base64-encoded 96-bit IV for decryption */
  encryptionIv?: string;
  /** Error message if upload failed */
  error?: string;
  /** Which Blossom server was used */
  serverUsed?: string;
}

/**
 * Descriptor for an attachment in DMs or PNS notes.
 * This is embedded in the encrypted message content.
 */
export interface AttachmentDescriptor {
  /** Blossom URL pointing to the encrypted blob */
  url: string;
  /** Original filename (for display and download) */
  fileName: string;
  /** MIME type (e.g., "image/png", "audio/mpeg", "video/mp4") */
  mimeType: string;
  /** Logical media type for UI rendering */
  mediaType: "file" | "image" | "audio" | "video";
  /** Ciphertext size in bytes */
  size: number;
  /** SHA-256 hash of the ciphertext (hex) for integrity verification */
  sha256: string;
  /** Encryption parameters for decryption */
  enc: MediaEncryptionParams;
  /** Optional short description (no PII) */
  alt?: string;
}

/**
 * Interface for Blossom client operations.
 * Allows for mocking in tests and potential future implementations.
 */
export interface IBlossomClient {
  /**
   * Upload and encrypt a file for use in DMs or PNS notes.
   * File is encrypted with AES-256-GCM before upload.
   *
   * @param file - File to encrypt and upload
   * @param signer - Optional Nostr signer for authenticated upload
   * @returns Upload result with URL and encryption keys
   */
  uploadEncryptedMedia(
    file: File,
    signer?: (event: unknown) => Promise<unknown>
  ): Promise<BlossomUploadResult>;

  /**
   * Download and decrypt a file from Blossom.
   *
   * @param url - Blossom URL to the encrypted blob
   * @param encryptionKey - Base64-encoded AES key
   * @param encryptionIv - Base64-encoded IV
   * @param expectedHash - Expected SHA-256 hash of ciphertext (optional, for verification)
   * @returns Decrypted file as Blob
   */
  downloadAndDecrypt(
    url: string,
    encryptionKey: string,
    encryptionIv: string,
    expectedHash?: string
  ): Promise<Blob>;

  /**
   * Delete a file from Blossom (if supported and authorized).
   *
   * @param sha256 - SHA-256 hash of the file to delete
   * @param signer - Nostr signer for authorization
   * @returns Success status
   */
  deleteMedia(
    sha256: string,
    signer: (event: unknown) => Promise<unknown>
  ): Promise<{ success: boolean; error?: string }>;

  /**
   * Upload a banner image (legacy Phase 4B API).
   *
   * @param file - Image file to upload
   * @param signer - Optional Nostr signer
   * @returns Banner upload response
   */
  uploadBanner(
    file: File,
    signer?: (event: unknown) => Promise<unknown>
  ): Promise<BannerUploadResponse>;
}

// ============================================================================
// Cryptographic Utilities (Web Crypto API)
// ============================================================================

/**
 * Generate a random 256-bit AES key for file encryption.
 * Uses Web Crypto API for secure random generation.
 */
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable (needed to export key for sharing)
    ["encrypt", "decrypt"]
  );
}

/**
 * Generate a random 96-bit IV for AES-GCM.
 */
export function generateIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

/**
 * Export CryptoKey to base64 string.
 */
export async function exportKeyToBase64(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("raw", key);
  return uint8ArrayToBase64(new Uint8Array(exported));
}

/**
 * Import base64 key string to CryptoKey.
 *
 * Note: The imported key is non-extractable and can only be used for decryption.
 * This is secure for the download use case where we only need to decrypt received files.
 */
export async function importKeyFromBase64(
  keyBase64: string
): Promise<CryptoKey> {
  const keyBytes = base64ToUint8Array(keyBase64);
  // Use slice() to get a new ArrayBuffer that covers only the Uint8Array's data
  // This avoids issues when keyBytes is a view into a larger buffer
  // slice() always returns a new ArrayBuffer (not SharedArrayBuffer)
  const keyBuffer = keyBytes.buffer.slice(
    keyBytes.byteOffset,
    keyBytes.byteOffset + keyBytes.byteLength
  ) as ArrayBuffer;
  return crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-GCM", length: 256 },
    false, // not extractable after import (secure for decrypt-only use)
    ["decrypt"]
  );
}

/**
 * Encrypt file data with AES-256-GCM.
 */
export async function encryptFileData(
  data: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  return crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    data
  );
}

/**
 * Decrypt ciphertext with AES-256-GCM.
 */
export async function decryptFileData(
  ciphertext: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ciphertext
  );
}

/**
 * Convert Uint8Array to base64 string.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Configuration from environment
const BLOSSOM_PRIMARY_URL = clientConfig.blossom.primaryUrl;
const BLOSSOM_FALLBACK_URL = clientConfig.blossom.fallbackUrl;
const UPLOAD_TIMEOUT = clientConfig.blossom.timeoutMs;
const MAX_RETRIES_PER_SERVER = clientConfig.blossom.retryAttempts;
const INITIAL_RETRY_DELAY = 1000; // 1 second

// Server priority array (Phase 5A)
const BLOSSOM_SERVERS = [BLOSSOM_PRIMARY_URL, BLOSSOM_FALLBACK_URL].filter(
  (url, index, arr) => url && arr.indexOf(url) === index // Remove duplicates and empty values
);

// Server health tracking (Phase 5A)
interface ServerHealth {
  url: string;
  successCount: number;
  failureCount: number;
  lastAttempt: number;
  lastSuccess: number | null;
  lastFailure: number | null;
}

const serverHealthMap = new Map<string, ServerHealth>();

// Initialize server health tracking
BLOSSOM_SERVERS.forEach((url) => {
  if (!serverHealthMap.has(url)) {
    serverHealthMap.set(url, {
      url,
      successCount: 0,
      failureCount: 0,
      lastAttempt: 0,
      lastSuccess: null,
      lastFailure: null,
    });
  }
});

/**
 * Calculate SHA-256 hash of file
 * Required by Blossom protocol
 */
async function calculateSHA256(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

/** Expiration window for authorization events (5 minutes) */
const AUTH_EXPIRATION_SECONDS = 300;

/**
 * Create Nostr authorization event for upload
 * Per BUD-01/BUD-02 spec: kind 24242 event with upload metadata and expiration
 *
 * @param fileHash - SHA-256 hash of file
 * @param fileSize - File size in bytes
 * @param mimeType - MIME type of file
 * @param signer - Nostr signer function (from NIP-07 or nsec)
 */
async function createAuthEvent(
  fileHash: string,
  fileSize: number,
  mimeType: string,
  signer?: (event: unknown) => Promise<unknown>
): Promise<string | null> {
  if (!signer) {
    return null; // Anonymous upload
  }

  try {
    const createdAt = Math.floor(Date.now() / 1000);
    const expiration = createdAt + AUTH_EXPIRATION_SECONDS;

    const event = {
      kind: 24242, // Blossom upload authorization event
      created_at: createdAt,
      tags: [
        ["t", "upload"],
        ["x", fileHash], // SHA-256 hash
        ["size", fileSize.toString()],
        ["m", mimeType],
        ["expiration", expiration.toString()], // BUD-01 required expiration tag
      ],
      content: "",
    };

    const signedEvent = await signer(event);
    return JSON.stringify(signedEvent);
  } catch (error) {
    console.error("Failed to create auth event:", error);
    return null; // Fall back to anonymous upload
  }
}

/**
 * Update server health tracking (Phase 5A)
 */
function updateServerHealth(serverUrl: string, success: boolean): void {
  const health = serverHealthMap.get(serverUrl);
  if (!health) return;

  const now = Date.now();
  health.lastAttempt = now;

  if (success) {
    health.successCount++;
    health.lastSuccess = now;
    console.log(
      `✅ Blossom server ${serverUrl} upload successful (${health.successCount} successes, ${health.failureCount} failures)`
    );
  } else {
    health.failureCount++;
    health.lastFailure = now;
    console.warn(
      `❌ Blossom server ${serverUrl} upload failed (${health.successCount} successes, ${health.failureCount} failures)`
    );
  }
}

/**
 * Get server health statistics (Phase 5A)
 * Exported for monitoring/debugging
 */
export function getServerHealthStats(): ServerHealth[] {
  return Array.from(serverHealthMap.values());
}

/**
 * Upload file to a specific Blossom server with retry logic (Phase 5A)
 *
 * @param serverUrl - Blossom server URL
 * @param file - File to upload
 * @param authEvent - Optional Nostr auth event (JSON string)
 * @param retryCount - Current retry attempt (internal)
 */
async function uploadToServer(
  serverUrl: string,
  file: File,
  authEvent: string | null,
  retryCount = 0
): Promise<BannerUploadResponse> {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const headers: Record<string, string> = {};

    // Add authorization header if auth event provided
    if (authEvent) {
      headers["Authorization"] = `Nostr ${btoa(authEvent)}`;
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT);

    console.log(
      `📤 Uploading to ${serverUrl} (attempt ${
        retryCount + 1
      }/${MAX_RETRIES_PER_SERVER})...`
    );

    const response = await fetch(`${serverUrl}/upload`, {
      method: "PUT",
      headers,
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Upload failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    // Update server health on success
    updateServerHealth(serverUrl, true);

    // Blossom response format: { url, sha256, size, type }
    return {
      success: true,
      url: result.url,
      sha256: result.sha256,
      size: result.size,
      type: result.type,
      serverUsed: serverUrl, // Track which server was used (Phase 5A)
    };
  } catch (error) {
    // Retry logic for this server
    if (retryCount < MAX_RETRIES_PER_SERVER - 1) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
      console.warn(
        `⚠️ Upload to ${serverUrl} failed (attempt ${
          retryCount + 1
        }/${MAX_RETRIES_PER_SERVER}). Retrying in ${delay}ms...`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return uploadToServer(serverUrl, file, authEvent, retryCount + 1);
    }

    // All retries exhausted for this server
    updateServerHealth(serverUrl, false);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Upload failed after multiple retries",
    };
  }
}

/**
 * Upload file with automatic failover across multiple servers (Phase 5A)
 *
 * @param file - File to upload
 * @param authEvent - Optional Nostr auth event (JSON string)
 */
async function uploadWithFailover(
  file: File,
  authEvent: string | null
): Promise<BannerUploadResponse> {
  const errors: string[] = [];

  // Try each server in priority order
  for (let i = 0; i < BLOSSOM_SERVERS.length; i++) {
    const serverUrl = BLOSSOM_SERVERS[i];
    const serverLabel = i === 0 ? "primary" : "fallback";

    console.log(`🔄 Attempting upload to ${serverLabel} server: ${serverUrl}`);

    const result = await uploadToServer(serverUrl, file, authEvent);

    if (result.success) {
      if (i > 0) {
        console.log(
          `✅ Failover successful! Used ${serverLabel} server: ${serverUrl}`
        );
      }
      return result;
    }

    // Log failure and try next server
    errors.push(`${serverLabel} (${serverUrl}): ${result.error}`);
    console.warn(
      `❌ ${serverLabel} server ${serverUrl} failed: ${result.error}`
    );

    if (i < BLOSSOM_SERVERS.length - 1) {
      console.log(`🔄 Failing over to next server...`);
    }
  }

  // All servers failed
  console.error(`❌ All Blossom servers failed. Errors:`, errors);

  return {
    success: false,
    error: `All Blossom servers failed:\n${errors.join("\n")}`,
  };
}

/**
 * Upload banner image to Blossom server with automatic failover (Phase 5A)
 *
 * @param file - Image file to upload
 * @param signer - Optional Nostr signer for authenticated upload
 * @returns Upload response with URL or error
 */
export async function uploadBannerToBlossom(
  file: File,
  signer?: (event: any) => Promise<any>
): Promise<BannerUploadResponse> {
  try {
    // Check if Blossom upload is enabled
    const BLOSSOM_ENABLED = clientConfig.flags.blossomUploadEnabled;

    if (!BLOSSOM_ENABLED) {
      return {
        success: false,
        error: "Blossom upload is disabled. Use data URL fallback instead.",
      };
    }

    // Validate server configuration
    if (BLOSSOM_SERVERS.length === 0) {
      return {
        success: false,
        error:
          "No Blossom servers configured. Please set VITE_BLOSSOM_PRIMARY_URL.",
      };
    }

    // Calculate file hash (required by Blossom)
    const fileHash = await calculateSHA256(file);

    // Create auth event if signer provided
    const authEvent = await createAuthEvent(
      fileHash,
      file.size,
      file.type,
      signer
    );

    // Upload with automatic failover (Phase 5A)
    const result = await uploadWithFailover(file, authEvent);

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown upload error",
    };
  }
}

/**
 * Convert file to base64 data URL (fallback when Blossom unavailable)
 *
 * @param file - Image file to convert
 * @returns Data URL string
 */
export async function convertToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert file to data URL"));
      }
    };

    reader.onerror = () => {
      reject(new Error("FileReader error"));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Compress image using Canvas API
 * Reduces file size while maintaining quality
 *
 * @param file - Image file to compress
 * @param maxWidth - Maximum width (default: 2000)
 * @param quality - JPEG quality 0-1 (default: 0.85)
 * @returns Compressed file
 */
export async function compressImage(
  file: File,
  maxWidth = 2000,
  quality = 0.85
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Calculate new dimensions (maintain aspect ratio)
      let { width, height } = img;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      // Create canvas and draw resized image
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob (WebP if supported, otherwise JPEG)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to compress image"));
            return;
          }

          // Create new File from blob
          const compressedFile = new File([blob], file.name, {
            type: blob.type,
            lastModified: Date.now(),
          });

          resolve(compressedFile);
        },
        "image/webp", // Prefer WebP for better compression
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for compression"));
    };

    img.src = objectUrl;
  });
}

// ============================================================================
// BlossomClient Class - Implements IBlossomClient Interface
// ============================================================================

/**
 * BlossomClient - Main client for encrypted media operations.
 * Implements IBlossomClient interface for DM and PNS attachment support.
 *
 * @example
 * ```typescript
 * const client = BlossomClient.getInstance();
 *
 * // Upload encrypted file
 * const result = await client.uploadEncryptedMedia(file);
 * if (result.success) {
 *   // Use result.url, result.encryptionKey, result.encryptionIv in message
 * }
 *
 * // Download and decrypt
 * const blob = await client.downloadAndDecrypt(
 *   attachment.url,
 *   attachment.enc.key,
 *   attachment.enc.iv,
 *   attachment.sha256
 * );
 * ```
 */
export class BlossomClient implements IBlossomClient {
  private static instance: BlossomClient | null = null;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton BlossomClient instance.
   */
  static getInstance(): BlossomClient {
    if (!BlossomClient.instance) {
      BlossomClient.instance = new BlossomClient();
    }
    return BlossomClient.instance;
  }

  /**
   * Upload and encrypt a file for use in DMs or PNS notes.
   * File is encrypted with AES-256-GCM before upload to Blossom.
   *
   * @param file - File to encrypt and upload
   * @param signer - Optional Nostr signer for authenticated upload
   * @returns Upload result with URL and encryption keys
   */
  async uploadEncryptedMedia(
    file: File,
    signer?: (event: unknown) => Promise<unknown>
  ): Promise<BlossomUploadResult> {
    // Maximum file size: 100MB (to prevent memory issues during encryption)
    const MAX_FILE_SIZE = 100 * 1024 * 1024;

    try {
      // Validate file size before processing
      if (file.size > MAX_FILE_SIZE) {
        return {
          success: false,
          error: `File too large. Maximum size: ${
            MAX_FILE_SIZE / (1024 * 1024)
          } MB`,
        };
      }

      // Check if Blossom is enabled
      if (!clientConfig.flags.blossomUploadEnabled) {
        return {
          success: false,
          error:
            "Blossom upload is disabled. Enable VITE_BLOSSOM_UPLOAD_ENABLED.",
        };
      }

      // Validate server configuration
      if (BLOSSOM_SERVERS.length === 0) {
        return {
          success: false,
          error:
            "No Blossom servers configured. Please set VITE_BLOSSOM_PRIMARY_URL.",
        };
      }

      // Generate encryption key and IV
      const aesKey = await generateEncryptionKey();
      const iv = generateIv();

      // Read file data
      const fileData = await file.arrayBuffer();

      // Encrypt file data
      const ciphertext = await encryptFileData(fileData, aesKey, iv);

      // Export key for storage in message
      const keyBase64 = await exportKeyToBase64(aesKey);
      const ivBase64 = uint8ArrayToBase64(iv);

      // Create encrypted file blob
      const encryptedBlob = new Blob([ciphertext], {
        type: "application/octet-stream",
      });
      const encryptedFile = new File([encryptedBlob], `${file.name}.enc`, {
        type: "application/octet-stream",
      });

      // Calculate hash of ciphertext (for Blossom and integrity verification)
      const ciphertextHash = await calculateSHA256(encryptedFile);

      // Create auth event if signer provided (type signature now matches)
      const authEvent = await createAuthEvent(
        ciphertextHash,
        encryptedFile.size,
        "application/octet-stream",
        signer
      );

      // Upload with failover
      const uploadResult = await uploadWithFailover(encryptedFile, authEvent);

      if (!uploadResult.success) {
        return {
          success: false,
          error: uploadResult.error || "Upload failed",
        };
      }

      return {
        success: true,
        url: uploadResult.url,
        sha256: ciphertextHash,
        size: encryptedFile.size,
        mimeType: file.type || "application/octet-stream",
        encryptionKey: keyBase64,
        encryptionIv: ivBase64,
        serverUsed: uploadResult.serverUsed,
      };
    } catch (error) {
      console.error("Failed to upload encrypted media:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown upload error",
      };
    }
  }

  /**
   * Download and decrypt a file from Blossom.
   *
   * @param url - Blossom URL to the encrypted blob
   * @param encryptionKey - Base64-encoded AES key
   * @param encryptionIv - Base64-encoded IV
   * @param expectedHash - Expected SHA-256 hash of ciphertext (optional, for verification)
   * @returns Decrypted file as Blob
   * @throws Error if download, verification, or decryption fails
   */
  async downloadAndDecrypt(
    url: string,
    encryptionKey: string,
    encryptionIv: string,
    expectedHash?: string
  ): Promise<Blob> {
    // Download ciphertext
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download from Blossom: ${response.status}`);
    }

    const ciphertext = await response.arrayBuffer();

    // Verify hash if provided
    if (expectedHash) {
      const actualHash = await this.calculateHash(ciphertext);
      if (actualHash !== expectedHash) {
        throw new Error(
          "Ciphertext hash mismatch - file may be corrupted or tampered"
        );
      }
    }

    // Import key and decrypt
    const key = await importKeyFromBase64(encryptionKey);
    const iv = base64ToUint8Array(encryptionIv);

    const plaintext = await decryptFileData(ciphertext, key, iv);

    // Return as Blob (caller can determine MIME type from attachment descriptor)
    return new Blob([plaintext]);
  }

  /**
   * Delete a file from Blossom (if supported and authorized).
   * Uses failover across all configured servers to handle files that may have
   * been uploaded to a fallback server.
   *
   * @param sha256 - SHA-256 hash of the file to delete
   * @param signer - Nostr signer for authorization
   * @returns Success status
   */
  async deleteMedia(
    sha256: string,
    signer: (event: unknown) => Promise<unknown>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (BLOSSOM_SERVERS.length === 0) {
        return { success: false, error: "No Blossom servers configured" };
      }

      // Create delete authorization event (kind 24242 with "delete" action)
      // Per BUD-01/BUD-02 spec: requires expiration tag
      const createdAt = Math.floor(Date.now() / 1000);
      const expiration = createdAt + AUTH_EXPIRATION_SECONDS;

      const event = {
        kind: 24242,
        created_at: createdAt,
        tags: [
          ["t", "delete"],
          ["x", sha256],
          ["expiration", expiration.toString()], // BUD-01 required expiration tag
        ],
        content: "",
      };

      const signedEvent = await signer(event);
      const authHeader = `Nostr ${btoa(JSON.stringify(signedEvent))}`;

      // Try all servers with failover (file may have been uploaded to a fallback server)
      const errors: string[] = [];
      for (const serverUrl of BLOSSOM_SERVERS) {
        try {
          const response = await fetch(`${serverUrl}/${sha256}`, {
            method: "DELETE",
            headers: {
              Authorization: authHeader,
            },
          });

          if (response.ok) {
            return { success: true };
          }

          // 404 means file doesn't exist on this server, try next
          if (response.status === 404) {
            continue;
          }

          // Other errors are collected for reporting
          const errorText = await response.text().catch(() => "Unknown error");
          errors.push(`${serverUrl}: ${response.status} - ${errorText}`);
        } catch (err) {
          // Network error, try next server
          errors.push(
            `${serverUrl}: ${
              err instanceof Error ? err.message : "Network error"
            }`
          );
          continue;
        }
      }

      // If we get here, deletion failed on all servers
      return {
        success: false,
        error: `Delete failed on all servers: ${errors.join("; ")}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown delete error",
      };
    }
  }

  /**
   * Upload a banner image (legacy Phase 4B API).
   * Delegates to the existing uploadBannerToBlossom function.
   *
   * @param file - Image file to upload
   * @param signer - Optional Nostr signer
   * @returns Banner upload response
   */
  async uploadBanner(
    file: File,
    signer?: (event: unknown) => Promise<unknown>
  ): Promise<BannerUploadResponse> {
    return uploadBannerToBlossom(
      file,
      signer as ((event: any) => Promise<any>) | undefined
    );
  }

  /**
   * Calculate SHA-256 hash of ArrayBuffer.
   * Internal utility for hash verification.
   */
  private async calculateHash(data: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

/**
 * Determine media type from MIME type.
 * Used for UI rendering decisions.
 */
export function getMediaTypeFromMime(
  mimeType: string
): "file" | "image" | "audio" | "video" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

// ============================================================================
// NIP-94 File Metadata Event Support
// ============================================================================

/**
 * Unsigned NIP-94 file metadata event (kind 1063).
 * This event represents an encrypted file stored on Blossom.
 * The event does NOT contain encryption keys (those are in the DM/PNS).
 */
export interface UnsignedNip94Event {
  kind: 1063;
  created_at: number;
  tags: string[][];
  content: string;
}

/**
 * Options for building a NIP-94 event.
 */
export interface Nip94EventOptions {
  /** Blossom URL to the encrypted blob */
  url: string;
  /** SHA-256 hash of the ciphertext (hex) */
  sha256: string;
  /** File size in bytes */
  size: number;
  /** MIME type of the original file */
  mimeType: string;
  /** Optional short description (no PII) */
  alt?: string;
  /** Optional dimensions for images/videos (e.g., "1920x1080") */
  dim?: string;
  /** Optional media type hint */
  type?: "file" | "image" | "audio" | "video";
}

/**
 * Build an unsigned NIP-94 file metadata event.
 *
 * This creates a kind 1063 event that describes an encrypted file.
 * The event can be:
 * 1. Published to relays for discoverability (optional)
 * 2. Referenced by event ID in DMs
 * 3. Kept client-side only for privacy
 *
 * IMPORTANT: The NIP-94 event does NOT contain encryption keys.
 * Keys are only stored in the encrypted DM/PNS content.
 *
 * @param options - File metadata options
 * @returns Unsigned NIP-94 event ready for signing
 *
 * @example
 * ```typescript
 * const nip94Event = buildNip94Event({
 *   url: "https://blossom.nostr.build/abc123",
 *   sha256: "abc123...",
 *   size: 1234567,
 *   mimeType: "video/mp4",
 *   alt: "Encrypted video attachment",
 * });
 * // Sign and optionally publish via CEPS
 * ```
 */
export function buildNip94Event(
  options: Nip94EventOptions
): UnsignedNip94Event {
  const tags: string[][] = [
    ["url", options.url],
    ["m", options.mimeType],
    ["x", options.sha256],
    ["size", options.size.toString()],
  ];

  // Add optional tags
  if (options.alt) {
    tags.push(["alt", options.alt]);
  }
  if (options.dim) {
    tags.push(["dim", options.dim]);
  }
  if (options.type) {
    tags.push(["type", options.type]);
  }

  return {
    kind: 1063,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "", // NIP-94 content is typically empty
  };
}

/**
 * Build imeta tag for embedding in DMs (NIP-17/NIP-59).
 * This follows the NIP-92/NIP-94 imeta format for cross-client compatibility.
 *
 * @param attachment - Attachment descriptor
 * @returns imeta tag array ready to include in event tags
 *
 * @example
 * ```typescript
 * const imetaTag = buildImetaTag(attachment);
 * // ["imeta", "url https://...", "m video/mp4", "x abc123...", "size 1234"]
 * ```
 */
export function buildImetaTag(attachment: AttachmentDescriptor): string[] {
  const parts = [
    "imeta",
    `url ${attachment.url}`,
    `m ${attachment.mimeType}`,
    `x ${attachment.sha256}`,
    `size ${attachment.size}`,
  ];

  if (attachment.alt) {
    parts.push(`alt ${attachment.alt}`);
  }

  return parts;
}

/**
 * Build fallback tag for non-Blossom clients.
 * Provides human-readable description of the attachment.
 *
 * @param attachment - Attachment descriptor
 * @returns fallback tag array
 *
 * @example
 * ```typescript
 * const fallbackTag = buildFallbackTag(attachment);
 * // ["fallback", "📎 [File: document.pdf - 1.2 MB - encrypted, open in Satnam to view]"]
 * ```
 */
export function buildFallbackTag(attachment: AttachmentDescriptor): string[] {
  const sizeStr = formatFileSize(attachment.size);
  const emoji = getMediaEmoji(attachment.mediaType);

  return [
    "fallback",
    `${emoji} [File: ${attachment.fileName} - ${sizeStr} - encrypted attachment, open in Satnam to view]`,
  ];
}

/**
 * Format file size in human-readable format.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Get emoji for media type.
 */
function getMediaEmoji(
  mediaType: "file" | "image" | "audio" | "video"
): string {
  switch (mediaType) {
    case "image":
      return "🖼️";
    case "audio":
      return "🎵";
    case "video":
      return "🎬";
    default:
      return "📎";
  }
}

/**
 * Create an AttachmentDescriptor from BlossomUploadResult and file info.
 * Convenience function for building attachment metadata.
 */
export function createAttachmentDescriptor(
  uploadResult: BlossomUploadResult,
  file: File,
  alt?: string
): AttachmentDescriptor | null {
  if (
    !uploadResult.success ||
    !uploadResult.url ||
    !uploadResult.encryptionKey ||
    !uploadResult.encryptionIv ||
    !uploadResult.sha256
  ) {
    return null;
  }

  return {
    url: uploadResult.url,
    fileName: file.name,
    mimeType: uploadResult.mimeType || file.type || "application/octet-stream",
    mediaType: getMediaTypeFromMime(file.type),
    size: uploadResult.size || 0,
    sha256: uploadResult.sha256,
    enc: {
      algo: "AES-GCM",
      key: uploadResult.encryptionKey,
      iv: uploadResult.encryptionIv,
    },
    alt,
  };
}
