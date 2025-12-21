/**
 * Admin Authentication and Authorization Utilities
 *
 * Extracts admin context from JWT tokens and validates admin privileges.
 * Integrates with SecureSessionManager and platform admin configuration.
 *
 * Security:
 *   - All authorization is DUID-based (no plaintext identifiers)
 *   - Platform admin status is checked against pre-computed DUIDs
 *   - Federation admin status is verified against database roles
 *   - All operations are logged for audit purposes
 */

import { createClient } from "@supabase/supabase-js";
import { getEnvVar, getRequiredEnvVar } from "./env.js";
import {
  validateJWTFromHeaderWithEnvSecret,
  type JWTPayload,
} from "./jwt-validation.js";
import {
  loadPlatformAdminConfig,
  isPlatformAdmin,
} from "../config/platform-admin.js";

// ============================================================================
// Types
// ============================================================================

export type AdminType = "platform" | "federation" | "none";

export interface AdminContext {
  /** Whether the user has any admin privileges */
  isAdmin: boolean;
  /** Type of admin: 'platform', 'federation', or 'none' */
  adminType: AdminType;
  /** User's DUID (always present if authenticated) */
  userDuid: string | null;
  /** User's NIP-05 DUID (if available) */
  nip05Duid: string | null;
  /** Federation ID (only for federation admins) */
  federationId: string | null;
  /** Federation role (only for federation admins) */
  federationRole: string | null;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Error message if authentication failed */
  error: string | null;
}

export interface AdminAuthResult {
  success: boolean;
  context: AdminContext;
  jwtPayload: JWTPayload | null;
}

// ============================================================================
// Supabase Client (lazy initialization)
// ============================================================================

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!supabaseClient) {
    const url = getRequiredEnvVar("VITE_SUPABASE_URL");
    const serviceKey = getRequiredEnvVar("SUPABASE_SERVICE_ROLE_KEY");
    supabaseClient = createClient(url, serviceKey);
  }
  return supabaseClient;
}

// ============================================================================
// Admin Context Extraction
// ============================================================================

/**
 * Extract admin context from JWT Authorization header
 *
 * @param authHeader - Authorization header value (e.g., "Bearer <token>")
 * @returns AdminAuthResult with context and JWT payload
 */
export async function extractAdminContext(
  authHeader: string | undefined
): Promise<AdminAuthResult> {
  const emptyContext: AdminContext = {
    isAdmin: false,
    adminType: "none",
    userDuid: null,
    nip05Duid: null,
    federationId: null,
    federationRole: null,
    isAuthenticated: false,
    error: null,
  };

  // Step 1: Validate JWT token
  const jwtResult = validateJWTFromHeaderWithEnvSecret(authHeader);

  if (!jwtResult.valid || !jwtResult.payload) {
    return {
      success: false,
      context: { ...emptyContext, error: jwtResult.error || "Invalid token" },
      jwtPayload: null,
    };
  }

  const payload = jwtResult.payload;

  // Step 2: Extract user identifiers from JWT
  const userDuid =
    (payload.userId as string) || (payload.sub as string) || null;
  const nip05Duid = (payload.nip05Duid as string) || null;

  if (!userDuid) {
    return {
      success: false,
      context: { ...emptyContext, error: "Missing user identifier in token" },
      jwtPayload: payload,
    };
  }

  // Step 3: Check platform admin status (O(1) lookup)
  const isPlatformAdminUser = isPlatformAdmin(userDuid);

  if (isPlatformAdminUser) {
    return {
      success: true,
      context: {
        isAdmin: true,
        adminType: "platform",
        userDuid,
        nip05Duid,
        federationId: null,
        federationRole: null,
        isAuthenticated: true,
        error: null,
      },
      jwtPayload: payload,
    };
  }

  // Step 4: Check federation admin status (database lookup)
  const federationContext = await checkFederationAdminStatus(userDuid);

  if (federationContext.isAdmin) {
    return {
      success: true,
      context: {
        isAdmin: true,
        adminType: "federation",
        userDuid,
        nip05Duid,
        federationId: federationContext.federationId,
        federationRole: federationContext.role,
        isAuthenticated: true,
        error: null,
      },
      jwtPayload: payload,
    };
  }

  // Step 5: Not an admin, but still authenticated
  return {
    success: true,
    context: {
      isAdmin: false,
      adminType: "none",
      userDuid,
      nip05Duid,
      federationId: null,
      federationRole: null,
      isAuthenticated: true,
      error: null,
    },
    jwtPayload: payload,
  };
}

