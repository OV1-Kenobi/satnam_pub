/**
 * Centralized Input Validation Utility
 * Provides consistent input validation and sanitization across all Netlify Functions
 *
 * Features:
 * - Length validation constants for all input types
 * - Regex patterns for format validation
 * - Type-safe validation functions
 * - XSS prevention through sanitization
 * - HTML encoding for safe output
 */

/**
 * Length validation constants
 * Define maximum lengths for various input types
 */
export const MAX_LENGTHS = {
  USERNAME: 64,
  PASSWORD: 256,
  EMAIL: 254,
  MESSAGE: 10000,
  DATA: 10000,
  NPUB: 63, // Nostr public key (bech32 encoded)
  NSEC: 63, // Nostr secret key (bech32 encoded)
  NIP05: 254, // NIP-05 identifier (email-like format)
  INVOICE: 1000, // Lightning invoice
  PAYMENT_AMOUNT: 21000000, // Max satoshis (21M BTC)
  WALLET_ID: 256,
  SIGNATURE: 256,
  HASH: 256,
  UUID: 36, // Standard UUID length
  URL: 2048,
  DESCRIPTION: 5000,
  METADATA: 50000,
} as const;

/**
 * Regex patterns for format validation
 */
export const VALIDATION_PATTERNS = {
  // UUID: 8-4-4-4-12 hex digits
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,

  // Email: basic RFC 5322 pattern
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  // Nostr public key (npub): bech32 encoded, starts with npub1
  NPUB: /^npub1[02-9ac-hj-np-z]{58}$/,

  // Nostr secret key (nsec): bech32 encoded, starts with nsec1
  NSEC: /^nsec1[02-9ac-hj-np-z]{58}$/,

  // Hex string: 0-9, a-f, A-F
  HEX: /^[0-9a-fA-F]*$/,

  // Alphanumeric with underscores and hyphens
  ALPHANUMERIC: /^[a-zA-Z0-9_-]+$/,

  // URL: basic pattern
  URL: /^https?:\/\/.+/,

  // Lightning invoice: starts with lnbc or lntb
  INVOICE: /^ln(bc|tb)[0-9a-z]+$/i,

  // NIP-05 identifier: username@domain format
  NIP05: /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

  // DUID: SHA-256 hash (64 hex characters)
  DUID: /^[0-9a-f]{64}$/i,

  // Iroh node ID: base32 encoded, 52 characters
  IROH_NODE_ID: /^[a-z2-7]{52}$/,

  // Numeric only
  NUMERIC: /^[0-9]+$/,

  // Positive integer
  POSITIVE_INT: /^[1-9][0-9]*$/,

  // Non-negative integer
  NON_NEGATIVE_INT: /^[0-9]+$/,
} as const;

/**
 * Validate UUID format
 *
 * @param uuid - UUID string to validate
 * @returns true if valid UUID format
 */
export function validateUUID(uuid: unknown): uuid is string {
  if (typeof uuid !== "string") return false;
  if (uuid.length > MAX_LENGTHS.UUID) return false;
  return VALIDATION_PATTERNS.UUID.test(uuid);
}

/**
 * Validate email format
 *
 * @param email - Email string to validate
 * @returns true if valid email format
 */
export function validateEmail(email: unknown): email is string {
  if (typeof email !== "string") return false;
  if (email.length > MAX_LENGTHS.EMAIL) return false;
  return VALIDATION_PATTERNS.EMAIL.test(email);
}

/**
 * Validate username format and length
 *
 * @param username - Username to validate
 * @returns true if valid username
 */
export function validateUsername(username: unknown): username is string {
  if (typeof username !== "string") return false;
  if (username.length === 0 || username.length > MAX_LENGTHS.USERNAME)
    return false;
  return VALIDATION_PATTERNS.ALPHANUMERIC.test(username);
}

/**
 * Validate password strength
 * Minimum 8 characters, at least one uppercase, one lowercase, one number
 *
 * @param password - Password to validate
 * @returns true if password meets strength requirements
 */
export function validatePassword(password: unknown): password is string {
  if (typeof password !== "string") return false;
  if (password.length < 8 || password.length > MAX_LENGTHS.PASSWORD)
    return false;

  // Check for at least one uppercase, lowercase, and number
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  return hasUppercase && hasLowercase && hasNumber;
}

/**
 * Validate Nostr public key (npub format)
 *
 * @param npub - Nostr public key to validate
 * @returns true if valid npub format
 */
export function validateNostrPubkey(npub: unknown): npub is string {
  if (typeof npub !== "string") return false;
  if (npub.length > MAX_LENGTHS.NPUB) return false;
  return VALIDATION_PATTERNS.NPUB.test(npub);
}

