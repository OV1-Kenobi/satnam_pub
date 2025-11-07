/**
 * Browser-Compatible Configuration
 *
 * This file provides configuration settings that work in browser environments
 * without Node.js dependencies like crypto.randomBytes
 */

/**
 * CRITICAL SECURITY: Master Context environment variable access pattern
 * Ensures browser compatibility with import.meta.env while maintaining serverless support
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = import.meta as any;
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  // CRITICAL FIX: Check if process exists before accessing (prevents TDZ errors in browser builds)
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }
  return undefined;
}

/**
 * NIP-05 configuration
 */
export const nip05Config = {
  domain: getEnvVar("NIP05_DOMAIN") || "satnam.pub",
};

/**
 * Authentication configuration
 */
export const authConfig = {
  tokenStorageKey: "satnam_auth_token",
  jwtSecret:
    getEnvVar("JWT_SECRET") || "development-secret-key-change-in-production",
  jwtExpiresIn: getEnvVar("JWT_EXPIRES_IN") || "7d",
  nostrAuthKind: 27235, // Custom event kind for authentication
  nostrAuthChallenge:
    getEnvVar("NOSTR_AUTH_CHALLENGE") || "satnam_auth_challenge",
  otpExpiryMinutes: 10,
  maxOtpAttempts: 3,
};

/**
 * Unified config object for convenience
 */
export const config = {
  nip05: nip05Config,
  auth: authConfig,
};
