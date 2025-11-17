import { Buffer } from "node:buffer";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { logError } from "../../functions/utils/logging.js";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Compress an OTS proof string using gzip and return a base64-encoded string.
 *
 * On failure, this function logs the error and returns the original proof
 * string unmodified so that callers can gracefully degrade to uncompressed
 * storage without breaking the attestation flow.
 */
export async function compressProof(proof: string): Promise<string> {
  if (!proof) {
    return proof;
  }

  try {
    const buffer = Buffer.from(proof, "utf8");
    const compressed = await gzipAsync(buffer);
    return compressed.toString("base64");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown compression error";

    logError("Proof compression failed", {
      component: "proof-compression",
      metadata: { error: message },
    });

    // Graceful degradation: return original uncompressed proof
    return proof;
  }
}

/**
 * Decompress a base64-encoded, gzip-compressed proof string back to its
 * original UTF-8 form.
 *
 * On failure (e.g., invalid base64 or corrupted gzip payload), this function
 * logs the error and returns the input string unchanged so that callers can
 * still access the stored value without throwing runtime errors.
 */
export async function decompressProof(
  compressedProof: string
): Promise<string> {
  if (!compressedProof) {
    return compressedProof;
  }

  try {
    const buffer = Buffer.from(compressedProof, "base64");
    const decompressed = await gunzipAsync(buffer);
    return decompressed.toString("utf8");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown decompression error";

    logError("Proof decompression failed", {
      component: "proof-compression",
      metadata: { error: message },
    });

    // Graceful degradation: return the stored string unchanged
    return compressedProof;
  }
}

/**
 * Calculate the compression ratio (compressed / original) based on string
 * length. Returns 0 when the original string is empty to avoid division by
 * zero.
 */
export function calculateCompressionRatio(
  original: string,
  compressed: string
): number {
  if (!original || original.length === 0) {
    return 0;
  }

  return compressed.length / original.length;
}
