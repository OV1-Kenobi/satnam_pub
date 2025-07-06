/**
 * Browser-Compatible Configuration
 * 
 * This file provides configuration settings that work in browser environments
 * without Node.js dependencies like crypto.randomBytes
 */

/**
 * NIP-05 configuration
 */
export const nip05Config = {
  domain: process.env.NIP05_DOMAIN || "satnam.pub",
};

/**
 * Authentication configuration
 */
export const authConfig = {
  tokenStorageKey: "satnam_auth_token",
  jwtSecret: process.env.JWT_SECRET || "development-secret-key-change-in-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  nostrAuthKind: 27235, // Custom event kind for authentication
  nostrAuthChallenge: process.env.NOSTR_AUTH_CHALLENGE || "satnam_auth_challenge",
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