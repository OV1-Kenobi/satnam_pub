/**
 * Family Foundry Integration Service
 *
 * Core integration functions for Family Federation creation with privacy-first DUID generation,
 * user mapping, role validation, and FROST threshold configuration.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Privacy-first DUID generation using Web Crypto API SHA-256
 * - Role hierarchy: 'guardian'|'steward'|'adult'|'offspring'
 * - FROST threshold calculation (default 2-of-3 for guardians)
 * - Zero-knowledge architecture (no key reconstruction)
 * - Browser-only serverless (no Node.js dependencies)
 */

import { sha256Hex } from "./content-provenance/hashing";

/**
 * Master Context Role Hierarchy
 * Defines the standardized role levels for family federations
 */
export const ROLE_HIERARCHY: Record<string, number> = {
  offspring: 1,
  adult: 2,
  steward: 3,
  guardian: 4,
};

/**
 * Generate privacy-first federation DUID using Web Crypto API
 *
 * DUID = SHA-256(federation_${familyName}_${creatorUserDuid}_${timestamp})
 * Substring to 32 chars for consistent identifier length
 *
 * @param familyName - Family name for federation
 * @param creatorUserDuid - Creator's user DUID
 * @returns Promise<string> - 32-character privacy-first DUID
 */
export async function generateFederationDuid(
  familyName: string,
  creatorUserDuid: string
): Promise<string> {
  const encoder = new TextEncoder();
  const timestamp = Date.now().toString();

  // Create deterministic input for hashing
  const data = encoder.encode(
    `federation_${familyName}_${creatorUserDuid}_${timestamp}`
  );

  // Use Web Crypto API SHA-256
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const duid = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 32);

  return duid;
}

/**
 * Validate role hierarchy against Master Context standards
 *
 * Ensures:
 * - At least one guardian exists
 * - All roles are valid Master Context roles
 * - Role hierarchy is properly structured
 *
 * @param roles - Array of role IDs to validate
 * @returns boolean - True if hierarchy is valid
 */
export function validateRoleHierarchy(roles: string[]): boolean {
  // Ensure at least one guardian
  if (!roles.includes("guardian")) {
    return false;
  }

  // Ensure all roles are valid Master Context roles
  return roles.every((role) => role in ROLE_HIERARCHY);
}

/**
 * Check if one role can manage another role
 *
 * @param currentRole - Role of the user performing the action
 * @param targetRole - Role being managed
 * @returns boolean - True if currentRole can manage targetRole
 */
export function canManageRole(
  currentRole: string,
  targetRole: string
): boolean {
  const currentLevel = ROLE_HIERARCHY[currentRole];
  const targetLevel = ROLE_HIERARCHY[targetRole];

  if (currentLevel === undefined || targetLevel === undefined) {
    return false;
  }

  return currentLevel > targetLevel;
}

/**
 * Calculate FROST threshold based on guardian count
 *
 * Default policy: 'balanced'
 * - 1 guardian: 1-of-1
 * - 2 guardians: 2-of-2
 * - 3 guardians: 2-of-3
 * - 4 guardians: 3-of-4
 * - 5+ guardians: 3-of-5 (or ceil(count * 0.66))
 *
 * @param guardianCount - Number of guardians in federation
 * @param policy - Threshold policy ('conservative'|'balanced'|'aggressive')
 * @returns Object with threshold and total
 */
export function calculateFrostThreshold(
  guardianCount: number,
  policy: "conservative" | "balanced" | "aggressive" = "balanced"
): { threshold: number; total: number } {
  type ThresholdPolicy = "conservative" | "balanced" | "aggressive";
  type GuardianThresholdMap = { [k: number]: number };

  const thresholds: Record<ThresholdPolicy, GuardianThresholdMap> = {
    conservative: { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3 },
    balanced: { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3 },
    aggressive: { 1: 1, 2: 2, 3: 2, 4: 2, 5: 3 },
  };

  const policyThresholds = thresholds[policy];
  const configuredThreshold = policyThresholds[guardianCount];

  const threshold =
    configuredThreshold !== undefined
      ? configuredThreshold
      : Math.ceil(guardianCount * 0.66);

  return { threshold, total: guardianCount };
}

/**
 * Hash federation data for operation signing
 *
 * Used for deterministic hashing of federation parameters
 * for FROST signing and steward approval workflows
 *
 * @param federationDuid - Federation DUID
 * @returns Promise<string> - SHA-256 hash as hex string
 */
export async function hashFederationData(
  federationDuid: string
): Promise<string> {
  return sha256Hex(federationDuid);
}

/**
 * Map npub to user_duid from user_identities table
 *
 * Queries the user_identities table to find the user_duid (id) for a given npub.
 * Used during member invitation to map Nostr public keys to system user identifiers.
 *
 * @param npub - Nostr public key (npub format)
 * @param supabaseClient - Supabase client instance
 * @returns Promise<string> - User DUID (id from user_identities)
 * @throws Error if user not found or query fails
 */
export async function mapNpubToUserDuid(
  npub: string,
  supabaseClient: any
): Promise<string> {
  if (!npub || npub.trim().length === 0) {
    throw new Error("npub is required");
  }

  try {
    const { data, error } = await supabaseClient
      .from("user_identities")
      .select("id")
      .eq("npub", npub.trim())
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new Error(`User not found for npub: ${npub}`);
      }
      throw new Error(`Database query failed: ${error.message}`);
    }

    if (!data || !data.id) {
      throw new Error(`Invalid user data returned for npub: ${npub}`);
    }

    return data.id;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to map npub to user_duid: ${String(error)}`);
  }
}

/**
 * Batch map multiple npubs to user_duids
 *
 * Maps multiple npubs to their corresponding user_duids in a single operation.
 * Useful for processing multiple family members at once.
 *
 * @param npubs - Array of Nostr public keys
 * @param supabaseClient - Supabase client instance
 * @returns Promise<Map<string, string>> - Map of npub to user_duid
 */
export async function batchMapNpubsToUserDuids(
  npubs: string[],
  supabaseClient: any
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const errors: Array<{ npub: string; error: string }> = [];

  for (const npub of npubs) {
    try {
      const userDuid = await mapNpubToUserDuid(npub, supabaseClient);
      result.set(npub, userDuid);
    } catch (error) {
      errors.push({
        npub,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (errors.length > 0) {
    const errorMessages = errors.map((e) => `${e.npub}: ${e.error}`).join("; ");
    throw new Error(`Failed to map some npubs: ${errorMessages}`);
  }

  return result;
}
