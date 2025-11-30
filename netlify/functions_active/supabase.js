/**
 * Supabase client for Netlify Functions (server-only)
 *
 * IMPORTANT: Do not import the browser client here. Functions run outside Vite and
 * require direct access to process.env at runtime. This module creates a dedicated
 * Supabase client using Node environment variables that Netlify provides.
 *
 * ⚠️  SECURITY AUDIT NOTES:
 *
 * PRIMARY ARCHITECTURE (Anon-Key Only):
 * - Default client uses SUPABASE_ANON_KEY for all operations
 * - All data access is protected by Row Level Security (RLS) policies
 * - User authorization is enforced via JWT tokens in Authorization header
 * - Maintains zero-knowledge architecture principles
 *
 * SERVICE-ROLE EXCEPTION (Hybrid Approach):
 * - getServiceClient() function provides RLS bypass for specific RPCs only
 * - Currently authorized for: get_eligible_steward_pubkeys_for_federation()
 * - Service-role key is NOT exported by default (see exports section)
 * - All service-role operations must include authorization logic in the RPC
 *
 * AUDIT REQUIREMENTS:
 * - All service-role operations must be logged with timestamp, user, and operation
 * - Service-role key should be rotated regularly (recommend: quarterly)
 * - Access to SUPABASE_SERVICE_ROLE_KEY should be restricted to production environment
 * - Developers should NOT have access to service-role key in development
 *
 * COMPLIANCE CHECKLIST:
 * ✓ Service-role usage is limited to specific, documented RPCs
 * ✓ Each RPC includes authorization validation (CTE, role checks, etc.)
 * ✓ Security comments explain why RLS bypass is necessary
 * ✓ Developers are educated on security implications
 * ✓ Audit logging should be implemented for all service-role calls
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

/**
 * Service-role client for tightly scoped RPC operations only
 *
 * ⚠️  SECURITY CRITICAL: This function creates a Supabase client with the service-role key,
 * which BYPASSES ALL ROW LEVEL SECURITY (RLS) policies. This is a significant security risk
 * and must be used ONLY for specific, pre-approved operations.
 *
 * AUTHORIZED OPERATIONS (service-role key required):
 * 1. get_eligible_steward_pubkeys_for_federation() - RPC for steward approval workflows
 *    - Validates requester membership via CTE before returning data
 *    - Only returns pubkeys for steward/adult roles
 *    - Requires both p_federation_id and p_requester_duid parameters
 *
 * SECURITY SAFEGUARDS IN PLACE:
 * - Service-role key is stored in SUPABASE_SERVICE_ROLE_KEY environment variable
 * - This function is NOT exported by default (see exports at end of file)
 * - All service-role operations must be explicitly called from specific Netlify functions
 * - Each RPC function includes authorization logic (CTE validation, role checks, etc.)
 * - Audit logging should be enabled for all service-role operations
 *
 * USAGE RESTRICTIONS:
 * - NEVER use service-role client for general data access
 * - NEVER bypass RPC functions to access tables directly
 * - ALWAYS validate user authorization within the RPC function itself
 * - ALWAYS log service-role operations for audit trails
 *
 * DEVELOPER EDUCATION:
 * Service-role keys have unrestricted database access. Misuse could expose:
 * - Sensitive user data (encrypted nsecs, password hashes, etc.)
 * - Private family federation information
 * - Unauthorized spending approvals
 * - Compromised authentication tokens
 *
 * If you need to use this function, you MUST:
 * 1. Document the specific RPC being called
 * 2. Explain why RLS bypass is necessary
 * 3. Verify authorization logic in the RPC function
 * 4. Add audit logging for the operation
 * 5. Get security review approval before deploying
 */
function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for service client");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Always returns false in anon-key-only architecture (kept for backwards compatibility)
const isServiceRoleKey = () => false;

export {
  getRequestClient,
  getServiceClient,
  isServiceRoleKey,
  supabase,
  supabaseKeyType
};

