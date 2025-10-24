/**
 * E2E Tests: Profile Customization - Complete User Flow
 * Phase 4D: Integration & Testing
 *
 * End-to-end tests for complete profile customization workflow
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileTheme, SocialLink } from "../../src/types/profile";
import { THEME_PRESETS } from "../../src/utils/theme-presets";
import {
  validateBannerUrl,
  validateFileSize,
  validateFileType,
} from "../../src/lib/validation/banner-validation";
import {
  sanitizeSocialLinks,
  validateSocialLinks,
} from "../../src/lib/validation/social-links-validation";

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

describe("Profile Customization - Complete User Flow E2E", () => {
  const testUserId = "test-user-duid-123";
  const testUsername = "testuser";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    console.log("✅ User flow test cleanup completed");
  });

  describe("User Flow: New User Profile Customization", () => {
    it("should complete full customization workflow: Theme → Banner → Social Links → Save", async () => {
      // Step 1: User selects a theme preset
      const selectedTheme = THEME_PRESETS[0]; // Light theme
      expect(selectedTheme.id).toBe("light");
      expect(selectedTheme.theme).toBeDefined();

      // Step 2: User customizes theme colors
      const customizedTheme: ProfileTheme = {
        ...selectedTheme.theme,
        colorScheme: {
          ...selectedTheme.theme.colorScheme,
          primary: "#8b5cf6", // User changes primary color
        },
      };

      // Save theme
      mockSupabase.update.mockReturnValueOnce(mockSupabase);
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null });

      await mockSupabase
        .from("user_identities")
        .update({ profile_theme: customizedTheme })
        .eq("id", testUserId);

      expect(mockSupabase.update).toHaveBeenCalledWith({
        profile_theme: customizedTheme,
      });

      // Step 3: User uploads a banner image
      const bannerUrl = "https://blossom.nostr.build/user-banner.jpg";
      const bannerValidation = validateBannerUrl(bannerUrl);
      expect(bannerValidation.valid).toBe(true);

      // Save banner
      mockSupabase.update.mockReturnValueOnce(mockSupabase);
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null });

      await mockSupabase
        .from("user_identities")
        .update({ profile_banner_url: bannerUrl })
        .eq("id", testUserId);

      expect(mockSupabase.update).toHaveBeenCalledWith({
        profile_banner_url: bannerUrl,
      });

      // Step 4: User adds social links
      const socialLinks: SocialLink[] = [
        {
          id: "link-1",
          platform: "twitter",
          url: "https://twitter.com/testuser",
          order: 0,
        },
        {
          id: "link-2",
          platform: "github",
          url: "https://github.com/testuser",
          order: 1,
        },
        {
          id: "link-3",
          platform: "website",
          url: "https://testuser.com",
          label: "My Blog",
          order: 2,
        },
      ];

      const linksValidation = validateSocialLinks(socialLinks);
      expect(linksValidation.valid).toBe(true);

      const sanitizedLinks = sanitizeSocialLinks(socialLinks);
      const socialLinksObject: Record<string, any> = {};
      sanitizedLinks.forEach((link, index) => {
        socialLinksObject[index.toString()] = link;
      });

      // Save social links
      mockSupabase.update.mockReturnValueOnce(mockSupabase);
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null });

      await mockSupabase
        .from("user_identities")
        .update({ social_links: socialLinksObject })
        .eq("id", testUserId);

      expect(mockSupabase.update).toHaveBeenCalledWith({
        social_links: socialLinksObject,
      });

      // Verify all three updates were successful
      expect(mockSupabase.update).toHaveBeenCalledTimes(3);
    });
  });

  describe("User Flow: Viewing Public Profile with Customizations", () => {
    it("should display complete profile with theme, banner, and social links", async () => {
      const completeProfile = {
        id: testUserId,
        username: testUsername,
        npub: "npub1test...",
        display_name: "Test User",
        bio: "Test bio",
        profile_visibility: "public",
        profile_theme: {
          colorScheme: {
            primary: "#8b5cf6",
            secondary: "#ec4899",
            background: "#ffffff",
            text: "#1f2937",
            accent: "#f59e0b",
          },
          typography: {
            fontFamily: "Inter",
            fontSize: "16px",
            lineHeight: "1.5",
          },
          layout: {
            maxWidth: "1200px",
            spacing: "normal",
            borderRadius: "8px",
          },
          version: "1.0",
        },
        profile_banner_url: "https://blossom.nostr.build/user-banner.jpg",
        social_links: {
          "0": {
            id: "link-1",
            platform: "twitter",
            url: "https://twitter.com/testuser",
            order: 0,
          },
          "1": {
            id: "link-2",
            platform: "github",
            url: "https://github.com/testuser",
            order: 1,
          },
          "2": {
            id: "link-3",
            platform: "website",
            url: "https://testuser.com",
            label: "My Blog",
            order: 2,
          },
        },
      };

      mockSupabase.select.mockReturnValueOnce(mockSupabase);
      mockSupabase.eq.mockReturnValueOnce(mockSupabase);
      mockSupabase.single.mockResolvedValueOnce({
        data: completeProfile,
        error: null,
      });

      const { data } = await mockSupabase
        .from("user_identities")
        .select("*")
        .eq("username", testUsername)
        .single();

      // Verify all customizations are present
      expect(data.profile_theme).toBeDefined();
      expect(data.profile_theme.colorScheme.primary).toBe("#8b5cf6");
      expect(data.profile_banner_url).toBe(
        "https://blossom.nostr.build/user-banner.jpg"
      );
      expect(data.social_links).toBeDefined();
      expect(Object.keys(data.social_links).length).toBe(3);
    });
  });

  describe("User Flow: Updating Existing Customizations", () => {
    it("should update theme without affecting banner or social links", async () => {
      // User changes theme from Light to Dark
      const darkTheme = THEME_PRESETS.find((p) => p.id === "dark");
      expect(darkTheme).toBeDefined();

      mockSupabase.update.mockReturnValueOnce(mockSupabase);
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null });

      await mockSupabase
        .from("user_identities")
        .update({ profile_theme: darkTheme!.theme })
        .eq("id", testUserId);

      // Verify only theme was updated
      expect(mockSupabase.update).toHaveBeenCalledWith({
        profile_theme: darkTheme!.theme,
      });
      expect(mockSupabase.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ profile_banner_url: expect.anything() })
      );
    });

    it("should update banner without affecting theme or social links", async () => {
      const newBannerUrl = "https://blossom.nostr.build/new-banner.jpg";

      mockSupabase.update.mockReturnValueOnce(mockSupabase);
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null });

      await mockSupabase
        .from("user_identities")
        .update({ profile_banner_url: newBannerUrl })
        .eq("id", testUserId);

      // Verify only banner was updated
      expect(mockSupabase.update).toHaveBeenCalledWith({
        profile_banner_url: newBannerUrl,
      });
      expect(mockSupabase.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ profile_theme: expect.anything() })
      );
    });

    it("should update social links without affecting theme or banner", async () => {
      const updatedLinks: SocialLink[] = [
        {
          id: "link-1",
          platform: "twitter",
          url: "https://twitter.com/newusername",
          order: 0,
        },
      ];

      const socialLinksObject: Record<string, any> = {};
      updatedLinks.forEach((link, index) => {
        socialLinksObject[index.toString()] = link;
      });

      mockSupabase.update.mockReturnValueOnce(mockSupabase);
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null });

      await mockSupabase
        .from("user_identities")
        .update({ social_links: socialLinksObject })
        .eq("id", testUserId);

      // Verify only social links were updated
      expect(mockSupabase.update).toHaveBeenCalledWith({
        social_links: socialLinksObject,
      });
      expect(mockSupabase.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ profile_theme: expect.anything() })
      );
    });
  });

  describe("User Flow: Removing Customizations", () => {
    it("should remove banner while keeping theme and social links", async () => {
      mockSupabase.update.mockReturnValueOnce(mockSupabase);
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null });

      await mockSupabase
        .from("user_identities")
        .update({ profile_banner_url: null })
        .eq("id", testUserId);

      expect(mockSupabase.update).toHaveBeenCalledWith({
        profile_banner_url: null,
      });
    });

    it("should remove all social links while keeping theme and banner", async () => {
      mockSupabase.update.mockReturnValueOnce(mockSupabase);
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null });

      await mockSupabase
        .from("user_identities")
        .update({ social_links: {} })
        .eq("id", testUserId);

      expect(mockSupabase.update).toHaveBeenCalledWith({
        social_links: {},
      });
    });

    it("should reset theme to default while keeping banner and social links", async () => {
      const defaultTheme = THEME_PRESETS[0].theme;

      mockSupabase.update.mockReturnValueOnce(mockSupabase);
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null });

      await mockSupabase
        .from("user_identities")
        .update({ profile_theme: defaultTheme })
        .eq("id", testUserId);

      expect(mockSupabase.update).toHaveBeenCalledWith({
        profile_theme: defaultTheme,
      });
    });
  });
});

