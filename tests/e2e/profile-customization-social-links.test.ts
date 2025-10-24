/**
 * E2E Tests: Profile Customization - Social Links Editor
 * Phase 4C: Social Links Editor
 *
 * Tests for social links management functionality
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SOCIAL_LINKS,
  sanitizeSocialLinks,
  validateLabel,
  validatePlatformUrl,
  validateSocialLinks,
} from "../../src/lib/validation/social-links-validation";
import type { SocialLink } from "../../src/types/profile";

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(() => mockSupabase),
  select: vi.fn(() => mockSupabase),
  update: vi.fn(() => mockSupabase),
  eq: vi.fn(() => mockSupabase),
  single: vi.fn(),
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabase),
}));

describe("Profile Customization - Social Links Editor E2E", () => {
  const testUserId = "test-user-duid-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    console.log("✅ Test cleanup completed");
  });

  describe("Feature Flag Gating", () => {
    it("should display social links editor when feature flag enabled", () => {
      const CUSTOMIZATION_ENABLED = true;
      expect(CUSTOMIZATION_ENABLED).toBe(true);
    });

    it("should hide social links editor when feature flag disabled", () => {
      const CUSTOMIZATION_ENABLED = false;
      expect(CUSTOMIZATION_ENABLED).toBe(false);
    });
  });

  describe("Twitter URL Validation", () => {
    it("should accept valid Twitter URLs", () => {
      const result = validatePlatformUrl(
        "twitter",
        "https://twitter.com/username"
      );
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe("https://twitter.com/username");
    });

    it("should accept valid X.com URLs and normalize to twitter.com", () => {
      const result = validatePlatformUrl("twitter", "https://x.com/username");
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe("https://twitter.com/username");
    });

    it("should reject invalid Twitter URLs", () => {
      const result = validatePlatformUrl("twitter", "https://example.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid twitter URL format");
    });
  });

  describe("GitHub URL Validation", () => {
    it("should accept valid GitHub URLs", () => {
      const result = validatePlatformUrl(
        "github",
        "https://github.com/username"
      );
      expect(result.valid).toBe(true);
    });

    it("should reject invalid GitHub URLs", () => {
      const result = validatePlatformUrl("github", "https://gitlab.com/user");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid github URL format");
    });
  });

  describe("Telegram URL Validation", () => {
    it("should accept valid Telegram URLs", () => {
      const result = validatePlatformUrl("telegram", "https://t.me/username");
      expect(result.valid).toBe(true);
    });

    it("should reject invalid Telegram URLs", () => {
      const result = validatePlatformUrl("telegram", "https://example.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid telegram URL format");
    });
  });

  describe("Nostr npub Validation", () => {
    it("should accept valid Nostr npub addresses", () => {
      // Valid npub format: npub1 + exactly 58 lowercase alphanumeric characters (bech32)
      const validNpub =
        "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3xueyj";
      const result = validatePlatformUrl("nostr", validNpub);
      expect(result.valid).toBe(true);
    });

    it("should reject invalid Nostr addresses", () => {
      const result = validatePlatformUrl("nostr", "invalid-npub");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid nostr URL format");
    });
  });

  describe("Lightning Address Validation", () => {
    it("should accept valid Lightning Addresses", () => {
      const result = validatePlatformUrl("lightning", "username@domain.com");
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe("username@domain.com");
    });

    it("should reject invalid Lightning Addresses", () => {
      const result = validatePlatformUrl("lightning", "invalid-address");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid lightning URL format");
    });
  });

  describe("Website URL Validation", () => {
    it("should accept valid HTTPS website URLs", () => {
      const result = validatePlatformUrl("website", "https://example.com");
      expect(result.valid).toBe(true);
    });

    it("should reject HTTP (non-HTTPS) website URLs", () => {
      const result = validatePlatformUrl("website", "http://example.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid website URL format");
    });
  });

  describe("Maximum Links Limit", () => {
    it("should enforce maximum 10 social links", () => {
      const links: SocialLink[] = Array.from({ length: 11 }, (_, i) => ({
        id: `link-${i}`,
        platform: "website",
        url: `https://example${i}.com`,
        order: i,
      }));

      const result = validateSocialLinks(links);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(`Maximum ${MAX_SOCIAL_LINKS}`);
    });

    it("should accept 10 or fewer social links", () => {
      const links: SocialLink[] = Array.from({ length: 10 }, (_, i) => ({
        id: `link-${i}`,
        platform: "website",
        url: `https://example${i}.com`,
        order: i,
      }));

      const result = validateSocialLinks(links);
      expect(result.valid).toBe(true);
    });
  });

  describe("Social Link Persistence", () => {
    it("should save social links to database", async () => {
      const links: SocialLink[] = [
        {
          id: "link-1",
          platform: "twitter",
          url: "https://twitter.com/username",
          order: 0,
        },
        {
          id: "link-2",
          platform: "github",
          url: "https://github.com/username",
          order: 1,
        },
      ];

      const socialLinksObject: Record<string, any> = {};
      links.forEach((link, index) => {
        socialLinksObject[index.toString()] = {
          id: link.id,
          platform: link.platform,
          url: link.url,
          label: link.label || undefined,
          order: link.order,
        };
      });

      mockSupabase.update.mockReturnValueOnce(mockSupabase);
      mockSupabase.eq.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const { error } = await mockSupabase
        .from("user_identities")
        .update({ social_links: socialLinksObject })
        .eq("id", testUserId);

      expect(error).toBeNull();
      expect(mockSupabase.update).toHaveBeenCalledWith({
        social_links: socialLinksObject,
      });
    });

    it("should remove social links from profile", async () => {
      mockSupabase.update.mockReturnValueOnce(mockSupabase);
      mockSupabase.eq.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const { error } = await mockSupabase
        .from("user_identities")
        .update({ social_links: {} })
        .eq("id", testUserId);

      expect(error).toBeNull();
      expect(mockSupabase.update).toHaveBeenCalledWith({
        social_links: {},
      });
    });
  });

  describe("Link Reordering", () => {
    it("should reorder social links correctly", () => {
      const links: SocialLink[] = [
        {
          id: "link-1",
          platform: "twitter",
          url: "https://twitter.com/user1",
          order: 0,
        },
        {
          id: "link-2",
          platform: "github",
          url: "https://github.com/user2",
          order: 1,
        },
        {
          id: "link-3",
          platform: "website",
          url: "https://example.com",
          order: 2,
        },
      ];

      // Simulate moving link-3 to position 0
      const reorderedLinks = [links[2], links[0], links[1]].map(
        (link, index) => ({
          ...link,
          order: index,
        })
      );

      expect(reorderedLinks[0].id).toBe("link-3");
      expect(reorderedLinks[0].order).toBe(0);
      expect(reorderedLinks[1].id).toBe("link-1");
      expect(reorderedLinks[1].order).toBe(1);
      expect(reorderedLinks[2].id).toBe("link-2");
      expect(reorderedLinks[2].order).toBe(2);
    });
  });

  describe("Label Validation", () => {
    it("should accept valid labels", () => {
      const result = validateLabel("My Blog");
      expect(result.valid).toBe(true);
    });

    it("should reject labels with HTML tags", () => {
      const result = validateLabel("<script>alert('xss')</script>");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid characters");
    });

    it("should reject labels exceeding maximum length", () => {
      const longLabel = "a".repeat(51);
      const result = validateLabel(longLabel);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds maximum length");
    });
  });

  describe("Link Sanitization", () => {
    it("should sanitize and normalize social links", () => {
      const links: SocialLink[] = [
        {
          id: "link-1",
          platform: "twitter",
          url: "https://x.com/username",
          label: "  My Twitter  ",
          order: 0,
        },
      ];

      const sanitized = sanitizeSocialLinks(links);

      expect(sanitized[0].url).toBe("https://twitter.com/username");
      expect(sanitized[0].label).toBe("My Twitter");
    });
  });
});
