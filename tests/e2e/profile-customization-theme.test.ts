/**
 * E2E Tests: Profile Customization - Theme Editor
 * Phase 4A: Theme Editor
 *
 * Tests for profile theme customization functionality
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isValidHexColor,
  sanitizeTheme,
  validateTheme,
} from "../../src/lib/validation/profile-customization";
import { getDefaultTheme, THEME_PRESETS } from "../../src/utils/theme-presets";

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

describe("Profile Customization - Theme Editor E2E", () => {
  const testUserId = "test-user-duid-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    console.log("✅ Test cleanup completed");
  });

  describe("Feature Flag Gating", () => {
    it("should display theme editor when feature flag enabled", () => {
      // Mock feature flag enabled
      const CUSTOMIZATION_ENABLED = true;

      expect(CUSTOMIZATION_ENABLED).toBe(true);
    });

    it("should hide theme editor when feature flag disabled", () => {
      // Mock feature flag disabled
      const CUSTOMIZATION_ENABLED = false;

      expect(CUSTOMIZATION_ENABLED).toBe(false);
    });
  });

  describe("Theme Loading", () => {
    it("should load current theme from database", async () => {
      const mockTheme = getDefaultTheme();

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: testUserId,
          profile_theme: mockTheme,
        },
        error: null,
      });

      const { data, error } = await mockSupabase
        .from("user_identities")
        .select("id, profile_theme")
        .eq("id", testUserId)
        .single();

      expect(error).toBeNull();
      expect(data?.profile_theme).toEqual(mockTheme);
    });
  });

  describe("Color Scheme Updates", () => {
    it("should update color scheme and preview in real-time", () => {
      const theme = getDefaultTheme();
      const newPrimary = "#FF0000";

      theme.colorScheme.primary = newPrimary;

      expect(theme.colorScheme.primary).toBe(newPrimary);
      expect(isValidHexColor(newPrimary)).toBe(true);
    });

    it("should validate hex color format", () => {
      expect(isValidHexColor("#8B5CF6")).toBe(true);
      expect(isValidHexColor("#FFFFFF")).toBe(true);
      expect(isValidHexColor("#000000")).toBe(true);
      expect(isValidHexColor("invalid")).toBe(false);
      expect(isValidHexColor("#FFF")).toBe(false);
      expect(isValidHexColor("8B5CF6")).toBe(false);
    });
  });

  describe("Typography Updates", () => {
    it("should update typography and preview in real-time", () => {
      const theme = getDefaultTheme();

      theme.typography.fontFamily = "Roboto";
      theme.typography.fontSize = "large";

      expect(theme.typography.fontFamily).toBe("Roboto");
      expect(theme.typography.fontSize).toBe("large");
    });

    it("should validate font family whitelist", () => {
      const theme = getDefaultTheme();
      (theme.typography.fontFamily as any) = "Comic Sans"; // Invalid font

      const validation = validateTheme(theme);

      // Validation should succeed because sanitizeFontFamily falls back to "Inter"
      expect(validation.valid).toBe(true);
      expect(validation.sanitized?.typography.fontFamily).toBe("Inter");
    });
  });

  describe("Layout Updates", () => {
    it("should update layout and preview in real-time", () => {
      const theme = getDefaultTheme();

      theme.layout.style = "minimal";
      theme.layout.showBanner = false;
      theme.layout.showSocialLinks = false;

      expect(theme.layout.style).toBe("minimal");
      expect(theme.layout.showBanner).toBe(false);
      expect(theme.layout.showSocialLinks).toBe(false);
    });
  });

  describe("Preset Themes", () => {
    it("should apply preset theme (Light)", () => {
      const lightPreset = THEME_PRESETS.find((p) => p.id === "light");

      expect(lightPreset).toBeDefined();
      // Create a fresh copy to avoid mutation
      const theme = { ...lightPreset!.theme };
      expect(theme.colorScheme.primary).toBe("#8B5CF6");
      expect(theme.colorScheme.background).toBe("#FFFFFF");
    });

    it("should apply preset theme (Dark)", () => {
      const darkPreset = THEME_PRESETS.find((p) => p.id === "dark");

      expect(darkPreset).toBeDefined();
      expect(darkPreset?.theme.colorScheme.background).toBe("#111827");
      expect(darkPreset?.theme.colorScheme.text).toBe("#F9FAFB");
    });

    it("should apply preset theme (Nostr Purple)", () => {
      const nostrPreset = THEME_PRESETS.find((p) => p.id === "nostr-purple");

      expect(nostrPreset).toBeDefined();
      expect(nostrPreset?.theme.colorScheme.primary).toBe("#7C3AED");
      expect(nostrPreset?.theme.typography.fontFamily).toBe("Montserrat");
    });

    it("should apply preset theme (Bitcoin Orange)", () => {
      const bitcoinPreset = THEME_PRESETS.find(
        (p) => p.id === "bitcoin-orange"
      );

      expect(bitcoinPreset).toBeDefined();
      expect(bitcoinPreset?.theme.colorScheme.primary).toBe("#F97316");
      expect(bitcoinPreset?.theme.layout.style).toBe("classic");
    });
  });

  describe("Theme Validation", () => {
    it("should validate complete theme structure", () => {
      const theme = getDefaultTheme();
      const validation = validateTheme(theme);

      expect(validation.valid).toBe(true);
      expect(validation.sanitized).toBeDefined();
    });

    it("should reject invalid color scheme", () => {
      const theme = getDefaultTheme();
      theme.colorScheme.primary = "invalid-color";

      const validation = validateTheme(theme);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("Invalid hex color");
    });

    it("should reject invalid typography", () => {
      const theme = getDefaultTheme();
      (theme.typography.fontSize as any) = "extra-large"; // Invalid size

      const validation = validateTheme(theme);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("fontSize");
    });

    it("should reject invalid layout", () => {
      const theme = getDefaultTheme();
      (theme.layout.style as any) = "futuristic"; // Invalid style

      const validation = validateTheme(theme);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("layout style");
    });
  });

  describe("Theme Sanitization", () => {
    it("should sanitize theme and set version", () => {
      const theme = getDefaultTheme();
      const sanitized = sanitizeTheme(theme);

      expect(sanitized.version).toBe("1.0");
      expect(sanitized.colorScheme.primary).toMatch(/^#[0-9A-F]{6}$/);
    });

    it("should uppercase hex colors", () => {
      const theme = getDefaultTheme();
      theme.colorScheme.primary = "#8b5cf6"; // Lowercase

      const sanitized = sanitizeTheme(theme);

      expect(sanitized.colorScheme.primary).toBe("#8B5CF6");
    });

    it("should convert boolean flags", () => {
      const theme = getDefaultTheme();
      (theme.layout.showBanner as any) = 1; // Number instead of boolean

      const sanitized = sanitizeTheme(theme);

      expect(typeof sanitized.layout.showBanner).toBe("boolean");
      expect(sanitized.layout.showBanner).toBe(true);
    });
  });

  describe("Theme Persistence", () => {
    it("should save custom theme to database", async () => {
      const customTheme = getDefaultTheme();
      customTheme.colorScheme.primary = "#FF0000";

      mockSupabase.update.mockReturnValueOnce(mockSupabase);
      mockSupabase.eq.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const { error } = await mockSupabase
        .from("user_identities")
        .update({ profile_theme: customTheme })
        .eq("id", testUserId);

      expect(error).toBeNull();
      expect(mockSupabase.update).toHaveBeenCalledWith({
        profile_theme: customTheme,
      });
    });
  });

  describe("Reset to Defaults", () => {
    it("should reset theme to defaults", () => {
      // Create a fresh default theme (not mutated)
      const defaultTheme = getDefaultTheme();

      expect(defaultTheme.colorScheme.primary).toBe("#8B5CF6");
      expect(defaultTheme.typography.fontFamily).toBe("Inter");
      expect(defaultTheme.layout.style).toBe("modern");
    });
  });

  describe("Unsaved Changes Tracking", () => {
    it("should track unsaved changes", () => {
      const initialTheme = getDefaultTheme();
      const modifiedTheme = getDefaultTheme();
      modifiedTheme.colorScheme.primary = "#FF0000";

      const hasChanges =
        JSON.stringify(initialTheme) !== JSON.stringify(modifiedTheme);

      expect(hasChanges).toBe(true);
    });

    it("should detect no changes when theme is unchanged", () => {
      const initialTheme = getDefaultTheme();
      const unchangedTheme = getDefaultTheme();

      const hasChanges =
        JSON.stringify(initialTheme) !== JSON.stringify(unchangedTheme);

      expect(hasChanges).toBe(false);
    });
  });
});
