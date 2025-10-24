/**
 * Banner Validation Utilities
 * Phase 4B: Banner Management
 * Phase 5A: Dynamic Domain Validation
 *
 * Validates banner images for upload:
 * - File type (JPEG, PNG, WebP only)
 * - File size (max 5MB before processing)
 * - Image dimensions (min 1200x300, max 4000x1000)
 * - Aspect ratio (recommended 4:1)
 * - Dynamic domain validation from environment (Phase 5A)
 */

import type { BannerValidationResult } from "../../types/profile";

// Constants
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const TARGET_FILE_SIZE = 1 * 1024 * 1024; // 1MB (target after compression)
const MIN_WIDTH = 1200;
const MIN_HEIGHT = 300;
const MAX_WIDTH = 4000;
const MAX_HEIGHT = 1000;
const RECOMMENDED_ASPECT_RATIO = 4; // 4:1 (width:height)
const ASPECT_RATIO_TOLERANCE = 0.2; // Allow ±20% deviation

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/**
 * Validate file type
 * Only JPEG, PNG, and WebP are allowed
 */
export function validateFileType(file: File): BannerValidationResult {
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type: ${file.type}. Only JPEG, PNG, and WebP are allowed.`,
    };
  }

  // Check file extension (additional security check)
  const fileName = file.name.toLowerCase();
  const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) =>
    fileName.endsWith(ext)
  );

  if (!hasValidExtension) {
    return {
      valid: false,
      error: `Invalid file extension. Only ${ALLOWED_EXTENSIONS.join(
        ", "
      )} are allowed.`,
    };
  }

  return { valid: true };
}

/**
 * Validate file size
 * Max 5MB before processing
 */
export function validateFileSize(file: File): BannerValidationResult {
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${sizeMB}MB) exceeds maximum allowed size of 5MB.`,
    };
  }

  const warnings: string[] = [];

  // Warn if file is large (but still under limit)
  if (file.size > TARGET_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    warnings.push(
      `File size (${sizeMB}MB) is large. Consider compressing before upload for better performance.`
    );
  }

  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Validate image dimensions
 * Min 1200x300, Max 4000x1000
 * Returns a promise because we need to load the image to check dimensions
 */
export function validateImageDimensions(
  file: File
): Promise<BannerValidationResult> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const { width, height } = img;
      const warnings: string[] = [];

      // Check minimum dimensions
      if (width < MIN_WIDTH || height < MIN_HEIGHT) {
        resolve({
          valid: false,
          error: `Image dimensions (${width}x${height}) are too small. Minimum required: ${MIN_WIDTH}x${MIN_HEIGHT}.`,
        });
        return;
      }

      // Check maximum dimensions
      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        resolve({
          valid: false,
          error: `Image dimensions (${width}x${height}) are too large. Maximum allowed: ${MAX_WIDTH}x${MAX_HEIGHT}.`,
        });
        return;
      }

      // Check aspect ratio (recommended 4:1)
      const aspectRatio = width / height;
      const deviation = Math.abs(aspectRatio - RECOMMENDED_ASPECT_RATIO);

      if (deviation > ASPECT_RATIO_TOLERANCE * RECOMMENDED_ASPECT_RATIO) {
        warnings.push(
          `Image aspect ratio (${aspectRatio.toFixed(
            2
          )}:1) differs from recommended 4:1. Consider cropping for optimal display.`
        );
      }

      resolve({
        valid: true,
        warnings: warnings.length > 0 ? warnings : undefined,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        valid: false,
        error: "Failed to load image. File may be corrupted.",
      });
    };

    img.src = objectUrl;
  });
}

/**
 * Validate banner file (comprehensive validation)
 * Checks file type, size, and dimensions
 */
export async function validateBannerFile(
  file: File
): Promise<BannerValidationResult> {
  // Step 1: Validate file type
  const typeValidation = validateFileType(file);
  if (!typeValidation.valid) {
    return typeValidation;
  }

  // Step 2: Validate file size
  const sizeValidation = validateFileSize(file);
  if (!sizeValidation.valid) {
    return sizeValidation;
  }

  // Step 3: Validate image dimensions
  const dimensionsValidation = await validateImageDimensions(file);
  if (!dimensionsValidation.valid) {
    return dimensionsValidation;
  }

  // Combine warnings from all validations
  const allWarnings = [
    ...(sizeValidation.warnings || []),
    ...(dimensionsValidation.warnings || []),
  ];

  return {
    valid: true,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  };
}

/**
 * Get approved Blossom domains from environment configuration (Phase 5A)
 * Dynamically extracts domains from configured Blossom server URLs
 */
function getApprovedBlossomDomains(): string[] {
  const domains: string[] = [];

  try {
    // Extract domain from primary URL
    if (clientConfig.blossom.primaryUrl) {
      const primaryUrl = new URL(clientConfig.blossom.primaryUrl);
      domains.push(primaryUrl.hostname);
    }

    // Extract domain from fallback URL
    if (clientConfig.blossom.fallbackUrl) {
      const fallbackUrl = new URL(clientConfig.blossom.fallbackUrl);
      domains.push(fallbackUrl.hostname);
    }

    // Add common Blossom CDN subdomains
    const baseDomains = [...new Set(domains)]; // Remove duplicates
    baseDomains.forEach((domain) => {
      // Add common CDN subdomains for each base domain
      domains.push(`cdn.${domain}`);
      domains.push(`i.${domain}`);
    });
  } catch (error) {
    console.warn("Failed to parse Blossom server URLs:", error);
  }

  // Remove duplicates and return
  return [...new Set(domains)];
}

/**
 * Validate banner URL (Phase 5A: Dynamic domain validation)
 * Server-side validation for banner URLs
 * Ensures HTTPS and approved domains only
 */
export function validateBannerUrl(url: string): BannerValidationResult {
  // Check if URL is a data URL (base64)
  if (url.startsWith("data:image/")) {
    // Validate data URL format
    const dataUrlRegex = /^data:image\/(jpeg|png|webp);base64,/;
    if (!dataUrlRegex.test(url)) {
      return {
        valid: false,
        error: "Invalid data URL format. Must be JPEG, PNG, or WebP.",
      };
    }

    // Estimate size (base64 is ~33% larger than binary)
    const base64Data = url.split(",")[1];
    const estimatedSize = (base64Data.length * 3) / 4;

    if (estimatedSize > 500 * 1024) {
      // 500KB limit for data URLs
      return {
        valid: false,
        error: "Data URL too large (>500KB). Please upload to Blossom instead.",
      };
    }

    return {
      valid: true,
      warnings: [
        "Using data URL for banner. Consider uploading to Blossom for better performance.",
      ],
    };
  }

  // Check if URL is HTTPS
  if (!url.startsWith("https://")) {
    return {
      valid: false,
      error: "Banner URL must use HTTPS protocol.",
    };
  }

  // Get approved domains dynamically from environment (Phase 5A)
  const approvedDomains = getApprovedBlossomDomains();

  // Fallback to hardcoded domains if environment not configured
  if (approvedDomains.length === 0) {
    approvedDomains.push(
      "blossom.nostr.build",
      "nostr.build",
      "cdn.nostr.build",
      "i.nostr.build"
    );
  }

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    const isApproved = approvedDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isApproved) {
      return {
        valid: false,
        error: `Banner URL domain (${hostname}) is not approved. Only Blossom servers are allowed.`,
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: "Invalid URL format.",
    };
  }
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Check if file size is suitable for data URL fallback
 */
export function canUseDataUrlFallback(file: File): boolean {
  return file.size <= 500 * 1024; // 500KB limit
}
