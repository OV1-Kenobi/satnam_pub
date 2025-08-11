/**
 * TypeScript declarations for Secure Deterministic User ID (DUID) Generator
 * Provides type safety for secure DUID generation with client-side public generation
 */

/**
 * Generate secure public DUID from npub only (client-side)
 * Creates a stable identifier that survives password changes
 *
 * @param npub - User's Nostr public key (npub1...)
 * @returns Promise resolving to public DUID (duid_public)
 */
export function generateDUID(npub: string): Promise<string>;

/**
 * Resolve NIP-05 identifier to npub using .well-known/nostr.json
 * This enables DUID generation from NIP-05 + password authentication
 *
 * @param nip05 - NIP-05 identifier (username@domain.com)
 * @returns Promise resolving to npub or null if resolution fails
 */
export function resolveNIP05ToNpub(nip05: string): Promise<string | null>;

/**
 * Generate DUID from NIP-05 and password (convenience function)
 * Combines NIP-05 resolution with DUID generation
 *
 * @param nip05 - NIP-05 identifier
 * @returns Promise resolving to public DUID - throws error if generation fails
 */
export function generateDUIDFromNIP05(nip05: string): Promise<string>;

// REMOVED: regenerateDUID() function - DUIDs are stable across password changes
// Use generateDUID(npub) directly instead

/**
 * Validate DUID format
 * Ensures DUID meets the expected format requirements
 *
 * @param duid - DUID to validate
 * @returns True if valid DUID format
 */
export function validateDUID(duid: string): boolean;

/**
 * Generate DUID for NIP-07 browser extension authentication
 * Uses npub from browser extension (no signature needed for stable DUID)
 *
 * @param npub - User's npub from NIP-07 extension
 * @returns Promise resolving to DUID for NIP-07 authentication
 */
export function generateDUIDForNIP07(npub: string): Promise<string>;
