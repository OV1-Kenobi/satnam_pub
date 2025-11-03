/**
 * Real Database Setup for Integration Tests
 * Phase 2 Week 3: Real Integration Testing
 *
 * Provides helpers for creating and cleaning up real test data in Supabase
 * database. All operations use actual database queries (not mocks).
 *
 * Usage:
 * ```typescript
 * const testUser = await setupTestDatabase();
 * const attestation = await createRealAttestation(testUser.id);
 * // ... run tests ...
 * await cleanupTestDatabase(testUser.id);
 * ```
 */

import { createClient } from "@supabase/supabase-js";

// ============================================================================
// TYPES
// ============================================================================

export interface TestUser {
  id: string;
  username: string;
  npub: string;
  nip05: string;
}

export interface RealAttestation {
  id: string;
  attested_event_id: string;
  attested_event_kind: number;
  nip03_event_id: string;
  simpleproof_timestamp_id: string | null;
  ots_proof: string;
  bitcoin_block: number | null;
  bitcoin_tx: string | null;
  event_type: string;
  user_duid: string;
  relay_urls: string[];
  published_at: number;
  verified_at: number | null;
  metadata: Record<string, any>;
}

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

function getSupabaseClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase credentials: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required"
    );
  }

  return createClient(url, key);
}

// ============================================================================
// TEST USER SETUP
// ============================================================================

/**
 * Create a test user in user_identities table
 */
export async function setupTestDatabase(): Promise<TestUser> {
  const supabase = getSupabaseClient();
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);

  const testUser: TestUser = {
    id: `test-user-${timestamp}-${randomId}`,
    username: `testuser-${timestamp}`,
    npub: `npub1test${randomId}`,
    nip05: `testuser-${timestamp}@my.satnam.pub`,
  };

  const { data, error } = await supabase
    .from("user_identities")
    .insert({
      id: testUser.id,
      username: testUser.username,
      npub: testUser.npub,
      nip05: testUser.nip05,
      role: "private",
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`);
  }

  return testUser;
}

// ============================================================================
// ATTESTATION CREATION
// ============================================================================

/**
 * Create a real NIP-03 attestation record in database
 */
export async function createRealAttestation(
  userId: string,
  overrides?: Partial<RealAttestation>
): Promise<RealAttestation> {
  const supabase = getSupabaseClient();
  const timestamp = Math.floor(Date.now() / 1000);

  const attestation: Omit<RealAttestation, "id"> = {
    attested_event_id:
      overrides?.attested_event_id ||
      "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890",
    attested_event_kind: overrides?.attested_event_kind || 0,
    nip03_event_id:
      overrides?.nip03_event_id ||
      "b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890ab",
    simpleproof_timestamp_id: overrides?.simpleproof_timestamp_id || null,
    ots_proof:
      overrides?.ots_proof ||
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    bitcoin_block: overrides?.bitcoin_block || null,
    bitcoin_tx: overrides?.bitcoin_tx || null,
    event_type: overrides?.event_type || "identity_creation",
    user_duid: userId,
    relay_urls: overrides?.relay_urls || ["wss://relay.satnam.pub"],
    published_at: overrides?.published_at || timestamp,
    verified_at: overrides?.verified_at || null,
    metadata: overrides?.metadata || {
      nip05: `testuser@my.satnam.pub`,
      npub: `npub1test`,
      event_type: "identity_creation",
      relay_count: 1,
      published_relays: ["wss://relay.satnam.pub"],
    },
  };

  const { data, error } = await supabase
    .from("nip03_attestations")
    .insert(attestation)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create attestation: ${error.message}`);
  }

  return data as RealAttestation;
}

// ============================================================================
// ATTESTATION QUERIES
// ============================================================================

/**
 * Query attestation by ID from real database
 */
export async function queryAttestationById(
  attestationId: string
): Promise<RealAttestation | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("nip03_attestations")
    .select("*")
    .eq("id", attestationId)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to query attestation: ${error.message}`);
  }

  return data as RealAttestation | null;
}

/**
 * Query attestations by user ID from real database
 */
export async function queryAttestationsByUserId(
  userId: string
): Promise<RealAttestation[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("nip03_attestations")
    .select("*")
    .eq("user_duid", userId);

  if (error) {
    throw new Error(`Failed to query attestations: ${error.message}`);
  }

  return (data || []) as RealAttestation[];
}

/**
 * Query attestation by event ID from real database
 */
export async function queryAttestationByEventId(
  eventId: string
): Promise<RealAttestation | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("nip03_attestations")
    .select("*")
    .eq("nip03_event_id", eventId)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(
      `Failed to query attestation by event ID: ${error.message}`
    );
  }

  return data as RealAttestation | null;
}

// ============================================================================
// ATTESTATION UPDATES
// ============================================================================

/**
 * Update attestation with Bitcoin block info
 */
export async function updateAttestationBitcoinInfo(
  attestationId: string,
  bitcoinBlock: number,
  bitcoinTx: string
): Promise<RealAttestation> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("nip03_attestations")
    .update({
      bitcoin_block: bitcoinBlock,
      bitcoin_tx: bitcoinTx,
      verified_at: Math.floor(Date.now() / 1000),
    })
    .eq("id", attestationId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update attestation: ${error.message}`);
  }

  return data as RealAttestation;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up all test data for a user
 */
export async function cleanupTestDatabase(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const errors: string[] = [];

  // Delete attestations
  const { error: attestError } = await supabase
    .from("nip03_attestations")
    .delete()
    .eq("user_duid", userId);

  if (attestError) {
    errors.push(`Failed to delete attestations: ${attestError.message}`);
  }

  // Delete user
  const { error: userError } = await supabase
    .from("user_identities")
    .delete()
    .eq("id", userId);

  if (userError) {
    errors.push(`Failed to delete test user: ${userError.message}`);
  }

  if (errors.length > 0) {
    throw new Error(`Cleanup failed:\n${errors.join("\n")}`);
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Create multiple attestations for testing
 */
export async function createMultipleAttestations(
  userId: string,
  count: number
): Promise<RealAttestation[]> {
  const promises = Array.from({ length: count }, (_, i) =>
    createRealAttestation(userId, {
      nip03_event_id: `event${i}${"0".repeat(58)}`,
      attested_event_id: `attested${i}${"0".repeat(56)}`,
    })
  );

  return Promise.all(promises);
}
