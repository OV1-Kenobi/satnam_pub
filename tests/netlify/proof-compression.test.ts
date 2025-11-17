import { describe, expect, it } from "vitest";
import {
  calculateCompressionRatio,
  compressProof,
  decompressProof,
} from "../../netlify/functions_active/utils/proof-compression.ts";

// NOTE: These tests exercise the gzip/base64 compression helpers used by
// the SimpleProof timestamp Netlify function. They are intentionally small
// and deterministic to keep CI/runtime overhead low.

describe("proof-compression utilities", () => {
  const sampleProof =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".repeat(4);

  it("compresses and decompresses a proof round-trip", async () => {
    const compressed = await compressProof(sampleProof);
    const decompressed = await decompressProof(compressed);

    expect(decompressed).toBe(sampleProof);

    const ratio = calculateCompressionRatio(sampleProof, compressed);
    expect(ratio).toBeGreaterThan(0);
    // Typical OTS-style strings should compress to well under 70% of original
    expect(ratio).toBeLessThan(0.7);
  });

  it("handles empty strings gracefully", async () => {
    const compressed = await compressProof("");
    const decompressed = await decompressProof(compressed);

    expect(compressed).toBe("");
    expect(decompressed).toBe("");

    const ratio = calculateCompressionRatio("", compressed);
    expect(ratio).toBe(0);
  });

  it("handles invalid base64 input without throwing", async () => {
    const invalid = "not-base64-@@@";
    const decompressed = await decompressProof(invalid);

    // On failure, decompressor should return the original string unchanged
    expect(decompressed).toBe(invalid);
  });

  it("handles corrupted compressed data without throwing", async () => {
    const compressed = await compressProof(sampleProof);
    // Corrupt by truncating the string
    const corrupted = compressed.slice(0, Math.floor(compressed.length / 2));

    const decompressed = await decompressProof(corrupted);

    // Decompression should not throw and should fall back to the stored value
    expect(decompressed).toBe(corrupted);
  });
});