/**
 * Validate Nostr secret key (nsec format)
 *
 * @param nsec - Nostr secret key to validate
 * @returns true if valid nsec format
 */
export function validateNostrSeckey(nsec: unknown): nsec is string {
  if (typeof nsec !== "string") return false;
  if (nsec.length > MAX_LENGTHS.NSEC) return false;
  return VALIDATION_PATTERNS.NSEC.test(nsec);
}

/**
 * Validate NIP-05 identifier format
 *
 * @param nip05 - NIP-05 identifier to validate
 * @returns true if valid NIP-05 format
 */
export function validateNIP05(nip05: unknown): nip05 is string {
  if (typeof nip05 !== "string") return false;
  if (nip05.length > MAX_LENGTHS.NIP05) return false;
  return VALIDATION_PATTERNS.NIP05.test(nip05);
}

/**
 * Validate DUID (Decentralized User ID) format
 * DUID is a SHA-256 hash (64 hex characters)
 *
 * @param duid - DUID to validate
 * @returns true if valid DUID format
 */
export function validateDUID(duid: unknown): duid is string {
  if (typeof duid !== "string") return false;
  if (duid.length !== 64) return false;
  return VALIDATION_PATTERNS.DUID.test(duid);
}

/**
 * Validate Iroh node ID format
 * Iroh node IDs are base32 encoded, 52 characters
 *
 * @param nodeId - Iroh node ID to validate
 * @returns true if valid Iroh node ID format
 */
export function validateIrohNodeId(nodeId: unknown): nodeId is string {
  if (typeof nodeId !== "string") return false;
  if (nodeId.length !== 52) return false;
  return VALIDATION_PATTERNS.IROH_NODE_ID.test(nodeId);
}

/**
 * Validate hex string format
 *
 * @param hex - Hex string to validate
 * @param expectedLength - Optional expected length (in characters)
 * @returns true if valid hex format
 */
export function validateHex(
  hex: unknown,
  expectedLength?: number
): hex is string {
  if (typeof hex !== "string") return false;
  if (expectedLength && hex.length !== expectedLength) return false;
  return VALIDATION_PATTERNS.HEX.test(hex);
}

/**
 * Validate URL format
 *
 * @param url - URL to validate
 * @returns true if valid URL format
 */
export function validateURL(url: unknown): url is string {
  if (typeof url !== "string") return false;
  if (url.length > MAX_LENGTHS.URL) return false;
  return VALIDATION_PATTERNS.URL.test(url);
}

/**
 * Validate Lightning invoice format
 *
 * @param invoice - Lightning invoice to validate
 * @returns true if valid invoice format
 */
export function validateInvoice(invoice: unknown): invoice is string {
  if (typeof invoice !== "string") return false;
  if (invoice.length > MAX_LENGTHS.INVOICE) return false;
  return VALIDATION_PATTERNS.INVOICE.test(invoice);
}

/**
 * Validate positive integer
 *
 * @param value - Value to validate
 * @returns true if valid positive integer
 */
export function validatePositiveInt(value: unknown): value is number {
  if (typeof value !== "number") return false;
  if (!Number.isInteger(value)) return false;
  return value > 0;
}

/**
 * Validate non-negative integer
 *
 * @param value - Value to validate
 * @returns true if valid non-negative integer
 */
export function validateNonNegativeInt(value: unknown): value is number {
  if (typeof value !== "number") return false;
  if (!Number.isInteger(value)) return false;
  return value >= 0;
}

/**
 * Sanitize input to prevent XSS attacks
 * Removes potentially dangerous characters and patterns
 *
 * @param input - Input string to sanitize
 * @returns Sanitized string
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== "string") return "";

  return input
    .replace(/[<>]/g, "") // Remove angle brackets
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, "") // Remove event handlers
    .trim();
}

/**
 * HTML encode string for safe output
 * Converts special characters to HTML entities
 *
 * @param input - String to encode
 * @returns HTML-encoded string
 */
export function htmlEncode(input: string): string {
  if (typeof input !== "string") return "";

  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return input.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Validate input length
 *
 * @param input - Input to validate
 * @param maxLength - Maximum allowed length
 * @returns true if input length is valid
 */
export function validateLength(
  input: unknown,
  maxLength: number
): input is string {
  if (typeof input !== "string") return false;
  return input.length > 0 && input.length <= maxLength;
}

/**
 * Validate required field (not empty)
 *
 * @param value - Value to validate
 * @returns true if value is not empty
 */
export function validateRequired(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return true;
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object" && value !== null)
    return Object.keys(value).length > 0;
  return false;
}
