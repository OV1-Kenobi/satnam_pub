/**
 * Social Links Validation Utilities
 * Phase 4C: Social Links Editor
 *
 * Platform-specific URL validation, sanitization, and XSS prevention
 */

import type {
  SocialLink,
  SocialLinkPlatform,
  SocialLinkValidationResult,
} from "../../types/profile";

// ============================================================================
// Constants
// ============================================================================

export const MAX_SOCIAL_LINKS = 10;
export const MAX_URL_LENGTH = 500;
export const MAX_LABEL_LENGTH = 50;

/**
 * Platform-specific URL patterns
 */
const PLATFORM_PATTERNS: Record<
  SocialLinkPlatform,
  { pattern: RegExp; example: string }
> = {
  twitter: {
    pattern: /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9_]{1,15}\/?$/,
    example: "https://twitter.com/username or https://x.com/username",
  },
  github: {
    pattern: /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]{1,39}\/?$/,
    example: "https://github.com/username",
  },
  telegram: {
    pattern: /^https?:\/\/(www\.)?(t\.me|telegram\.me)\/[a-zA-Z0-9_]{5,32}\/?$/,
    example: "https://t.me/username",
  },
  nostr: {
    pattern: /^(npub1[a-z0-9]{58,59}|nprofile1[a-z0-9]+)$/,
    example: "npub1... or nprofile1...",
  },
  lightning: {
    pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    example: "username@domain.com",
  },
  website: {
    pattern: /^https:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/[^\s]*)?$/,
    example: "https://example.com",
  },
  youtube: {
    pattern:
      /^https?:\/\/(www\.)?(youtube\.com\/(c\/|channel\/|user\/|@)?[a-zA-Z0-9_-]+|youtu\.be\/[a-zA-Z0-9_-]+)\/?$/,
    example: "https://youtube.com/@username or https://youtube.com/c/channel",
  },
  linkedin: {
    pattern:
      /^https?:\/\/(www\.)?linkedin\.com\/(in|company)\/[a-zA-Z0-9_-]{3,100}\/?$/,
    example: "https://linkedin.com/in/username",
  },
  instagram: {
    pattern:
      /^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9_.]{1,30}\/?$/,
    example: "https://instagram.com/username",
  },
  facebook: {
    pattern:
      /^https?:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9.]{5,50}\/?$/,
    example: "https://facebook.com/username",
  },
};

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate platform-specific URL format
 */
export function validatePlatformUrl(
  platform: SocialLinkPlatform,
  url: string
): SocialLinkValidationResult {
  if (!url || url.trim().length === 0) {
    return {
      valid: false,
      error: "URL cannot be empty",
    };
  }

  if (url.length > MAX_URL_LENGTH) {
    return {
      valid: false,
      error: `URL exceeds maximum length of ${MAX_URL_LENGTH} characters`,
    };
  }

  const platformConfig = PLATFORM_PATTERNS[platform];
  if (!platformConfig) {
    return {
      valid: false,
      error: `Unsupported platform: ${platform}`,
    };
  }

  const trimmedUrl = url.trim();

  // Check if URL matches platform pattern
  if (!platformConfig.pattern.test(trimmedUrl)) {
    return {
      valid: false,
      error: `Invalid ${platform} URL format. Example: ${platformConfig.example}`,
    };
  }

  // Normalize URL
  const normalizedUrl = normalizeUrl(platform, trimmedUrl);

  return {
    valid: true,
    normalizedUrl,
  };
}

/**
 * Normalize URL for consistent storage
 */
function normalizeUrl(platform: SocialLinkPlatform, url: string): string {
  let normalized = url.trim();

  // Remove trailing slash
  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  // Platform-specific normalization
  switch (platform) {
    case "twitter":
      // Normalize x.com to twitter.com for consistency
      normalized = normalized.replace("x.com", "twitter.com");
      // Ensure https://
      if (normalized.startsWith("http://")) {
        normalized = normalized.replace("http://", "https://");
      }
      break;

    case "website":
      // Ensure https:// (already validated)
      break;

    case "nostr":
      // Nostr npub/nprofile - no normalization needed
      break;

    case "lightning":
      // Lightning address - lowercase for consistency
      normalized = normalized.toLowerCase();
      break;

    default:
      // Ensure https:// for all other platforms
      if (normalized.startsWith("http://")) {
        normalized = normalized.replace("http://", "https://");
      }
      break;
  }

  return normalized;
}

/**
 * Validate label (optional custom label)
 */
export function validateLabel(label?: string): SocialLinkValidationResult {
  if (!label) {
    return { valid: true }; // Label is optional
  }

  const trimmedLabel = label.trim();

  if (trimmedLabel.length === 0) {
    return { valid: true }; // Empty label is OK
  }

  if (trimmedLabel.length > MAX_LABEL_LENGTH) {
    return {
      valid: false,
      error: `Label exceeds maximum length of ${MAX_LABEL_LENGTH} characters`,
    };
  }

  // XSS prevention: disallow HTML tags and script content
  if (/<[^>]*>/.test(trimmedLabel) || /javascript:/i.test(trimmedLabel)) {
    return {
      valid: false,
      error: "Label contains invalid characters (HTML/script tags not allowed)",
    };
  }

  return {
    valid: true,
    normalizedUrl: trimmedLabel,
  };
}

/**
 * Validate a single social link
 */
export function validateSocialLink(
  link: SocialLink
): SocialLinkValidationResult {
  // Validate platform
  if (!link.platform) {
    return {
      valid: false,
      error: "Platform is required",
    };
  }

  // Validate URL
  const urlValidation = validatePlatformUrl(link.platform, link.url);
  if (!urlValidation.valid) {
    return urlValidation;
  }

  // Validate label (optional)
  if (link.label) {
    const labelValidation = validateLabel(link.label);
    if (!labelValidation.valid) {
      return labelValidation;
    }
  }

  // Validate order
  if (typeof link.order !== "number" || link.order < 0) {
    return {
      valid: false,
      error: "Order must be a non-negative number",
    };
  }

  return {
    valid: true,
    normalizedUrl: urlValidation.normalizedUrl,
  };
}

/**
 * Validate array of social links
 */
export function validateSocialLinks(
  links: SocialLink[]
): SocialLinkValidationResult {
  if (!Array.isArray(links)) {
    return {
      valid: false,
      error: "Links must be an array",
    };
  }

  if (links.length > MAX_SOCIAL_LINKS) {
    return {
      valid: false,
      error: `Maximum ${MAX_SOCIAL_LINKS} social links allowed`,
    };
  }

  // Validate each link
  for (let i = 0; i < links.length; i++) {
    const linkValidation = validateSocialLink(links[i]);
    if (!linkValidation.valid) {
      return {
        valid: false,
        error: `Link ${i + 1}: ${linkValidation.error}`,
      };
    }
  }

  // Check for duplicate IDs
  const ids = links.map((link) => link.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    return {
      valid: false,
      error: "Duplicate link IDs detected",
    };
  }

  return {
    valid: true,
  };
}

/**
 * Sanitize social links for storage
 * Returns normalized links ready for database storage
 */
export function sanitizeSocialLinks(links: SocialLink[]): SocialLink[] {
  return links.map((link) => {
    const urlValidation = validatePlatformUrl(link.platform, link.url);
    return {
      ...link,
      url: urlValidation.normalizedUrl || link.url,
      label: link.label?.trim() || undefined,
    };
  });
}

