/**
 * Profile Customization Validation Utilities
 * Phase 4A: Theme Editor
 * 
 * Provides validation and sanitization for profile theme data
 * to prevent XSS, SQL injection, and ensure data integrity.
 */

import type { ProfileTheme, ColorScheme, Typography, Layout } from '../../types/profile';

/**
 * Safe font families whitelist
 * Only these fonts are allowed to prevent CSS injection
 */
const SAFE_FONTS: Array<Typography['fontFamily']> = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
];

/**
 * Valid font sizes
 */
const VALID_FONT_SIZES: Array<Typography['fontSize']> = ['small', 'medium', 'large'];

/**
 * Valid layout styles
 */
const VALID_LAYOUT_STYLES: Array<Layout['style']> = ['modern', 'classic', 'minimal'];

/**
 * Sanitize hex color value
 * Only allows valid 6-digit hex colors (#RRGGBB)
 * 
 * @param color - Color value to sanitize
 * @returns Sanitized hex color
 * @throws Error if color is invalid
 */
export function sanitizeHexColor(color: string): string {
  // Remove whitespace
  const trimmed = color.trim();
  
  // Validate hex color format (#RRGGBB)
  const hexRegex = /^#[0-9A-Fa-f]{6}$/;
  if (!hexRegex.test(trimmed)) {
    throw new Error(`Invalid hex color: ${color}. Must be in format #RRGGBB`);
  }
  
  // Return uppercase for consistency
  return trimmed.toUpperCase();
}

/**
 * Sanitize font family
 * Only allows whitelisted safe fonts
 * 
 * @param font - Font family to sanitize
 * @returns Sanitized font family (or default if invalid)
 */
export function sanitizeFontFamily(font: string): Typography['fontFamily'] {
  // Check if font is in whitelist
  if (SAFE_FONTS.includes(font as Typography['fontFamily'])) {
    return font as Typography['fontFamily'];
  }
  
  // Return default font if invalid
  console.warn(`Invalid font family: ${font}. Using default: Inter`);
  return 'Inter';
}

/**
 * Validate enum value
 * Ensures value is one of the allowed options
 * 
 * @param value - Value to validate
 * @param allowedValues - Array of allowed values
 * @param fieldName - Field name for error messages
 * @returns Validated value
 * @throws Error if value is invalid
 */
function validateEnum<T extends string>(
  value: string,
  allowedValues: readonly T[],
  fieldName: string
): T {
  if (allowedValues.includes(value as T)) {
    return value as T;
  }
  
  throw new Error(
    `Invalid ${fieldName}: ${value}. Must be one of: ${allowedValues.join(', ')}`
  );
}

/**
 * Sanitize color scheme
 * Validates and sanitizes all color values
 * 
 * @param colorScheme - Color scheme to sanitize
 * @returns Sanitized color scheme
 * @throws Error if any color is invalid
 */
export function sanitizeColorScheme(colorScheme: ColorScheme): ColorScheme {
  return {
    primary: sanitizeHexColor(colorScheme.primary),
    secondary: sanitizeHexColor(colorScheme.secondary),
    background: sanitizeHexColor(colorScheme.background),
    text: sanitizeHexColor(colorScheme.text),
    accent: sanitizeHexColor(colorScheme.accent),
  };
}

/**
 * Sanitize typography settings
 * Validates font family and size
 * 
 * @param typography - Typography settings to sanitize
 * @returns Sanitized typography settings
 */
export function sanitizeTypography(typography: Typography): Typography {
  return {
    fontFamily: sanitizeFontFamily(typography.fontFamily),
    fontSize: validateEnum(typography.fontSize, VALID_FONT_SIZES, 'fontSize'),
  };
}

/**
 * Sanitize layout settings
 * Validates layout style and boolean flags
 * 
 * @param layout - Layout settings to sanitize
 * @returns Sanitized layout settings
 */
export function sanitizeLayout(layout: Layout): Layout {
  return {
    style: validateEnum(layout.style, VALID_LAYOUT_STYLES, 'layout style'),
    showBanner: Boolean(layout.showBanner),
    showSocialLinks: Boolean(layout.showSocialLinks),
  };
}

/**
 * Sanitize profile theme
 * Validates and sanitizes complete theme configuration
 * Prevents XSS, CSS injection, and ensures data integrity
 * 
 * @param theme - Theme to sanitize
 * @returns Sanitized theme
 * @throws Error if theme is invalid
 */
export function sanitizeTheme(theme: ProfileTheme): ProfileTheme {
  // Validate theme structure
  if (!theme || typeof theme !== 'object') {
    throw new Error('Invalid theme: must be an object');
  }
  
  if (!theme.colorScheme || typeof theme.colorScheme !== 'object') {
    throw new Error('Invalid theme: colorScheme is required');
  }
  
  if (!theme.typography || typeof theme.typography !== 'object') {
    throw new Error('Invalid theme: typography is required');
  }
  
  if (!theme.layout || typeof theme.layout !== 'object') {
    throw new Error('Invalid theme: layout is required');
  }
  
  // Sanitize each section
  const sanitized: ProfileTheme = {
    colorScheme: sanitizeColorScheme(theme.colorScheme),
    typography: sanitizeTypography(theme.typography),
    layout: sanitizeLayout(theme.layout),
    version: '1.0', // Always set to current version
  };
  
  return sanitized;
}

/**
 * Validate theme (non-throwing version)
 * Returns validation result with error message if invalid
 * 
 * @param theme - Theme to validate
 * @returns Validation result
 */
export function validateTheme(theme: ProfileTheme): {
  valid: boolean;
  error?: string;
  sanitized?: ProfileTheme;
} {
  try {
    const sanitized = sanitizeTheme(theme);
    return { valid: true, sanitized };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}

/**
 * Check if color is valid hex format (non-throwing)
 * 
 * @param color - Color to check
 * @returns True if valid hex color
 */
export function isValidHexColor(color: string): boolean {
  const hexRegex = /^#[0-9A-Fa-f]{6}$/;
  return hexRegex.test(color.trim());
}

/**
 * Get default theme
 * Returns a safe default theme configuration
 * 
 * @returns Default theme
 */
export function getDefaultTheme(): ProfileTheme {
  return {
    colorScheme: {
      primary: '#8B5CF6',    // Purple (Nostr brand color)
      secondary: '#10B981',  // Green
      background: '#FFFFFF', // White
      text: '#1F2937',       // Dark gray
      accent: '#F59E0B',     // Amber
    },
    typography: {
      fontFamily: 'Inter',
      fontSize: 'medium',
    },
    layout: {
      style: 'modern',
      showBanner: true,
      showSocialLinks: true,
    },
    version: '1.0',
  };
}

