/**
 * Admin Account Control Components - Test Setup
 * Provides mocks and utilities for testing admin UI components
 * @module admin-test-setup
 */

import { vi } from "vitest";

// Type definitions for test mocks
type AdminRole = "guardian" | "steward" | "adult" | "offspring" | "private";
type AdminType = "platform" | "federation";

export interface MockAdminUser {
  duid: string;
  npub: string;
  role: AdminRole;
  nip05Identifier: string;
  displayName: string;
  avatarUrl: string | null;
  isActive: boolean;
  federationId?: string;
}

export interface MockAdminContext {
  userDuid: string;
  adminType: AdminType;
  federationId: string | null;
  permissions: string[];
}

// Mock environment variables
export const mockEnvVars = {
  VITE_SUPABASE_URL: "http://localhost:54321",
  VITE_SUPABASE_ANON_KEY: "test-anon-key",
  VITE_ADMIN_ACCOUNT_CONTROL_ENABLED: "true",
};

// Mock admin user data
export const mockPlatformAdmin: MockAdminUser = {
  duid: "platform-admin-duid-123",
  npub: "npub1" + "a".repeat(58),
  role: "guardian",
  nip05Identifier: "admin@satnam.pub",
  displayName: "Platform Admin",
  avatarUrl: null,
  isActive: true,
};

export const mockFederationAdmin: MockAdminUser = {
  duid: "federation-admin-duid-456",
  npub: "npub1" + "b".repeat(58),
  role: "steward",
  nip05Identifier: "steward@family.satnam.pub",
  displayName: "Federation Admin",
  avatarUrl: null,
  isActive: true,
  federationId: "federation-123",
};

export const mockRegularUser: MockAdminUser = {
  duid: "regular-user-duid-789",
  npub: "npub1" + "c".repeat(58),
  role: "adult",
  nip05Identifier: "user@satnam.pub",
  displayName: "Regular User",
  avatarUrl: null,
  isActive: true,
};

// Mock admin context
export const mockPlatformAdminContext: MockAdminContext = {
  userDuid: mockPlatformAdmin.duid,
  adminType: "platform",
  federationId: null,
  permissions: [
    "manage_accounts",
    "manage_orphans",
    "view_audit_log",
    "rollback",
  ],
};

export const mockFederationAdminContext: MockAdminContext = {
  userDuid: mockFederationAdmin.duid,
  adminType: "federation",
  federationId: "federation-123",
  permissions: ["manage_accounts", "view_audit_log"],
};

// Mock removal log entries
export const mockRemovalLogEntries = [
  {
    id: "removal-1",
    admin_user_duid: mockPlatformAdmin.duid,
    admin_type: "platform" as const,
    target_user_duid: "target-user-1",
    target_nip05_duid: "nip05-1",
    target_account_type: "private",
    removal_reason: "user_request",
    status: "completed",
    rollback_expires_at: new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    ).toISOString(),
    rollback_executed: false,
    records_deleted: 5,
    requested_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    completed_at: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "removal-2",
    admin_user_duid: mockFederationAdmin.duid,
    admin_type: "federation" as const,
    target_user_duid: "target-user-2",
    target_nip05_duid: "nip05-2",
    target_account_type: "federation",
    removal_reason: "policy_violation",
    status: "failed",
    rollback_expires_at: null,
    rollback_executed: false,
    records_deleted: 0,
    requested_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    completed_at: null,
  },
];

// Mock account search results
export const mockAccountSearchResults = [
  {
    user_duid: "user-duid-1",
    nip05_duid: "nip05-duid-1",
    identifier: "alice",
    domain: "satnam.pub",
    npub: "npub1" + "d".repeat(58),
    account_type: "private",
    federation_id: null,
    created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    last_verified_at: new Date(
      Date.now() - 1 * 24 * 60 * 60 * 1000
    ).toISOString(),
    is_active: true,
  },
  {
    user_duid: "user-duid-2",
    nip05_duid: "nip05-duid-2",
    identifier: "bob",
    domain: "family.satnam.pub",
    npub: "npub1" + "e".repeat(58),
    account_type: "federation",
    federation_id: "federation-123",
    created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    last_verified_at: new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString(),
    is_active: true,
  },
];

// Mock orphan records
export const mockOrphanRecords = [
  {
    nip05_duid: "orphan-nip05-1",
    identifier: "orphan1",
    domain: "satnam.pub",
    npub: "npub1" + "f".repeat(58),
    created_at: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
    reason: "User identity not found in user_identities table",
  },
];

// Setup mock useAuth hook
export function setupAuthMock(
  user: MockAdminUser = mockPlatformAdmin,
  authenticated = true
) {
  return {
    user,
    sessionToken: authenticated ? "mock-jwt-token-" + Date.now() : null,
    authenticated,
    loading: false,
    error: null,
    signOut: vi.fn(),
    refreshSession: vi.fn(),
  };
}

// Cleanup helper
export function cleanupMocks() {
  vi.restoreAllMocks();
}
