import { createClient } from "@supabase/supabase-js";
import { vault } from "./vault";

// Browser-compatible Supabase client using Supabase Vault
// NO process.env usage - all credentials from Supabase Vault

// Get credentials from Supabase Vault
const getVaultCredentials = async () => {
  return await vault.getSupabaseCredentials();
};

// Create client with Vault credentials
export const createSupabaseClient = async () => {
  const credentials = await getVaultCredentials();

  if (!credentials.url || !credentials.anonKey) {
    throw new Error("Supabase Vault credentials not available");
  }

  return createClient(credentials.url, credentials.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
};

// DEPRECATED: Use src/lib/supabase.ts instead
// This file is kept for backward compatibility only
// All new code should import from src/lib/supabase.ts

// Re-export the main client to prevent breaking changes
export {
  CitadelDatabase,
  supabase as default,
  supabase,
} from "../src/lib/supabase";
