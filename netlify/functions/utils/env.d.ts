/**
 * Type definitions for environment variable helper for Netlify Functions
 * Server-side: ALWAYS use process.env, never import.meta.env
 */

/**
 * Get environment variable with proper Node.js/Netlify Functions compatibility
 * @param key - Environment variable key
 * @param defaultValue - Default value if not found
 * @returns Environment variable value
 */
export function getEnvVar(key: string, defaultValue?: string): string | undefined;

/**
 * Get required environment variable (throws if missing)
 * @param key - Environment variable key
 * @param context - Context for error message
 * @returns Environment variable value
 * @throws {Error} If environment variable is missing
 */
export function getRequiredEnvVar(key: string, context?: string): string;

/**
 * Validate DUID server secret
 * @returns Validated DUID server secret
 * @throws {Error} If secret is missing or invalid
 */
export function getDuidServerSecret(): string;

/**
 * Supabase configuration object
 */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

/**
 * Get Supabase configuration for server-side operations
 * @returns Supabase configuration
 */
export function getSupabaseConfig(): SupabaseConfig;

/**
 * Check if running in production environment
 * @returns True if production
 */
export function isProduction(): boolean;

/**
 * Environment information object
 */
export interface EnvironmentInfo {
  nodeEnv?: string;
  netlifyContext?: string;
  isNetlify: boolean;
  hasSupabaseUrl: boolean;
  hasSupabaseAnonKey: boolean;
  hasSupabaseServiceKey: boolean;
  hasDuidSecret: boolean;
  timestamp: string;
}

/**
 * Get environment info for debugging
 * @returns Environment information
 */
export function getEnvironmentInfo(): EnvironmentInfo;

