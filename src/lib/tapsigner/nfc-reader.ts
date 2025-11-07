/**
 * NFC Reader Library for Tapsigner
 * Phase 3 Task 3.2: Web NFC API Integration
 *
 * Provides utilities for reading NFC cards using the Web NFC API
 * Handles card detection, NDEF message parsing, and error handling
 */

import { getEnvVar } from "../../config/env.client";

/**
 * Card data extracted from NFC tag
 */
export interface CardData {
  cardId: string;
  publicKey: string;
  timestamp: number;
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
    const message = error instanceof Error ? error.message : "NFC initialization failed";
    console.error("[NFC Reader] Initialization error:", message);
    throw error;
  }
}

/**
 * Scan for NFC card with timeout
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns Promise resolving to card data
 */
export async function scanForCard(timeoutMs: number = 10000): Promise<CardData> {
  try {
    if (!isNFCSupported()) {
      throw new Error("Web NFC API not supported on this device");
    }

    const reader = new (window as any).NDEFReader();
    const debugEnabled = getEnvVar("VITE_TAPSIGNER_DEBUG") === "true";

    if (debugEnabled) {
      console.log("[NFC Reader] Starting card scan with timeout:", timeoutMs);
    }

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reader.abort?.();
        reject(new Error("Card detection timeout - please try again"));
      }, timeoutMs);
    });

    // Create card detection promise
    const cardDetectionPromise = new Promise<CardData>((resolve, reject) => {
      reader.onreading = (event: any) => {
        try {
          if (debugEnabled) {
            console.log("[NFC Reader] Card detected, parsing NDEF message");
          }

          const message = event.message;
          if (!message || !message.records || message.records.length === 0) {
            throw new Error("Invalid NDEF message format");
          }

          const cardData = extractCardData(message);
          if (debugEnabled) {
            console.log("[NFC Reader] Card data extracted successfully");
          }

          resolve(cardData);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Failed to parse card data";
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
    });

    // Race between card detection and timeout
    return await Promise.race([cardDetectionPromise, timeoutPromise]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Card scan failed";
    console.error("[NFC Reader] Scan error:", message);
    throw error;
  }
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
    const message = error instanceof Error ? error.message : "NDEF parsing failed";
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

    // If no public key in records, use placeholder (will be fetched from backend)
    if (!publicKey) {
      publicKey = "0".repeat(64); // 64-character hex placeholder
    }

    return {
      cardId: cardId,
      publicKey: publicKey,
      timestamp: Date.now(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Card data extraction failed";
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
      // Allow placeholder (all zeros) for now
      if (cardData.publicKey !== "0".repeat(64)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

