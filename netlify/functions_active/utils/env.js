/**
 * Environment variable helper for Netlify Functions
 * Server-side: ALWAYS use process.env, never import.meta.env
 */

/**
 * Get environment variable with proper Node.js/Netlify Functions compatibility
 * @param {string} key - Environment variable key
 * @param {string} [defaultValue] - Default value if not found
 * @returns {string|undefined} Environment variable value
 */
export function getEnvVar(key, defaultValue) {
  // Netlify Functions run in Node.js environment - use process.env
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue;
  }
  return defaultValue;
}

/**
 * Get required environment variable (throws if missing)
 * @param {string} key - Environment variable key
 * @param {string} [context] - Context for error message
 * @returns {string} Environment variable value
 * @throws {Error} If environment variable is missing
 */
export function getRequiredEnvVar(key, context = 'application') {
  const value = getEnvVar(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key} (required for ${context})`);
  }
  return value;
}

/**
 * Validate DUID server secret
 * @returns {string} Validated DUID server secret
 * @throws {Error} If secret is missing or invalid
 */
export function getDuidServerSecret() {
  const secret = getEnvVar('DUID_SERVER_SECRET');
  
  if (!secret) {
    throw new Error('DUID_SERVER_SECRET environment variable is required for secure indexing');
  }
  
  if (secret.length < 32) {
    throw new Error('DUID_SERVER_SECRET must be at least 32 characters for security');
  }
  
  return secret;
}

/**
 * Get Supabase configuration for server-side operations
 * @returns {Object} Supabase configuration
 */
export function getSupabaseConfig() {
  return {
    url: getRequiredEnvVar('VITE_SUPABASE_URL', 'Supabase connection'),
    anonKey: getRequiredEnvVar('VITE_SUPABASE_ANON_KEY', 'Supabase anon operations'),
    serviceRoleKey: getEnvVar('SUPABASE_SERVICE_ROLE_KEY') // Optional for some operations
  };
}

/**
 * Check if running in production environment
 * @returns {boolean} True if production
 */
export function isProduction() {
  const nodeEnv = getEnvVar('NODE_ENV', 'development');
  const netlifyContext = getEnvVar('CONTEXT', 'development');
  
  return nodeEnv === 'production' || netlifyContext === 'production';
}

/**
 * Get environment info for debugging
 * @returns {Object} Environment information
 */
export function getEnvironmentInfo() {
  return {
    nodeEnv: getEnvVar('NODE_ENV'),
    netlifyContext: getEnvVar('CONTEXT'),
    isNetlify: !!getEnvVar('NETLIFY'),
    hasSupabaseUrl: !!getEnvVar('VITE_SUPABASE_URL'),
    hasSupabaseAnonKey: !!getEnvVar('VITE_SUPABASE_ANON_KEY'),
    hasSupabaseServiceKey: !!getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
    hasDuidSecret: !!getEnvVar('DUID_SERVER_SECRET'),
    timestamp: new Date().toISOString()
  };
}
