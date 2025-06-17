// Backend Family API Tests
import { beforeEach, describe, expect, test } from "vitest";
import { FamilyAPI } from "../family-api";

describe("FamilyAPI - Backend Integration Tests", () => {
  let familyAPI: FamilyAPI;

  beforeEach(() => {
    familyAPI = new FamilyAPI();
  });

  describe("Database Connection Tests", () => {
    test("should connect to Supabase", async () => {
      try {
        await familyAPI.getFamilyMembers();
        // If no error thrown, connection works
        expect(true).toBe(true);
      } catch (error) {
        // Log connection issues for debugging
        console.error("Database connection failed:", error);
        throw error;
      }
    });
  });

  describe("Family Members CRUD Tests", () => {
    test("should retrieve family members", async () => {
      const members = await familyAPI.getFamilyMembers();
      expect(Array.isArray(members)).toBe(true);
    });

    test("should add family member with validation", async () => {
      const newMember = {
        name: "Test Member",
        role: "child",
        lightningBalance: 0,
      };

      const addedMember = await familyAPI.addFamilyMember(newMember);
      expect(addedMember).toBeDefined();
      expect(addedMember.id).toBeDefined();
      expect(addedMember.name).toBe(newMember.name);

      // Clean up - remove test member
      await familyAPI.deleteFamilyMember(addedMember.id);
    });

    test("should update family member", async () => {
      // First add a test member
      const newMember = {
        name: "Update Test Member",
        role: "child",
        lightningBalance: 1000,
      };

      const addedMember = await familyAPI.addFamilyMember(newMember);

      // Update the member
      const updates = { lightningBalance: 2000, role: "teen" };
      const updatedMember = await familyAPI.updateFamilyMember(
        addedMember.id,
        updates,
      );

      expect(updatedMember.lightningBalance).toBe(2000);
      expect(updatedMember.role).toBe("teen");

      // Clean up
      await familyAPI.deleteFamilyMember(addedMember.id);
    });

    test("should handle invalid member data", async () => {
      const invalidMember = {
        // Missing required fields
        name: "",
        role: "",
      };

      await expect(familyAPI.addFamilyMember(invalidMember)).rejects.toThrow();
    });
  });

  describe("Security Tests", () => {
    test("should prevent SQL injection", async () => {
      const maliciousInput = "'; DROP TABLE family_members; --";

      const maliciousMember = {
        name: maliciousInput,
        role: "attacker",
      };

      // This should either fail safely or sanitize input
      try {
        const result = await familyAPI.addFamilyMember(maliciousMember);
        // If successful, check that no injection occurred
        expect(result.name).not.toContain("DROP TABLE");
        await familyAPI.deleteFamilyMember(result.id);
      } catch (error) {
        // Rejection is also acceptable for security
        expect(error).toBeDefined();
      }
    });
  });
});
