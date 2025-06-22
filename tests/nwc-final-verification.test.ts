import { describe, expect, it } from "vitest";
import { sanitizeNWCData, validateNWCUri } from "../utils/nwc-validation";

describe("NWC Final Implementation Verification", () => {
  describe("Complete NWC Flow", () => {
    it("should handle a complete NWC validation and sanitization flow", () => {
      // Test with a realistic NWC URI
      const testNwcUri =
        "nostr+walletconnect://a1b2c3d4e5f67890123456789012345678901234567890123456789012345678?relay=wss://relay.damus.io&secret=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890&permissions=pay_invoice,get_balance,get_info";

      // Step 1: Validate the NWC URI
      const validationResult = validateNWCUri(testNwcUri);

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.data).toBeDefined();
      expect(validationResult.data?.pubkey).toBe(
        "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678"
      );
      expect(validationResult.data?.relay).toBe("wss://relay.damus.io");
      expect(validationResult.data?.secret).toHaveLength(64);
      expect(validationResult.data?.permissions).toEqual([
        "pay_invoice",
        "get_balance",
        "get_info",
      ]);

      // Step 2: Sanitize the data
      if (validationResult.data) {
        const sanitizedData = sanitizeNWCData(validationResult.data);

        expect(sanitizedData.pubkey).toBe(
          "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678"
        );
        expect(sanitizedData.relay).toBe("wss://relay.damus.io");
        expect(sanitizedData.secret).toBe(
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
        );
        expect(sanitizedData.permissions).toEqual([
          "pay_invoice",
          "get_balance",
          "get_info",
        ]);
      }
    });

    it("should handle uppercase pubkeys correctly", () => {
      const testNwcUri =
        "nostr+walletconnect://A1B2C3D4E5F67890123456789012345678901234567890123456789012345678?relay=wss://relay.damus.io&secret=ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890";

      const validationResult = validateNWCUri(testNwcUri);

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.data?.pubkey).toBe(
        "A1B2C3D4E5F67890123456789012345678901234567890123456789012345678"
      );

      // Sanitization should convert to lowercase
      if (validationResult.data) {
        const sanitizedData = sanitizeNWCData(validationResult.data);
        expect(sanitizedData.pubkey).toBe(
          "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678"
        );
      }
    });

    it("should properly validate all security requirements", () => {
      const securityTests = [
        {
          name: "Invalid protocol",
          uri: "http://invalid-protocol/test",
          shouldPass: false,
        },
        {
          name: "Invalid pubkey length",
          uri: "nostr+walletconnect://short?relay=wss://relay.damus.io&secret=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
          shouldPass: false,
        },
        {
          name: "Non-hex pubkey",
          uri: "nostr+walletconnect://not-hex-characters-here-at-all-just-text-and-more-text-to-fill?relay=wss://relay.damus.io&secret=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
          shouldPass: false,
        },
        {
          name: "Non-websocket relay",
          uri: "nostr+walletconnect://a1b2c3d4e5f67890123456789012345678901234567890123456789012345678?relay=https://relay.example.com&secret=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
          shouldPass: false,
        },
        {
          name: "Short secret",
          uri: "nostr+walletconnect://a1b2c3d4e5f67890123456789012345678901234567890123456789012345678?relay=wss://relay.damus.io&secret=short",
          shouldPass: false,
        },
        {
          name: "Valid NWC URI",
          uri: "nostr+walletconnect://a1b2c3d4e5f67890123456789012345678901234567890123456789012345678?relay=wss://relay.damus.io&secret=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
          shouldPass: true,
        },
      ];

      securityTests.forEach((test) => {
        const result = validateNWCUri(test.uri);
        expect(result.isValid).toBe(test.shouldPass);

        if (!test.shouldPass) {
          expect(result.error).toBeDefined();
        }
      });
    });
  });

  describe("Real-world Compatibility", () => {
    it("should work with popular wallet NWC URIs", () => {
      const walletTests = [
        {
          name: "Alby-style",
          uri: "nostr+walletconnect://a1b2c3d4e5f67890123456789012345678901234567890123456789012345678?relay=wss://relay.getalby.com/v1&secret=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890&permissions=pay_invoice,get_balance",
        },
        {
          name: "Mutiny-style",
          uri: "nostr+walletconnect://b2c3d4e5f6789012345678901234567890123456789012345678901234567890?relay=wss://relay.mutinywallet.com&secret=fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
        },
        {
          name: "Generic relay",
          uri: "nostr+walletconnect://c3d4e5f6789012345678901234567890123456789012345678901234567890ab?relay=wss://nos.lol&secret=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        },
      ];

      walletTests.forEach((test) => {
        const result = validateNWCUri(test.uri);
        expect(result.isValid).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data?.pubkey).toHaveLength(64);
        expect(result.data?.relay.startsWith("wss://")).toBe(true);
        expect(result.data?.secret).toHaveLength(64);
      });
    });
  });

  describe("Performance Verification", () => {
    it("should validate quickly under load", () => {
      const testUri =
        "nostr+walletconnect://a1b2c3d4e5f67890123456789012345678901234567890123456789012345678?relay=wss://relay.damus.io&secret=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const result = validateNWCUri(testUri);
        expect(result.isValid).toBe(true);
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      // Should validate in under 0.5ms on average
      expect(avgTime).toBeLessThan(0.5);
    });
  });
});
