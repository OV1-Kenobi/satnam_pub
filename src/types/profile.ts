/**
 * Profile System Type Definitions
 * Phase 3: Public Profile URL System - UI Integration
 *
 * Comprehensive type definitions for profile visibility, analytics,
 * verification, and public profile display.
 */

import { ProfileVisibility } from "../lib/services/profile-service";

/**
 * Verification Level (Phase 2)
 * Auto-derived from verification flags in encrypted_contacts table
 */
export type VerificationLevel = "unverified" | "basic" | "verified" | "trusted";

/**
 * Verification Methods
 * Tracks which verification methods have been completed for a contact
 */
export interface VerificationMethods {
  physical_mfa_verified: boolean;
  simpleproof_verified: boolean;
  kind0_verified: boolean;
  pkarr_verified: boolean;
  iroh_dht_verified: boolean;
}

/**
 * Visibility Settings
 * Complete profile visibility configuration
 */
export interface VisibilitySettings {
  profile_visibility: ProfileVisibility;
  is_discoverable: boolean;
  analytics_enabled: boolean;
}

/**
 * Public Profile
 * Sanitized profile data safe for public display
 * Never includes nsec, encrypted credentials, or sensitive data
 */
export interface PublicProfile {
  id: string;
  username: string;
  npub: string;
  nip05?: string;
  lightning_address?: string;
  display_name?: string;
  bio?: string;
  picture?: string;
  website?: string;
  profile_visibility: ProfileVisibility;
  profile_banner_url?: string;
  profile_theme?: Record<string, any>;
  social_links?: Record<string, string>;
  is_discoverable: boolean;
  profile_views_count: number;
  last_profile_view?: string;
  analytics_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Profile Analytics Data
 * Privacy-first analytics with aggregated data only
 */
export interface ProfileAnalyticsData {
  total_views: number;
  last_profile_view?: string;
  recent_views: Array<{
    viewed_at: string;
    referrer?: string;
  }>;
  referrer_summary?: Array<{
    referrer: string;
    count: number;
  }>;
  time_series?: Array<{
    date: string;
    views: number;
  }>;
}

/**
 * Contact with Verification
 * Extended contact information including verification status
 */
export interface ContactWithVerification {
  contact_hash: string;
  owner_hash: string;
  verification_level: VerificationLevel;
  verification_methods: VerificationMethods;
  created_at: string;
  updated_at: string;
}

/**
 * Profile View Event
 * Data structure for tracking profile views (privacy-first)
 */
export interface ProfileViewEvent {
  profile_id: string;
  viewer_hash: string; // Hashed viewer identity (no PII)
  referrer?: string; // Domain only, not full URL
  viewed_at?: string;
}

/**
 * Profile URL Configuration
 * Configuration for generating and displaying profile URLs
 */
export interface ProfileURLConfig {
  baseUrl: string;
  username: string;
  npub?: string;
  includeQRCode?: boolean;
}

/**
 * Visibility Mode Option
 * UI configuration for visibility mode selection
 */
export interface VisibilityModeOption {
  value: ProfileVisibility;
  label: string;
  description: string;
  icon: string;
  detailedExplanation?: string;
}

/**
 * Analytics Time Range
 * Supported time ranges for analytics queries
 */
export type AnalyticsTimeRange = 7 | 30 | 90 | 365;

/**
 * Profile Update Request
 * Request payload for updating profile settings
 */
export interface ProfileUpdateRequest {
  visibility?: ProfileVisibility;
  is_discoverable?: boolean;
  analytics_enabled?: boolean;
  display_name?: string;
  bio?: string;
  picture?: string;
  website?: string;
  profile_banner_url?: string;
  profile_theme?: Record<string, any>;
  social_links?: Record<string, string>;
}

/**
 * Profile API Response
 * Standard response format for profile API endpoints
 */
export interface ProfileAPIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================================================
// Phase 4: Profile Customization Types
// ============================================================================

/**
 * Color Scheme
 * Defines the color palette for a profile theme
 */
export interface ColorScheme {
  primary: string; // Primary brand color (hex format: #RRGGBB)
  secondary: string; // Secondary accent color
  background: string; // Background color
  text: string; // Text color
  accent: string; // Accent/highlight color
}

/**
 * Typography Settings
 * Defines font family and size preferences
 */
export interface Typography {
  fontFamily: "Inter" | "Roboto" | "Open Sans" | "Lato" | "Montserrat";
  fontSize: "small" | "medium" | "large";
}

/**
 * Layout Settings
 * Defines layout style and visibility options
 */
export interface Layout {
  style: "modern" | "classic" | "minimal";
  showBanner: boolean;
  showSocialLinks: boolean;
}

/**
 * Profile Theme
 * Complete theme configuration for profile customization
 * Stored in user_identities.profile_theme JSONB column
 */
export interface ProfileTheme {
  colorScheme: ColorScheme;
  typography: Typography;
  layout: Layout;
  version: string; // Schema version for future migrations (e.g., "1.0")
}

/**
 * Theme Preset
 * Pre-defined theme configuration with metadata
 */
export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  theme: ProfileTheme;
}

// ============================================================================
// Phase 4B: Banner Management Types
// ============================================================================

/**
 * Banner crop options for image cropping
 */
export interface BannerCropOptions {
  x: number; // X coordinate of crop area (pixels)
  y: number; // Y coordinate of crop area (pixels)
  width: number; // Width of crop area (pixels)
  height: number; // Height of crop area (pixels)
  scale: number; // Zoom scale (1.0 = 100%)
}

/**
 * Banner upload request payload
 */
export interface BannerUploadRequest {
  file: File; // Image file to upload
  cropOptions?: BannerCropOptions; // Optional crop settings
}

/**
 * Banner upload response from Blossom server
 * Phase 5A: Added serverUsed field for multi-server tracking
 */
export interface BannerUploadResponse {
  success: boolean;
  url?: string; // HTTPS URL to uploaded banner
  sha256?: string; // SHA-256 hash of uploaded file (Blossom spec)
  size?: number; // File size in bytes
  type?: string; // MIME type
  error?: string; // Error message if upload failed
  serverUsed?: string; // Which Blossom server was used (Phase 5A)
}

/**
 * Banner validation result
 */
export interface BannerValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[]; // Non-blocking warnings (e.g., "File size >1MB")
}

// ============================================================================
// Phase 4C: Social Links Editor Types
// ============================================================================

/**
 * Supported social link platforms
 */
export type SocialLinkPlatform =
  | "twitter"
  | "github"
  | "telegram"
  | "nostr"
  | "lightning"
  | "website"
  | "youtube"
  | "linkedin"
  | "instagram"
  | "facebook";

/**
 * Social link with platform and URL
 */
export interface SocialLink {
  id: string; // Unique identifier for reordering
  platform: SocialLinkPlatform;
  url: string; // Full URL or handle (e.g., @username for Twitter)
  label?: string; // Optional custom label (e.g., "My Blog")
  order: number; // Display order (0-indexed)
}

/**
 * Social links update request payload
 */
export interface SocialLinksUpdateRequest {
  links: SocialLink[]; // Array of social links (max 10)
}

/**
 * Social links update response
 */
export interface SocialLinksUpdateResponse {
  success: boolean;
  social_links?: Record<string, string>; // Updated social_links JSONB
  error?: string;
}

/**
 * Social link validation result
 */
export interface SocialLinkValidationResult {
  valid: boolean;
  error?: string;
  normalizedUrl?: string; // Normalized/sanitized URL
  warnings?: string[]; // Non-blocking warnings
}
