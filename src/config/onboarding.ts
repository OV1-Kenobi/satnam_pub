/**
 * High-Volume Physical Peer Onboarding Configuration
 * 
 * Centralized configuration for onboarding feature flags and settings.
 * Uses getEnvVar() helper for safe module-level environment variable access.
 */

import { getEnvVar } from './env.client';
import type { PasswordMode } from '../types/onboarding';

// ============================================================================
// Feature Flags
// ============================================================================

/**
 * Master feature flag for physical peer onboarding system
 */
export const ONBOARDING_ENABLED = 
  (getEnvVar('VITE_ENABLE_PHYSICAL_PEER_ONBOARDING') ?? 'false') === 'true';

/**
 * Enable Nostr account migration via OTP
 */
export const ONBOARDING_NOSTR_MIGRATION_ENABLED = 
  (getEnvVar('VITE_ONBOARDING_ENABLE_NOSTR_MIGRATION') ?? 'true') === 'true';

/**
 * Enable Keet P2P identity generation
 */
export const ONBOARDING_KEET_IDENTITY_ENABLED = 
  (getEnvVar('VITE_ONBOARDING_ENABLE_KEET_IDENTITY') ?? 'true') === 'true';

/**
 * Enable attestation publishing (OTS + NIP-03)
 */
export const ONBOARDING_ATTESTATION_ENABLED = 
  (getEnvVar('VITE_ONBOARDING_ENABLE_ATTESTATION') ?? 'true') === 'true';

// ============================================================================
// Session Configuration
// ============================================================================

/**
 * Maximum number of participants in a batch session
 */
export const ONBOARDING_MAX_BATCH_SIZE = 
  parseInt(getEnvVar('VITE_ONBOARDING_MAX_BATCH_SIZE') ?? '100', 10);

/**
 * Session timeout in minutes
 */
export const ONBOARDING_SESSION_TIMEOUT_MINUTES = 
  parseInt(getEnvVar('VITE_ONBOARDING_SESSION_TIMEOUT_MINUTES') ?? '120', 10);

/**
 * OTP expiry time in minutes
 */
export const ONBOARDING_OTP_EXPIRY_MINUTES = 
  parseInt(getEnvVar('VITE_ONBOARDING_OTP_EXPIRY_MINUTES') ?? '10', 10);

// ============================================================================
// Password Configuration
// ============================================================================

/**
 * Minimum length for phrase-based passwords
 */
export const ONBOARDING_PASSWORD_MIN_LENGTH = 
  parseInt(getEnvVar('VITE_ONBOARDING_PASSWORD_MIN_LENGTH') ?? '26', 10);

/**
 * Minimum number of words for phrase-based passwords
 */
export const ONBOARDING_PASSWORD_MIN_WORDS = 4;

/**
 * Maximum number of words for phrase-based passwords
 */
export const ONBOARDING_PASSWORD_MAX_WORDS = 5;

/**
 * Minimum length for complexity-based passwords
 */
export const ONBOARDING_PASSWORD_COMPLEX_MIN_LENGTH = 12;

/**
 * Default password mode (coordinator-assigned vs user-chosen)
 */
export const ONBOARDING_DEFAULT_PASSWORD_MODE: PasswordMode = 
  (getEnvVar('VITE_ONBOARDING_DEFAULT_PASSWORD_MODE') ?? 'coordinator-assigned') as PasswordMode;

// ============================================================================
// PIN Configuration
// ============================================================================

/**
 * PIN length for NFC cards
 */
export const ONBOARDING_PIN_LENGTH = 
  parseInt(getEnvVar('VITE_ONBOARDING_PIN_LENGTH') ?? '6', 10);

/**
 * PBKDF2 iterations for PIN hashing
 */
export const ONBOARDING_PIN_PBKDF2_ITERATIONS = 100000;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validates that onboarding is enabled before allowing access
 */
export function assertOnboardingEnabled(): void {
  if (!ONBOARDING_ENABLED) {
    throw new Error(
      'Physical peer onboarding is not enabled. Set VITE_ENABLE_PHYSICAL_PEER_ONBOARDING=true'
    );
  }
}

/**
 * Gets the session timeout in milliseconds
 */
export function getSessionTimeoutMs(): number {
  return ONBOARDING_SESSION_TIMEOUT_MINUTES * 60 * 1000;
}

/**
 * Gets the OTP expiry time in milliseconds
 */
export function getOTPExpiryMs(): number {
  return ONBOARDING_OTP_EXPIRY_MINUTES * 60 * 1000;
}

/**
 * Validates batch size is within limits
 */
export function validateBatchSize(size: number): boolean {
  return size > 0 && size <= ONBOARDING_MAX_BATCH_SIZE;
}

/**
 * Gets configuration summary for debugging
 */
export function getOnboardingConfig() {
  return {
    enabled: ONBOARDING_ENABLED,
    features: {
      nostrMigration: ONBOARDING_NOSTR_MIGRATION_ENABLED,
      keetIdentity: ONBOARDING_KEET_IDENTITY_ENABLED,
      attestation: ONBOARDING_ATTESTATION_ENABLED,
    },
    session: {
      maxBatchSize: ONBOARDING_MAX_BATCH_SIZE,
      timeoutMinutes: ONBOARDING_SESSION_TIMEOUT_MINUTES,
      otpExpiryMinutes: ONBOARDING_OTP_EXPIRY_MINUTES,
    },
    password: {
      minLength: ONBOARDING_PASSWORD_MIN_LENGTH,
      minWords: ONBOARDING_PASSWORD_MIN_WORDS,
      maxWords: ONBOARDING_PASSWORD_MAX_WORDS,
      complexMinLength: ONBOARDING_PASSWORD_COMPLEX_MIN_LENGTH,
      defaultMode: ONBOARDING_DEFAULT_PASSWORD_MODE,
    },
    pin: {
      length: ONBOARDING_PIN_LENGTH,
      pbkdf2Iterations: ONBOARDING_PIN_PBKDF2_ITERATIONS,
    },
  };
}

