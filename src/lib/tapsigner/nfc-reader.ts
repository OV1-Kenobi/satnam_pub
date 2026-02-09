/**
 * NFC Reader Library for Tapsigner
 * Phase 3 Task 3.2: Web NFC API Integration
 * Phase 11 Task 11.2.4: Performance Optimization (UID caching, retry logic)
 *
 * Provides utilities for reading NFC cards using the Web NFC API
 * Handles card detection, NDEF message parsing, and error handling
 *
 * Performance Optimizations:
 * - 30-second UID cache to reduce redundant scans
 * - Exponential backoff retry logic for failed operations
 * - Batch NDEF record processing
 */

import { getEnvVar } from "../../config/env.client";
import CryptoJS from "crypto-js";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Card data extracted from NFC tag
 */
export interface CardData {
  cardId: string;
  publicKey: string;
  timestamp: number;
}

/**
 * Cached card data with expiration
 */
interface CachedCardData {
  cardData: CardData;
  expiresAt: number;
}

// ============================================================================
// Module-Level Cache (30-second TTL)
// ============================================================================

const CARD_UID_CACHE = new Map<string, CachedCardData>();
const CACHE_TTL_MS = 30000; // 30 seconds

/**
 * Get cached card data if available and not expired
 */
function getCachedCardData(cardId: string): CardData | null {
  const cached = CARD_UID_CACHE.get(cardId);
  if (!cached) return null;

  const now = Date.now();
  if (now > cached.expiresAt) {
    CARD_UID_CACHE.delete(cardId);
    return null;
  }

  const debugEnabled = getEnvVar("VITE_TAPSIGNER_DEBUG") === "true";
  if (debugEnabled) {
    console.log(`[NFC Reader] Cache hit for card ${cardId.substring(0, 8)}...`);
  }

  return cached.cardData;
}

/**
 * Cache card data with TTL
 */
function cacheCardData(cardData: CardData): void {
  const expiresAt = Date.now() + CACHE_TTL_MS;
  CARD_UID_CACHE.set(cardData.cardId, { cardData, expiresAt });

  const debugEnabled = getEnvVar("VITE_TAPSIGNER_DEBUG") === "true";
  if (debugEnabled) {
    console.log(
      `[NFC Reader] Cached card ${cardData.cardId.substring(0, 8)}... (expires in ${CACHE_TTL_MS}ms)`,
    );
  }
}

/**
 * Clear expired cache entries
 */
function clearExpiredCache(): void {
  const now = Date.now();
  for (const [cardId, cached] of CARD_UID_CACHE.entries()) {
    if (now > cached.expiresAt) {
      CARD_UID_CACHE.delete(cardId);
    }
  }
}

// Periodically clear expired cache entries (every 60 seconds)
if (typeof window !== "undefined") {
  setInterval(clearExpiredCache, 60000);
}

// ============================================================================
// Retry Logic with Exponential Backoff
// ============================================================================

/**
 * Retry an NFC operation with exponential backoff
 * @param operation - Async operation to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param operationName - Name of operation for logging
 * @returns Result of the operation
 */
