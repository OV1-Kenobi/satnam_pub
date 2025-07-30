/**
 * Supabase client for Netlify Functions
 * MASTER CONTEXT COMPLIANCE: Direct JavaScript implementation for browser-only serverless architecture
 *
 * This file provides the actual Supabase client implementation instead of re-exporting from TypeScript
 * to avoid circular dependencies and module resolution issues in Netlify Functions.
 */

import { createClient } from "@supabase/supabase-js";

// Browser-compatible Supabase configuration for Netlify Functions
// Following Master Context: "Store secrets in Supabase Vault, NOT .env files"
const supabaseUrl = "https://rhfqfftkizyengcuhuvq.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoZnFmZnRraXp5ZW5nY3VodXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3NjA1ODQsImV4cCI6MjA2NTMzNjU4NH0.T9UoL9ozgIzpqDBrY9qefq4V9bCbbenYkO5bTRrdhQE";

// Create Supabase client with anon key for browser-compatible operations
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    storageKey: "citadel-functions-auth",
  },
  global: {
    headers: {
      "x-client-info": "citadel-netlify-functions@1.0.0",
      "x-security-level": "browser-compatible",
    },
  },
});

// Export for compatibility with existing code
export default supabase;
