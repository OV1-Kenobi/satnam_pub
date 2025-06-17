/**
 * NIP-06 Key Derivation Tests
 *
 * Tests for Nostr key derivation following the NIP-06 standard
 * Security: Private keys are masked by default to prevent accidental exposure in logs
 * Set SHOW_SECRETS=true environment variable to display full values (NOT recommended for CI/production)
 */

import { createHash } from "crypto";
import { describe, expect, test } from "vitest";

// Import crypto utilities - adjust path as needed
import * as crypto from "../../utils/crypto";

// Check for SHOW_SECRETS environment variable (use with caution!)
const showSecrets = process.env.SHOW_SECRETS === "true";

// Helper function to safely display sensitive data
function safelog(label: string, value: string, type: "key" | "phrase" = "key") {
  if (showSecrets) {
    console.log(`${label}:`, value);
  } else {
    if (type === "phrase") {
      // For phrases, show first and last word only
      const words = value.split(" ");
      const masked = `${words[0]} ... ${words[words.length - 1]} (${words.length} words)`;
      console.log(`${label}:`, masked);
    } else {
      // For keys, show first 4 and last 4 characters with hash
      const masked = `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
      const hash = createHash("sha256")
        .update(value)
        .digest("hex")
        .substring(0, 8);
      console.log(`${label}:`, `${masked} (hash: ${hash})`);
    }
  }
}

describe("NIP-06 Key Derivation", () => {
  // Security notice for test output
  if (!showSecrets) {
    console.log(
      "🔒 Security mode: Private keys and recovery phrases are masked in test output.",
    );
    console.log(
      "   Set SHOW_SECRETS=true environment variable to display full values (NOT recommended for CI/production)",
    );
    console.log("   Hashes are shown for verification purposes.\n");
  } else {
    console.log(
      "⚠️  WARNING: Showing full private keys and recovery phrases in test output!",
    );
    console.log(
      "   This should NEVER be used in CI/production environments.\n",
    );
  }

  test("should generate a valid recovery phrase", () => {
    const phrase = crypto.generateRecoveryPhrase();

    expect(phrase).toBeDefined();
    expect(typeof phrase).toBe("string");
    expect(phrase.split(" ").length).toBeGreaterThanOrEqual(12); // Standard mnemonic lengths

    safelog("✅ Recovery phrase generated", phrase, "phrase");
  });

  test("should derive private key from recovery phrase", () => {
    const phrase = crypto.generateRecoveryPhrase();

    expect(() => {
      const privateKey = crypto.privateKeyFromPhrase(phrase);
      expect(privateKey).toBeDefined();
      expect(typeof privateKey).toBe("string");
      expect(privateKey.length).toBeGreaterThan(0);

      safelog("✅ Private key (account 0)", privateKey);
    }).not.toThrow();
  });

  test("should derive keys for multiple accounts", () => {
    const phrase = crypto.generateRecoveryPhrase();
    const accounts = 3;

    console.log("\n🔑 Deriving keys for multiple accounts:");

    for (let i = 0; i < accounts; i++) {
      expect(() => {
        const accountKey = crypto.privateKeyFromPhraseWithAccount(phrase, i);
        expect(accountKey).toBeDefined();
        expect(typeof accountKey).toBe("string");

        safelog(`✅ Account ${i} private key`, accountKey);

        // Generate a full key pair
        const keyPair = crypto.generateNostrKeyPair(phrase, i);
        expect(keyPair).toBeDefined();
        expect(keyPair.publicKey).toBeDefined();
        expect(keyPair.npub).toBeDefined();

        safelog(`✅ Account ${i} public key`, keyPair.publicKey);
        console.log(`✅ Account ${i} npub:`, keyPair.npub);
      }).not.toThrow();
    }
  });

  test("should generate consistent keys from same phrase", () => {
    const phrase = crypto.generateRecoveryPhrase();

    // Generate the same key twice
    const key1 = crypto.privateKeyFromPhrase(phrase);
    const key2 = crypto.privateKeyFromPhrase(phrase);

    expect(key1).toBe(key2);

    // Generate the same account key twice
    const accountKey1 = crypto.privateKeyFromPhraseWithAccount(phrase, 0);
    const accountKey2 = crypto.privateKeyFromPhraseWithAccount(phrase, 0);

    expect(accountKey1).toBe(accountKey2);
  });

  test("should generate different keys for different accounts", () => {
    const phrase = crypto.generateRecoveryPhrase();

    const account0Key = crypto.privateKeyFromPhraseWithAccount(phrase, 0);
    const account1Key = crypto.privateKeyFromPhraseWithAccount(phrase, 1);

    expect(account0Key).not.toBe(account1Key);
  });

  test("should handle invalid inputs gracefully", () => {
    // Test empty string
    expect(() => {
      crypto.privateKeyFromPhrase("");
    }).toThrow();

    // Test invalid mnemonic phrase
    expect(() => {
      crypto.privateKeyFromPhrase("this is not a valid mnemonic phrase at all");
    }).toThrow();

    // Test too few words
    expect(() => {
      crypto.privateKeyFromPhrase("word1 word2 word3");
    }).toThrow();
  });
});
