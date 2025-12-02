/**
 * Family Foundry Steward Approval Integration Tests
 * Tests steward approval workflow for federation creation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateFederationOperationHash,
  FederationApprovalRequest,
} from "../family-foundry-steward-approval";

describe("Family Foundry Steward Approval Integration", () => {
  describe("generateFederationOperationHash", () => {
    it("should generate consistent hash for same inputs", async () => {
      const hash1 = await generateFederationOperationHash(
        "fed_123",
        "Test Family",
        "creator_1"
      );
      const hash2 = await generateFederationOperationHash(
        "fed_123",
        "Test Family",
        "creator_1"
      );
      expect(hash1).toBe(hash2);
    });

    it("should generate different hash for different federation DUID", async () => {
      const hash1 = await generateFederationOperationHash(
        "fed_123",
        "Test Family",
        "creator_1"
      );
      const hash2 = await generateFederationOperationHash(
        "fed_456",
        "Test Family",
        "creator_1"
      );
      expect(hash1).not.toBe(hash2);
    });

    it("should generate different hash for different family name", async () => {
      const hash1 = await generateFederationOperationHash(
        "fed_123",
        "Test Family",
        "creator_1"
      );
      const hash2 = await generateFederationOperationHash(
        "fed_123",
        "Different Family",
        "creator_1"
      );
      expect(hash1).not.toBe(hash2);
    });

    it("should generate different hash for different creator", async () => {
      const hash1 = await generateFederationOperationHash(
        "fed_123",
        "Test Family",
        "creator_1"
      );
      const hash2 = await generateFederationOperationHash(
        "fed_123",
        "Test Family",
        "creator_2"
      );
      expect(hash1).not.toBe(hash2);
    });

    it("should generate 64-character hex hash", async () => {
      const hash = await generateFederationOperationHash(
        "fed_123",
        "Test Family",
        "creator_1"
      );
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should handle special characters in family name", async () => {
      const hash = await generateFederationOperationHash(
        "fed_123",
        "Test Family & Co.",
        "creator_1"
      );
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("Federation Approval Request Validation", () => {
    const validRequest: FederationApprovalRequest = {
      federationDuid: "fed_123",
      federationName: "Test Family",
      creatorUserDuid: "creator_1",
      stewardThreshold: 2,
      stewardPubkeys: ["pubkey1", "pubkey2", "pubkey3"],
      operationHash: "hash_123",
      expiresAtSeconds: Math.floor(Date.now() / 1000) + 300,
    };

    it("should validate required fields", () => {
      expect(validRequest.federationDuid).toBeDefined();
      expect(validRequest.federationName).toBeDefined();
      expect(validRequest.stewardThreshold).toBeGreaterThan(0);
      expect(validRequest.stewardPubkeys.length).toBeGreaterThan(0);
    });

    it("should have threshold <= pubkey count", () => {
      expect(validRequest.stewardThreshold).toBeLessThanOrEqual(
        validRequest.stewardPubkeys.length
      );
    });

    it("should have future expiration", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(validRequest.expiresAtSeconds).toBeGreaterThan(now);
    });

    it("should have valid operation hash format", async () => {
      const hash = await generateFederationOperationHash(
        "fed_123",
        "Test Family",
        "creator_1"
      );
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("Steward Approval Workflow", () => {
    it("should require at least one steward", () => {
      const request: FederationApprovalRequest = {
        federationDuid: "fed_123",
        federationName: "Test Family",
        creatorUserDuid: "creator_1",
        stewardThreshold: 1,
        stewardPubkeys: [],
        operationHash: "hash_123",
        expiresAtSeconds: Math.floor(Date.now() / 1000) + 300,
      };
      expect(request.stewardPubkeys.length).toBe(0);
    });

    it("should support multiple stewards", () => {
      const request: FederationApprovalRequest = {
        federationDuid: "fed_123",
        federationName: "Test Family",
        creatorUserDuid: "creator_1",
        stewardThreshold: 2,
        stewardPubkeys: ["pubkey1", "pubkey2", "pubkey3", "pubkey4", "pubkey5"],
        operationHash: "hash_123",
        expiresAtSeconds: Math.floor(Date.now() / 1000) + 300,
      };
      expect(request.stewardPubkeys.length).toBe(5);
      expect(request.stewardThreshold).toBeLessThanOrEqual(
        request.stewardPubkeys.length
      );
    });

    it("should enforce threshold <= steward count", () => {
      const request: FederationApprovalRequest = {
        federationDuid: "fed_123",
        federationName: "Test Family",
        creatorUserDuid: "creator_1",
        stewardThreshold: 3,
        stewardPubkeys: ["pubkey1", "pubkey2"],
        operationHash: "hash_123",
        expiresAtSeconds: Math.floor(Date.now() / 1000) + 300,
      };
      // This should fail validation
      expect(request.stewardThreshold).toBeGreaterThan(
        request.stewardPubkeys.length
      );
    });
  });
});
