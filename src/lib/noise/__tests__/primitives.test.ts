/**
 * @fileoverview Unit tests for Noise Protocol primitives
 */

import { describe, expect, it } from "vitest";
import {
  generateX25519KeyPair,
  generateSymmetricKey,
  x25519ECDH,
  hkdfExpand,
  deriveCipherState,
  chaCha20Poly1305Encrypt,
  chaCha20Poly1305Decrypt,
  encryptWithCipherState,
  decryptWithCipherState,
  secureZero,
  constantTimeEqual,
  bytesToHex,
  hexToBytes,
  bytesToBase64,
  base64ToBytes,
} from "../primitives";

describe("Noise Protocol Primitives", () => {
  describe("X25519 Key Generation", () => {
    it("should generate valid key pairs", async () => {
      const keyPair = await generateX25519KeyPair();

      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey.length).toBe(32);
      expect(keyPair.privateKey.length).toBe(32);
    });

    it("should generate unique key pairs", async () => {
      const keyPair1 = await generateX25519KeyPair();
      const keyPair2 = await generateX25519KeyPair();

      expect(bytesToHex(keyPair1.publicKey)).not.toBe(
        bytesToHex(keyPair2.publicKey)
      );
      expect(bytesToHex(keyPair1.privateKey)).not.toBe(
        bytesToHex(keyPair2.privateKey)
      );
    });
  });

  describe("X25519 ECDH", () => {
    it("should compute shared secret", async () => {
      const alice = await generateX25519KeyPair();
      const bob = await generateX25519KeyPair();

      const sharedAlice = await x25519ECDH(alice.privateKey, bob.publicKey);
      const sharedBob = await x25519ECDH(bob.privateKey, alice.publicKey);

      expect(sharedAlice).toBeInstanceOf(Uint8Array);
      expect(sharedAlice.length).toBe(32);
      expect(bytesToHex(sharedAlice)).toBe(bytesToHex(sharedBob));
    });
  });

  describe("HKDF Key Derivation", () => {
    it("should derive keys of specified length", () => {
      const ikm = generateSymmetricKey();
      const salt = generateSymmetricKey();
      const info = "test-info";

      const derived = hkdfExpand(ikm, salt, info, 64);

      expect(derived).toBeInstanceOf(Uint8Array);
      expect(derived.length).toBe(64);
    });

    it("should produce deterministic output", () => {
      const ikm = hexToBytes(
        "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"
      );
      const salt = new Uint8Array(32);
      const info = "test";

      const derived1 = hkdfExpand(ikm, salt, info, 32);
      const derived2 = hkdfExpand(ikm, salt, info, 32);

      expect(bytesToHex(derived1)).toBe(bytesToHex(derived2));
    });
  });

  describe("ChaCha20-Poly1305 AEAD", () => {
    it("should encrypt and decrypt data", async () => {
      const key = generateSymmetricKey();
      // ChaCha20-Poly1305 requires exactly 12-byte nonce
      const nonce = new Uint8Array(12);
      crypto.getRandomValues(nonce);
      const plaintext = new TextEncoder().encode("Hello, Noise Protocol!");
      const aad = new TextEncoder().encode("additional data");

      const ciphertext = await chaCha20Poly1305Encrypt(
        key,
        nonce,
        plaintext,
        aad
      );
      const decrypted = await chaCha20Poly1305Decrypt(
        key,
        nonce,
        ciphertext,
        aad
      );

      expect(new TextDecoder().decode(decrypted)).toBe(
        "Hello, Noise Protocol!"
      );
    });

    it("should fail with wrong key", async () => {
      const key = generateSymmetricKey();
      const wrongKey = generateSymmetricKey();
      // ChaCha20-Poly1305 requires exactly 12-byte nonce
      const nonce = new Uint8Array(12);
      crypto.getRandomValues(nonce);
      const plaintext = new TextEncoder().encode("Secret message");

      const ciphertext = await chaCha20Poly1305Encrypt(key, nonce, plaintext);

      await expect(
        chaCha20Poly1305Decrypt(wrongKey, nonce, ciphertext)
      ).rejects.toThrow();
    });

    it("should fail with tampered ciphertext", async () => {
      const key = generateSymmetricKey();
      // ChaCha20-Poly1305 requires exactly 12-byte nonce
      const nonce = new Uint8Array(12);
      crypto.getRandomValues(nonce);
      const plaintext = new TextEncoder().encode("Secret message");

      const ciphertext = await chaCha20Poly1305Encrypt(key, nonce, plaintext);
      ciphertext[0] ^= 0xff; // Tamper with ciphertext

      await expect(
        chaCha20Poly1305Decrypt(key, nonce, ciphertext)
      ).rejects.toThrow();
    });
  });

  describe("CipherState Operations", () => {
    it("should encrypt and decrypt with cipher state", async () => {
      const key = generateSymmetricKey();
      const salt = new Uint8Array(32);
      const cipherState = deriveCipherState(key, salt, "send");

      const plaintext = new TextEncoder().encode("Test message");
      const aad = new TextEncoder().encode("header");

      const { ciphertext, nonce, nextNonce } = await encryptWithCipherState(
        cipherState,
        plaintext,
        aad
      );

      // Verify nextNonce is incremented
      expect(nextNonce).toBe(cipherState.nonce + 1n);

      // Create matching receive cipher state (uses same key derivation)
      const receiveCipherState = deriveCipherState(key, salt, "send");

      const decrypted = await decryptWithCipherState(
        receiveCipherState,
        ciphertext,
        nonce,
        aad
      );

      expect(new TextDecoder().decode(decrypted)).toBe("Test message");
    });
  });

  describe("Utility Functions", () => {
    it("should securely zero memory", () => {
      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      secureZero(data);

      expect(data.every((b) => b === 0)).toBe(true);
    });

    it("should perform constant-time comparison", () => {
      const a = new Uint8Array([1, 2, 3, 4]);
      const b = new Uint8Array([1, 2, 3, 4]);
      const c = new Uint8Array([1, 2, 3, 5]);

      expect(constantTimeEqual(a, b)).toBe(true);
      expect(constantTimeEqual(a, c)).toBe(false);
    });
  });
});
