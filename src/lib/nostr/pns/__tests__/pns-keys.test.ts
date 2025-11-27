/**
 * @fileoverview Unit tests for PNS Key Derivation Module
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  derivePnsKeypair,
  derivePnsNip44Key,
  derivePnsFsRoot,
  validatePnsKeys,
} from "../pns-keys";
import { bytesToHex, hexToBytes, secureZero } from "../../../noise/primitives";
import { NoiseProtocolError } from "../../../noise/types";

// Test fixtures
const VALID_NSEC = hexToBytes(
  "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"
);
const ALTERNATE_NSEC = hexToBytes(
  "2122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f40"
);
const VALID_DEVICE_SALT = crypto.getRandomValues(new Uint8Array(32));
const ALTERNATE_DEVICE_SALT = crypto.getRandomValues(new Uint8Array(32));

// Keys to track for cleanup
const keysToCleanup: Uint8Array[] = [];

afterEach(() => {
  // Securely zero all keys used in tests
  for (const key of keysToCleanup) {
    secureZero(key);
  }
  keysToCleanup.length = 0;
});

describe("PNS Key Derivation", () => {
  describe("derivePnsKeypair", () => {
    it("should produce deterministic keypairs from same nsec", async () => {
      const keypair1 = await derivePnsKeypair(VALID_NSEC);
      const keypair2 = await derivePnsKeypair(VALID_NSEC);

      keysToCleanup.push(
        keypair1.publicKey,
        keypair1.privateKey,
        keypair2.publicKey,
        keypair2.privateKey
      );

      expect(bytesToHex(keypair1.publicKey)).toBe(
        bytesToHex(keypair2.publicKey)
      );
      expect(bytesToHex(keypair1.privateKey)).toBe(
        bytesToHex(keypair2.privateKey)
      );
    });

    it("should produce different keypairs from different nsecs", async () => {
      const keypair1 = await derivePnsKeypair(VALID_NSEC);
      const keypair2 = await derivePnsKeypair(ALTERNATE_NSEC);

      keysToCleanup.push(
        keypair1.publicKey,
        keypair1.privateKey,
        keypair2.publicKey,
        keypair2.privateKey
      );

      expect(bytesToHex(keypair1.publicKey)).not.toBe(
        bytesToHex(keypair2.publicKey)
      );
      expect(bytesToHex(keypair1.privateKey)).not.toBe(
        bytesToHex(keypair2.privateKey)
      );
    });

    it("should produce valid 32-byte keys", async () => {
      const keypair = await derivePnsKeypair(VALID_NSEC);
      keysToCleanup.push(keypair.publicKey, keypair.privateKey);

      expect(keypair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keypair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keypair.publicKey.length).toBe(32);
      expect(keypair.privateKey.length).toBe(32);
    });

    it("should throw for invalid nsec length", async () => {
      const shortNsec = new Uint8Array(16);
      await expect(derivePnsKeypair(shortNsec)).rejects.toThrow(
        NoiseProtocolError
      );
    });

    it("should throw for all-zeros nsec", async () => {
      const zeroNsec = new Uint8Array(32);
      await expect(derivePnsKeypair(zeroNsec)).rejects.toThrow(
        NoiseProtocolError
      );
    });

    it("should throw for non-Uint8Array input", async () => {
      // @ts-expect-error Testing invalid input
      await expect(derivePnsKeypair("invalid")).rejects.toThrow(
        NoiseProtocolError
      );
    });
  });

  describe("derivePnsNip44Key", () => {
    it("should produce deterministic keys from same nsec", async () => {
      const key1 = await derivePnsNip44Key(VALID_NSEC);
      const key2 = await derivePnsNip44Key(VALID_NSEC);

      keysToCleanup.push(key1, key2);

      expect(bytesToHex(key1)).toBe(bytesToHex(key2));
    });

    it("should produce different keys from different nsecs", async () => {
      const key1 = await derivePnsNip44Key(VALID_NSEC);
      const key2 = await derivePnsNip44Key(ALTERNATE_NSEC);

      keysToCleanup.push(key1, key2);

      expect(bytesToHex(key1)).not.toBe(bytesToHex(key2));
    });

    it("should produce a valid 32-byte key", async () => {
      const key = await derivePnsNip44Key(VALID_NSEC);
      keysToCleanup.push(key);

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it("should produce different key than keypair private key", async () => {
      const nip44Key = await derivePnsNip44Key(VALID_NSEC);
      const keypair = await derivePnsKeypair(VALID_NSEC);

      keysToCleanup.push(nip44Key, keypair.publicKey, keypair.privateKey);

      // NIP-44 key should be different from keypair keys
      expect(bytesToHex(nip44Key)).not.toBe(bytesToHex(keypair.privateKey));
    });
  });

  describe("derivePnsFsRoot", () => {
    it("should produce deterministic keys from same nsec without salt", async () => {
      const root1 = await derivePnsFsRoot(VALID_NSEC);
      const root2 = await derivePnsFsRoot(VALID_NSEC);

      keysToCleanup.push(root1, root2);

      expect(bytesToHex(root1)).toBe(bytesToHex(root2));
    });

    it("should produce different keys with different device salts", async () => {
      const root1 = await derivePnsFsRoot(VALID_NSEC, VALID_DEVICE_SALT);
      const root2 = await derivePnsFsRoot(VALID_NSEC, ALTERNATE_DEVICE_SALT);

      keysToCleanup.push(root1, root2);

      expect(bytesToHex(root1)).not.toBe(bytesToHex(root2));
    });

    it("should produce different keys with vs without device salt", async () => {
      const rootNoSalt = await derivePnsFsRoot(VALID_NSEC);
      const rootWithSalt = await derivePnsFsRoot(VALID_NSEC, VALID_DEVICE_SALT);

      keysToCleanup.push(rootNoSalt, rootWithSalt);

      expect(bytesToHex(rootNoSalt)).not.toBe(bytesToHex(rootWithSalt));
    });

    it("should produce a valid 32-byte key", async () => {
      const root = await derivePnsFsRoot(VALID_NSEC);
      keysToCleanup.push(root);

      expect(root).toBeInstanceOf(Uint8Array);
      expect(root.length).toBe(32);
    });

    it("should throw for device salt that is too short", async () => {
      const shortSalt = new Uint8Array(8); // Less than 16 bytes
      await expect(derivePnsFsRoot(VALID_NSEC, shortSalt)).rejects.toThrow(
        NoiseProtocolError
      );
    });

    it("should produce different key than NIP-44 key", async () => {
      const fsRoot = await derivePnsFsRoot(VALID_NSEC);
      const nip44Key = await derivePnsNip44Key(VALID_NSEC);

      keysToCleanup.push(fsRoot, nip44Key);

      // FS root should be different from NIP-44 key
      expect(bytesToHex(fsRoot)).not.toBe(bytesToHex(nip44Key));
    });
  });

  describe("validatePnsKeys", () => {
    it("should validate a valid keypair", async () => {
      const keypair = await derivePnsKeypair(VALID_NSEC);
      keysToCleanup.push(keypair.publicKey, keypair.privateKey);

      expect(validatePnsKeys(keypair)).toBe(true);
    });

    it("should reject keypair with wrong public key", async () => {
      const keypair = await derivePnsKeypair(VALID_NSEC);
      keysToCleanup.push(keypair.publicKey, keypair.privateKey);

      // Corrupt the public key
      const badKeypair = {
        publicKey: new Uint8Array(32).fill(1), // Wrong public key
        privateKey: keypair.privateKey,
      };
      keysToCleanup.push(badKeypair.publicKey);

      expect(validatePnsKeys(badKeypair)).toBe(false);
    });

    it("should reject keypair with all-zeros public key", async () => {
      const keypair = await derivePnsKeypair(VALID_NSEC);
      keysToCleanup.push(keypair.publicKey, keypair.privateKey);

      const badKeypair = {
        publicKey: new Uint8Array(32), // All zeros
        privateKey: keypair.privateKey,
      };

      expect(validatePnsKeys(badKeypair)).toBe(false);
    });

    it("should reject keypair with all-zeros private key", async () => {
      const keypair = await derivePnsKeypair(VALID_NSEC);
      keysToCleanup.push(keypair.publicKey, keypair.privateKey);

      const badKeypair = {
        publicKey: keypair.publicKey,
        privateKey: new Uint8Array(32), // All zeros
      };

      expect(validatePnsKeys(badKeypair)).toBe(false);
    });

    it("should reject keypair with wrong key lengths", async () => {
      const badKeypair = {
        publicKey: new Uint8Array(16), // Wrong length
        privateKey: new Uint8Array(16), // Wrong length
      };

      expect(validatePnsKeys(badKeypair)).toBe(false);
    });

    it("should reject non-Uint8Array inputs", async () => {
      // @ts-expect-error Testing invalid input
      expect(validatePnsKeys({ publicKey: "abc", privateKey: "def" })).toBe(
        false
      );
    });
  });

  describe("Domain Separation", () => {
    it("should produce different keys for each derivation type", async () => {
      const keypair = await derivePnsKeypair(VALID_NSEC);
      const nip44Key = await derivePnsNip44Key(VALID_NSEC);
      const fsRoot = await derivePnsFsRoot(VALID_NSEC);

      keysToCleanup.push(
        keypair.publicKey,
        keypair.privateKey,
        nip44Key,
        fsRoot
      );

      // All three derived keys should be different due to domain separation
      const keys = [
        bytesToHex(keypair.privateKey),
        bytesToHex(nip44Key),
        bytesToHex(fsRoot),
      ];

      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(3);
    });
  });
});
