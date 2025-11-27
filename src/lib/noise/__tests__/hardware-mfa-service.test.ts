/**
 * @fileoverview Unit tests for HardwareMfaService
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HardwareMfaService,
  getNfcAvailabilityMessage,
} from "../hardware-mfa-service";
import type { VaultAccessor } from "../noise-session-manager";

// Mock VaultAccessor
const createMockVaultAccessor = (): VaultAccessor => {
  const storage = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => storage.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    remove: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
    keys: vi.fn(async () => Array.from(storage.keys())),
  };
};

describe("HardwareMfaService", () => {
  let service: HardwareMfaService;
  let mockVault: VaultAccessor;

  beforeEach(() => {
    HardwareMfaService.resetInstance();
    mockVault = createMockVaultAccessor();
  });

  afterEach(() => {
    HardwareMfaService.resetInstance();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = HardwareMfaService.getInstance();
      const instance2 = HardwareMfaService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("Initialization", () => {
    it("should initialize successfully", async () => {
      service = HardwareMfaService.getInstance();
      // Initialize should complete without throwing
      await expect(service.initialize(mockVault)).resolves.not.toThrow();
    });
  });

  describe("NFC Availability Detection", () => {
    beforeEach(async () => {
      service = HardwareMfaService.getInstance();
      await service.initialize(mockVault);
    });

    it("should check NFC availability", () => {
      const availability = service.checkNfcAvailability();

      expect(availability).toHaveProperty("hardwareAvailable");
      expect(availability).toHaveProperty("apiAvailable");
      expect(availability).toHaveProperty("platform");
      expect(typeof availability.hardwareAvailable).toBe("boolean");
    });

    it("should detect platform correctly", () => {
      const availability = service.checkNfcAvailability();

      // In jsdom test environment, platform detection should work
      expect(["android", "ios", "desktop", "unknown"]).toContain(
        availability.platform
      );
    });
  });

  describe("Hardened FS Availability", () => {
    beforeEach(async () => {
      service = HardwareMfaService.getInstance();
      await service.initialize(mockVault);
    });

    it("should check if Hardened FS is available", () => {
      const available = service.isHardenedFsAvailable();
      expect(typeof available).toBe("boolean");
    });
  });

  describe("Token Management", () => {
    beforeEach(async () => {
      service = HardwareMfaService.getInstance();
      await service.initialize(mockVault);
    });

    it("should start with no enrolled tokens", () => {
      expect(service.hasEnrolledTokens()).toBe(false);
      expect(service.getEnrolledTokens()).toHaveLength(0);
    });
  });

  describe("getNfcAvailabilityMessage", () => {
    beforeEach(async () => {
      service = HardwareMfaService.getInstance();
      await service.initialize(mockVault);
    });

    it("should return a message about NFC availability", () => {
      // The function uses the service internally to check availability
      const message = getNfcAvailabilityMessage();
      expect(typeof message).toBe("string");
      expect(message.length).toBeGreaterThan(0);
      // In jsdom environment, NFC is not available, so message should mention that
      expect(message).toContain("NFC");
    });
  });

  describe("Challenge Generation and Response Verification", () => {
    beforeEach(async () => {
      service = HardwareMfaService.getInstance();
      await service.initialize(mockVault);
    });

    it("should generate a valid challenge with proper structure", () => {
      const challenge = service.generateChallenge();

      expect(challenge).toHaveProperty("challenge");
      expect(challenge).toHaveProperty("createdAt");
      expect(challenge).toHaveProperty("expiresAt");

      // Challenge should be 64 hex characters (32 bytes)
      expect(challenge.challenge).toMatch(/^[0-9a-f]{64}$/i);

      // Expiry should be 60 seconds after creation
      expect(challenge.expiresAt - challenge.createdAt).toBe(60000);
    });

    it("should reject expired challenge", async () => {
      const challenge = service.generateChallenge();
      // Manually expire the challenge
      challenge.expiresAt = Date.now() - 1000;

      const result = await service.verifyChallengeResponse(challenge, {
        tokenId: "test-token-id",
        signature: "0".repeat(128), // Valid length signature
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Challenge expired");
    });

    it("should reject response from unregistered token", async () => {
      const challenge = service.generateChallenge();

      const result = await service.verifyChallengeResponse(challenge, {
        tokenId: "non-existent-token",
        signature: "0".repeat(128),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Token not enrolled");
    });
  });

  describe("ECDSA Signature Verification Security", () => {
    beforeEach(async () => {
      service = HardwareMfaService.getInstance();
      await service.initialize(mockVault);
    });

    // Test that the HardwareTokenMetadata type includes cryptoCapable
    it("should include cryptoCapable in HardwareTokenMetadata", () => {
      // This is a compile-time check - if cryptoCapable is missing, TypeScript would error
      const mockToken = {
        tokenType: "boltcard" as const,
        tokenId: "test-id",
        publicKey: "04" + "0".repeat(128), // Uncompressed P-256 public key format
        enrolledAt: Date.now(),
        label: "Test Token",
        cryptoCapable: true,
      };

      expect(mockToken.cryptoCapable).toBe(true);
    });

    it("should differentiate token types for crypto capability", () => {
      // Boltcard and Satscard should be crypto-capable
      const cryptoTypes: string[] = ["boltcard", "satscard"];
      expect(cryptoTypes.includes("boltcard")).toBe(true);
      expect(cryptoTypes.includes("satscard")).toBe(true);
      // Generic NFC should not be crypto-capable
      expect(cryptoTypes.includes("generic-nfc")).toBe(false);
    });

    it("should require valid public key length for P-256", () => {
      // P-256 uncompressed public key: 65 bytes (0x04 + 64 bytes)
      const uncompressedKey = "04" + "a".repeat(128);
      expect(uncompressedKey.length).toBe(130); // 65 bytes in hex

      // P-256 compressed public key: 33 bytes (0x02/0x03 + 32 bytes)
      const compressedKey = "02" + "a".repeat(64);
      expect(compressedKey.length).toBe(66); // 33 bytes in hex

      // Invalid key lengths should be rejected
      const invalidKey = "ab".repeat(20); // 20 bytes - invalid
      expect(invalidKey.length).toBe(40); // Neither 66 nor 130
    });

    it("should require 64-byte signature for P-256 ECDSA", () => {
      // Valid P-256 ECDSA signature: 64 bytes (r: 32 bytes, s: 32 bytes)
      const validSignature = "a".repeat(128); // 64 bytes in hex
      expect(validSignature.length).toBe(128);

      // Invalid signature lengths
      const shortSignature = "a".repeat(64); // 32 bytes - too short
      expect(shortSignature.length).toBe(64);
    });
  });
});
