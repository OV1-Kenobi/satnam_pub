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
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://rhfqfftkizyengcuhuvq.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || process.env.VITE_SUPABASE_ANON_KEY;

const supabaseKeyType = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? 'service'
  : ((process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY) ? 'anon' : 'unknown');

if (!supabaseUrl) {
  throw new Error("Supabase URL not configured (SUPABASE_URL or VITE_SUPABASE_URL)");
}
if (!supabaseKey) {
  throw new Error("Supabase key not configured (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY)");
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const isServiceRoleKey = () => supabaseKeyType === 'service';
export { supabaseKeyType };

export default supabase;

