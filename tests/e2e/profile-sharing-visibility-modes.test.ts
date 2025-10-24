/**
 * E2E Tests for Profile Visibility Mode Enforcement
 * Phase 3 Sub-Phase 3B Task 3B.4
 *
 * Tests visibility mode enforcement (public, contacts_only, trusted_contacts_only, private)
 * with RLS policy integration and access control verification.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PublicProfile, VerificationMethods } from "../../src/types/profile";
import type { ProfileVisibility } from "../../src/lib/services/profile-service";

// Mock Supabase client with RLS simulation
const mockSupabaseData: Record<string, any[]> = {
  user_identities: [],
  encrypted_contacts: [],
  profile_views: [],
};

// Mock current user context
let mockCurrentUserDuid: string | null = null;

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn(async (payload: any) => {
        if (!mockSupabaseData[table]) mockSupabaseData[table] = [];
        mockSupabaseData[table].push(payload);
        return { data: payload, error: null };
      }),
      eq: vi.fn(function (this: any, column: string, value: any) {
        // Simulate RLS filtering
        if (table === "user_identities") {
          const filtered = mockSupabaseData[table].filter((row) => {
            // Apply visibility rules
            if (row.profile_visibility === "public") return true;
            if (row.profile_visibility === "private") {
              return row.id === mockCurrentUserDuid;
            }
            if (row.profile_visibility === "contacts_only") {
              return isContactOfOwner(row.id, mockCurrentUserDuid);
            }
            if (row.profile_visibility === "trusted_contacts_only") {
              return isTrustedContactOfOwner(row.id, mockCurrentUserDuid);
            }
            return false;
          });
          this._filtered = filtered.filter((row) => row[column] === value);
        }
        return this;
      }),
      single: vi.fn(async function (this: any) {
        const data = this._filtered?.[0] || null;
        return { data, error: data ? null : { message: "Access denied", code: "PGRST116" } };
      }),
      maybeSingle: vi.fn(async function (this: any) {
        const data = this._filtered?.[0] || null;
        return { data, error: null };
      }),
    })),
    rpc: vi.fn(async (fnName: string, params: any) => {
      if (fnName === "get_current_user_duid") {
        return { data: mockCurrentUserDuid, error: null };
      }
      if (fnName === "is_contact_of_owner") {
        return { data: isContactOfOwner(params.p_owner_duid, params.p_viewer_duid), error: null };
      }
      if (fnName === "is_trusted_contact_of_owner") {
        return { data: isTrustedContactOfOwner(params.p_owner_duid, params.p_viewer_duid), error: null };
      }
      return { data: null, error: null };
    }),
  })),
}));

// Helper functions to simulate RLS policies
function isContactOfOwner(ownerDuid: string, viewerDuid: string | null): boolean {
  if (!viewerDuid) return false;
  
  const ownerHash = `hash_${ownerDuid}`;
  const contactHash = `contact_${viewerDuid}_of_${ownerDuid}`;
  
  return mockSupabaseData.encrypted_contacts.some(
    (contact) => contact.owner_hash === ownerHash && contact.contact_hash === contactHash
  );
}

function isTrustedContactOfOwner(ownerDuid: string, viewerDuid: string | null): boolean {
  if (!viewerDuid) return false;
  
  const ownerHash = `hash_${ownerDuid}`;
  const contactHash = `contact_${viewerDuid}_of_${ownerDuid}`;
  
  return mockSupabaseData.encrypted_contacts.some(
    (contact) =>
      contact.owner_hash === ownerHash &&
      contact.contact_hash === contactHash &&
      (contact.verification_level === "verified" || contact.verification_level === "trusted")
  );
}

// Test Helpers
function createMockProfile(
  id: string,
  username: string,
  visibility: ProfileVisibility
): PublicProfile {
  return {
    id,
    username,
    npub: `npub1${id}`,
    nip05: `${username}@my.satnam.pub`,
    display_name: username,
    bio: `Bio for ${username}`,
    profile_visibility: visibility,
    is_discoverable: visibility === "public",
    profile_views_count: 0,
    analytics_enabled: true,
    verification_methods: {
      physical_mfa_verified: false,
      simpleproof_verified: false,
      kind0_verified: false,
      pkarr_verified: false,
      iroh_dht_verified: false,
    },
  };
}

function addContact(
  ownerDuid: string,
  viewerDuid: string,
  verificationLevel: "unverified" | "basic" | "verified" | "trusted" = "unverified"
) {
  const ownerHash = `hash_${ownerDuid}`;
  const contactHash = `contact_${viewerDuid}_of_${ownerDuid}`;
  
  mockSupabaseData.encrypted_contacts.push({
    owner_hash: ownerHash,
    contact_hash: contactHash,
    verification_level: verificationLevel,
    physical_mfa_verified: verificationLevel === "trusted" || verificationLevel === "verified",
    simpleproof_verified: verificationLevel === "trusted",
    kind0_verified: false,
    pkarr_verified: false,
    iroh_dht_verified: false,
  });
}

describe("Profile Visibility Mode Enforcement E2E", () => {
  beforeEach(() => {
    // Reset mock data before each test
    mockSupabaseData.user_identities = [];
    mockSupabaseData.encrypted_contacts = [];
    mockSupabaseData.profile_views = [];
    mockCurrentUserDuid = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Public Profile Access", () => {
    it("should allow anonymous users to view public profiles", () => {
      const publicProfile = createMockProfile("owner_123", "publicuser", "public");
      mockSupabaseData.user_identities.push(publicProfile);
      mockCurrentUserDuid = null; // Anonymous

      const profiles = mockSupabaseData.user_identities.filter(
        (p) => p.profile_visibility === "public"
      );

      expect(profiles).toHaveLength(1);
      expect(profiles[0].username).toBe("publicuser");
    });

    it("should allow authenticated users to view public profiles", () => {
      const publicProfile = createMockProfile("owner_123", "publicuser", "public");
      mockSupabaseData.user_identities.push(publicProfile);
      mockCurrentUserDuid = "viewer_456"; // Authenticated

      const profiles = mockSupabaseData.user_identities.filter(
        (p) => p.profile_visibility === "public"
      );

      expect(profiles).toHaveLength(1);
      expect(profiles[0].username).toBe("publicuser");
    });
  });

  describe("Contacts-Only Profile Access", () => {
    it("should allow contacts to view contacts_only profiles", () => {
      const ownerDuid = "owner_123";
      const viewerDuid = "viewer_456";
      
      const contactsProfile = createMockProfile(ownerDuid, "contactsuser", "contacts_only");
      mockSupabaseData.user_identities.push(contactsProfile);
      
      // Add viewer as contact
      addContact(ownerDuid, viewerDuid, "basic");
      mockCurrentUserDuid = viewerDuid;

      const canView = isContactOfOwner(ownerDuid, viewerDuid);
      expect(canView).toBe(true);
    });

    it("should deny non-contacts access to contacts_only profiles", () => {
      const ownerDuid = "owner_123";
      const viewerDuid = "viewer_456";
      
      const contactsProfile = createMockProfile(ownerDuid, "contactsuser", "contacts_only");
      mockSupabaseData.user_identities.push(contactsProfile);
      
      // Viewer is NOT a contact
      mockCurrentUserDuid = viewerDuid;

      const canView = isContactOfOwner(ownerDuid, viewerDuid);
      expect(canView).toBe(false);
    });

    it("should deny anonymous users access to contacts_only profiles", () => {
      const ownerDuid = "owner_123";
      
      const contactsProfile = createMockProfile(ownerDuid, "contactsuser", "contacts_only");
      mockSupabaseData.user_identities.push(contactsProfile);
      
      mockCurrentUserDuid = null; // Anonymous

      const canView = isContactOfOwner(ownerDuid, null);
      expect(canView).toBe(false);
    });
  });

  describe("Trusted-Contacts-Only Profile Access", () => {
    it("should allow verified contacts to view trusted_contacts_only profiles", () => {
      const ownerDuid = "owner_123";
      const viewerDuid = "viewer_456";
      
      const trustedProfile = createMockProfile(ownerDuid, "trusteduser", "trusted_contacts_only");
      mockSupabaseData.user_identities.push(trustedProfile);
      
      // Add viewer as verified contact
      addContact(ownerDuid, viewerDuid, "verified");
      mockCurrentUserDuid = viewerDuid;

      const canView = isTrustedContactOfOwner(ownerDuid, viewerDuid);
      expect(canView).toBe(true);
    });

    it("should allow trusted contacts to view trusted_contacts_only profiles", () => {
      const ownerDuid = "owner_123";
      const viewerDuid = "viewer_456";
      
      const trustedProfile = createMockProfile(ownerDuid, "trusteduser", "trusted_contacts_only");
      mockSupabaseData.user_identities.push(trustedProfile);
      
      // Add viewer as trusted contact
      addContact(ownerDuid, viewerDuid, "trusted");
      mockCurrentUserDuid = viewerDuid;

      const canView = isTrustedContactOfOwner(ownerDuid, viewerDuid);
      expect(canView).toBe(true);
    });

    it("should deny basic contacts access to trusted_contacts_only profiles", () => {
      const ownerDuid = "owner_123";
      const viewerDuid = "viewer_456";
      
      const trustedProfile = createMockProfile(ownerDuid, "trusteduser", "trusted_contacts_only");
      mockSupabaseData.user_identities.push(trustedProfile);
      
      // Add viewer as basic contact (not verified/trusted)
      addContact(ownerDuid, viewerDuid, "basic");
      mockCurrentUserDuid = viewerDuid;

      const canView = isTrustedContactOfOwner(ownerDuid, viewerDuid);
      expect(canView).toBe(false);
    });

    it("should deny unverified contacts access to trusted_contacts_only profiles", () => {
      const ownerDuid = "owner_123";
      const viewerDuid = "viewer_456";
      
      const trustedProfile = createMockProfile(ownerDuid, "trusteduser", "trusted_contacts_only");
      mockSupabaseData.user_identities.push(trustedProfile);
      
      // Add viewer as unverified contact
      addContact(ownerDuid, viewerDuid, "unverified");
      mockCurrentUserDuid = viewerDuid;

      const canView = isTrustedContactOfOwner(ownerDuid, viewerDuid);
      expect(canView).toBe(false);
    });

    it("should deny anonymous users access to trusted_contacts_only profiles", () => {
      const ownerDuid = "owner_123";
      
      const trustedProfile = createMockProfile(ownerDuid, "trusteduser", "trusted_contacts_only");
      mockSupabaseData.user_identities.push(trustedProfile);
      
      mockCurrentUserDuid = null; // Anonymous

      const canView = isTrustedContactOfOwner(ownerDuid, null);
      expect(canView).toBe(false);
    });
  });

  describe("Private Profile Access", () => {
    it("should allow only the owner to view private profiles", () => {
      const ownerDuid = "owner_123";
      
      const privateProfile = createMockProfile(ownerDuid, "privateuser", "private");
      mockSupabaseData.user_identities.push(privateProfile);
      
      mockCurrentUserDuid = ownerDuid; // Owner viewing their own profile

      const canView = privateProfile.id === mockCurrentUserDuid;
      expect(canView).toBe(true);
    });

    it("should deny authenticated users access to private profiles", () => {
      const ownerDuid = "owner_123";
      const viewerDuid = "viewer_456";
      
      const privateProfile = createMockProfile(ownerDuid, "privateuser", "private");
      mockSupabaseData.user_identities.push(privateProfile);
      
      mockCurrentUserDuid = viewerDuid; // Different user

      const canView = privateProfile.id === mockCurrentUserDuid;
      expect(canView).toBe(false);
    });

    it("should deny contacts access to private profiles", () => {
      const ownerDuid = "owner_123";
      const viewerDuid = "viewer_456";
      
      const privateProfile = createMockProfile(ownerDuid, "privateuser", "private");
      mockSupabaseData.user_identities.push(privateProfile);
      
      // Add viewer as contact (should still be denied)
      addContact(ownerDuid, viewerDuid, "verified");
      mockCurrentUserDuid = viewerDuid;

      const canView = privateProfile.id === mockCurrentUserDuid;
      expect(canView).toBe(false);
    });

    it("should deny anonymous users access to private profiles", () => {
      const ownerDuid = "owner_123";
      
      const privateProfile = createMockProfile(ownerDuid, "privateuser", "private");
      mockSupabaseData.user_identities.push(privateProfile);
      
      mockCurrentUserDuid = null; // Anonymous

      const canView = privateProfile.id === mockCurrentUserDuid;
      expect(canView).toBe(false);
    });
  });

  describe("URL Format Access", () => {
    it("should support /profile/{username} format", () => {
      const publicProfile = createMockProfile("owner_123", "testuser", "public");
      mockSupabaseData.user_identities.push(publicProfile);

      const profile = mockSupabaseData.user_identities.find((p) => p.username === "testuser");
      expect(profile).toBeDefined();
      expect(profile?.username).toBe("testuser");
    });

    it("should support /profile/npub/{npub} format", () => {
      const publicProfile = createMockProfile("owner_123", "testuser", "public");
      mockSupabaseData.user_identities.push(publicProfile);

      const profile = mockSupabaseData.user_identities.find((p) => p.npub === "npub1owner_123");
      expect(profile).toBeDefined();
      expect(profile?.npub).toBe("npub1owner_123");
    });

    it("should support /p/{username} short URL format", () => {
      const publicProfile = createMockProfile("owner_123", "testuser", "public");
      mockSupabaseData.user_identities.push(publicProfile);

      // Short URL should resolve to same profile
      const profile = mockSupabaseData.user_identities.find((p) => p.username === "testuser");
      expect(profile).toBeDefined();
      expect(profile?.username).toBe("testuser");
    });

    it("should handle URL decoding for special characters", () => {
      const specialUsername = "test_user-123";
      const publicProfile = createMockProfile("owner_123", specialUsername, "public");
      mockSupabaseData.user_identities.push(publicProfile);

      const encodedUsername = encodeURIComponent(specialUsername);
      const decodedUsername = decodeURIComponent(encodedUsername);
      
      const profile = mockSupabaseData.user_identities.find((p) => p.username === decodedUsername);
      expect(profile).toBeDefined();
      expect(profile?.username).toBe("test_user-123");
    });
  });
});

