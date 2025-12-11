/**
 * @fileoverview BlossomClient Unit Tests
 * @description Tests for Blossom protocol integration with AES-256-GCM encryption
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import {
  generateEncryptionKey,
  generateIv,
  exportKeyToBase64,
  importKeyFromBase64,
  encryptFileData,
  decryptFileData,
  uint8ArrayToBase64,
  base64ToUint8Array,
  getMediaTypeFromMime,
  buildNip94Event,
  buildImetaTag,
  buildFallbackTag,
  createAttachmentDescriptor,
  uploadBannerToBlossom,
} from "../lib/api/blossom-client";
import type {
  BlossomUploadResult,
  AttachmentDescriptor,
} from "../lib/api/blossom-client";
import { clientConfig } from "../config/env.client";

describe("BlossomClient Cryptographic Utilities", () => {
  describe("Key Generation", () => {
    it("should generate a valid AES-256 key", async () => {
      const key = await generateEncryptionKey();
      expect(key).toBeDefined();
      expect(key.type).toBe("secret");
      expect(key.algorithm.name).toBe("AES-GCM");
    });

    it("should generate a 12-byte IV", () => {
      const iv = generateIv();
      expect(iv).toBeInstanceOf(Uint8Array);
      expect(iv.length).toBe(12);
    });

    it("should export and import key correctly", async () => {
      const originalKey = await generateEncryptionKey();
      const exported = await exportKeyToBase64(originalKey);
      expect(typeof exported).toBe("string");
      expect(exported.length).toBeGreaterThan(0);

      const imported = await importKeyFromBase64(exported);
      expect(imported.type).toBe("secret");
      expect(imported.algorithm.name).toBe("AES-GCM");
    });
  });

  describe("Base64 Encoding/Decoding", () => {
    it("should encode and decode Uint8Array correctly", () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
      const encoded = uint8ArrayToBase64(original);
      const decoded = base64ToUint8Array(encoded);

      expect(decoded).toEqual(original);
    });

    it("should handle empty array", () => {
      const original = new Uint8Array([]);
      const encoded = uint8ArrayToBase64(original);
      const decoded = base64ToUint8Array(encoded);

      expect(decoded).toEqual(original);
    });
  });

  describe("Encryption/Decryption", () => {
    it("should encrypt and decrypt data correctly", async () => {
      const key = await generateEncryptionKey();
      const iv = generateIv();
      const plaintext = new TextEncoder().encode("Hello, Blossom!");

      const ciphertext = await encryptFileData(plaintext.buffer, key, iv);
      // Check it's ArrayBuffer-like (has byteLength property)
      expect(ciphertext.byteLength).toBeDefined();
      expect(ciphertext.byteLength).toBeGreaterThan(plaintext.length);

      const decrypted = await decryptFileData(ciphertext, key, iv);
      const decryptedText = new TextDecoder().decode(decrypted);
      expect(decryptedText).toBe("Hello, Blossom!");
    });

    it("should produce different ciphertext with different IVs", async () => {
      const key = await generateEncryptionKey();
      const iv1 = generateIv();
      const iv2 = generateIv();
      const plaintext = new TextEncoder().encode("Same message");

      const ciphertext1 = await encryptFileData(plaintext.buffer, key, iv1);
      const ciphertext2 = await encryptFileData(plaintext.buffer, key, iv2);

      const ct1Array = new Uint8Array(ciphertext1);
      const ct2Array = new Uint8Array(ciphertext2);

      // Ciphertexts should be different
      let areDifferent = false;
      for (let i = 0; i < ct1Array.length; i++) {
        if (ct1Array[i] !== ct2Array[i]) {
          areDifferent = true;
          break;
        }
      }
      expect(areDifferent).toBe(true);
    });
  });
});

describe("Media Type Detection", () => {
  it("should detect image types", () => {
    expect(getMediaTypeFromMime("image/png")).toBe("image");
    expect(getMediaTypeFromMime("image/jpeg")).toBe("image");
    expect(getMediaTypeFromMime("image/webp")).toBe("image");
  });

  it("should detect audio types", () => {
    expect(getMediaTypeFromMime("audio/mp3")).toBe("audio");
    expect(getMediaTypeFromMime("audio/wav")).toBe("audio");
    expect(getMediaTypeFromMime("audio/ogg")).toBe("audio");
  });

  it("should detect video types", () => {
    expect(getMediaTypeFromMime("video/mp4")).toBe("video");
    expect(getMediaTypeFromMime("video/webm")).toBe("video");
  });

  it("should default to file for unknown types", () => {
    expect(getMediaTypeFromMime("application/pdf")).toBe("file");
    expect(getMediaTypeFromMime("text/plain")).toBe("file");
    expect(getMediaTypeFromMime("")).toBe("file");
  });
});

describe("NIP-94 Event Building", () => {
  it("should build a valid NIP-94 event", () => {
    const event = buildNip94Event({
      url: "https://blossom.nostr.build/abc123",
      sha256: "abc123def456",
      size: 1234567,
      mimeType: "video/mp4",
    });

    expect(event.kind).toBe(1063);
    expect(event.content).toBe("");
    expect(event.tags).toContainEqual([
      "url",
      "https://blossom.nostr.build/abc123",
    ]);
    expect(event.tags).toContainEqual(["m", "video/mp4"]);
    expect(event.tags).toContainEqual(["x", "abc123def456"]);
    expect(event.tags).toContainEqual(["size", "1234567"]);
  });

  it("should include optional tags when provided", () => {
    const event = buildNip94Event({
      url: "https://blossom.nostr.build/abc123",
      sha256: "abc123def456",
      size: 1234567,
      mimeType: "image/png",
      alt: "A beautiful sunset",
      dim: "1920x1080",
    });

    expect(event.tags).toContainEqual(["alt", "A beautiful sunset"]);
    expect(event.tags).toContainEqual(["dim", "1920x1080"]);
  });
});

describe("NIP-17 Tag Building", () => {
  const mockAttachment: AttachmentDescriptor = {
    url: "https://blossom.nostr.build/abc123",
    fileName: "document.pdf",
    mimeType: "application/pdf",
    mediaType: "file",
    size: 1234567,
    sha256: "abc123def456",
    enc: {
      algo: "AES-GCM",
      key: "base64key==",
      iv: "base64iv==",
    },
  };

  it("should build a valid imeta tag", () => {
    const tag = buildImetaTag(mockAttachment);

    expect(tag[0]).toBe("imeta");
    expect(tag).toContain("url https://blossom.nostr.build/abc123");
    expect(tag).toContain("m application/pdf");
    expect(tag).toContain("x abc123def456");
    expect(tag).toContain("size 1234567");
  });

  it("should include alt text in imeta when provided", () => {
    const attachmentWithAlt = { ...mockAttachment, alt: "Important document" };
    const tag = buildImetaTag(attachmentWithAlt);

    expect(tag).toContain("alt Important document");
  });

  it("should build a valid fallback tag", () => {
    const tag = buildFallbackTag(mockAttachment);

    expect(tag[0]).toBe("fallback");
    expect(tag[1]).toContain("document.pdf");
    expect(tag[1]).toContain("encrypted attachment");
    expect(tag[1]).toContain("📎"); // File emoji
  });

  it("should use correct emoji for different media types", () => {
    const imageAttachment = { ...mockAttachment, mediaType: "image" as const };
    const audioAttachment = { ...mockAttachment, mediaType: "audio" as const };
    const videoAttachment = { ...mockAttachment, mediaType: "video" as const };

    expect(buildFallbackTag(imageAttachment)[1]).toContain("🖼️");
    expect(buildFallbackTag(audioAttachment)[1]).toContain("🎵");
    expect(buildFallbackTag(videoAttachment)[1]).toContain("🎬");
  });
});

describe("Attachment Descriptor Creation", () => {
  it("should create a valid descriptor from upload result", () => {
    const uploadResult: BlossomUploadResult = {
      success: true,
      url: "https://blossom.nostr.build/abc123",
      sha256: "abc123def456",
      size: 1234567,
      mimeType: "image/png",
      encryptionKey: "base64key==",
      encryptionIv: "base64iv==",
    };

    const mockFile = new File(["test"], "test.png", { type: "image/png" });
    const descriptor = createAttachmentDescriptor(uploadResult, mockFile);

    expect(descriptor).not.toBeNull();
    expect(descriptor?.url).toBe("https://blossom.nostr.build/abc123");
    expect(descriptor?.fileName).toBe("test.png");
    expect(descriptor?.mimeType).toBe("image/png");
    expect(descriptor?.mediaType).toBe("image");
    expect(descriptor?.enc.algo).toBe("AES-GCM");
    expect(descriptor?.enc.key).toBe("base64key==");
    expect(descriptor?.enc.iv).toBe("base64iv==");
  });

  it("should return null for failed upload", () => {
    const uploadResult: BlossomUploadResult = {
      success: false,
      error: "Upload failed",
    };

    const mockFile = new File(["test"], "test.png", { type: "image/png" });
    const descriptor = createAttachmentDescriptor(uploadResult, mockFile);

    expect(descriptor).toBeNull();
  });

  it("should include alt text when provided", () => {
    const uploadResult: BlossomUploadResult = {
      success: true,
      url: "https://blossom.nostr.build/abc123",
      sha256: "abc123def456",
      size: 1234567,
      mimeType: "image/png",
      encryptionKey: "base64key==",
      encryptionIv: "base64iv==",
    };

    const mockFile = new File(["test"], "sunset.png", { type: "image/png" });
    const descriptor = createAttachmentDescriptor(
      uploadResult,
      mockFile,
      "Beautiful sunset"
    );

    expect(descriptor?.alt).toBe("Beautiful sunset");
  });
});

describe("BlossomClient BUD-06 preflight", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Ensure Blossom uploads are enabled for these tests so we exercise the
    // upload path (including BUD-06 preflight) instead of the feature flag
    // guard.
    clientConfig.flags.blossomUploadEnabled = true;

    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function createMockFile(name: string, type: string): File {
    const encoder = new TextEncoder();
    const data = encoder.encode("test-data");
    const buffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    ) as ArrayBuffer;

    const mockFile: {
      name: string;
      type: string;
      size: number;
      arrayBuffer: () => Promise<ArrayBuffer>;
    } = {
      name,
      type,
      size: data.byteLength,
      arrayBuffer: async () => buffer,
    };

    return mockFile as unknown as File;
  }

  it("should perform HEAD preflight before PUT upload when server supports BUD-06", async () => {
    const fetchMock = globalThis.fetch as unknown as Mock;

    const headResponse = {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => "",
      json: async () => {
        throw new Error("HEAD json should not be called");
      },
    } as unknown as Response;

    const putResponseBody = {
      url: "https://blossom.nostr.build/abc123",
      sha256: "abc123",
      size: 123,
      type: "image/png",
    };

    const putResponse = {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => "",
      json: async () => putResponseBody,
    } as unknown as Response;

    fetchMock.mockResolvedValueOnce(headResponse);
    fetchMock.mockResolvedValueOnce(putResponse);

    const file = createMockFile("test.png", "image/png");
    const signer = vi.fn(async (event: unknown) => ({
      ...(event as Record<string, unknown>),
      id: "id",
      pubkey: "pubkey",
      sig: "sig",
    }));

    const result = await uploadBannerToBlossom(file, signer);

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstCall = fetchMock.mock.calls[0];
    const secondCall = fetchMock.mock.calls[1];

    const headUrl = firstCall[0] as string;
    const headInit = firstCall[1] as RequestInit;

    expect(headUrl).toBe(`${clientConfig.blossom.primaryUrl}/upload`);
    expect(headInit.method).toBe("HEAD");

    const headHeaders = headInit.headers as Record<string, string>;
    expect(headHeaders["X-SHA-256"]).toBeDefined();
    expect(headHeaders["X-Content-Length"]).toBe(file.size.toString());
    expect(headHeaders["X-Content-Type"]).toBe("image/png");
    expect(headHeaders["Authorization"]).toMatch(/^Nostr /);

    const putUrl = secondCall[0] as string;
    const putInit = secondCall[1] as RequestInit;
    expect(putUrl).toBe(`${clientConfig.blossom.primaryUrl}/upload`);
    expect(putInit.method).toBe("PUT");
  });

  it("should surface clear error when preflight returns 4xx/5xx and skip PUT", async () => {
    const fetchMock = globalThis.fetch as unknown as Mock;

    const headErrorResponse = {
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => "Unauthorized",
      json: async () => {
        throw new Error("HEAD json should not be called");
      },
    } as unknown as Response;

    // Mock HEAD 401 for all servers (primary and fallback) - each preflight
    // failure should skip the PUT for that server and move to the next.
    // With 2 servers (primary + fallback), we expect:
    //  - Server 1: HEAD 401 → skip PUT → failover
    //  - Server 2: HEAD 401 → skip PUT → all servers exhausted
    fetchMock.mockResolvedValue(headErrorResponse);

    const file = createMockFile("test.png", "image/png");
    const signer = vi.fn(async (event: unknown) => ({
      ...(event as Record<string, unknown>),
      id: "id",
      pubkey: "pubkey",
      sig: "sig",
    }));

    const result = await uploadBannerToBlossom(file, signer);

    expect(result.success).toBe(false);
    // Error should mention preflight failure (at least from the primary server)
    expect(result.error).toContain("Preflight check failed");
    // With 2 servers, each gets one HEAD preflight call before failing over
    // So we expect 2 HEAD calls (one per server)
    expect(fetchMock).toHaveBeenCalled();
    // Verify no PUT calls were made (all were blocked by preflight failures)
    const allCalls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    const putCalls = allCalls.filter((call) => call[1]?.method === "PUT");
    expect(putCalls.length).toBe(0);
  });

  it("should fall back to direct PUT when HEAD is not supported", async () => {
    const fetchMock = globalThis.fetch as unknown as Mock;

    const headNotAllowedResponse = {
      ok: false,
      status: 405,
      headers: new Headers(),
      text: async () => "Method Not Allowed",
      json: async () => {
        throw new Error("HEAD json should not be called");
      },
    } as unknown as Response;

    const putResponseBody = {
      url: "https://blossom.nostr.build/def456",
      sha256: "def456",
      size: 456,
      type: "image/png",
    };

    const putResponse = {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => "",
      json: async () => putResponseBody,
    } as unknown as Response;

    fetchMock.mockResolvedValueOnce(headNotAllowedResponse);
    fetchMock.mockResolvedValueOnce(putResponse);

    const file = createMockFile("test.png", "image/png");
    const signer = vi.fn(async (event: unknown) => ({
      ...(event as Record<string, unknown>),
      id: "id",
      pubkey: "pubkey",
      sig: "sig",
    }));

    const result = await uploadBannerToBlossom(file, signer);

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstCall = fetchMock.mock.calls[0];
    const secondCall = fetchMock.mock.calls[1];

    const headInit = firstCall[1] as RequestInit;
    expect(headInit.method).toBe("HEAD");

    const putInit = secondCall[1] as RequestInit;
    expect(putInit.method).toBe("PUT");
  });
});
