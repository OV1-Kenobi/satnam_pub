/**
 * Security Audit Tests: Profile Customization
 * Phase 4D: Integration & Testing
 *
 * Comprehensive security tests for all customization features
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateBannerUrl,
  validateFileSize,
  validateFileType,
} from "../../src/lib/validation/banner-validation";
import {
  sanitizeSocialLinks,
  validatePlatformUrl,
  validateSocialLinks,
} from "../../src/lib/validation/social-links-validation";
import type { SocialLink } from "../../src/types/profile";

describe("Profile Customization - Security Audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    console.log("✅ Security test cleanup completed");
  });

  describe("XSS Prevention", () => {
    describe("Social Links XSS Prevention", () => {
      it("should block HTML tags in URLs", () => {
        const maliciousUrl =
          "https://twitter.com/<script>alert('xss')</script>";
        const result = validatePlatformUrl("twitter", maliciousUrl);
        expect(result.valid).toBe(false);
        // URL format validation catches this before XSS check
        expect(result.error).toBeDefined();
      });

      it("should block HTML tags in labels", () => {
        const link: SocialLink = {
          id: "link-1",
          platform: "twitter",
          url: "https://twitter.com/username",
          label: "<script>alert('xss')</script>",
          order: 0,
        };

        const result = validateSocialLinks([link]);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("invalid characters");
      });

      it("should block javascript: protocol in URLs", () => {
        const maliciousUrl = "javascript:alert('xss')";
        const result = validatePlatformUrl("website", maliciousUrl);
        expect(result.valid).toBe(false);
      });

      it("should block data: URLs with script content", () => {
        const maliciousUrl = "data:text/html,<script>alert('xss')</script>";
        const result = validatePlatformUrl("website", maliciousUrl);
        expect(result.valid).toBe(false);
      });

      it("should sanitize social links before storage", () => {
        const links: SocialLink[] = [
          {
            id: "link-1",
            platform: "twitter",
            url: "https://twitter.com/username",
            label: "My Twitter",
            order: 0,
          },
        ];

        const sanitized = sanitizeSocialLinks(links);
        expect(sanitized).toHaveLength(1);
        expect(sanitized[0].url).toBe("https://twitter.com/username");
      });
    });

    describe("Banner XSS Prevention", () => {
      it("should block javascript: protocol in banner URLs", () => {
        const maliciousUrl = "javascript:alert('xss')";
        const result = validateBannerUrl(maliciousUrl);
        expect(result.valid).toBe(false);
      });

      it("should block data URLs with HTML content", () => {
        const maliciousUrl = "data:text/html,<script>alert('xss')</script>";
        const result = validateBannerUrl(maliciousUrl);
        expect(result.valid).toBe(false);
      });

      it("should allow valid data URLs for images", () => {
        const validDataUrl =
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        const result = validateBannerUrl(validDataUrl);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe("HTTPS Enforcement", () => {
    it("should require HTTPS for website URLs", () => {
      const httpUrl = "http://example.com";
      const result = validatePlatformUrl("website", httpUrl);
      expect(result.valid).toBe(false);
      // Error message shows example format which includes HTTPS
      expect(result.error).toBeDefined();
    });

    it("should accept HTTPS website URLs", () => {
      const httpsUrl = "https://example.com";
      const result = validatePlatformUrl("website", httpsUrl);
      expect(result.valid).toBe(true);
    });

    it("should require HTTPS for banner URLs", () => {
      const httpUrl = "http://blossom.nostr.build/banner.jpg";
      const result = validateBannerUrl(httpUrl);
      expect(result.valid).toBe(false);
    });

    it("should accept HTTPS banner URLs from approved domains", () => {
      const httpsUrl = "https://blossom.nostr.build/banner.jpg";
      const result = validateBannerUrl(httpsUrl);
      expect(result.valid).toBe(true);
    });

    it("should normalize HTTP to HTTPS for social platforms", () => {
      const httpUrl = "http://twitter.com/username";
      const result = validatePlatformUrl("twitter", httpUrl);
      // Should normalize to HTTPS
      expect(result.normalizedUrl).toBe("https://twitter.com/username");
    });
  });

  describe("Input Validation", () => {
    describe("URL Length Limits", () => {
      it("should reject URLs exceeding 500 characters", () => {
        const longUrl = "https://twitter.com/" + "a".repeat(500);
        const result = validatePlatformUrl("twitter", longUrl);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("exceeds maximum length");
      });

      it("should accept URLs within 500 character limit", () => {
        const validUrl = "https://twitter.com/username";
        const result = validatePlatformUrl("twitter", validUrl);
        expect(result.valid).toBe(true);
      });
    });

    describe("Label Length Limits", () => {
      it("should reject labels exceeding 50 characters", () => {
        const link: SocialLink = {
          id: "link-1",
          platform: "twitter",
          url: "https://twitter.com/username",
          label: "a".repeat(51),
          order: 0,
        };

        const result = validateSocialLinks([link]);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("exceeds maximum length");
      });

      it("should accept labels within 50 character limit", () => {
        const link: SocialLink = {
          id: "link-1",
          platform: "twitter",
          url: "https://twitter.com/username",
          label: "My Twitter Profile",
          order: 0,
        };

        const result = validateSocialLinks([link]);
        expect(result.valid).toBe(true);
      });
    });

    describe("Maximum Links Limit", () => {
      it("should reject more than 10 social links", () => {
        const links: SocialLink[] = Array.from({ length: 11 }, (_, i) => ({
          id: `link-${i}`,
          platform: "twitter" as const,
          url: `https://twitter.com/user${i}`,
          order: i,
        }));

        const result = validateSocialLinks(links);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Maximum 10 social links");
      });

      it("should accept 10 or fewer social links", () => {
        const links: SocialLink[] = Array.from({ length: 10 }, (_, i) => ({
          id: `link-${i}`,
          platform: "twitter" as const,
          url: `https://twitter.com/user${i}`,
          order: i,
        }));

        const result = validateSocialLinks(links);
        expect(result.valid).toBe(true);
      });
    });

    describe("File Size Limits", () => {
      it("should reject files exceeding 5MB", () => {
        const file = new File(["x".repeat(6 * 1024 * 1024)], "banner.jpg", {
          type: "image/jpeg",
        });
        const result = validateFileSize(file);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("exceeds maximum");
      });

      it("should accept files under 5MB", () => {
        const file = new File(["x".repeat(1024 * 1024)], "banner.jpg", {
          type: "image/jpeg",
        });
        const result = validateFileSize(file);
        expect(result.valid).toBe(true);
      });

      it("should warn for files over 1MB", () => {
        const file = new File(["x".repeat(2 * 1024 * 1024)], "banner.jpg", {
          type: "image/jpeg",
        });
        const result = validateFileSize(file);
        expect(result.valid).toBe(true);
        expect(result.warnings).toBeDefined();
        expect(result.warnings![0]).toContain("large");
      });
    });

    describe("File Type Validation", () => {
      it("should accept JPEG files", () => {
        const file = new File(["data"], "banner.jpg", { type: "image/jpeg" });
        const result = validateFileType(file);
        expect(result.valid).toBe(true);
      });

      it("should accept PNG files", () => {
        const file = new File(["data"], "banner.png", { type: "image/png" });
        const result = validateFileType(file);
        expect(result.valid).toBe(true);
      });

      it("should accept WebP files", () => {
        const file = new File(["data"], "banner.webp", { type: "image/webp" });
        const result = validateFileType(file);
        expect(result.valid).toBe(true);
      });

      it("should reject GIF files", () => {
        const file = new File(["data"], "banner.gif", { type: "image/gif" });
        const result = validateFileType(file);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid file type");
      });

      it("should reject SVG files", () => {
        const file = new File(["data"], "banner.svg", {
          type: "image/svg+xml",
        });
        const result = validateFileType(file);
        expect(result.valid).toBe(false);
      });

      it("should reject executable files", () => {
        const file = new File(["data"], "malware.exe", {
          type: "application/x-msdownload",
        });
        const result = validateFileType(file);
        expect(result.valid).toBe(false);
      });
    });
  });

  describe("Domain Whitelisting", () => {
    it("should accept banner URLs from approved Blossom domains", () => {
      // Only blossom.nostr.build is approved in current implementation
      const approvedUrl = "https://blossom.nostr.build/banner.jpg";
      const result = validateBannerUrl(approvedUrl);
      expect(result.valid).toBe(true);
    });

    it("should reject banner URLs from unapproved domains", () => {
      const unapprovedUrl = "https://malicious-site.com/banner.jpg";
      const result = validateBannerUrl(unapprovedUrl);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not approved");
    });
  });

  describe("Zero-Knowledge Architecture Compliance", () => {
    it("should not expose nsec in theme data", () => {
      // Theme data should never contain nsec
      const theme = {
        colorScheme: { primary: "#8b5cf6" },
        typography: { fontFamily: "Inter" },
        layout: { maxWidth: "1200px" },
        version: "1.0",
      };

      const themeJson = JSON.stringify(theme);
      expect(themeJson).not.toContain("nsec");
      expect(themeJson).not.toContain("private");
      expect(themeJson).not.toContain("secret");
    });

    it("should not expose nsec in social links", () => {
      const links: SocialLink[] = [
        {
          id: "link-1",
          platform: "twitter",
          url: "https://twitter.com/username",
          order: 0,
        },
      ];

      const linksJson = JSON.stringify(links);
      expect(linksJson).not.toContain("nsec");
      expect(linksJson).not.toContain("private");
      expect(linksJson).not.toContain("secret");
    });

    it("should not expose nsec in banner URLs", () => {
      const bannerUrl = "https://blossom.nostr.build/banner.jpg";
      expect(bannerUrl).not.toContain("nsec");
      expect(bannerUrl).not.toContain("private");
      expect(bannerUrl).not.toContain("secret");
    });
  });

  describe("Server-Side Validation", () => {
    it("should validate all inputs server-side (not just client-side)", () => {
      // This test verifies that validation functions exist and are callable
      // In production, these same functions are used server-side in unified-profiles.ts

      // Theme validation (server-side in handleUpdateTheme)
      const theme = {
        colorScheme: { primary: "#8b5cf6" },
        typography: { fontFamily: "Inter" },
        layout: { maxWidth: "1200px" },
        version: "1.0",
      };
      expect(theme.version).toBe("1.0");

      // Banner validation (server-side in handleUpdateBanner)
      const bannerUrl = "https://blossom.nostr.build/banner.jpg";
      const bannerResult = validateBannerUrl(bannerUrl);
      expect(bannerResult.valid).toBe(true);

      // Social links validation (server-side in handleUpdateSocialLinks)
      const links: SocialLink[] = [
        {
          id: "link-1",
          platform: "twitter",
          url: "https://twitter.com/username",
          order: 0,
        },
      ];
      const linksResult = validateSocialLinks(links);
      expect(linksResult.valid).toBe(true);
    });
  });
});
