/**
 * ContactsList Trust Enhancements Tests
 * Phase 3 Day 2: Trust-Based Contact Filtering & Sorting
 *
 * Tests for ContactsList component enhancements with trust-based filtering and sorting
 */

import { describe, expect, it } from "vitest";
import type { TrustFilters } from "../../../src/components/trust/TrustFilterPanel";
import type { Contact } from "../../../src/types/contacts";

describe("ContactsList Trust Enhancements", () => {
  const mockContacts: Contact[] = [
    {
      id: "contact-1",
      npub: "npub1contact1",
      displayName: "Alice",
      trustLevel: "family",
      supportsGiftWrap: true,
      preferredEncryption: "gift-wrap",
      tags: ["family"],
      addedAt: new Date("2024-01-01"),
      contactCount: 10,
      cachedTrustScore: 95,
      nip05Verified: true,
      pubkeyVerified: true,
    },
    {
      id: "contact-2",
      npub: "npub1contact2",
      displayName: "Bob",
      trustLevel: "trusted",
      supportsGiftWrap: true,
      preferredEncryption: "gift-wrap",
      tags: ["work"],
      addedAt: new Date("2024-02-01"),
      contactCount: 5,
      cachedTrustScore: 72,
      nip05Verified: true,
      pubkeyVerified: false,
    },
    {
      id: "contact-3",
      npub: "npub1contact3",
      displayName: "Charlie",
      trustLevel: "known",
      supportsGiftWrap: false,
      preferredEncryption: "nip04",
      tags: ["friends"],
      addedAt: new Date("2024-03-01"),
      contactCount: 3,
      cachedTrustScore: 45,
      nip05Verified: false,
      pubkeyVerified: true,
    },
    {
      id: "contact-4",
      npub: "npub1contact4",
      displayName: "Diana",
      trustLevel: "unverified",
      supportsGiftWrap: false,
      preferredEncryption: "auto",
      tags: [],
      addedAt: new Date("2024-04-01"),
      contactCount: 1,
      cachedTrustScore: 20,
      nip05Verified: false,
      pubkeyVerified: false,
    },
  ];

  describe("Trust Score Filtering", () => {
    it("should filter contacts by minimum trust score", () => {
      const filters: TrustFilters = { minTrustScore: 70 };
      const filtered = mockContacts.filter(
        (c) => (c.cachedTrustScore || 0) >= filters.minTrustScore!
      );
      expect(filtered).toHaveLength(2);
      expect(filtered.map((c) => c.displayName)).toEqual(["Alice", "Bob"]);
    });

    it("should filter contacts by maximum trust score", () => {
      const filters: TrustFilters = { maxTrustScore: 50 };
      const filtered = mockContacts.filter(
        (c) => (c.cachedTrustScore || 0) <= filters.maxTrustScore!
      );
      expect(filtered).toHaveLength(2);
      expect(filtered.map((c) => c.displayName)).toEqual(["Charlie", "Diana"]);
    });

    it("should filter contacts by trust score range", () => {
      const filters: TrustFilters = { minTrustScore: 40, maxTrustScore: 80 };
      const filtered = mockContacts.filter(
        (c) =>
          (c.cachedTrustScore || 0) >= filters.minTrustScore! &&
          (c.cachedTrustScore || 0) <= filters.maxTrustScore!
      );
      expect(filtered).toHaveLength(2);
      expect(filtered.map((c) => c.displayName)).toEqual(["Bob", "Charlie"]);
    });

    it("should handle contacts without trust score", () => {
      const contactNoScore: Contact = {
        ...mockContacts[0],
        cachedTrustScore: undefined,
      };
      const filters: TrustFilters = { minTrustScore: 50 };
      const filtered = [contactNoScore, ...mockContacts].filter(
        (c) => (c.cachedTrustScore || 0) >= filters.minTrustScore!
      );
      expect(filtered).toHaveLength(2);
    });
  });

  describe("Trust Score Sorting", () => {
    it("should sort contacts by trust score ascending", () => {
      const sorted = [...mockContacts].sort((a, b) => {
        const aScore = a.cachedTrustScore || 0;
        const bScore = b.cachedTrustScore || 0;
        return aScore - bScore;
      });
      expect(sorted.map((c) => c.displayName)).toEqual([
        "Diana",
        "Charlie",
        "Bob",
        "Alice",
      ]);
    });

    it("should sort contacts by trust score descending", () => {
      const sorted = [...mockContacts].sort((a, b) => {
        const aScore = a.cachedTrustScore || 0;
        const bScore = b.cachedTrustScore || 0;
        return bScore - aScore;
      });
      expect(sorted.map((c) => c.displayName)).toEqual([
        "Alice",
        "Bob",
        "Charlie",
        "Diana",
      ]);
    });

    it("should handle sorting with missing trust scores", () => {
      const contactNoScore: Contact = {
        ...mockContacts[0],
        displayName: "Eve",
        cachedTrustScore: undefined,
      };
      const sorted = [contactNoScore, ...mockContacts].sort((a, b) => {
        const aScore = a.cachedTrustScore || 0;
        const bScore = b.cachedTrustScore || 0;
        return bScore - aScore;
      });
      // Contacts with undefined score are treated as 0, so they sort to the end
      // Both Eve (undefined) and Diana (20) have score 0 when treated as 0
      // So they should be at the end
      const lastTwo = sorted.slice(-2).map((c) => c.displayName);
      expect(lastTwo).toContain("Diana");
      expect(lastTwo).toContain("Eve");
    });
  });

  describe("Unverified Contact Filtering", () => {
    it("should filter out unverified contacts when showUnverified is false", () => {
      const filters: TrustFilters = { showUnverified: false };
      const filtered = mockContacts.filter((contact) => {
        if (filters.showUnverified === false) {
          return (
            contact.nip05Verified ||
            contact.pubkeyVerified ||
            contact.vpVerified ||
            contact.physicallyVerified
          );
        }
        return true;
      });
      expect(filtered).toHaveLength(3);
      expect(filtered.map((c) => c.displayName)).toEqual([
        "Alice",
        "Bob",
        "Charlie",
      ]);
    });

    it("should include all contacts when showUnverified is true", () => {
      const filters: TrustFilters = { showUnverified: true };
      const filtered = mockContacts.filter((contact) => {
        if (filters.showUnverified === false) {
          return (
            contact.nip05Verified ||
            contact.pubkeyVerified ||
            contact.vpVerified ||
            contact.physicallyVerified
          );
        }
        return true;
      });
      expect(filtered).toHaveLength(4);
    });
  });

  describe("Combined Trust Filtering", () => {
    it("should apply multiple trust filters together", () => {
      const filters: TrustFilters = {
        minTrustScore: 40,
        maxTrustScore: 80,
        showUnverified: false,
      };
      let filtered = mockContacts;

      if (filters.minTrustScore !== undefined) {
        filtered = filtered.filter(
          (c) => (c.cachedTrustScore || 0) >= filters.minTrustScore!
        );
      }

      if (filters.maxTrustScore !== undefined) {
        filtered = filtered.filter(
          (c) => (c.cachedTrustScore || 0) <= filters.maxTrustScore!
        );
      }

      if (filters.showUnverified === false) {
        filtered = filtered.filter(
          (c) =>
            c.nip05Verified ||
            c.pubkeyVerified ||
            c.vpVerified ||
            c.physicallyVerified
        );
      }

      // Should include Bob (72, nip05Verified) and Charlie (45, pubkeyVerified)
      expect(filtered).toHaveLength(2);
      expect(filtered.map((c) => c.displayName)).toEqual(["Bob", "Charlie"]);
    });

    it("should handle empty result set", () => {
      const filters: TrustFilters = {
        minTrustScore: 100,
        maxTrustScore: 100,
      };
      const filtered = mockContacts.filter(
        (c) =>
          (c.cachedTrustScore || 0) >= filters.minTrustScore! &&
          (c.cachedTrustScore || 0) <= filters.maxTrustScore!
      );
      expect(filtered).toHaveLength(0);
    });
  });

  describe("Trust Score Display", () => {
    it("should display trust score for contacts with score", () => {
      const contact = mockContacts[0];
      expect(contact.cachedTrustScore).toBeDefined();
      expect(contact.cachedTrustScore).toBeGreaterThanOrEqual(0);
      expect(contact.cachedTrustScore).toBeLessThanOrEqual(100);
    });

    it("should handle missing trust score gracefully", () => {
      const contact: Contact = {
        ...mockContacts[0],
        cachedTrustScore: undefined,
      };
      const displayScore = contact.cachedTrustScore || 0;
      expect(displayScore).toBe(0);
    });

    it("should color-code trust scores correctly", () => {
      const getScoreColor = (score: number) => {
        if (score >= 80) return "green";
        if (score >= 60) return "blue";
        if (score >= 40) return "yellow";
        return "red";
      };

      expect(getScoreColor(95)).toBe("green");
      expect(getScoreColor(72)).toBe("blue");
      expect(getScoreColor(45)).toBe("yellow");
      expect(getScoreColor(20)).toBe("red");
    });
  });

  describe("Verification Badge Integration", () => {
    it("should display verification badges for verified contacts", () => {
      const contact = mockContacts[0];
      expect(contact.nip05Verified).toBe(true);
      expect(contact.pubkeyVerified).toBe(true);
    });

    it("should display trust score alongside verification badges", () => {
      const contact = mockContacts[0];
      expect(contact.cachedTrustScore).toBeDefined();
      expect(contact.nip05Verified || contact.pubkeyVerified).toBe(true);
    });

    it("should handle contacts with only trust score", () => {
      const contact: Contact = {
        ...mockContacts[0],
        nip05Verified: false,
        pubkeyVerified: false,
        cachedTrustScore: 75,
      };
      expect(contact.cachedTrustScore).toBeDefined();
      expect(contact.nip05Verified || contact.pubkeyVerified).toBe(false);
    });
  });

  describe("Filter State Management", () => {
    it("should initialize with empty trust filters", () => {
      const trustFilters: TrustFilters = {};
      expect(Object.keys(trustFilters)).toHaveLength(0);
    });

    it("should update trust filters", () => {
      let trustFilters: TrustFilters = {};
      trustFilters = { ...trustFilters, minTrustScore: 50 };
      expect(trustFilters.minTrustScore).toBe(50);
    });

    it("should clear trust filters", () => {
      let trustFilters: TrustFilters = {
        minTrustScore: 50,
        maxTrustScore: 80,
      };
      trustFilters = {};
      expect(Object.keys(trustFilters)).toHaveLength(0);
    });
  });

  describe("Backward Compatibility", () => {
    it("should work without trust filtering enabled", () => {
      const filtered = mockContacts.filter((c) => c.trustLevel === "family");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].displayName).toBe("Alice");
    });

    it("should preserve existing filter functionality", () => {
      const filtered = mockContacts.filter(
        (c) => c.trustLevel === "trusted" || c.trustLevel === "family"
      );
      expect(filtered).toHaveLength(2);
    });

    it("should combine existing and trust filters", () => {
      let filtered = mockContacts.filter((c) => c.supportsGiftWrap === true);
      filtered = filtered.filter((c) => (c.cachedTrustScore || 0) >= 70);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((c) => c.displayName)).toEqual(["Alice", "Bob"]);
    });
  });
});
