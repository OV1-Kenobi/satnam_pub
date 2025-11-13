// lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

// Browser-compatible Supabase configuration
// Following Master Context: "Store secrets in Supabase Vault, NOT .env files"
// Bootstrap credentials from environment - ONLY for accessing Vault

/**
 * Environment variable getter with browser and Netlify Function compatibility
 * CRITICAL: For browser code, use import.meta.env (Vite's native pattern)
 * For Netlify Functions, use process.env
 * @param {string} key - Environment variable key
 * @param {string} [defaultValue] - Default value if not found
 * @returns {string} Environment variable value
 */
function getEnvVar(key: string, defaultValue: string = ""): string {
  // PRIMARY: process.env (works for both Netlify Functions and Vite-defined injections)
  try {
    if (
      typeof process !== "undefined" &&
      (process as any).env &&
      typeof ((process as any).env as any)[key] !== "undefined"
    ) {
      return (((process as any).env as any)[key] as string) || defaultValue;
    }
  } catch {
    /* noop */
  }

  // SECONDARY: Removed import.meta usage - does NOT work in Netlify Functions
  // All environment values are injected into process.env via Vite define
  // and must be read from process.env only for shared code.

  // TERTIARY: global shim if provided at runtime
  try {
    if (typeof globalThis !== "undefined" && (globalThis as any).__APP_ENV__) {
      const v = (globalThis as any).__APP_ENV__[key];
      if (typeof v !== "undefined") return v as string;
    }
  } catch {
    /* noop */
  }

  return defaultValue;
}

const getSupabaseConfig = () => {
  // Bootstrap credentials for Vault access
  // These are the minimal credentials needed to access the Vault
  // All other sensitive credentials are stored in the Vault
  const url = getEnvVar("VITE_SUPABASE_URL");
  const key = getEnvVar("VITE_SUPABASE_ANON_KEY");

  // Debug environment variable access (without exposing sensitive data)
  console.log("🔍 Supabase Environment Check:", {
    hasUrl: !!url,
    hasKey: !!key,
    urlLength: url ? url.length : 0,
    keyLength: key ? key.length : 0,
    environment: typeof window !== "undefined" ? "browser" : "node",
    processEnvAvailable: typeof process !== "undefined" && !!process.env,
    processEnvHasViteVars:
      typeof process !== "undefined" && !!process.env?.VITE_SUPABASE_URL,
  });

  // Security validation - ensure we have bootstrap credentials
  if (!url || !key) {
    const errorDetails = {
      hasUrl: !!url,
      hasKey: !!key,
      environment: typeof window !== "undefined" ? "browser" : "node",
      availableEnvVars:
        typeof process !== "undefined" && process.env
          ? Object.keys(process.env).filter((k) => k.startsWith("VITE_"))
          : [],
    };

    console.error("❌ Supabase credentials missing:", errorDetails);

    // ALWAYS fail fast - credentials are REQUIRED for the app to function
    // This prevents silent failures and white screens in production
    throw new Error(
      "CRITICAL: Bootstrap Supabase credentials missing. " +
        "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables " +
        "to access the Vault system. " +
        `Environment: ${errorDetails.environment}, ` +
        `Available VITE_ vars: ${errorDetails.availableEnvVars.length}`
    );
  }

  return { url, key };
};

import type { SupabaseClient } from "@supabase/supabase-js";

const cfg = getSupabaseConfig();
const supabaseUrl = cfg.url;
const supabaseKey = cfg.key;

// Helper: determine environment
const isProd =
  typeof process !== "undefined" && process.env?.NODE_ENV === "production";

// Validate only when configured
if (typeof window !== "undefined" && supabaseUrl && supabaseKey) {
  // Validate that we don't have placeholder values
  if (
    supabaseUrl.includes("your-project-ref") ||
    supabaseKey.includes("your-anon-key")
  ) {
    throw new Error(
      "CRITICAL: Placeholder Supabase credentials detected. " +
        "Configure real bootstrap credentials in environment variables."
    );
  }

  // Validate URL format and security
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== "https:") {
      throw new Error(`SECURITY: Supabase URL must use HTTPS: ${supabaseUrl}`);
    }
  } catch {
    throw new Error(`CRITICAL: Invalid Supabase URL format: ${supabaseUrl}`);
  }

  // Validate key format (basic check for JWT structure)
  if (!supabaseKey.startsWith("eyJ")) {
    throw new Error(
      "CRITICAL: Supabase anon key appears to be invalid (not a JWT token)"
    );
  }
}

function createSupabaseStub(): SupabaseClient {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      const message =
        "Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.";
      // Fail fast in production, but in dev only when actually used
      if (isProd) throw new Error(message);
      console.error(
        "[SupabaseStub] Attempted access to property:",
        String(prop)
      );
      throw new Error(message);
    },
  };
  // Use 'as unknown as SupabaseClient' to bypass strict type checking
  // This is intentionally a stub that throws on property access
  // The Proxy pattern allows us to defer type validation until runtime
  return new Proxy({}, handler) as unknown as SupabaseClient;
}

