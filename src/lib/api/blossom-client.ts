/**
 * Blossom Client - Nostr.build Blob Storage Protocol
 * Phase 4B: Banner Management
 * Phase 5A: Multi-Server Support with Automatic Failover
 *
 * Implements Blossom protocol (BUD-02) for uploading images
 * https://github.com/hzrd149/blossom/blob/master/buds/02.md
 *
 * Features:
 * - Nostr signature-based authentication (NIP-98 style)
 * - Anonymous uploads (fallback)
 * - Multi-server support with automatic failover (Phase 5A)
 * - Retry logic with exponential backoff
 * - Timeout handling (configurable)
 * - Server health tracking
 */

import { clientConfig } from "../../config/env.client";
import type { BannerUploadResponse } from "../../types/profile";

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

/**
 * Create Nostr authorization event for upload
 * Per BUD-02 spec: kind 24242 event with upload metadata
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
  signer?: (event: any) => Promise<any>
): Promise<string | null> {
  if (!signer) {
    return null; // Anonymous upload
  }

  try {
    const event = {
      kind: 24242, // Blossom upload authorization event
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["t", "upload"],
        ["x", fileHash], // SHA-256 hash
        ["size", fileSize.toString()],
        ["m", mimeType],
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
