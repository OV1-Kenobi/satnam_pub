/**
 * Batch NDEF Writer with Retry Logic
 * Phase 11 Task 11.2.4: Performance Optimization
 *
 * Provides optimized NFC write operations with:
 * - Batch record writes (single write operation for multiple records)
 * - Exponential backoff retry logic
 * - Browser compatibility checks
 * - Debug logging support
 */

import { getEnvVar } from "../../config/env.client";
import { retryNFCOperation } from "../tapsigner/nfc-reader";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * NDEF record data for batch writes
 */
export interface NDEFRecordData {
  recordType: string;
  data: string | ArrayBuffer | Uint8Array;
  lang?: string;
  mediaType?: string;
}

/**
 * Result of NFC write operation
 */
export interface NFCWriteResult {
  success: boolean;
  bytesWritten?: number;
  error?: string;
}

// ============================================================================
// Browser Compatibility Checks
// ============================================================================

/**
 * Check if NFC writing is supported in the browser
 */
export function isNFCWriteSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "NDEFWriter" in window;
}

/**
 * Get NFC write compatibility message
 */
export function getNFCWriteCompatibilityMessage(): string {
  if (!isNFCWriteSupported()) {
    return "NFC writing is not supported on this device. Please use Chrome or Edge on Android with HTTPS.";
  }
  return "NFC writing is supported";
}

// ============================================================================
// Batch NDEF Write Operations
// ============================================================================

/**
 * Write multiple NDEF records in a single operation with retry logic
 * @param records - Array of NDEF records to write
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Promise resolving to write result
 */
export async function batchWriteNDEFRecords(
  records: NDEFRecordData[],
  maxRetries: number = 3,
): Promise<NFCWriteResult> {
  const debugEnabled = getEnvVar("VITE_TAPSIGNER_DEBUG") === "true";

  try {
    // Validate browser support
    if (!isNFCWriteSupported()) {
      return {
        success: false,
        bytesWritten: 0,
        error: "NFC writing not supported in this browser",
      };
    }

    // Validate input
    if (!records || records.length === 0) {
      return {
        success: false,
        bytesWritten: 0,
        error: "No records provided for writing",
      };
    }

    if (debugEnabled) {
      console.log(
        `[Batch NDEF Writer] Writing ${records.length} records in single operation`,
      );
    }

    // Wrap write operation in retry logic
    await retryNFCOperation(
      async () => {
        const writer = new (window as any).NDEFWriter();

        // Build NDEF message with all records
        const message = {
          records: records.map((record) => ({
            recordType: record.recordType,
            data: record.data,
            ...(record.lang && { lang: record.lang }),
            ...(record.mediaType && { mediaType: record.mediaType }),
          })),
        };

        // Perform single write operation
        await writer.write(message);

        if (debugEnabled) {
          console.log(
            `[Batch NDEF Writer] Successfully wrote ${records.length} records`,
          );
        }
      },
      maxRetries,
      "Batch NDEF write",
    );

    // Calculate approximate bytes written
    const bytesWritten = records.reduce((total, record) => {
      if (typeof record.data === "string") {
        return total + new TextEncoder().encode(record.data).length;
      } else if (record.data instanceof ArrayBuffer) {
        return total + record.data.byteLength;
      } else if (record.data instanceof Uint8Array) {
        return total + record.data.length;
      }
      return total;
    }, 0);

    return {
      success: true,
      bytesWritten,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "NFC write failed";
    console.error("[Batch NDEF Writer] Write error:", errorMessage);
    return {
      success: false,
      bytesWritten: 0,
      error: errorMessage,
    };
  }
}

/**
 * Write a single NDEF text record with retry logic
 * @param text - Text content to write
 * @param lang - Language code (default: "en")
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Promise resolving to write result
 */
export async function writeSingleTextRecord(
  text: string,
  lang: string = "en",
  maxRetries: number = 3,
): Promise<NFCWriteResult> {
  return batchWriteNDEFRecords(
    [
      {
        recordType: "text",
        data: text,
        lang,
      },
    ],
    maxRetries,
  );
}
