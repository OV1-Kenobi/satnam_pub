/**
 * @fileoverview Unit tests for NoisePnsManager (Private Notes to Self)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoisePnsManager, type EncryptedNote } from "../noise-pns-manager";
import type { VaultAccessor } from "../noise-session-manager";
import { bytesToHex, hexToBytes } from "../primitives";

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

describe("NoisePnsManager", () => {
  let manager: NoisePnsManager;
  let mockVault: VaultAccessor;

  beforeEach(() => {
    NoisePnsManager.resetInstance();
    mockVault = createMockVaultAccessor();
  });

  afterEach(() => {
    NoisePnsManager.resetInstance();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = NoisePnsManager.getInstance();
      const instance2 = NoisePnsManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("Initialization", () => {
    it("should initialize with new root key", async () => {
      manager = NoisePnsManager.getInstance();
      await manager.initialize(mockVault);
      expect(manager.isInitialized()).toBe(true);
    });

    it("should initialize with existing root key", async () => {
      manager = NoisePnsManager.getInstance();
      await manager.initialize(mockVault);

      const exportedKey = manager.exportRootKey();
      expect(exportedKey).toBeDefined();
      expect(exportedKey.length).toBe(44); // 32 bytes = 44 base64 chars

      // Re-initialize with same key
      NoisePnsManager.resetInstance();
      const newManager = NoisePnsManager.getInstance();
      await newManager.importRootKey(exportedKey);
      expect(newManager.isInitialized()).toBe(true);
    });
  });

  describe("Note Encryption/Decryption", () => {
    beforeEach(async () => {
      manager = NoisePnsManager.getInstance();
      await manager.initialize(mockVault);
    });

    it("should encrypt a note", async () => {
      const plaintext = new TextEncoder().encode("My secret note");
      const encrypted = await manager.encryptNote(plaintext);

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.nonce).toBeDefined();
      expect(encrypted.noteIndex).toBe(0);
      expect(encrypted.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it("should decrypt an encrypted note", async () => {
      const plaintextStr = "My secret note";
      const plaintext = new TextEncoder().encode(plaintextStr);
      const encrypted = await manager.encryptNote(plaintext);
      const decrypted = await manager.decryptNote(encrypted);

      expect(new TextDecoder().decode(decrypted)).toBe(plaintextStr);
    });

    it("should handle Unicode content", async () => {
      const plaintextStr = "Hello 🌍 नमस्ते 你好 مرحبا";
      const plaintext = new TextEncoder().encode(plaintextStr);
      const encrypted = await manager.encryptNote(plaintext);
      const decrypted = await manager.decryptNote(encrypted);

      expect(new TextDecoder().decode(decrypted)).toBe(plaintextStr);
    });

    it("should handle empty string", async () => {
      const plaintextStr = "";
      const plaintext = new TextEncoder().encode(plaintextStr);
      const encrypted = await manager.encryptNote(plaintext);
      const decrypted = await manager.decryptNote(encrypted);

      expect(new TextDecoder().decode(decrypted)).toBe(plaintextStr);
    });
  });

  describe("Forward Secrecy Ratcheting", () => {
    beforeEach(async () => {
      manager = NoisePnsManager.getInstance();
      await manager.initialize(mockVault);
    });

    it("should increment chain index for each note", async () => {
      const note1 = await manager.encryptNote(
        new TextEncoder().encode("First")
      );
      const note2 = await manager.encryptNote(
        new TextEncoder().encode("Second")
      );
      const note3 = await manager.encryptNote(
        new TextEncoder().encode("Third")
      );

      expect(note1.noteIndex).toBe(0);
      expect(note2.noteIndex).toBe(1);
      expect(note3.noteIndex).toBe(2);
    });

    it("should use different keys for each note (forward secrecy)", async () => {
      const note1 = await manager.encryptNote(
        new TextEncoder().encode("Same content")
      );
      const note2 = await manager.encryptNote(
        new TextEncoder().encode("Same content")
      );

      // Same plaintext should produce different ciphertext due to key ratcheting
      expect(note1.ciphertext).not.toBe(note2.ciphertext);
    });

    it("should still decrypt old notes after ratcheting", async () => {
      const encrypted1 = await manager.encryptNote(
        new TextEncoder().encode("First note")
      );
      const encrypted2 = await manager.encryptNote(
        new TextEncoder().encode("Second note")
      );
      const encrypted3 = await manager.encryptNote(
        new TextEncoder().encode("Third note")
      );

      // Decrypt in reverse order to test key derivation
      const dec3 = await manager.decryptNote(encrypted3);
      const dec1 = await manager.decryptNote(encrypted1);
      const dec2 = await manager.decryptNote(encrypted2);

      expect(new TextDecoder().decode(dec3)).toBe("Third note");
      expect(new TextDecoder().decode(dec1)).toBe("First note");
      expect(new TextDecoder().decode(dec2)).toBe("Second note");
    });
  });

  describe("Root Key Export/Import", () => {
    it("should export and import root key", async () => {
      manager = NoisePnsManager.getInstance();
      await manager.initialize(mockVault);

      // Encrypt some notes
      const note1 = await manager.encryptNote(
        new TextEncoder().encode("Note 1")
      );
      const note2 = await manager.encryptNote(
        new TextEncoder().encode("Note 2")
      );

      // Export root key (synchronous)
      const exportedKey = manager.exportRootKey();
      expect(exportedKey).toBeDefined();

      // Get the note counter before resetting
      const noteCounter = manager.getNoteCounter();

      // Create new instance and import
      NoisePnsManager.resetInstance();
      const newManager = NoisePnsManager.getInstance();
      // Import with the note counter to restore chain state
      await newManager.importRootKey(exportedKey, noteCounter);

      // Should be able to decrypt notes
      const dec1 = await newManager.decryptNote(note1);
      const dec2 = await newManager.decryptNote(note2);
      expect(new TextDecoder().decode(dec1)).toBe("Note 1");
      expect(new TextDecoder().decode(dec2)).toBe("Note 2");
    });
  });

  describe("Security Properties", () => {
    beforeEach(async () => {
      manager = NoisePnsManager.getInstance();
      await manager.initialize(mockVault);
    });

    it("should fail to decrypt with wrong chain state", async () => {
      const encrypted = await manager.encryptNote(
        new TextEncoder().encode("Secret")
      );

      // Tamper with note index
      const tampered: EncryptedNote = {
        ...encrypted,
        noteIndex: encrypted.noteIndex + 100,
      };

      await expect(manager.decryptNote(tampered)).rejects.toThrow();
    });

    it("should fail to decrypt tampered ciphertext", async () => {
      const encrypted = await manager.encryptNote(
        new TextEncoder().encode("Secret")
      );

      // Tamper with ciphertext (it's base64 encoded, so we modify the first char)
      const tamperedCiphertext = "X" + encrypted.ciphertext.slice(1);
      const tampered: EncryptedNote = {
        ...encrypted,
        ciphertext: tamperedCiphertext,
      };

      await expect(manager.decryptNote(tampered)).rejects.toThrow();
    });
  });
});
