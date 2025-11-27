/**
 * @fileoverview Unit tests for PNS Service
 *
 * Tests the PnsService singleton pattern, initialization, and error handling.
 * Note: Full CRUD operations require complex mocking of NIP-44 encryption
 * and NoisePnsManager, which is tested via integration tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PnsService } from "../pns-service";
import type { VaultAccessor } from "../../../noise/noise-session-manager";
import { secureZero } from "../../../noise/primitives";
import { PNS_PREDEFINED_TAGS } from "../../../noise/types";

// Test fixtures - use Uint8Array for nsec
const VALID_NSEC = new Uint8Array([
  0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89,
  0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x23,
  0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
]);

// Mock vault accessor
function createMockVaultAccessor(): VaultAccessor {
  const storage = new Map<string, string>();

  return {
    get: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
    remove: vi.fn((key: string) => {
      storage.delete(key);
      return Promise.resolve();
    }),
    keys: vi.fn(() => Promise.resolve(Array.from(storage.keys()))),
  };
}

// Keys to track for cleanup
const keysToCleanup: Uint8Array[] = [];

describe("PnsService", () => {
  let service: PnsService;
  let mockVault: VaultAccessor;

  beforeEach(() => {
    PnsService.resetInstance();
    service = PnsService.getInstance();
    mockVault = createMockVaultAccessor();
    vi.clearAllMocks();
  });

  afterEach(() => {
    PnsService.resetInstance();
    for (const key of keysToCleanup) {
      secureZero(key);
    }
    keysToCleanup.length = 0;
    vi.restoreAllMocks();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = PnsService.getInstance();
      const instance2 = PnsService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = PnsService.getInstance();
      PnsService.resetInstance();
      const instance2 = PnsService.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("initialize", () => {
    it("should initialize successfully with valid nsec", async () => {
      await service.initialize(mockVault, VALID_NSEC);

      expect(service.isInitialized()).toBe(true);
    });

    it("should throw for invalid nsec length", async () => {
      const shortNsec = new Uint8Array(16);
      await expect(service.initialize(mockVault, shortNsec)).rejects.toThrow();
    });

    it("should store keypair in vault", async () => {
      await service.initialize(mockVault, VALID_NSEC);

      expect(mockVault.set).toHaveBeenCalled();
    });

    it("should be idempotent when already initialized", async () => {
      await service.initialize(mockVault, VALID_NSEC);
      const firstCallCount = (mockVault.set as ReturnType<typeof vi.fn>).mock
        .calls.length;

      // Second initialization should not re-derive keys
      await service.initialize(mockVault, VALID_NSEC);
      const secondCallCount = (mockVault.set as ReturnType<typeof vi.fn>).mock
        .calls.length;

      expect(secondCallCount).toBe(firstCallCount);
    });
  });

  describe("cleanup", () => {
    it("should clean up resources", async () => {
      await service.initialize(mockVault, VALID_NSEC);

      service.cleanup();

      expect(service.isInitialized()).toBe(false);
    });

    it("should be safe to call multiple times", async () => {
      await service.initialize(mockVault, VALID_NSEC);

      service.cleanup();
      service.cleanup();

      expect(service.isInitialized()).toBe(false);
    });

    it("should be safe to call before initialization", () => {
      expect(() => service.cleanup()).not.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("should throw when saveNote called before initialization", async () => {
      await expect(service.saveNote("Test", {})).rejects.toThrow(
        "not initialized"
      );
    });

    it("should throw when listNotes called before initialization", async () => {
      await expect(service.listNotes()).rejects.toThrow("not initialized");
    });

    it("should throw when getNote called before initialization", async () => {
      await expect(service.getNote("id")).rejects.toThrow("not initialized");
    });

    it("should throw when updateNote called before initialization", async () => {
      await expect(service.updateNote("id", "content")).rejects.toThrow(
        "not initialized"
      );
    });

    it("should throw when deleteNote called before initialization", async () => {
      await expect(service.deleteNote("id")).rejects.toThrow("not initialized");
    });
  });

  describe("Content Validation", () => {
    beforeEach(async () => {
      await service.initialize(mockVault, VALID_NSEC);
    });

    it("should throw for empty content", async () => {
      await expect(service.saveNote("", {})).rejects.toThrow();
    });

    it("should throw for content exceeding max length", async () => {
      const longContent = "A".repeat(256 * 1024 + 1);
      await expect(service.saveNote(longContent, {})).rejects.toThrow();
    });
  });

  describe("PNS Predefined Tags", () => {
    it("should have all expected predefined tag categories", () => {
      // Verify predefined tags are available for Note2Self organization
      expect(PNS_PREDEFINED_TAGS).toContain("important");
      expect(PNS_PREDEFINED_TAGS).toContain("personal");
      expect(PNS_PREDEFINED_TAGS).toContain("software");
      expect(PNS_PREDEFINED_TAGS).toContain("hardware");
      expect(PNS_PREDEFINED_TAGS).toContain("graphics");
      expect(PNS_PREDEFINED_TAGS).toContain("links");
      expect(PNS_PREDEFINED_TAGS).toContain("quotations");
    });

    it("should have exactly 7 predefined tags", () => {
      expect(PNS_PREDEFINED_TAGS).toHaveLength(7);
    });

    it("should be a readonly array", () => {
      // TypeScript ensures this at compile time via `as const`
      // Runtime check: verify it's an array
      expect(Array.isArray(PNS_PREDEFINED_TAGS)).toBe(true);
    });
  });
});
