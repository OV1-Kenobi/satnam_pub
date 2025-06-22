import { describe, expect, it } from "vitest";
import { validateNWCUri } from "../utils/nwc-validation";

describe("NWC Implementation Verification", () => {
  describe("Core NWC Functionality", () => {
    it("should validate proper NWC URI format", () => {
      const validPubkey =
        "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678";
      const validNwcUri = `nostr+walletconnect://${validPubkey}?relay=wss://relay.damus.io&secret=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890`;

      const result = validateNWCUri(validNwcUri);

      expect(result.isValid).toBe(true);
      expect(result.data?.pubkey).toBe(validPubkey);
      expect(result.data?.relay).toBe("wss://relay.damus.io");
      expect(result.data?.secret).toHaveLength(64);
    });

    it("should handle various relay URLs", () => {
      const validPubkey =
        "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678";
      const relays = [
        "wss://relay.damus.io",
        "wss://nos.lol",
        "wss://relay.snort.social",
        "wss://relay.current.fyi",
      ];

      relays.forEach((relay) => {
        const nwcUri = `nostr+walletconnect://${validPubkey}?relay=${relay}&secret=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890`;
        const result = validateNWCUri(nwcUri);

        expect(result.isValid).toBe(true);
        expect(result.data?.relay).toBe(relay);
      });
    });

    it("should validate NWC permissions correctly", () => {
      const validPubkey =
        "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678";
      const permissions = [
        "pay_invoice",
        "get_balance",
        "get_info",
        "make_invoice",
        "lookup_invoice",
        "list_transactions",
      ];

      const nwcUri = `nostr+walletconnect://${validPubkey}?relay=wss://relay.damus.io&secret=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890&permissions=${permissions.join(",")}`;

      const result = validateNWCUri(nwcUri);

      expect(result.isValid).toBe(true);
      expect(result.data?.permissions).toEqual(permissions);
    });
  });

  describe("Security Validation", () => {
    it("should reject weak secrets", () => {
      const validPubkey =
        "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678";
      const weakSecret = "weak123";
      const nwcUri = `nostr+walletconnect://${validPubkey}?relay=wss://relay.damus.io&secret=${weakSecret}`;

      const result = validateNWCUri(nwcUri);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Invalid secret length");
    });

    it("should reject invalid pubkey formats", () => {
      const invalidPubkeys = [
        "invalid",
        "123",
        "not-hex-characters-here-at-all-just-text-and-more-text-to-fill-64",
        "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678901", // 65 chars
      ];

      invalidPubkeys.forEach((pubkey) => {
        const nwcUri = `nostr+walletconnect://${pubkey}?relay=wss://relay.damus.io&secret=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890`;
        const result = validateNWCUri(nwcUri);

        expect(result.isValid).toBe(false);
      });
    });

    it("should reject non-websocket relay URLs", () => {
      const validPubkey =
        "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678";
      const invalidRelays = [
        "http://relay.example.com",
        "https://relay.example.com",
        "ftp://relay.example.com",
        "invalid-url",
        "not-a-url-at-all",
        "",
      ];

      invalidRelays.forEach((relay) => {
        const nwcUri = `nostr+walletconnect://${validPubkey}?relay=${relay}&secret=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890`;
        const result = validateNWCUri(nwcUri);

        expect(result.isValid).toBe(false);
      });
    });
  });

  describe("Real-world NWC URI Examples", () => {
    it("should handle Alby-style NWC URIs", () => {
      // Simulated Alby NWC URI format
      const validPubkey =
        "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678";
      const albyStyleUri = `nostr+walletconnect://${validPubkey}?relay=wss://relay.getalby.com/v1&secret=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890&permissions=pay_invoice,get_balance,get_info`;

      const result = validateNWCUri(albyStyleUri);

      expect(result.isValid).toBe(true);
      expect(result.data?.relay).toBe("wss://relay.getalby.com/v1");
      expect(result.data?.permissions).toContain("pay_invoice");
      expect(result.data?.permissions).toContain("get_balance");
    });

    it("should handle Mutiny-style NWC URIs", () => {
      // Simulated Mutiny NWC URI format
      const validPubkey =
        "b2c3d4e5f6789012345678901234567890123456789012345678901234567890";
      const mutinyStyleUri = `nostr+walletconnect://${validPubkey}?relay=wss://relay.mutinywallet.com&secret=fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321`;

      const result = validateNWCUri(mutinyStyleUri);

      expect(result.isValid).toBe(true);
      expect(result.data?.pubkey).toBe(validPubkey);
      expect(result.data?.relay).toBe("wss://relay.mutinywallet.com");
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle malformed URLs gracefully", () => {
      const malformedUris = [
        "nostr+walletconnect://",
        "nostr+walletconnect://pubkey",
        "nostr+walletconnect://pubkey?",
        "nostr+walletconnect://pubkey?relay=",
        "not-a-url-at-all",
      ];

      malformedUris.forEach((uri) => {
        const result = validateNWCUri(uri);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it("should handle empty and null inputs", () => {
      const invalidInputs = ["", " ", "\n", "\t"];

      invalidInputs.forEach((input) => {
        const result = validateNWCUri(input);
        expect(result.isValid).toBe(false);
      });
    });

    it("should accept uppercase hex characters", () => {
      const validPubkey =
        "A1B2C3D4E5F67890123456789012345678901234567890123456789012345678"; // uppercase
      const nwcUri = `nostr+walletconnect://${validPubkey}?relay=wss://relay.damus.io&secret=ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890`;

      const result = validateNWCUri(nwcUri);

      // Should accept uppercase hex characters
      expect(result.isValid).toBe(true);
      expect(result.data?.pubkey).toBe(validPubkey); // Returns as-is, no automatic lowercasing
    });
  });

  describe("Performance and Reliability", () => {
    it("should validate URIs quickly", () => {
      const validPubkey =
        "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678";
      const nwcUri = `nostr+walletconnect://${validPubkey}?relay=wss://relay.damus.io&secret=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890`;

      const startTime = performance.now();

      // Run validation 100 times
      for (let i = 0; i < 100; i++) {
        validateNWCUri(nwcUri);
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / 100;

      // Should validate in under 1ms on average
      expect(avgTime).toBeLessThan(1);
    });

    it("should handle concurrent validations", async () => {
      const validPubkey =
        "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678";
      const nwcUri = `nostr+walletconnect://${validPubkey}?relay=wss://relay.damus.io&secret=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890`;

      // Create 50 concurrent validation promises
      const promises = Array.from({ length: 50 }, () =>
        Promise.resolve(validateNWCUri(nwcUri))
      );

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach((result) => {
        expect(result.isValid).toBe(true);
      });
    });
  });
});
