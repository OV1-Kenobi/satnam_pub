// NIP-SKL Skill Manifest Fetching and Validation
// Implements: fetch kind 33400 from relays, verify signature, parse content, cache with TTL
// Aligned with docs/planning/NIP-Triumvirate-Satnam-Integration-Plan.md §5.1

import type { SkillManifest, NostrEvent } from "../../../types/nip-skl";
import { verifyEvent } from "nostr-tools";

/**
 * Fetch a skill manifest from Nostr relays
 * @param skillScopeId - Canonical skill address: "33400:<pubkey>:<d-tag>:<version>"
 * @param relayUrls - Array of relay URLs to query
 * @returns SkillManifest or null if not found
 */
export async function fetchSkillManifest(
  skillScopeId: string,
  relayUrls: string[],
): Promise<SkillManifest | null> {
  // Parse skillScopeId to extract pubkey and d-tag
  const parts = skillScopeId.split(":");
  if (parts.length < 3 || parts[0] !== "33400") {
    throw new Error(`Invalid skillScopeId format: ${skillScopeId}`);
  }

  const [, pubkey, dTag] = parts;

  // TODO: Implement relay subscription using nostr-tools
  // For now, return null (stub)
  // Real implementation would:
  // 1. Connect to relays
  // 2. Subscribe to filter: { kinds: [33400], authors: [pubkey], "#d": [dTag] }
  // 3. Wait for event
  // 4. Verify signature
  // 5. Parse and return

  console.warn(
    `fetchSkillManifest stub: would fetch ${skillScopeId} from relays`,
    relayUrls,
  );
  return null;
}

/**
 * Validate a skill manifest event
 * @param event - Nostr event (kind 33400)
 * @returns true if valid, false otherwise
 */
export function validateManifest(event: NostrEvent): boolean {
  // 1. Verify event kind
  if (event.kind !== 33400) {
    return false;
  }

  // 2. Verify event signature using nostr-tools
  if (!verifyEvent(event)) {
    return false;
  }

  // 3. Verify required tags present
  const dTag = event.tags.find((t) => t[0] === "d");
  const nameTag = event.tags.find((t) => t[0] === "name");
  const versionTag = event.tags.find((t) => t[0] === "version");

  if (!dTag || !nameTag || !versionTag) {
    return false;
  }

  // 4. Verify version is semver-like (basic check)
  const version = versionTag[1];
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    return false;
  }

  return true;
}

/**
 * Parse manifest content from a validated kind 33400 event
 * @param event - Nostr event (kind 33400)
 * @returns SkillManifest
 */
export function parseManifestContent(event: NostrEvent): SkillManifest {
  const getTag = (name: string): string | undefined =>
    event.tags.find((t) => t[0] === name)?.[1];
  const getAllTags = (name: string): string[] =>
    event.tags.filter((t) => t[0] === name).map((t) => t[1]);

  const dTag = getTag("d") || "";
  const version = getTag("version") || "0.0.0";
  const skillScopeId =
    getTag("skillscopeid") || `33400:${event.pubkey}:${dTag}:${version}`;

  // Parse input/output schemas from content if present (JSON)
  let inputSchema: Record<string, unknown> = {};
  let outputSchema: Record<string, unknown> = {};
  try {
    const contentJson = JSON.parse(event.content || "{}");
    inputSchema = contentJson.inputSchema || {};
    outputSchema = contentJson.outputSchema || {};
  } catch {
    // Content is not JSON, use empty schemas
  }

  return {
    skillScopeId,
    version,
    name: getTag("name") || "",
    description: getTag("description") || event.content || "",
    inputSchema,
    outputSchema,
    runtimeConstraints: getAllTags("constraint"),
    attestations: [], // Populated separately by attestation-verifier.ts
    publisherPubkey: event.pubkey,
    manifestEventId: event.id,
    manifestHash: getTag("manifesthash"),
    capabilities: getAllTags("capability"),
    validUntilUnix: getTag("expiry")
      ? parseInt(getTag("expiry")!, 10)
      : undefined,
    relayHint: getTag("relay"),
    rawEvent: event,
  };
}

/**
 * Compute SHA-256 hash of skill payload bytes (for verification)
 * Uses Web Crypto API (browser-safe)
 * @param payloadBytes - Skill payload as Uint8Array
 * @returns Hex-encoded SHA-256 hash
 */
export async function computeManifestHash(
  payloadBytes: Uint8Array,
): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", payloadBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

/**
 * Verify manifest hash matches payload
 * @param manifest - SkillManifest with manifestHash
 * @param payloadBytes - Actual skill payload bytes
 * @returns true if hash matches
 */
export async function verifyManifestHash(
  manifest: SkillManifest,
  payloadBytes: Uint8Array,
): Promise<boolean> {
  if (!manifest.manifestHash) {
    return false;
  }
  const computedHash = await computeManifestHash(payloadBytes);
  return computedHash === manifest.manifestHash;
}
