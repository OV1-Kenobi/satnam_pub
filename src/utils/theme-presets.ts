/**
 * Theme Presets
 * Phase 4A: Theme Editor
 *
 * Pre-defined theme configurations for quick profile customization
 */

import type { ProfileTheme, ThemePreset } from "../types/profile";

/**
 * Light Theme
 * Clean, bright theme with purple accents
 */
const LIGHT_THEME: ProfileTheme = {
  colorScheme: {
    primary: "#8B5CF6", // Purple
    secondary: "#10B981", // Green
    background: "#FFFFFF", // White
    text: "#1F2937", // Dark gray
    accent: "#F59E0B", // Amber
  },
  typography: {
    fontFamily: "Inter",
    fontSize: "medium",
  },
  layout: {
    style: "modern",
    showBanner: true,
    showSocialLinks: true,
  },
  version: "1.0",
};

/**
 * Dark Theme
 * Dark mode theme with vibrant accents
 */
const DARK_THEME: ProfileTheme = {
  colorScheme: {
    primary: "#A78BFA", // Light purple
    secondary: "#34D399", // Light green
    background: "#111827", // Very dark gray
    text: "#F9FAFB", // Off-white
    accent: "#FBBF24", // Light amber
  },
  typography: {
    fontFamily: "Inter",
    fontSize: "medium",
  },
  layout: {
    style: "modern",
    showBanner: true,
    showSocialLinks: true,
  },
  version: "1.0",
};

/**
 * Nostr Purple Theme
 * Nostr-branded theme with purple emphasis
 */
const NOSTR_PURPLE_THEME: ProfileTheme = {
  colorScheme: {
    primary: "#7C3AED", // Deep purple
    secondary: "#EC4899", // Pink
    background: "#FAF5FF", // Very light purple
    text: "#581C87", // Dark purple
    accent: "#C026D3", // Magenta
  },
  typography: {
    fontFamily: "Montserrat",
    fontSize: "medium",
  },
  layout: {
    style: "modern",
    showBanner: true,
    showSocialLinks: true,
  },
  version: "1.0",
};

/**
 * Bitcoin Orange Theme
 * Bitcoin-branded theme with orange emphasis
 */
const BITCOIN_ORANGE_THEME: ProfileTheme = {
  colorScheme: {
    primary: "#F97316", // Orange
    secondary: "#FBBF24", // Amber
    background: "#FFFBEB", // Very light yellow
    text: "#78350F", // Dark brown
    accent: "#EF4444", // Red
  },
  typography: {
    fontFamily: "Roboto",
    fontSize: "medium",
  },
  layout: {
    style: "classic",
    showBanner: true,
    showSocialLinks: true,
  },
  version: "1.0",
};

/**
 * Theme Presets Array
 * All available preset themes with metadata
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "light",
    name: "Light",
    description: "Clean, bright theme with purple accents",
    theme: LIGHT_THEME,
  },
  {
    id: "dark",
    name: "Dark",
    description: "Dark mode theme with vibrant accents",
    theme: DARK_THEME,
  },
  {
    id: "nostr-purple",
    name: "Nostr Purple",
    description: "Nostr-branded theme with purple emphasis",
    theme: NOSTR_PURPLE_THEME,
  },
  {
    id: "bitcoin-orange",
    name: "Bitcoin Orange",
    description: "Bitcoin-branded theme with orange emphasis",
    theme: BITCOIN_ORANGE_THEME,
  },
];

/**
 * Get preset theme by ID
 *
 * @param id - Preset theme ID
 * @returns Theme preset or undefined if not found
 */
export function getPresetById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((preset) => preset.id === id);
}

/**
 * Get default theme
 * Returns the Light theme as default
 * Deep copy to prevent mutation
 *
 * @returns Default theme
 */
export function getDefaultTheme(): ProfileTheme {
  return {
    colorScheme: { ...LIGHT_THEME.colorScheme },
    typography: { ...LIGHT_THEME.typography },
    layout: { ...LIGHT_THEME.layout },
    version: LIGHT_THEME.version,
  };
}

/**
 * Check if theme matches a preset
 * Compares theme configuration to all presets
 *
 * @param theme - Theme to check
 * @returns Preset ID if match found, null otherwise
 */
export function getMatchingPresetId(theme: ProfileTheme): string | null {
  for (const preset of THEME_PRESETS) {
    if (isThemeEqual(theme, preset.theme)) {
      return preset.id;
    }
  }
  return null;
}

/**
 * Compare two themes for equality
 * Deep comparison of all theme properties
 *
 * @param theme1 - First theme
 * @param theme2 - Second theme
 * @returns True if themes are equal
 */
function isThemeEqual(theme1: ProfileTheme, theme2: ProfileTheme): boolean {
  return (
    theme1.colorScheme.primary === theme2.colorScheme.primary &&
    theme1.colorScheme.secondary === theme2.colorScheme.secondary &&
    theme1.colorScheme.background === theme2.colorScheme.background &&
    theme1.colorScheme.text === theme2.colorScheme.text &&
    theme1.colorScheme.accent === theme2.colorScheme.accent &&
    theme1.typography.fontFamily === theme2.typography.fontFamily &&
    theme1.typography.fontSize === theme2.typography.fontSize &&
    theme1.layout.style === theme2.layout.style &&
    theme1.layout.showBanner === theme2.layout.showBanner &&
    theme1.layout.showSocialLinks === theme2.layout.showSocialLinks
  );
}
