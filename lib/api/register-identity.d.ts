export interface IdentityRegistrationArgs {
  // Define specific properties based on requirements
}

export interface IdentityRegistrationResponse {
  // Define specific response properties
}

export interface IdentityRegistration {
  register: (
    args: IdentityRegistrationArgs
  ) => Promise<IdentityRegistrationResponse>;
}
/**
 * Represents a Nostr key pair.
 *
 * Security requirements for handling `nsec` (Nostr private key):
 * - NEVER log `nsec` to the console or include it in error messages.
 * - NEVER store `nsec` in plaintext (e.g., localStorage, sessionStorage, cookies, or database).
 * - Use the Client Vault session storage model and immediately re-wrap with Noble V2 encryption
 *   before any at-rest persistence (Noble V2: `noble-v2.<salt>.<iv>.<cipher>` format).
 * - Zero-knowledge architecture: convert `nsec` to an ArrayBuffer via TextEncoder immediately
 *   upon receipt, process in-memory only, and wipe any transient buffers after use.
 */
export interface NostrKeyPair {
  /** Public key in hex format */
  pubkey: string;
  /** Private key in nsec (Nostr Secret) format - MUST be stored securely */
  nsec: string;
}

/**
 * Generates a new Nostr key pair.
 *
 * Security handling guidance for returned `nsec`:
 * - Do NOT log or serialize `nsec` into analytics, telemetry, or error messages.
 * - Do NOT persist plaintext `nsec`. Instead, use Client Vault session storage and
 *   immediately re-wrap with Noble V2 encryption prior to any persistence.
 * - Follow zero-knowledge practices: convert to ArrayBuffer via TextEncoder on receipt,
 *   avoid long-lived references, and clear buffers promptly after use.
 *
 * @returns A key pair containing a public key and private key (nsec).
 */
export function generateNostrKeyPair(): NostrKeyPair;
