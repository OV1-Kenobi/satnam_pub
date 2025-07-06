// netlify/functions/supabase.ts
import { createClient } from "@supabase/supabase-js";

// Browser-compatible Supabase configuration for Netlify Functions
// Following Master Context: "Store secrets in Supabase Vault, NOT .env files"
const supabaseUrl = 'https://rhfqfftkizyengcuhuvq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoZnFmZnRraXp5ZW5nY3VodXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3NjA1ODQsImV4cCI6MjA2NTMzNjU4NH0.T9UoL9ozgIzpqDBrY9qefq4V9bCbbenYkO5bTRrdhQE';

// Create Supabase client with anon key for browser-compatible operations
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    storageKey: "citadel-auth",
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