export async function retryNFCOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  operationName: string = "NFC operation",
): Promise<T> {
  const debugEnabled = getEnvVar("VITE_TAPSIGNER_DEBUG") === "true";
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (debugEnabled && attempt > 0) {
        console.log(
          `[NFC Reader] Retry attempt ${attempt}/${maxRetries} for ${operationName}`,
        );
      }

      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on certain errors
      const message = lastError.message.toLowerCase();
      if (
        message.includes("permission") ||
        message.includes("not supported") ||
        message.includes("abort")
      ) {
        throw lastError;
      }

      // Calculate exponential backoff delay: 500ms, 1000ms, 2000ms
      if (attempt < maxRetries) {
        const delayMs = 500 * Math.pow(2, attempt);
        if (debugEnabled) {
          console.log(
            `[NFC Reader] ${operationName} failed, retrying in ${delayMs}ms...`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  // All retries exhausted
  if (debugEnabled) {
    console.error(
      `[NFC Reader] ${operationName} failed after ${maxRetries} retries:`,
      lastError,
    );
  }
  throw (
    lastError ||
    new Error(`${operationName} failed after ${maxRetries} retries`)
  );
}

/**
 * Result of scanning for a card when raw NDEF message is requested
 */
export interface ScanForCardResult {
  cardData: CardData;
  rawMessage?: unknown;
}

interface CardConfig {
  uid: string;
  signingPublicKey: string;
  encryptedPrivateKey?: string; // Optional encrypted private key for recovery scenarios
  aesKeys: {
    authentication: string;
    encryption: string;
    sun: string;
  };
  pinHash: string;
  userNpub: string;
  familyRole: "offspring" | "adult" | "steward" | "guardian" | "private";
  spendingLimits?: {
    daily: number;
    weekly: number;
    monthly: number;
    perTransaction: number;
  };
  individual: string;
  createdAt: number;
  lastUsed: number;
  // Application-layer P-256 keypair for NTAG424 operation signing (encrypted at rest in encrypted_config)
  p256PrivateKey?: string; // 64-char hex (32 bytes), used for spend + non-Nostr sign operations
  p256PublicKey?: string; // 130-char hex (uncompressed) or 66-char (compressed), for integrity verification
}

// Lazy import to prevent Supabase client creation on page load
let supabaseClient: any = null;

async function getSupabaseClient() {
  if (!supabaseClient) {
    const { supabase } = await import("../supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
}

function getMasterKey(): string {
  const vaultKey = getEnvVar("VITE_NTAG424_MASTER_KEY");

  if (vaultKey && vaultKey !== "your-master-key-here") {
    return vaultKey;
  }

  console.warn(
    "[TapSigner NFC Reader] Using development NTAG424 master key. Configure VITE_NTAG424_MASTER_KEY for production.",
  );
  return "dev-ntag424-master-key-32-chars";
}

function decryptCardConfig(encryptedConfig: string): CardConfig {
  if (!encryptedConfig) {
    throw new Error("Encrypted card config is empty");
  }

  const masterKey = getMasterKey();
  const bytes = CryptoJS.AES.decrypt(encryptedConfig, masterKey);
  const decryptedString = bytes.toString(CryptoJS.enc.Utf8);

  if (!decryptedString) {
    throw new Error("Failed to decrypt card config - empty result");
  }

  let config: unknown;
  try {
    config = JSON.parse(decryptedString);
  } catch {
    throw new Error("Failed to parse decrypted card config JSON");
  }

  if (!config || typeof config !== "object") {
    throw new Error("Decrypted card config is not an object");
  }

  const typed = config as CardConfig;

  if (!typed.signingPublicKey) {
    throw new Error("Card config missing signingPublicKey");
  }

  return typed;
}

export async function fetchCardPublicKey(
  cardId: string,
): Promise<string | null> {
  if (!cardId || cardId.length === 0) {
    throw new Error("Card ID is required to fetch public key");
  }

  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from("ntag424_registrations")
    .select("encrypted_config, uid")
    .eq("uid", cardId)
    .maybeSingle();

  if (error) {
    console.error(
      "[TapSigner NFC Reader] Supabase error fetching card public key:",
      error.message,
    );
    throw new Error("Failed to fetch card public key from backend");
  }

  if (!data || !data.encrypted_config) {
    if (getEnvVar("VITE_TAPSIGNER_DEBUG") === "true") {
      console.warn(
        "[TapSigner NFC Reader] No registration found for cardId:",
        cardId.substring(0, 8) + "...",
      );
    }
    return null;
  }

  const config = decryptCardConfig(data.encrypted_config as string);
  return config.signingPublicKey || null;
}

/**
 * Check if Web NFC API is supported in the browser
 */
export function isNFCSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "NDEFReader" in window;
}

/**
 * Get browser compatibility message
 */
export function getNFCCompatibilityMessage(): string {
  if (!isNFCSupported()) {
    return "Web NFC API is not supported on this device. Please use Chrome or Edge on HTTPS.";
  }
  return "Web NFC API is supported";
}

/**
 * Initialize NFC reader and check browser support
 */
export async function initializeNFCReader(): Promise<boolean> {
  try {
    if (!isNFCSupported()) {
      throw new Error(getNFCCompatibilityMessage());
    }
    return true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "NFC initialization failed";
    console.error("[NFC Reader] Initialization error:", message);
    throw error;
  }
}

/**
 * Scan for NFC card with timeout and optional cache bypass
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @param includeRawMessage - When true, also return the raw NDEF message
 * @param forceRefresh - When true, bypass cache and force new scan (default: false)
 * @returns Promise resolving to card data, optionally with raw message
 */
export async function scanForCard(
  timeoutMs?: number,
  forceRefresh?: boolean,
): Promise<CardData>;
export async function scanForCard(
  timeoutMs: number | undefined,
  includeRawMessage: true,
  forceRefresh?: boolean,
): Promise<ScanForCardResult>;
export async function scanForCard(
  timeoutMs: number = 10000,
  includeRawMessageOrForceRefresh: boolean = false,
  forceRefresh: boolean = false,
): Promise<CardData | ScanForCardResult> {
  // Handle overloaded parameters
  const includeRawMessage =
    typeof includeRawMessageOrForceRefresh === "boolean" &&
    forceRefresh !== undefined
      ? includeRawMessageOrForceRefresh
      : false;
  const shouldForceRefresh =
    forceRefresh !== undefined
      ? forceRefresh
      : typeof includeRawMessageOrForceRefresh === "boolean" &&
          forceRefresh === undefined
        ? includeRawMessageOrForceRefresh
        : false;

  const debugEnabled = getEnvVar("VITE_TAPSIGNER_DEBUG") === "true";

  // Wrap the actual scan operation in retry logic
  return await retryNFCOperation(
    async () => {
      try {
        if (!isNFCSupported()) {
          throw new Error("Web NFC API not supported on this device");
        }

        const reader = new (window as any).NDEFReader();

        if (debugEnabled) {
          console.log(
            "[NFC Reader] Starting card scan with timeout:",
            timeoutMs,
          );
        }

        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reader.abort?.();
            reject(new Error("Card detection timeout - please try again"));
          }, timeoutMs);
        });

        // Create card detection promise
        const cardDetectionPromise = new Promise<CardData | ScanForCardResult>(
          (resolve, reject) => {
            reader.onreading = (event: any) => {
              try {
                if (debugEnabled) {
                  console.log(
                    "[NFC Reader] Card detected, parsing NDEF message",
                  );
                }

                const message = event.message;
                if (
                  !message ||
                  !message.records ||
                  message.records.length === 0
                ) {
                  throw new Error("Invalid NDEF message format");
                }

                const cardData = extractCardData(message);

                // Check cache first (unless forceRefresh is true)
                if (!shouldForceRefresh) {
                  const cachedData = getCachedCardData(cardData.cardId);
                  if (cachedData) {
                    if (debugEnabled) {
                      console.log(
                        "[NFC Reader] Using cached card data for",
                        cardData.cardId.substring(0, 8) + "...",
                      );
                    }
                    if (includeRawMessage) {
                      resolve({ cardData: cachedData, rawMessage: message });
                    } else {
                      resolve(cachedData);
                    }
                    return;
                  }
                }

                // Cache the new card data
                cacheCardData(cardData);

                if (debugEnabled) {
                  console.log("[NFC Reader] Card data extracted successfully");
                }

                if (includeRawMessage) {
                  resolve({ cardData, rawMessage: message });
                } else {
                  resolve(cardData);
                }
              } catch (err) {
                const errorMsg =
                  err instanceof Error
                    ? err.message
                    : "Failed to parse card data";
                if (debugEnabled) {
                  console.error("[NFC Reader] Card parsing error:", errorMsg);
                }
                reject(err);
              }
            };

            reader.onerror = () => {
              reject(new Error("NFC read error - please try again"));
            };

            reader.scan().catch(reject);
          },
        );

        // Race between card detection and timeout
        return await Promise.race([cardDetectionPromise, timeoutPromise]);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Card scan failed";
        console.error("[NFC Reader] Scan error:", message);
        throw error;
      }
    },
    3,
    "Card scan",
  );
}

