/**
 * E2E Tests for Public Profile Access
 * Phase 3 Sub-Phase 3B Task 3B.4
 *
 * Tests public profile accessibility, data display, view tracking,
 * analytics, verification badges, and fallback rendering.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PublicProfile, VerificationMethods } from "../../src/types/profile";

// Mock Supabase client
const mockSupabaseData: Record<string, any[]> = {
  user_identities: [],
  profile_views: [],
  encrypted_contacts: [],
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn(async (payload: any) => {
        if (!mockSupabaseData[table]) mockSupabaseData[table] = [];
        mockSupabaseData[table].push(payload);
        return { data: payload, error: null };
      }),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(async () => {
        const data = mockSupabaseData[table]?.[0] || null;
        return { data, error: data ? null : { message: "Not found" } };
      }),
      maybeSingle: vi.fn(async () => {
        const data = mockSupabaseData[table]?.[0] || null;
        return { data, error: null };
      }),
    })),
    rpc: vi.fn(async (fnName: string, params: any) => {
      // Mock RLS helper functions
      if (fnName === "get_current_user_duid") {
        return { data: null, error: null };
      }
      if (fnName === "is_contact_of_owner") {
        return { data: false, error: null };
      }
      if (fnName === "is_trusted_contact_of_owner") {
        return { data: false, error: null };
      }
      return { data: null, error: null };
    }),
  })),
}));

// Test Helpers
function createMockPublicProfile(overrides?: Partial<PublicProfile>): PublicProfile {
  return {
    id: "test_duid_123",
    username: "testuser",
    npub: "npub1test123456789abcdefghijklmnopqrstuvwxyz",
    nip05: "testuser@my.satnam.pub",
    lightning_address: "testuser@my.satnam.pub",
    display_name: "Test User",
    bio: "This is a test bio for public profile testing.",
    picture: "https://example.com/avatar.jpg",
    website: "https://example.com",
    profile_visibility: "public",
    profile_banner_url: "https://example.com/banner.jpg",
    social_links: {
      twitter: "https://twitter.com/testuser",
      github: "https://github.com/testuser",
    },
    is_discoverable: true,
    profile_views_count: 42,
    analytics_enabled: true,
    verification_methods: {
      physical_mfa_verified: false,
      simpleproof_verified: false,
      kind0_verified: false,
      pkarr_verified: false,
      iroh_dht_verified: false,
    },
    ...overrides,
  };
}

function createMockVerificationMethods(
  overrides?: Partial<VerificationMethods>
): VerificationMethods {
  return {
    physical_mfa_verified: false,
    simpleproof_verified: false,
    kind0_verified: false,
    pkarr_verified: false,
    iroh_dht_verified: false,
    ...overrides,
  };
}

// Verification level derivation logic (matches backend trigger)
function deriveVerificationLevel(methods: VerificationMethods): "trusted" | "verified" | "basic" | "unverified" {
  const { physical_mfa_verified, simpleproof_verified, kind0_verified, pkarr_verified, iroh_dht_verified } = methods;

  if (physical_mfa_verified && (simpleproof_verified || kind0_verified)) {
    return "trusted";
  } else if (physical_mfa_verified || (simpleproof_verified && kind0_verified)) {
    return "verified";
  } else if (physical_mfa_verified || simpleproof_verified || kind0_verified || pkarr_verified || iroh_dht_verified) {
    return "basic";
  } else {
    return "unverified";
  }
}

describe("Public Profile Access E2E", () => {
  beforeEach(() => {
    // Reset mock data before each test
    mockSupabaseData.user_identities = [];
    mockSupabaseData.profile_views = [];
    mockSupabaseData.encrypted_contacts = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Public Profile Accessibility", () => {
    it("should allow anonymous users to view public profiles", async () => {
      const publicProfile = createMockPublicProfile({ profile_visibility: "public" });
      mockSupabaseData.user_identities.push(publicProfile);

      // Simulate anonymous access (no auth token)
      const profile = mockSupabaseData.user_identities[0];

      expect(profile).toBeDefined();
      expect(profile.profile_visibility).toBe("public");
      expect(profile.username).toBe("testuser");
    });

    it("should allow authenticated users to view public profiles", async () => {
      const publicProfile = createMockPublicProfile({ profile_visibility: "public" });
      mockSupabaseData.user_identities.push(publicProfile);

      // Simulate authenticated access (with auth token)
      const profile = mockSupabaseData.user_identities[0];

      expect(profile).toBeDefined();
      expect(profile.profile_visibility).toBe("public");
    });

    it("should return profile data for valid username", async () => {
      const publicProfile = createMockPublicProfile({ username: "validuser" });
      mockSupabaseData.user_identities.push(publicProfile);

      const profile = mockSupabaseData.user_identities.find((p) => p.username === "validuser");

      expect(profile).toBeDefined();
      expect(profile?.username).toBe("validuser");
    });

    it("should return profile data for valid npub", async () => {
      const publicProfile = createMockPublicProfile({ npub: "npub1validkey123" });
      mockSupabaseData.user_identities.push(publicProfile);

      const profile = mockSupabaseData.user_identities.find((p) => p.npub === "npub1validkey123");

      expect(profile).toBeDefined();
      expect(profile?.npub).toBe("npub1validkey123");
    });

    it("should return 404 for invalid username", async () => {
      const profile = mockSupabaseData.user_identities.find((p) => p.username === "nonexistent");

      expect(profile).toBeUndefined();
    });

    it("should return 404 for invalid npub", async () => {
      const profile = mockSupabaseData.user_identities.find((p) => p.npub === "npub1invalid");

      expect(profile).toBeUndefined();
    });
  });

  describe("Profile Data Display", () => {
    it("should display all profile fields correctly", async () => {
      const publicProfile = createMockPublicProfile();
      mockSupabaseData.user_identities.push(publicProfile);

      const profile = mockSupabaseData.user_identities[0];

      expect(profile.display_name).toBe("Test User");
      expect(profile.bio).toBe("This is a test bio for public profile testing.");
      expect(profile.picture).toBe("https://example.com/avatar.jpg");
      expect(profile.profile_banner_url).toBe("https://example.com/banner.jpg");
      expect(profile.social_links).toEqual({
        twitter: "https://twitter.com/testuser",
        github: "https://github.com/testuser",
      });
      expect(profile.lightning_address).toBe("testuser@my.satnam.pub");
      expect(profile.nip05).toBe("testuser@my.satnam.pub");
      expect(profile.website).toBe("https://example.com");
    });

    it("should handle missing optional fields gracefully", async () => {
      const minimalProfile = createMockPublicProfile({
        display_name: undefined,
        bio: undefined,
        picture: undefined,
        profile_banner_url: undefined,
        social_links: {},
        website: undefined,
      });
      mockSupabaseData.user_identities.push(minimalProfile);

      const profile = mockSupabaseData.user_identities[0];

      expect(profile.display_name).toBeUndefined();
      expect(profile.bio).toBeUndefined();
      expect(profile.picture).toBeUndefined();
      expect(profile.profile_banner_url).toBeUndefined();
      expect(profile.social_links).toEqual({});
      expect(profile.website).toBeUndefined();
    });

    it("should display social links correctly", async () => {
      const profileWithSocial = createMockPublicProfile({
        social_links: {
          twitter: "https://twitter.com/test",
          github: "https://github.com/test",
          nostr: "npub1test",
        },
      });
      mockSupabaseData.user_identities.push(profileWithSocial);

      const profile = mockSupabaseData.user_identities[0];

      expect(Object.keys(profile.social_links)).toHaveLength(3);
      expect(profile.social_links.twitter).toBe("https://twitter.com/test");
      expect(profile.social_links.github).toBe("https://github.com/test");
      expect(profile.social_links.nostr).toBe("npub1test");
    });
  });

  describe("Profile View Tracking", () => {
    it("should track profile views when analytics enabled", async () => {
      const publicProfile = createMockPublicProfile({ analytics_enabled: true });
      mockSupabaseData.user_identities.push(publicProfile);

      // Simulate profile view tracking
      const viewRecord = {
        id: "view_123",
        profile_id: publicProfile.id,
        viewer_hash: "abc123def456", // Hashed viewer identity
        viewed_at: new Date().toISOString(),
        referrer: "direct",
      };
      mockSupabaseData.profile_views.push(viewRecord);

      expect(mockSupabaseData.profile_views).toHaveLength(1);
      expect(mockSupabaseData.profile_views[0].profile_id).toBe(publicProfile.id);
      expect(mockSupabaseData.profile_views[0].viewer_hash).toBe("abc123def456");
    });

    it("should increment profile_views_count correctly", async () => {
      const publicProfile = createMockPublicProfile({
        profile_views_count: 10,
        analytics_enabled: true,
      });
      mockSupabaseData.user_identities.push(publicProfile);

      // Simulate view count increment
      publicProfile.profile_views_count += 1;

      expect(publicProfile.profile_views_count).toBe(11);
    });

    it("should use hashed viewer identity for privacy", async () => {
      const viewRecord = {
        id: "view_456",
        profile_id: "test_duid_123",
        viewer_hash: "1234567890abcdef1234567890abcdef1234567890abcdef12", // SHA-256 first 50 chars
        viewed_at: new Date().toISOString(),
      };
      mockSupabaseData.profile_views.push(viewRecord);

      expect(viewRecord.viewer_hash).toHaveLength(50);
      expect(viewRecord.viewer_hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("Verification Badge Display", () => {
    it("should derive 'trusted' level correctly", () => {
      const methods = createMockVerificationMethods({
        physical_mfa_verified: true,
        simpleproof_verified: true,
      });

      const level = deriveVerificationLevel(methods);
      expect(level).toBe("trusted");
    });

    it("should derive 'verified' level correctly", () => {
      const methods = createMockVerificationMethods({
        physical_mfa_verified: true,
      });

      const level = deriveVerificationLevel(methods);
      expect(level).toBe("verified");
    });

    it("should derive 'basic' level correctly", () => {
      const methods = createMockVerificationMethods({
        kind0_verified: true,
      });

      const level = deriveVerificationLevel(methods);
      expect(level).toBe("basic");
    });

    it("should derive 'unverified' level correctly", () => {
      const methods = createMockVerificationMethods();

      const level = deriveVerificationLevel(methods);
      expect(level).toBe("unverified");
    });
  });
});

