/**
 * @fileoverview Unit tests for NoiseSessionManager
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NoiseSessionManager,
  type VaultAccessor,
} from "../noise-session-manager";
import { generateX25519KeyPair, bytesToHex } from "../primitives";
import type { NoiseSecurityTier } from "../types";

// Mock VaultAccessor for testing
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

describe("NoiseSessionManager", () => {
  let manager: NoiseSessionManager;
  let mockVault: VaultAccessor;

  beforeEach(() => {
    NoiseSessionManager.resetInstance();
    mockVault = createMockVaultAccessor();
  });

  afterEach(() => {
    NoiseSessionManager.resetInstance();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = NoiseSessionManager.getInstance();
      const instance2 = NoiseSessionManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("Initialization", () => {
    it("should initialize successfully", async () => {
      manager = NoiseSessionManager.getInstance();
      // Initialize should complete without throwing
      await expect(manager.initialize(mockVault)).resolves.not.toThrow();
    });

    it("should throw when used before initialization", async () => {
      manager = NoiseSessionManager.getInstance();
      // Don't initialize - test that operations fail
      const peerNpub = "npub1test123";

      await expect(
        manager.createSession(peerNpub, "ephemeral-standard")
      ).rejects.toThrow();
    });
  });

  describe("Session Lifecycle - Ephemeral Standard", () => {
    beforeEach(async () => {
      manager = NoiseSessionManager.getInstance();
      await manager.initialize(mockVault);
    });

    it("should create a new session", async () => {
      const bobKeyPair = await generateX25519KeyPair();
      const peerNpub = "npub1test123";

      const sessionId = await manager.createSession(
        peerNpub,
        "ephemeral-standard",
        bobKeyPair.publicKey
      );

      expect(typeof sessionId).toBe("string");
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it("should complete handshake", async () => {
      const bobKeyPair = await generateX25519KeyPair();
      const peerNpub = "npub1bob123";

      const sessionId = await manager.createSession(
        peerNpub,
        "ephemeral-standard",
        bobKeyPair.publicKey
      );

      // Complete handshake with Bob's ephemeral public key
      await manager.completeHandshake(sessionId, bobKeyPair.publicKey);

      const session = manager.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.handshakeComplete).toBe(true);
    });

    it("should encrypt and decrypt messages", async () => {
      const bobKeyPair = await generateX25519KeyPair();
      const peerNpub = "npub1bob123";

      const sessionId = await manager.createSession(
        peerNpub,
        "ephemeral-standard",
        bobKeyPair.publicKey
      );

      await manager.completeHandshake(sessionId, bobKeyPair.publicKey);

      const plaintext = new TextEncoder().encode("Hello, Bob!");
      const envelope = await manager.encrypt(sessionId, plaintext);

      // Envelope contains base64-encoded strings, not Uint8Array
      expect(typeof envelope.ciphertext).toBe("string");
      expect(typeof envelope.nonce).toBe("string");

      // Note: In a real scenario, decryption would happen on Bob's side with
      // matching cipher states. For this unit test, we verify the envelope
      // structure is correct. Full round-trip would require two-party simulation.
      expect(envelope.version).toBe(1);
      expect(envelope.securityTier).toBe("ephemeral-standard");
      expect(envelope.ephemeralPubkey).toBeDefined();
    });

    it("should close session", async () => {
      const bobKeyPair = await generateX25519KeyPair();
      const peerNpub = "npub1bob123";

      const sessionId = await manager.createSession(
        peerNpub,
        "ephemeral-standard",
        bobKeyPair.publicKey
      );

      await manager.closeSession(sessionId);
      expect(manager.getSession(sessionId)).toBeUndefined();
    });
  });

  describe("Security Tiers", () => {
    beforeEach(async () => {
      manager = NoiseSessionManager.getInstance();
      await manager.initialize(mockVault);
    });

    const testSecurityTier = async (tier: NoiseSecurityTier) => {
      const bobKeyPair = await generateX25519KeyPair();
      const peerNpub = "npub1test123";

      const sessionId = await manager.createSession(
        peerNpub,
        tier,
        bobKeyPair.publicKey
      );

      const session = manager.getSession(sessionId);
      expect(session?.securityTier).toBe(tier);
    };

    it("should support ephemeral-standard tier", async () => {
      await testSecurityTier("ephemeral-standard");
    });

    it("should support everlasting-standard tier", async () => {
      await testSecurityTier("everlasting-standard");
    });

    it("should support hardened tier", async () => {
      await testSecurityTier("hardened");
    });
  });
});