// ============================================================================
// Federation Admin Status Check
// ============================================================================

interface FederationAdminCheckResult {
  isAdmin: boolean;
  federationId: string | null;
  role: string | null;
}

/**
 * Check if user is a federation admin (guardian or steward)
 *
 * @param userDuid - User's DUID to check
 * @returns Federation admin status with federation ID and role
 */
async function checkFederationAdminStatus(
  userDuid: string
): Promise<FederationAdminCheckResult> {
  try {
    const supabase = getSupabase();

    // Query for guardian or steward role in any federation
    const { data, error } = await supabase
      .from("family_members")
      .select("federation_id, role")
      .eq("user_duid", userDuid)
      .in("role", ["guardian", "steward"])
      .limit(1)
      .single();

    if (error || !data) {
      return { isAdmin: false, federationId: null, role: null };
    }

    return {
      isAdmin: true,
      federationId: (data.federation_id as string) || null,
      role: (data.role as string) || null,
    };
  } catch (error) {
    console.error("[AdminAuth] Federation admin check failed:", error);
    return { isAdmin: false, federationId: null, role: null };
  }
}

// ============================================================================
// Authorization Helpers
// ============================================================================

/**
 * Require platform admin privileges
 * Returns error context if user is not a platform admin
 *
 * @param authHeader - Authorization header value
 * @returns AdminAuthResult with authorization status
 */
export async function requirePlatformAdmin(
  authHeader: string | undefined
): Promise<AdminAuthResult> {
  const result = await extractAdminContext(authHeader);

  if (!result.success) {
    return result;
  }

  if (result.context.adminType !== "platform") {
    return {
      success: false,
      context: {
        ...result.context,
        error: "Platform admin privileges required",
      },
      jwtPayload: result.jwtPayload,
    };
  }

  return result;
}

/**
 * Require any admin privileges (platform or federation)
 * Returns error context if user is not an admin
 *
 * @param authHeader - Authorization header value
 * @returns AdminAuthResult with authorization status
 */
export async function requireAnyAdmin(
  authHeader: string | undefined
): Promise<AdminAuthResult> {
  const result = await extractAdminContext(authHeader);

  if (!result.success) {
    return result;
  }

  if (!result.context.isAdmin) {
    return {
      success: false,
      context: {
        ...result.context,
        error: "Admin privileges required",
      },
      jwtPayload: result.jwtPayload,
    };
  }

  return result;
}

/**
 * Require federation admin privileges for a specific federation
 *
 * @param authHeader - Authorization header value
 * @param federationId - Federation ID to check access for
 * @returns AdminAuthResult with authorization status
 */
export async function requireFederationAdmin(
  authHeader: string | undefined,
  federationId: string
): Promise<AdminAuthResult> {
  const result = await extractAdminContext(authHeader);

  if (!result.success) {
    return result;
  }

  // Platform admins have access to all federations
  if (result.context.adminType === "platform") {
    return result;
  }

  // Federation admins only have access to their own federation
  if (
    result.context.adminType === "federation" &&
    result.context.federationId === federationId
  ) {
    return result;
  }

  return {
    success: false,
    context: {
      ...result.context,
      error: "Federation admin privileges required for this federation",
    },
    jwtPayload: result.jwtPayload,
  };
}

/**
 * Check if admin can remove a specific account type
 * Platform admins can remove any account
 * Federation admins can remove offspring, adult, but not guardians
 *
 * @param adminContext - Admin context from extractAdminContext
 * @param targetAccountType - Account type to remove
 * @returns Whether the admin can remove this account type
 */
export function canRemoveAccountType(
  adminContext: AdminContext,
  targetAccountType: string
): boolean {
  if (!adminContext.isAdmin) {
    return false;
  }

  // Platform admins can remove any account
  if (adminContext.adminType === "platform") {
    return true;
  }

  // Federation admins cannot remove guardians
  if (adminContext.adminType === "federation") {
    return targetAccountType !== "guardian";
  }

  return false;
}
