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

// Server-side environment variables
const supabaseUrl = getEnvVar("VITE_SUPABASE_URL") || getEnvVar("SUPABASE_URL");
const supabaseKey =
  getEnvVar("VITE_SUPABASE_ANON_KEY") || getEnvVar("SUPABASE_ANON_KEY");

// Fallback to development values if not set
const defaultUrl = "https://your-project.supabase.co";
const defaultKey = "your-anon-key";

// For development/testing, use default values if env vars not set
const finalUrl = supabaseUrl || defaultUrl;
const finalKey = supabaseKey || defaultKey;

console.log("⚠️  DEPRECATED: Using lib/supabase-server.ts");
console.log("   Consider migrating to src/lib/supabase.ts singleton");
console.log(`   URL: ${finalUrl}`);
console.log(
  `   Key: ${finalKey ? finalKey.substring(0, 20) + "..." : "not set"}`
);

// Create server-side Supabase client (LEGACY - for migration scripts only)
export const supabase = createClient(finalUrl, finalKey, {
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
        url: finalUrl,
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

// Detect if we're in a testing/development environment without real Supabase
export const isSupabaseMocked =
  finalUrl === defaultUrl || finalKey === defaultKey;

if (isSupabaseMocked) {
  console.log(
    "⚠️  Using mock Supabase operations (no real database connection)"
  );
  console.log(
    "   Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables for real database access"
  );
}
