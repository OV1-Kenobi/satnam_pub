/**
 * Platform Admin Configuration Loader
 *
 * Loads and validates platform admin NPUBs and NIP-05s from environment variables.
 * Pre-computes DUIDs at startup for O(1) lookup during authorization checks.
 *
 * Environment Variables:
 *   PLATFORM_ADMIN_NPUBS - Comma-separated list of admin npubs
 *   PLATFORM_ADMIN_NIP05S - Comma-separated list of admin NIP-05 identifiers
 *
 * Security:
 *   - DUIDs are computed server-side using DUID_SERVER_SECRET
 *   - No plaintext NIP-05s are stored after DUID computation
 *   - Singleton pattern ensures consistent config across requests
 */

import crypto from "node:crypto";
import { getEnvVar, getDuidServerSecret } from "../utils/env.js";

// ============================================================================
// Types
// ============================================================================

export interface PlatformAdminConfig {
  /** Original npub identifiers (for display/audit only) */
  npubs: string[];
  /** Pre-computed NIP-05 DUIDs for O(1) lookup */
  nip05Duids: string[];
  /** Pre-computed npub DUIDs for O(1) lookup */
  npubDuids: string[];
  /** Combined set of all admin DUIDs for fast lookup */
  allAdminDuids: Set<string>;
  /** Timestamp when config was loaded */
  loadedAt: Date;
  /** Whether config has been validated */
  validated: boolean;
}

// ============================================================================
// DUID Generation (matches lib/security/duid-generator.js)
// ============================================================================

/**
 * Generate DUID from NIP-05 identifier using HMAC-SHA256
 * Must match the canonical implementation in lib/security/duid-generator.js
 */
function generateDUIDFromNIP05(nip05: string, secret: string): string {
  if (!nip05 || typeof nip05 !== "string" || !nip05.includes("@")) {
    throw new Error(`Invalid NIP-05 format: ${nip05}`);
  }

  const identifier = nip05.trim().toLowerCase();
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(identifier);
  return hmac.digest("hex");
}

/**
 * Generate DUID from npub using HMAC-SHA256
 * Uses 'npub:' prefix to namespace from NIP-05 DUIDs
 */
function generateDUIDFromNpub(npub: string, secret: string): string {
  if (!npub || !npub.startsWith("npub1")) {
    throw new Error(`Invalid npub format: ${npub}`);
  }

  const identifier = `npub:${npub.trim().toLowerCase()}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(identifier);
  return hmac.digest("hex");
}

// ============================================================================
// Singleton Config Instance
// ============================================================================

let cachedConfig: PlatformAdminConfig | null = null;

/**
 * Load platform admin configuration from environment variables
 * Caches the result for subsequent calls (singleton pattern)
 *
 * @returns PlatformAdminConfig with pre-computed DUIDs
 * @throws Error if DUID_SERVER_SECRET is not configured
 */
export function loadPlatformAdminConfig(): PlatformAdminConfig {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  const secret = getDuidServerSecret();

  // Parse comma-separated environment variables
  const npubsRaw = getEnvVar("PLATFORM_ADMIN_NPUBS") || "";
  const nip05sRaw = getEnvVar("PLATFORM_ADMIN_NIP05S") || "";

  const npubs = npubsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const nip05s = nip05sRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Pre-compute DUIDs for O(1) lookup
  const npubDuids: string[] = [];
  const nip05Duids: string[] = [];

  // Only compute DUIDs if secret is available
  if (secret) {
    for (const npub of npubs) {
      try {
        npubDuids.push(generateDUIDFromNpub(npub, secret));
      } catch (error) {
        console.warn(
          `[PlatformAdmin] Invalid npub skipped: ${npub.substring(0, 10)}...`
        );
      }
    }

    for (const nip05 of nip05s) {
      try {
        nip05Duids.push(generateDUIDFromNIP05(nip05, secret));
      } catch (error) {
        console.warn(
          `[PlatformAdmin] Invalid NIP-05 skipped: ${nip05.split("@")[0]}@...`
        );
      }
    }
  } else {
    console.warn(
      "[PlatformAdmin] DUID_SERVER_SECRET not configured, admin DUIDs not computed"
    );
  }

  // Create combined lookup set
  const allAdminDuids = new Set([...npubDuids, ...nip05Duids]);

  cachedConfig = {
    npubs,
    nip05Duids,
    npubDuids,
    allAdminDuids,
    loadedAt: new Date(),
    validated: true,
  };

  console.log(
    `[PlatformAdmin] Loaded config: ${npubs.length} npubs, ${nip05s.length} NIP-05s, ${allAdminDuids.size} total admin DUIDs`
  );

  return cachedConfig;
}

/**
 * Check if a user DUID is a platform admin
 * @param userDuid - The user's DUID to check
 * @returns true if the user is a platform admin
 */
export function isPlatformAdmin(userDuid: string): boolean {
  const config = loadPlatformAdminConfig();
  return config.allAdminDuids.has(userDuid);
}

/**
 * Clear cached config (useful for testing or config reload)
 */
export function clearPlatformAdminConfigCache(): void {
  cachedConfig = null;
}