/**
 * Parse NDEF message from NFC tag
 * @param message - NDEF message object
 * @returns Parsed message data
 */
export function parseNDEFMessage(message: any): any {
  try {
    if (!message || !message.records) {
      throw new Error("Invalid NDEF message structure");
    }

    const records = message.records.map((record: any) => {
      const decoder = new TextDecoder();
      const data = decoder.decode(record.data);
      return {
        recordType: record.recordType,
        mediaType: record.mediaType,
        data: data,
      };
    });

    return {
      records: records,
      timestamp: Date.now(),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "NDEF parsing failed";
    console.error("[NFC Reader] NDEF parsing error:", message);
    throw error;
  }
}

/**
 * Extract card data from NDEF message
 * @param message - NDEF message object
 * @returns Card data (cardId and publicKey)
 */
export function extractCardData(message: any): CardData {
  try {
    if (!message || !message.records || message.records.length === 0) {
      throw new Error("No records in NDEF message");
    }

    const decoder = new TextDecoder();
    const records = message.records;

    // Extract card ID from first record
    if (!records[0] || !records[0].data) {
      throw new Error("Invalid first record format");
    }

    const cardId = decoder.decode(records[0].data).trim();
    if (!cardId) {
      throw new Error("Card ID is empty");
    }

    // Extract public key from second record (if available)
    let publicKey = "";
    if (records.length > 1 && records[1] && records[1].data) {
      publicKey = decoder.decode(records[1].data).trim();
    }

    // If no public key in records, we set a placeholder that callers
    // must replace via fetchCardPublicKey(cardId) before using it for
    // any cryptographic verification.
    if (!publicKey) {
      publicKey = "0".repeat(64); // 64-character hex placeholder
    }

    const isPlaceholder = publicKey === "0".repeat(64);

    if (!/^[a-fA-F0-9]{64}$/.test(publicKey)) {
      throw new Error("Invalid public key format from card or backend");
    }

    if (isPlaceholder && getEnvVar("VITE_TAPSIGNER_DEBUG") === "true") {
      console.warn(
        "[TapSigner NFC Reader] Placeholder public key is still being used. Backend lookup required for production.",
      );
    }

    return {
      cardId: cardId,
      publicKey: publicKey,
      timestamp: Date.now(),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Card data extraction failed";
    console.error("[NFC Reader] Extraction error:", message);
    throw error;
  }
}

/**
 * Handle NFC errors with user-friendly messages
 * @param error - Error object
 * @returns User-friendly error message
 */
export function handleNFCError(error: any): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("timeout")) {
      return "Card detection timed out. Please try again.";
    }
    if (message.includes("not supported")) {
      return "Web NFC API is not supported on this device. Please use Chrome or Edge on HTTPS.";
    }
    if (message.includes("permission")) {
      return "NFC permission denied. Please allow NFC access in your browser settings.";
    }
    if (message.includes("abort")) {
      return "Card scan was cancelled.";
    }
    if (message.includes("invalid")) {
      return "Invalid card data. Please try again with a valid Tapsigner card.";
    }

    return error.message;
  }

  return "An unknown NFC error occurred. Please try again.";
}

/**
 * Validate card data format
 * @param cardData - Card data to validate
 * @returns true if valid, false otherwise
 */
export function validateCardData(cardData: CardData): boolean {
  try {
    if (!cardData) return false;
    if (!cardData.cardId || cardData.cardId.length === 0) return false;
    if (!cardData.publicKey || cardData.publicKey.length === 0) return false;
    if (!cardData.timestamp || cardData.timestamp <= 0) return false;

    // Validate card ID format (should be hex string)
    if (!/^[a-fA-F0-9]+$/.test(cardData.cardId)) return false;

    // Validate public key format (should be 64-character hex string)
    if (!/^[a-fA-F0-9]{64}$/.test(cardData.publicKey)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
