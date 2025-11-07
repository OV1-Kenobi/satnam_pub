/**
 * Integration Test Setup
 * Shared utilities for real integration tests with actual Supabase database
 * and Netlify Functions
 *
 * This file provides:
 * - Real Supabase client configuration
 * - Database seeding and cleanup utilities
 * - Test data factories
 * - Authentication helpers
 * - Netlify Functions API helpers
 */

import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Netlify Functions configuration
const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:8888";
const TAPSIGNER_ENDPOINT = `${API_BASE_URL}/.netlify/functions/tapsigner-unified`;

export let serverAvailable = false;

// Environment variable helper
function getEnvVar(key: string): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }
  return undefined;
}

// Test Supabase client configuration
const SUPABASE_URL = getEnvVar("VITE_SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = getEnvVar("VITE_SUPABASE_ANON_KEY") || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("⚠️  Missing Supabase credentials. Integration tests may fail.");
  console.warn(
    "   Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables."
  );
}

// Singleton Supabase client for tests
let testSupabaseClient: SupabaseClient | null = null;

export function getTestSupabaseClient(): SupabaseClient {
  if (!testSupabaseClient) {
    testSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return testSupabaseClient;
}

// Test data factories
export const TestDataFactory = {
  /**
   * Generate a test keypair for Nostr/PKARR
   */
  generateKeypair() {
    const privateKey = ed25519.utils.randomSecretKey();
    const publicKey = ed25519.getPublicKey(privateKey);
    return {
      privateKey,
      publicKey,
      privateKeyHex: bytesToHex(privateKey),
      publicKeyHex: bytesToHex(publicKey),
    };
  },

  /**
   * Generate test user identity data
   */
  generateUserIdentity(overrides: Partial<any> = {}) {
    const keypair = this.generateKeypair();
    const timestamp = Date.now();

    return {
      npub: `npub1${keypair.publicKeyHex.slice(0, 58)}`,
      pubkey: keypair.publicKeyHex,
      username: `testuser_${timestamp}`,
      nip05: `testuser_${timestamp}@my.satnam.pub`,
      created_at: new Date().toISOString(),
      ...overrides,
    };
  },

  /**
   * Generate test PKARR record
   */
  generatePkarrRecord(publicKeyHex: string, overrides: Partial<any> = {}) {
    return {
      public_key: publicKeyHex,
      sequence: 1,
      timestamp: Math.floor(Date.now() / 1000),
      dns_records: [
        {
          name: "_nostr",
          type: "TXT",
          value: publicKeyHex,
          ttl: 3600,
        },
      ],
      relay_urls: ["https://pkarr.relay.pubky.tech"],
      last_published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  },

  /**
   * Generate test Iroh node data
   */
  generateIrohNode(overrides: Partial<any> = {}) {
    const timestamp = Date.now();
    return {
      node_id: `iroh_${timestamp}_${Math.random().toString(36).slice(2, 11)}`,
      public_key: this.generateKeypair().publicKeyHex,
      relay_url: "https://iroh.relay.example.com",
      last_seen: Date.now(),
      status: "active",
      created_at: new Date().toISOString(),
      ...overrides,
    };
  },

  /**
   * Generate test encrypted contact
   */
  generateEncryptedContact(userDuid: string, overrides: Partial<any> = {}) {
    const timestamp = Date.now();
    return {
      user_duid: userDuid,
      contact_hash: `contact_hash_${timestamp}`,
      encrypted_npub: `encrypted_npub_${timestamp}`,
      encrypted_name: `encrypted_name_${timestamp}`,
      verification_level: "unverified",
      pkarr_verified: false,
      iroh_verified: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  },
};

// Database cleanup utilities
export const DatabaseCleanup = {
  /**
   * Clean up all test data from PKARR tables
   */
  async cleanupPkarrData(supabase: SupabaseClient) {
    try {
      // Delete test PKARR records (those created in the last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      await supabase
        .from("pkarr_records")
        .delete()
        .gte("created_at", oneHourAgo);

      await supabase
        .from("pkarr_publish_history")
        .delete()
        .gte("published_at", oneHourAgo);

      console.log("✅ PKARR test data cleaned up");
    } catch (error) {
      console.error("❌ PKARR cleanup failed:", error);
    }
  },

  /**
   * Clean up test user identities
   */
  async cleanupUserIdentities(supabase: SupabaseClient) {
    try {
      // Delete test users (those with username starting with 'testuser_')
      await supabase
        .from("user_identities")
        .delete()
        .like("username", "testuser_%");

      console.log("✅ User identity test data cleaned up");
    } catch (error) {
      console.error("❌ User identity cleanup failed:", error);
    }
  },

  /**
   * Clean up test Iroh nodes
   */
  async cleanupIrohNodes(supabase: SupabaseClient) {
    try {
      // Delete test Iroh nodes (those with node_id starting with 'iroh_')
      await supabase.from("iroh_nodes").delete().like("node_id", "iroh_%");

      console.log("✅ Iroh node test data cleaned up");
    } catch (error) {
      console.error("❌ Iroh node cleanup failed:", error);
    }
  },

  /**
   * Clean up test encrypted contacts
   */
  async cleanupEncryptedContacts(supabase: SupabaseClient) {
    try {
      // Delete test contacts (those with contact_hash starting with 'contact_hash_')
      await supabase
        .from("encrypted_contacts")
        .delete()
        .like("contact_hash", "contact_hash_%");

      console.log("✅ Encrypted contact test data cleaned up");
    } catch (error) {
      console.error("❌ Encrypted contact cleanup failed:", error);
    }
  },

  /**
   * Clean up all test data
   */
  async cleanupAll(supabase: SupabaseClient) {
    await this.cleanupPkarrData(supabase);
    await this.cleanupUserIdentities(supabase);
    await this.cleanupIrohNodes(supabase);
    await this.cleanupEncryptedContacts(supabase);
  },
};

// Database seeding utilities
export const DatabaseSeeding = {
  /**
   * Seed a test user identity
   */
  async seedUserIdentity(supabase: SupabaseClient, userData?: Partial<any>) {
    const identity = TestDataFactory.generateUserIdentity(userData);

    const { data, error } = await supabase
      .from("user_identities")
      .insert(identity)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to seed user identity: ${error.message}`);
    }

    return data;
  },

  /**
   * Seed a test PKARR record
   */
  async seedPkarrRecord(
    supabase: SupabaseClient,
    publicKeyHex: string,
    recordData?: Partial<any>
  ) {
    const record = TestDataFactory.generatePkarrRecord(
      publicKeyHex,
      recordData
    );

    const { data, error } = await supabase
      .from("pkarr_records")
      .insert(record)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to seed PKARR record: ${error.message}`);
    }

    return data;
  },

  /**
   * Seed a test Iroh node
   */
  async seedIrohNode(supabase: SupabaseClient, nodeData?: Partial<any>) {
    const node = TestDataFactory.generateIrohNode(nodeData);

    const { data, error } = await supabase
      .from("iroh_nodes")
      .insert(node)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to seed Iroh node: ${error.message}`);
    }

    return data;
  },
};

// Test lifecycle hooks
export const TestLifecycle = {
  /**
   * Setup before each test
   */
  async beforeEach() {
    const supabase = getTestSupabaseClient();
    // Optionally clean up before each test
    // await DatabaseCleanup.cleanupAll(supabase);
  },

  /**
   * Cleanup after each test
   */
  async afterEach() {
    const supabase = getTestSupabaseClient();
    await DatabaseCleanup.cleanupAll(supabase);
  },

  /**
   * Setup before all tests
   */
  async beforeAll() {
    const supabase = getTestSupabaseClient();

    // Verify database connection
    try {
      const { error } = await supabase
        .from("user_identities")
        .select("id")
        .limit(1);

      if (error && error.code !== "PGRST116") {
        throw new Error(`Database connection failed: ${error.message}`);
      }

      console.log("✅ Integration test database connection verified");
    } catch (error) {
      console.error("❌ Integration test setup failed:", error);
      throw error;
    }
  },

  /**
   * Cleanup after all tests
   */
  async afterAll() {
    const supabase = getTestSupabaseClient();
    await DatabaseCleanup.cleanupAll(supabase);
  },
};

// ============================================================================
// Netlify Functions Integration Helpers
// ============================================================================

/**
 * Check if Netlify Functions server is available
 */
export async function checkNetlifyServerAvailability(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(TAPSIGNER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status" }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    serverAvailable = response.status !== undefined;
    return serverAvailable;
  } catch (error) {
    serverAvailable = false;
    return false;
  }
}

/**
 * Create test JWT token
 */
export function createTestJWT(): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  ).toString("base64");
  const payload = Buffer.from(
    JSON.stringify({
      sub: "test-user-123",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString("base64");
  const signature = "test-signature";

  return `${header}.${payload}.${signature}`;
}

/**
 * Make authenticated API call to Tapsigner endpoint
 */
export async function makeAuthenticatedCall(
  action: string,
  payload: any = {}
): Promise<Response> {
  const token = createTestJWT();

  return fetch(TAPSIGNER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action,
      ...payload,
    }),
  });
}

/**
 * Test helper: Register card
 */
export async function testRegisterCard(
  cardId: string = "a1b2c3d4e5f6a7b8",
  publicKey: string = "a".repeat(64)
): Promise<Response> {
  return makeAuthenticatedCall("register", {
    cardId,
    publicKey,
    familyRole: "private",
  });
}

/**
 * Test helper: Verify card
 */
export async function testVerifyCard(
  cardId: string = "a1b2c3d4e5f6a7b8",
  signature: string = "a".repeat(128),
  challenge: string = "test-challenge"
): Promise<Response> {
  return makeAuthenticatedCall("verify", {
    cardId,
    signature,
    challenge,
  });
}

/**
 * Test helper: Sign event
 */
export async function testSignEvent(
  cardId: string = "a1b2c3d4e5f6a7b8",
  event: any = {
    kind: 1,
    content: "Test message",
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
  }
): Promise<Response> {
  return makeAuthenticatedCall("sign", {
    cardId,
    event,
  });
}

/**
 * Test helper: Link wallet
 */
export async function testLinkWallet(
  cardId: string = "a1b2c3d4e5f6a7b8",
  walletId: string = "test-wallet-123",
  spendLimit: number = 100000
): Promise<Response> {
  return makeAuthenticatedCall("lnbits-link", {
    cardId,
    walletId,
    spendLimit,
  });
}

/**
 * Test helper: Get card status
 */
export async function testGetCardStatus(
  cardId: string = "a1b2c3d4e5f6a7b8"
): Promise<Response> {
  return makeAuthenticatedCall("status", {
    cardId,
  });
}
