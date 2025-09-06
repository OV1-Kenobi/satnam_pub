/**
 * Supabase client for Netlify Functions (server-only)
 *
 * IMPORTANT: Do not import the browser client here. Functions run outside Vite and
 * require direct access to process.env at runtime. This module creates a dedicated
 * Supabase client using Node environment variables that Netlify provides.
 */

import { createClient } from "@supabase/supabase-js";

function requireEnv(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

// Allow both SUPABASE_* (functions) and VITE_SUPABASE_* (if configured) names
// PRODUCTION SECURITY: ANON KEY ONLY with custom JWT authentication (SecureSessionManager)
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY          // REQUIRED: Use anon key only
  || process.env.VITE_SUPABASE_ANON_KEY;                   // Maintains zero-knowledge architecture

const supabaseKeyType = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  ? 'anon'
  : 'missing';

if (!supabaseUrl) {
  throw new Error("Supabase URL not configured (SUPABASE_URL or VITE_SUPABASE_URL)");
}
if (!supabaseKey) {
  throw new Error("Supabase key not configured (SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY, fallback SUPABASE_SERVICE_ROLE_KEY)");
}

console.log(`🔐 DEBUG: Supabase server client using ${supabaseKeyType} key`);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Create a per-request client with Authorization header for RLS
function getRequestClient(accessToken) {
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  });
}

// Always returns false in anon-key-only architecture
const isServiceRoleKey = () => false;

export { getRequestClient, isServiceRoleKey, supabase, supabaseKeyType };

