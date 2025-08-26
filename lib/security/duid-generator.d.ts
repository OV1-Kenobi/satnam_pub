/**
 * TypeScript declarations for Canonical DUID Generator - NIP-05 Based Architecture
 * Single source of truth for all DUID generation across the codebase
 */

/**
 * Generate DUID from NIP-05 identifier (server-side only)
 * This is the ONLY way to generate DUIDs for consistent lookups
 * Replaces all npub-based DUID generation methods
 *
 * @param nip05 - NIP-05 identifier (username@domain)
 * @returns Promise resolving to DUID (64-character hex)
 * @throws Error if server secret not configured or invalid NIP-05 format
 */
export function generateDUIDFromNIP05(nip05: string): Promise<string>;

/**
 * Validate DUID format
 * Ensures DUID meets the expected format requirements
 *
 * @param duid - DUID to validate
 * @returns True if valid DUID format
 */
export function validateDUID(duid: string): boolean;