// Create real client only when credentials are present; otherwise a stub that throws on use
export const supabase: SupabaseClient =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
          lock: async <R>(
            _name: string,
            _acquireTimeout: number,
            fn: () => Promise<R>
          ) => await fn(),
          storageKey: "citadel-auth",
        },
        global: {
          headers: {
            "x-client-info": "citadel-identity-forge@1.0.0",
            "x-security-level": "enhanced",
          },
        },
        db: { schema: "public" },
        realtime: {
          params: { eventsPerSecond: 10 },
          heartbeatIntervalMs: 30000,
          reconnectAfterMs: (tries: number) => Math.min(tries * 1000, 30000),
        },
      })
    : createSupabaseStub();

// Development helper function to set Supabase config
export function setSupabaseConfig(url: string, key: string) {
  if (typeof window !== "undefined") {
    const config = { url, key };
    localStorage.setItem("satnam_supabase_config", JSON.stringify(config));
    // Reload the page to apply new config
    window.location.reload();
  }
}

// Connection health monitoring
let connectionHealthCheck: ReturnType<typeof setInterval> | null = null;

export function startConnectionMonitoring() {
  if (connectionHealthCheck) return; // Already monitoring

  connectionHealthCheck = setInterval(async () => {
    try {
      // Lightweight health check - use privacy_users table instead of profiles
      await supabase
        .from("privacy_users")
        .select("hashed_uuid", { count: "exact", head: true });
    } catch (error) {
      console.error("🚨 Supabase connection health check failed:", error);
      // Could implement reconnection logic here
    }
  }, 60000); // Check every minute
}

export function stopConnectionMonitoring() {
  if (connectionHealthCheck) {
    clearInterval(connectionHealthCheck);
    connectionHealthCheck = null;
  }
}

// Lazy connection monitoring - only start when explicitly needed
let monitoringInitialized = false;

export function initializeConnectionMonitoring() {
  if (monitoringInitialized || typeof window === "undefined") return;

  monitoringInitialized = true;
  startConnectionMonitoring();

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    stopConnectionMonitoring();
  });
}

// Database service layer
export class CitadelDatabase {
  // Static methods for database operations

  static async query(sql: string, params?: any[]): Promise<any> {
    // Implementation for raw SQL queries
    return supabase.rpc("execute_sql", { query: sql, params });
  }

  static async from(table: string) {
    return supabase.from(table);
  }

