/**
 * @fileoverview Unit tests for PNS Events Module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNoisePnsEnvelope,
  parseNoisePnsEnvelope,
  PNS_EVENT_KIND,
} from "../pns-events";
import type { NoisePnsEnvelope, PnsNoteMetadata } from "../../../noise/types";
import { PNS_PREDEFINED_TAGS } from "../../../noise/types";
import {
  generateSymmetricKey,
  bytesToHex,
  secureZero,
} from "../../../noise/primitives";

// Test fixtures
const VALID_NOISE_KEY = generateSymmetricKey();
const VALID_CONTENT = "This is my private note content.";
const VALID_METADATA: PnsNoteMetadata = {
  tags: ["important", "personal"], // Using predefined tags
  createdAt: Date.now(),
};

// Metadata with new predefined tags for testing
const EXTENDED_TAGS_METADATA: PnsNoteMetadata = {
  tags: ["software", "hardware", "links"], // New predefined categories
  createdAt: Date.now(),
};

// Keys to track for cleanup
const keysToCleanup: Uint8Array[] = [];

afterEach(() => {
  for (const key of keysToCleanup) {
    secureZero(key);
  }
  keysToCleanup.length = 0;
  vi.restoreAllMocks();
});

describe("PNS Events Module", () => {
  describe("PNS_EVENT_KIND", () => {
    it("should be 1080", () => {
      expect(PNS_EVENT_KIND).toBe(1080);
    });
  });

  describe("createNoisePnsEnvelope", () => {
    it("should create a valid envelope", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const envelope = await createNoisePnsEnvelope(
        VALID_CONTENT,
        VALID_METADATA,
        noiseKey,
        0,
        "everlasting-standard"
      );

      expect(envelope.version).toBe(1);
      expect(envelope.fs_mode).toBe("noise-fs");
      expect(envelope.note_epoch).toBe(0);
      expect(envelope.noise_ciphertext).toBeDefined();
      expect(envelope.noise_nonce).toBeDefined();
      expect(envelope.security_tier).toBe("everlasting-standard");
      expect(envelope.created_at).toBeDefined();
    });

    it("should encrypt content so it differs from plaintext", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const envelope = await createNoisePnsEnvelope(
        VALID_CONTENT,
        VALID_METADATA,
        noiseKey,
        0
      );

      // Ciphertext should not contain the plaintext
      expect(envelope.noise_ciphertext).not.toContain(VALID_CONTENT);
    });

    it("should produce different ciphertext for same content (random nonce)", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const envelope1 = await createNoisePnsEnvelope(
        VALID_CONTENT,
        VALID_METADATA,
        noiseKey,
        0
      );

      const envelope2 = await createNoisePnsEnvelope(
        VALID_CONTENT,
        VALID_METADATA,
        noiseKey,
        0
      );

      // Different nonces should produce different ciphertexts
      expect(envelope1.noise_nonce).not.toBe(envelope2.noise_nonce);
      expect(envelope1.noise_ciphertext).not.toBe(envelope2.noise_ciphertext);
    });

    it("should throw for invalid key length", async () => {
      const shortKey = new Uint8Array(16);

      await expect(
        createNoisePnsEnvelope(VALID_CONTENT, VALID_METADATA, shortKey, 0)
      ).rejects.toThrow("Invalid noise key");
    });

    it("should handle Unicode content", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const unicodeContent = "Hello 🌍 नमस्ते 你好 مرحبا";

      const envelope = await createNoisePnsEnvelope(
        unicodeContent,
        VALID_METADATA,
        noiseKey,
        0
      );

      expect(envelope.noise_ciphertext).toBeDefined();
    });

    it("should include correct note epoch", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const envelope = await createNoisePnsEnvelope(
        VALID_CONTENT,
        VALID_METADATA,
        noiseKey,
        42
      );

      expect(envelope.note_epoch).toBe(42);
    });

    it("should set default security tier", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const envelope = await createNoisePnsEnvelope(
        VALID_CONTENT,
        VALID_METADATA,
        noiseKey,
        0
      );

      expect(envelope.security_tier).toBe("everlasting-standard");
    });
  });

  describe("parseNoisePnsEnvelope", () => {
    it("should decrypt content correctly", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const envelope = await createNoisePnsEnvelope(
        VALID_CONTENT,
        VALID_METADATA,
        noiseKey,
        0
      );

      const parsed = await parseNoisePnsEnvelope(envelope, noiseKey);

      expect(parsed.content).toBe(VALID_CONTENT);
    });

    it("should preserve metadata through encryption/decryption", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const metadata: PnsNoteMetadata = {
        tags: ["test", "roundtrip"],
        noteId: "note-123",
        createdAt: Date.now(),
      };

      const envelope = await createNoisePnsEnvelope(
        VALID_CONTENT,
        metadata,
        noiseKey,
        5
      );

      const parsed = await parseNoisePnsEnvelope(envelope, noiseKey);

      expect(parsed.metadata.tags).toEqual(metadata.tags);
      expect(parsed.metadata.noteId).toBe(metadata.noteId);
    });

    it("should handle all predefined tag categories", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      // Use all predefined tags from PNS_PREDEFINED_TAGS
      const allPredefinedTags = [...PNS_PREDEFINED_TAGS];
      const metadata: PnsNoteMetadata = {
        tags: allPredefinedTags,
        createdAt: Date.now(),
      };

      const envelope = await createNoisePnsEnvelope(
        VALID_CONTENT,
        metadata,
        noiseKey,
        0
      );

      const parsed = await parseNoisePnsEnvelope(envelope, noiseKey);

      expect(parsed.metadata.tags).toEqual(allPredefinedTags);
      expect(parsed.metadata.tags).toContain("important");
      expect(parsed.metadata.tags).toContain("software");
      expect(parsed.metadata.tags).toContain("hardware");
      expect(parsed.metadata.tags).toContain("graphics");
      expect(parsed.metadata.tags).toContain("links");
      expect(parsed.metadata.tags).toContain("quotations");
    });

    it("should preserve extended predefined tags through encryption", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const envelope = await createNoisePnsEnvelope(
        "Code snippet for project",
        EXTENDED_TAGS_METADATA,
        noiseKey,
        0
      );

      const parsed = await parseNoisePnsEnvelope(envelope, noiseKey);

      expect(parsed.metadata.tags).toEqual(["software", "hardware", "links"]);
    });

    it("should handle Unicode content", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const unicodeContent = "Hello 🌍 नमस्ते 你好 مرحبا 🎉";

      const envelope = await createNoisePnsEnvelope(
        unicodeContent,
        VALID_METADATA,
        noiseKey,
        0
      );

      const parsed = await parseNoisePnsEnvelope(envelope, noiseKey);

      expect(parsed.content).toBe(unicodeContent);
    });

    it("should throw for wrong key", async () => {
      const noiseKey = generateSymmetricKey();
      const wrongKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey, wrongKey);

      const envelope = await createNoisePnsEnvelope(
        VALID_CONTENT,
        VALID_METADATA,
        noiseKey,
        0
      );

      await expect(parseNoisePnsEnvelope(envelope, wrongKey)).rejects.toThrow();
    });

    it("should throw for corrupted ciphertext", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const envelope = await createNoisePnsEnvelope(
        VALID_CONTENT,
        VALID_METADATA,
        noiseKey,
        0
      );

      // Corrupt the ciphertext
      const corruptedEnvelope: NoisePnsEnvelope = {
        ...envelope,
        noise_ciphertext: "corrupted" + envelope.noise_ciphertext.slice(10),
      };

      await expect(
        parseNoisePnsEnvelope(corruptedEnvelope, noiseKey)
      ).rejects.toThrow();
    });

    it("should throw for invalid envelope version", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const invalidEnvelope = {
        version: 99,
        fs_mode: "noise-fs",
        note_epoch: 0,
        noise_ciphertext: "abc",
        noise_nonce: "def",
        security_tier: "everlasting-standard",
        created_at: Date.now(),
      } as unknown as NoisePnsEnvelope;

      await expect(
        parseNoisePnsEnvelope(invalidEnvelope, noiseKey)
      ).rejects.toThrow("Invalid or unsupported");
    });

    it("should throw for invalid key length", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const envelope = await createNoisePnsEnvelope(
        VALID_CONTENT,
        VALID_METADATA,
        noiseKey,
        0
      );

      const shortKey = new Uint8Array(16);

      await expect(parseNoisePnsEnvelope(envelope, shortKey)).rejects.toThrow(
        "Invalid noise key"
      );
    });

    it("should handle empty content", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const envelope = await createNoisePnsEnvelope(
        "",
        VALID_METADATA,
        noiseKey,
        0
      );

      const parsed = await parseNoisePnsEnvelope(envelope, noiseKey);

      expect(parsed.content).toBe("");
    });

    it("should handle long content", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const longContent = "A".repeat(10000);

      const envelope = await createNoisePnsEnvelope(
        longContent,
        VALID_METADATA,
        noiseKey,
        0
      );

      const parsed = await parseNoisePnsEnvelope(envelope, noiseKey);

      expect(parsed.content).toBe(longContent);
    });
  });

  describe("Round-trip Encryption", () => {
    it("should encrypt and decrypt with ephemeral policy", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const metadataWithEphemeral: PnsNoteMetadata = {
        ...VALID_METADATA,
        ephemeralPolicy: {
          isEphemeral: true,
          ttlSeconds: 3600,
          expiresAt: Date.now() + 3600000,
          deleteFromRelays: true,
        },
      };

      const envelope = await createNoisePnsEnvelope(
        VALID_CONTENT,
        metadataWithEphemeral,
        noiseKey,
        0
      );

      const parsed = await parseNoisePnsEnvelope(envelope, noiseKey);

      expect(parsed.content).toBe(VALID_CONTENT);
      expect(parsed.metadata.ephemeralPolicy?.isEphemeral).toBe(true);
      expect(parsed.metadata.ephemeralPolicy?.ttlSeconds).toBe(3600);
    });

    it("should preserve all metadata fields", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const fullMetadata: PnsNoteMetadata = {
        noteId: "test-note-id",
        tags: ["tag1", "tag2", "tag3"],
        createdAt: Date.now() - 1000,
        updatedAt: Date.now(),
        ephemeralPolicy: {
          isEphemeral: false,
        },
      };

      const envelope = await createNoisePnsEnvelope(
        VALID_CONTENT,
        fullMetadata,
        noiseKey,
        10
      );

      const parsed = await parseNoisePnsEnvelope(envelope, noiseKey);

      expect(parsed.metadata.noteId).toBe(fullMetadata.noteId);
      expect(parsed.metadata.tags).toEqual(fullMetadata.tags);
      expect(parsed.metadata.ephemeralPolicy?.isEphemeral).toBe(false);
    });

    it("should work with different security tiers", async () => {
      const noiseKey = generateSymmetricKey();
      keysToCleanup.push(noiseKey);

      const tiers = [
        "ephemeral-minimum",
        "everlasting-standard",
        "everlasting-maximum",
      ] as const;

      for (const tier of tiers) {
        const envelope = await createNoisePnsEnvelope(
          VALID_CONTENT,
          VALID_METADATA,
          noiseKey,
          0,
          tier
        );

        const parsed = await parseNoisePnsEnvelope(envelope, noiseKey);

        expect(parsed.content).toBe(VALID_CONTENT);
        expect(envelope.security_tier).toBe(tier);
      }
    });
  });
});
