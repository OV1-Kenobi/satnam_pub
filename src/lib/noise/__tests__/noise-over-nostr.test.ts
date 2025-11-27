/**
 * Unit Tests for NoiseOverNostrAdapter
 * Phase 5: Noise Protocol Overlay - Priority 7
 *
 * Tests the transport adapter that maps Noise messages to NIP-17/59 events
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NoiseOverNostrAdapter } from "../noise-over-nostr";
import type { NoiseTransportMessage } from "../types";

describe("NoiseOverNostrAdapter", () => {
  let adapter: NoiseOverNostrAdapter;

  beforeEach(() => {
    // Reset singleton for clean tests
    NoiseOverNostrAdapter.resetInstance();
    adapter = NoiseOverNostrAdapter.getInstance();
  });

  afterEach(() => {
    NoiseOverNostrAdapter.resetInstance();
    console.log("✅ Test cleanup completed");
  });

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = NoiseOverNostrAdapter.getInstance();
      const instance2 = NoiseOverNostrAdapter.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("createTransportMessage", () => {
    it("should create transport message with correct structure", () => {
      const sessionId = "session123";
      const payload = new Uint8Array([1, 2, 3, 4, 5]);
      const pattern = "XX" as const;

      const message = adapter.createTransportMessage(
        sessionId,
        payload,
        pattern
      );

      expect(message.type).toBe("transport");
      // Payload is base64 encoded
      expect(typeof message.payload).toBe("string");
      expect(message.pattern).toBe("XX");
      expect(message.sessionId).toBe(sessionId);
      expect(message.timestamp).toBeDefined();
      expect(typeof message.timestamp).toBe("number");
    });

    it("should create transport message for IK pattern", () => {
      const message = adapter.createTransportMessage(
        "session1",
        new Uint8Array([1, 2, 3]),
        "IK"
      );
      expect(message.pattern).toBe("IK");
    });

    it("should create transport message for NK pattern", () => {
      const message = adapter.createTransportMessage(
        "session1",
        new Uint8Array([1, 2, 3]),
        "NK"
      );
      expect(message.pattern).toBe("NK");
    });
  });

  describe("createHandshakeMessage", () => {
    it("should create handshake message with index", () => {
      const sessionId = "session123";
      const payload = new Uint8Array([10, 20, 30]);
      const pattern = "XX" as const;
      const index = 1;

      const message = adapter.createHandshakeMessage(
        sessionId,
        payload,
        pattern,
        index
      );

      expect(message.type).toBe("handshake");
      // Payload is base64 encoded
      expect(typeof message.payload).toBe("string");
      expect(message.pattern).toBe("XX");
      expect(message.handshakeIndex).toBe(1);
      expect(message.timestamp).toBeDefined();
    });

    it("should create handshake message for index 0 (initiator)", () => {
      const message = adapter.createHandshakeMessage(
        "session1",
        new Uint8Array([1, 2, 3]),
        "XX",
        0
      );
      expect(message.handshakeIndex).toBe(0);
    });

    it("should create handshake message for index 2 (final)", () => {
      const message = adapter.createHandshakeMessage(
        "session1",
        new Uint8Array([1, 2, 3]),
        "XX",
        2
      );
      expect(message.handshakeIndex).toBe(2);
    });
  });

  describe("wrapNoiseMessage", () => {
    it("should wrap message with noise tag including pattern", () => {
      const transportMessage: NoiseTransportMessage = {
        type: "transport",
        sessionId: "test-session-id",
        payload: "AQID", // base64 encoded
        pattern: "XX",
        timestamp: Date.now(),
      };

      const { content, tags } = adapter.wrapNoiseMessage(
        "npub1test",
        transportMessage
      );

      expect(content).toBeDefined();
      expect(typeof content).toBe("string");
      // Tag format is ["noise", "v1", pattern]
      expect(tags.some((t) => t[0] === "noise" && t[1] === "v1")).toBe(true);
    });

    it("should include pattern in noise tag", () => {
      const transportMessage: NoiseTransportMessage = {
        type: "transport",
        sessionId: "test-session-id",
        payload: "AQID",
        pattern: "IK",
        timestamp: Date.now(),
      };

      const { tags } = adapter.wrapNoiseMessage("npub1test", transportMessage);

      // Pattern is included in the noise tag as third element
      expect(tags.some((t) => t[0] === "noise" && t[2] === "IK")).toBe(true);
    });

    it("should include noise payload in content", () => {
      const transportMessage: NoiseTransportMessage = {
        type: "transport",
        sessionId: "test-session-id",
        payload: "AQID",
        pattern: "XX",
        timestamp: Date.now(),
      };

      const { content } = adapter.wrapNoiseMessage(
        "npub1test",
        transportMessage
      );
      const parsed = JSON.parse(content);

      expect(parsed.noise).toBeDefined();
      expect(parsed.type).toBe("transport");
    });
  });

  describe("isNoiseMessage", () => {
    it("should return true for events with noise tag", () => {
      const event = {
        id: "test",
        pubkey: "abc123",
        created_at: Date.now(),
        kind: 14,
        tags: [
          ["noise", "v1", "XX"],
          ["p", "recipient"],
        ],
        content: "{}",
        sig: "sig123",
      };

      expect(adapter.isNoiseMessage(event)).toBe(true);
    });

    it("should return false for events without noise tag", () => {
      const event = {
        id: "test",
        pubkey: "abc123",
        created_at: Date.now(),
        kind: 14,
        tags: [["p", "recipient"]],
        content: "{}",
        sig: "sig123",
      };

      expect(adapter.isNoiseMessage(event)).toBe(false);
    });

    it("should return false for non-NIP17 events", () => {
      const event = {
        id: "test",
        pubkey: "abc123",
        created_at: Date.now(),
        kind: 1, // Not NIP-17
        tags: [["noise", "v1", "XX"]],
        content: "{}",
        sig: "sig123",
      };

      expect(adapter.isNoiseMessage(event)).toBe(false);
    });
  });
});