  // Create privacy-first user profile
  static async createUserProfile(userData: {
    id: string; // UUID from Supabase auth.users
    auth_hash: string; // Non-reversible hash for verification
    username: string; // Platform username (not Nostr username)
    encrypted_profile?: string; // User-encrypted optional data
    encryption_hint?: string; // Hint for user's encryption method
    lightning_address?: string; // Optional, can be encrypted
    family_id?: string;
  }) {
    const { data, error } = await supabase
      .from("profiles")
      .insert(userData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Get family members
  static async getFamilyMembers(familyId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("family_id", familyId);

    if (error) throw error;
    return data;
  }

  // Store Nostr event reference
  static async storeNostrBackup(userId: string, eventId: string) {
    const { data, error } = await supabase.from("nostr_backups").insert({
      user_id: userId,
      event_id: eventId,
      relay_url: "wss://relay.citadel.academy",
    });

    if (error) throw error;
    return data;
  }

  // Create a family
  static async createFamily(familyData: {
    family_name: string;
    domain?: string;
    relay_url?: string;
    federation_id?: string;
  }) {
    const { data, error } = await supabase
      .from("families")
      .insert(familyData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Join a family
  static async joinFamily(userId: string, familyId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ family_id: familyId })
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Set up lightning address
  static async setupLightningAddress(addressData: {
    user_id: string;
    address: string;
    btcpay_store_id?: string;
    voltage_node_id?: string;
    active?: boolean;
  }) {
    // First deactivate existing addresses
    await supabase
      .from("lightning_addresses")
      .update({ active: false })
      .eq("user_id", addressData.user_id);

    // Create new active address
    const { data, error } = await supabase
      .from("lightning_addresses")
      .insert({ ...addressData, active: true })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Get complete user identity
  static async getUserIdentity(userId: string) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        `
        *,
        families(*),
        lightning_addresses(*),
        nostr_backups(*)
      `
      )
      .eq("id", userId)
      .single();

    if (profileError) throw profileError;
    return profile;
  }

  // Get user backups
  static async getUserBackups(userId: string) {
    const { data, error } = await supabase
      .from("nostr_backups")
      .select("*")
      .eq("user_id", userId);

    if (error) throw error;
    return data;
  }

  // Get user lightning data
  static async getUserLightning(userId: string) {
    const { data, error } = await supabase
      .from("lightning_addresses")
      .select("*")
      .eq("user_id", userId);

    if (error) throw error;
    return data;
  }

  // Store encrypted private key (SECURITY: Atomic operation)
  static async storeEncryptedPrivateKey(
    userId: string,
    encryptedPrivateKey: string,
    encryptionMethod: string
  ) {
    const { data, error } = await supabase
      .from("encrypted_keys")
      .insert({
        user_id: userId,
        encrypted_private_key: encryptedPrivateKey,
        encryption_method: encryptionMethod,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Get encrypted private key for recovery (SECURITY: Authenticated only)
  static async getEncryptedPrivateKey(userId: string) {
    const { data, error } = await supabase
      .from("encrypted_keys")
      .select("encrypted_private_key, encryption_method")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No data found
        return null;
      }
      throw error;
    }

    return {
      encrypted_key: data.encrypted_private_key,
      encryption_method: data.encryption_method,
    };
  }

  // Get user by username (for availability checking)
  static async getUserByUsername(username: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("username", username)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No data found - username is available
        return null;
      }
      throw error;
    }

    return data;
  }

  // Update lightning address with external service IDs (SECURITY: Atomic operation)
  static async updateLightningServiceIds(
    userId: string,
    updates: {
      btcpay_store_id?: string;
      voltage_node_id?: string;
      encrypted_btcpay_config?: string;
      encrypted_voltage_config?: string;
      last_sync_at?: string;
    }
  ) {
    const { data, error } = await supabase
      .from("lightning_addresses")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("active", true)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Atomic lightning setup with rollback capability
  static async atomicLightningSetup(lightningData: {
    user_id: string;
    address: string;
    btcpay_store_id?: string;
    voltage_node_id?: string;
    encrypted_btcpay_config?: string;
    encrypted_voltage_config?: string;
    active?: boolean;
  }) {
    // Use Supabase RPC for atomic transaction
    const { data, error } = await supabase.rpc("setup_lightning_atomic", {
      p_user_id: lightningData.user_id,
      p_address: lightningData.address,
      p_btcpay_store_id: lightningData.btcpay_store_id,
      p_voltage_node_id: lightningData.voltage_node_id,
      p_encrypted_btcpay_config: lightningData.encrypted_btcpay_config,
      p_encrypted_voltage_config: lightningData.encrypted_voltage_config,
      p_active: lightningData.active ?? true,
    });

    if (error) throw error;
    return data;
  }

  // Get lightning address record for updates
  static async getLightningAddress(userId: string) {
    const { data, error } = await supabase
      .from("lightning_addresses")
      .select("*")
      .eq("user_id", userId)
      .eq("active", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }
    return data;
  }

  // Validate NIP-05 and Lightning address consistency
  static async validateIdentifierConsistency(userId: string): Promise<{
    isConsistent: boolean;
    nip05_identifier?: string;
    lightning_address?: string;
    username?: string;
    issues: string[];
  }> {
    try {
      // Get user profile
      const profile = await this.getUserIdentity(userId);
      if (!profile) {
        return {
          isConsistent: false,
          issues: ["User profile not found"],
        };
      }

      const issues: string[] = [];
      const username = profile.username;
      const expectedIdentifier = `${username}@${getEnvVar(
        "VITE_LIGHTNING_DOMAIN",
        "satnam.pub"
      )}`;

      // Check Lightning address
      const lightningAddress = profile.lightning_addresses?.[0]?.address;
      if (lightningAddress && lightningAddress !== expectedIdentifier) {
        issues.push(
          `Lightning address mismatch: expected ${expectedIdentifier}, got ${lightningAddress}`
        );
      }

      // TODO: Check NIP-05 record when available
      // const nip05Record = await getNip05RecordsByUserId(userId);

      return {
        isConsistent: issues.length === 0,
        nip05_identifier: expectedIdentifier,
        lightning_address: lightningAddress,
        username: username,
        issues,
      };
    } catch (error) {
      return {
        isConsistent: false,
        issues: [
          `Validation error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ],
      };
    }
  }

  // Fix inconsistent identifiers
  static async fixIdentifierConsistency(userId: string): Promise<{
    success: boolean;
    fixed_issues: string[];
    error?: string;
  }> {
    try {
      const validation = await this.validateIdentifierConsistency(userId);

      if (validation.isConsistent) {
        return {
          success: true,
          fixed_issues: ["No issues found - identifiers are consistent"],
        };
      }

      const fixedIssues: string[] = [];

      // Get user profile for username
      const profile = await this.getUserIdentity(userId);
      if (!profile) {
        throw new Error("User profile not found");
      }

      const correctIdentifier = `${profile.username}@${
        (typeof process !== "undefined" &&
          process.env?.VITE_LIGHTNING_DOMAIN) ||
        "satnam.pub"
      }`;

      // Fix Lightning address if inconsistent
      const lightningAddress = profile.lightning_addresses?.[0];
      if (lightningAddress && lightningAddress.address !== correctIdentifier) {
        await this.updateLightningServiceIds(userId, {
          // Update the address to be consistent
        });

        // Actually, we need to update the address field itself
        const { error } = await supabase
          .from("lightning_addresses")
          .update({
            address: correctIdentifier,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .eq("active", true);

        if (error) throw error;

        fixedIssues.push(`Updated Lightning address to: ${correctIdentifier}`);
      }

      return {
        success: true,
        fixed_issues: fixedIssues,
      };
    } catch (error) {
      return {
        success: false,
        fixed_issues: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
