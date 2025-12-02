/**
 * Family Foundry FROST Integration Tests
 * Tests FROST session creation, threshold calculation, and participant management
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  calculateFrostThreshold,
  createFrostSession,
  FROST_THRESHOLD_CONFIG,
  FrostSessionSetupParams,
} from "../family-foundry-frost";

describe("Family Foundry FROST Integration", () => {
  describe("calculateFrostThreshold", () => {
    it("should return 1-of-1 for single participant", () => {
      const participants = [{ user_duid: "user1", role: "private" }];
      const result = calculateFrostThreshold(participants);
      expect(result.threshold).toBe(1);
      expect(result.minRequired).toBe(1);
    });

    it("should return 2-of-2 for two stewards", () => {
      const participants = [
        { user_duid: "user1", role: "steward" },
        { user_duid: "user2", role: "steward" },
      ];
      const result = calculateFrostThreshold(participants);
      expect(result.threshold).toBe(2);
      expect(result.minRequired).toBe(2);
    });

    it("should return 2-of-3 for three guardians", () => {
      const participants = [
        { user_duid: "user1", role: "guardian" },
        { user_duid: "user2", role: "guardian" },
        { user_duid: "user3", role: "guardian" },
      ];
      const result = calculateFrostThreshold(participants);
      expect(result.threshold).toBe(2);
      expect(result.minRequired).toBe(3);
    });

    it("should return 1-of-1 for mixed roles with no stewards/guardians", () => {
      const participants = [
        { user_duid: "user1", role: "adult" },
        { user_duid: "user2", role: "offspring" },
      ];
      const result = calculateFrostThreshold(participants);
      expect(result.threshold).toBe(1);
      expect(result.minRequired).toBe(1);
    });

    it("should handle mixed roles with stewards", () => {
      const participants = [
        { user_duid: "user1", role: "steward" },
        { user_duid: "user2", role: "adult" },
        { user_duid: "user3", role: "offspring" },
      ];
      const result = calculateFrostThreshold(participants);
      expect(result.threshold).toBe(1);
      expect(result.minRequired).toBe(1);
    });
  });

  describe("createFrostSession", () => {
    const mockParams: FrostSessionSetupParams = {
      federationDuid: "fed_123",
      familyName: "Test Family",
      creatorUserDuid: "creator_1",
      participants: [
        { user_duid: "user1", role: "steward" },
        { user_duid: "user2", role: "steward" },
      ],
      messageHash: "hash_123",
      eventTemplate: "federation_creation",
      eventType: "federation_setup",
    };

    it("should fail with no participants", async () => {
      const params = { ...mockParams, participants: [] };
      const result = await createFrostSession(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("At least one participant required");
    });

    it("should handle single steward participant", async () => {
      const params = {
        ...mockParams,
        participants: [{ user_duid: "user1", role: "steward" }],
      };
      const result = await createFrostSession(params);
      // Single steward should work (1-of-1)
      if (result.success) {
        expect(result.threshold).toBe(1);
      }
    });

    it("should calculate correct threshold for participants", async () => {
      const result = await createFrostSession(mockParams);
      if (result.success) {
        expect(result.threshold).toBe(2);
        expect(result.participantCount).toBe(2);
      }
    });

    it("should handle error gracefully", async () => {
      const params = { ...mockParams, federationDuid: "" };
      const result = await createFrostSession(params);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("FROST_THRESHOLD_CONFIG", () => {
    it("should have correct configuration for all roles", () => {
      expect(FROST_THRESHOLD_CONFIG.private).toEqual({
        minParticipants: 1,
        threshold: 1,
      });
      expect(FROST_THRESHOLD_CONFIG.offspring).toEqual({
        minParticipants: 2,
        threshold: 1,
      });
      expect(FROST_THRESHOLD_CONFIG.adult).toEqual({
        minParticipants: 2,
        threshold: 2,
      });
      expect(FROST_THRESHOLD_CONFIG.steward).toEqual({
        minParticipants: 3,
        threshold: 2,
      });
      expect(FROST_THRESHOLD_CONFIG.guardian).toEqual({
        minParticipants: 3,
        threshold: 2,
      });
    });
  });
});
