/**
 * Netlify Functions (Node.js) environment variable access
 * Server-side: ALWAYS use process.env, never import.meta.env
 */
function getEnvVar(key: string): string | undefined {
  return process.env[key];
}

/**
 * Server-side Supabase client for migrations and scripts
 * DEPRECATED: Use the singleton client from src/lib/supabase.ts instead
 * This file is kept only for legacy migration script compatibility
 */

import { createClient } from "@supabase/supabase-js";

// Fallback to development values if not set
const defaultUrl = "https://your-project.supabase.co";
const defaultKey = "your-anon-key";

// True lazy getters - compute on first access only
let _cachedUrl: string | null = null;
let _cachedKey: string | null = null;

function getFinalUrl(): string {
  if (_cachedUrl === null) {
    _cachedUrl =
      getEnvVar("VITE_SUPABASE_URL") || getEnvVar("SUPABASE_URL") || defaultUrl;
  }
  return _cachedUrl;
}

function getFinalKey(): string {
  if (_cachedKey === null) {
    _cachedKey =
      getEnvVar("VITE_SUPABASE_ANON_KEY") ||
      getEnvVar("SUPABASE_ANON_KEY") ||
      defaultKey;
  }
  return _cachedKey;
}

// Lazy singleton for the Supabase client
let _supabaseClient: ReturnType<typeof createClient> | null = null;
let _loggedDeprecation = false;

function logDeprecationWarning(): void {
  if (_loggedDeprecation) return;
  _loggedDeprecation = true;
  const url = getFinalUrl();
  const key = getFinalKey();
  console.log("⚠️  DEPRECATED: Using lib/supabase-server.ts");
  console.log("   Consider migrating to src/lib/supabase.ts singleton");
  console.log(`   URL: ${url}`);
  console.log(`   Key: ${key ? key.substring(0, 20) + "..." : "not set"}`);
}

function getSupabaseClient(): ReturnType<typeof createClient> {
  if (_supabaseClient === null) {
    logDeprecationWarning();
    _supabaseClient = createClient(getFinalUrl(), getFinalKey(), {
      auth: {
        persistSession: false, // Server-side doesn't need session persistence
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          "x-client-info": "satnam-migration-tools@1.0.0",
          "x-deprecated": "true",
        },
      },
    });
  }
  return _supabaseClient;
}

// Export as a getter proxy for backward compatibility
// This defers client creation until first property access
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    return (getSupabaseClient() as any)[prop];
  },
});

// Test connection function
export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  error?: string;
  info?: any;
}> {
  try {
    console.log("🔍 Testing Supabase connection...");

    // Try a simple query that should work with any Supabase instance
    const { data, error } = await supabase
      .from("information_schema.tables")
      .select("table_name")
      .limit(1);

    if (error) {
      return {
        connected: false,
        error: error.message,
      };
    }

    return {
      connected: true,
      info: {
        url: getFinalUrl(),
        tablesAccessible: data?.length > 0,
      },
    };
  } catch (error) {
    return {
      connected: false,
      error:
        error instanceof Error ? error.message : "Unknown connection error",
    };
  }
}

// Mock functions for when Supabase is not available
export const mockSupabaseOperations = {
  async checkEnumExists(enumName: string) {
    console.log(`🔧 Mock: Checking if enum ${enumName} exists`);
    return { data: true, error: null };
  },

  async checkTableExists(tableName: string) {
    console.log(`🔧 Mock: Checking if table ${tableName} exists`);
    return { data: true, error: null };
  },

  async logPrivacyOperation(params: any) {
    console.log(`🔧 Mock: Logging privacy operation:`, params);
    return { data: "mock_audit_id", error: null };
  },

  async createGuardianApproval(params: any) {
    console.log(`🔧 Mock: Creating guardian approval:`, params);
    return {
      data: {
        approvalId: "mock_approval_id",
        status: "pending",
        requiredSignatures: 2,
        currentSignatures: 0,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      error: null,
    };
  },
};

// Lazy check for mocked Supabase - computed on first access
let _isSupabaseMockedCached: boolean | null = null;

export function isSupabaseMocked(): boolean {
  if (_isSupabaseMockedCached === null) {
    _isSupabaseMockedCached =
      getFinalUrl() === defaultUrl || getFinalKey() === defaultKey;
    if (_isSupabaseMockedCached) {
      console.log(
        "⚠️  Using mock Supabase operations (no real database connection)"
      );
      console.log(
        "   Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables for real database access"
      );
    }
  }
  return _isSupabaseMockedCached;
}
