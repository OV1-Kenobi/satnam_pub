/**
 * @fileoverview Input Validation and Sanitization for Satnam.pub
 * @description Comprehensive input validation to prevent injection attacks
 */

import { nip19 } from "../../../src/lib/nostr-browser";

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
  sanitized?: any;
}

/**
 * General input validation function
 */
export function validateInput(
  input: unknown,
  type:
    | "username"
    | "email"
    | "pubkey"
    | "amount"
    | "text"
    | "familyId" = "text"
): ValidationResult {
  switch (type) {
    case "username":
      return validateUsername(input);
    case "email":
      return validateEmail(input);
    case "pubkey":
      return validateNostrPubkey(input);
    case "amount":
      return validateLightningAmount(input);
    case "familyId":
      return validateFamilyId(input);
    case "text":
    default:
      return sanitizeText(input);
  }
}

/**
 * Validate and sanitize username
 */
export function validateUsername(username: unknown): ValidationResult {
  if (typeof username !== "string") {
    return { isValid: false, error: "Username must be a string" };
  }

  // Remove dangerous characters and normalize
  const sanitized = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, ""); // Only allow alphanumeric, underscore, and dash

  // Length validation
  if (sanitized.length < 3) {
    return {
      isValid: false,
      error: "Username must be at least 3 characters long",
    };
  }

  if (sanitized.length > 32) {
    return { isValid: false, error: "Username must be 32 characters or less" };
  }

  // Pattern validation
  if (!/^[a-z][a-z0-9_-]*$/.test(sanitized)) {
    return {
      isValid: false,
      error:
        "Username must start with a letter and contain only letters, numbers, underscores, and dashes",
    };
  }

  // Reserved username check
  const reserved = [
    "admin",
    "root",
    "api",
    "www",
    "satnam",
    "bitcoin",
    "lightning",
    "nostr",
  ];
  if (reserved.includes(sanitized)) {
    return { isValid: false, error: "This username is reserved" };
  }

  return { isValid: true, sanitized };
}

/**
 * Validate Lightning amount (satoshis)
 */
export function validateLightningAmount(amount: unknown): ValidationResult {
  if (typeof amount !== "number" && typeof amount !== "string") {
    return { isValid: false, error: "Amount must be a number" };
  }

  const numAmount = typeof amount === "string" ? parseInt(amount, 10) : amount;

  if (isNaN(numAmount) || !isFinite(numAmount)) {
    return { isValid: false, error: "Amount must be a valid number" };
  }

  if (numAmount <= 0) {
    return { isValid: false, error: "Amount must be positive" };
  }

  // Maximum reasonable Lightning payment: 10 BTC
  if (numAmount > 1_000_000_000) {
    return { isValid: false, error: "Amount exceeds maximum limit" };
  }

  // Minimum Lightning payment: 1 sat
  if (numAmount < 1) {
    return { isValid: false, error: "Amount must be at least 1 satoshi" };
  }

  return { isValid: true, sanitized: Math.floor(numAmount) };
}

/**
 * Validate Nostr public key (npub or hex)
 */
export function validateNostrPubkey(pubkey: unknown): ValidationResult {
  if (typeof pubkey !== "string") {
    return { isValid: false, error: "Public key must be a string" };
  }

  const cleaned = pubkey.trim();

  try {
    if (cleaned.startsWith("npub")) {
      // Validate and convert npub to hex
      const decoded = nip19.decode(cleaned);
      if (decoded.type !== "npub") {
        return { isValid: false, error: "Invalid npub format" };
      }
      return { isValid: true, sanitized: decoded.data as string };
    } else if (/^[a-fA-F0-9]{64}$/.test(cleaned)) {
      // Validate hex pubkey
      return { isValid: true, sanitized: cleaned.toLowerCase() };
    } else {
      return {
        isValid: false,
        error: "Public key must be npub format or 64-character hex",
      };
    }
  } catch (error) {
    return { isValid: false, error: "Invalid public key format" };
  }
}

/**
 * Validate Nostr private key (nsec)
 */
export function validateNostrPrivkey(nsec: unknown): ValidationResult {
  if (typeof nsec !== "string") {
    return { isValid: false, error: "Private key must be a string" };
  }

  const cleaned = nsec.trim();

  if (!cleaned.startsWith("nsec")) {
    return { isValid: false, error: "Private key must be in nsec format" };
  }

  try {
    const decoded = nip19.decode(cleaned);
    if (decoded.type !== "nsec") {
      return { isValid: false, error: "Invalid nsec format" };
    }
    return { isValid: true, sanitized: cleaned };
  } catch (error) {
    return { isValid: false, error: "Invalid private key format" };
  }
}

/**
 * Validate Lightning invoice
 */
export function validateLightningInvoice(invoice: unknown): ValidationResult {
  if (typeof invoice !== "string") {
    return { isValid: false, error: "Invoice must be a string" };
  }

  const cleaned = invoice.trim().toLowerCase();

  // Basic Lightning invoice format validation
  if (!cleaned.startsWith("ln")) {
    return { isValid: false, error: "Invoice must start with 'ln'" };
  }

  // Check for reasonable length (Lightning invoices are typically 200-400 characters)
  if (cleaned.length < 100 || cleaned.length > 1000) {
    return { isValid: false, error: "Invoice length is invalid" };
  }

  // Basic character validation (bech32)
  if (!/^[ln][a-z0-9]+$/.test(cleaned)) {
    return { isValid: false, error: "Invoice contains invalid characters" };
  }

  return { isValid: true, sanitized: cleaned };
}

/**
 * Validate family ID
 */
export function validateFamilyId(familyId: unknown): ValidationResult {
  if (typeof familyId !== "string") {
    return { isValid: false, error: "Family ID must be a string" };
  }

  const cleaned = familyId.trim();

  // UUID format validation
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(cleaned)) {
    return { isValid: true, sanitized: cleaned.toLowerCase() };
  }

  // Custom family ID format (family_xxxxx)
  if (/^family_[a-z0-9]{16}$/.test(cleaned)) {
    return { isValid: true, sanitized: cleaned };
  }

  return {
    isValid: false,
    error: "Family ID must be UUID or family_xxxxx format",
  };
}

/**
 * Validate encryption key strength
 */
export function validateEncryptionKey(key: unknown): ValidationResult {
  if (typeof key !== "string") {
    return { isValid: false, error: "Encryption key must be a string" };
  }

  const cleaned = key.trim();

  // Minimum length for security
  if (cleaned.length < 32) {
    return {
      isValid: false,
      error: "Encryption key must be at least 32 characters",
    };
  }

  // Maximum reasonable length
  if (cleaned.length > 512) {
    return { isValid: false, error: "Encryption key is too long" };
  }

  // Check for sufficient entropy (basic check)
  const uniqueChars = new Set(cleaned).size;
  if (uniqueChars < 10) {
    return { isValid: false, error: "Encryption key lacks sufficient entropy" };
  }

  return { isValid: true, sanitized: cleaned };
}

/**
 * Validate email address (for NIP-05)
 */
export function validateEmail(email: unknown): ValidationResult {
  if (typeof email !== "string") {
    return { isValid: false, error: "Email must be a string" };
  }

  const cleaned = email.trim().toLowerCase();

  // Basic email regex (not perfect but good enough for our use case)
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  if (!emailRegex.test(cleaned)) {
    return { isValid: false, error: "Invalid email format" };
  }

  // Length validation
  if (cleaned.length > 254) {
    return { isValid: false, error: "Email address is too long" };
  }

  return { isValid: true, sanitized: cleaned };
}

/**
 * Sanitize text input to prevent XSS
 */
export function sanitizeText(
  text: unknown,
  maxLength: number = 1000
): ValidationResult {
  if (typeof text !== "string") {
    return { isValid: false, error: "Text must be a string" };
  }

  // Remove dangerous characters and normalize
  const sanitized = text
    .trim()
    .replace(/[<>]/g, "") // Remove < and > to prevent basic XSS
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+=/gi, "") // Remove event handlers
    .substring(0, maxLength); // Truncate to max length

  return { isValid: true, sanitized };
}

/**
 * Validate JSON data with size limits
 */
export function validateJsonData(
  data: unknown,
  maxSize: number = 10240
): ValidationResult {
  try {
    const jsonString = typeof data === "string" ? data : JSON.stringify(data);

    if (jsonString.length > maxSize) {
      return {
        isValid: false,
        error: `JSON data exceeds maximum size of ${maxSize} bytes`,
      };
    }

    const parsed = typeof data === "string" ? JSON.parse(data) : data;

    // Basic safety checks
    if (parsed === null || typeof parsed !== "object") {
      return { isValid: false, error: "JSON data must be an object" };
    }

    return { isValid: true, sanitized: parsed };
  } catch (error) {
    return { isValid: false, error: "Invalid JSON format" };
  }
}

/**
 * Comprehensive validation middleware factory
 */
export function createValidator(
  schema: Record<string, (value: unknown) => ValidationResult>
) {
  return (
    data: Record<string, unknown>
  ): {
    isValid: boolean;
    errors: Record<string, string>;
    sanitized: Record<string, unknown>;
  } => {
    const errors: Record<string, string> = {};
    const sanitized: Record<string, unknown> = {};
    let isValid = true;

    for (const [field, validator] of Object.entries(schema)) {
      const result = validator(data[field]);
      if (!result.isValid) {
        errors[field] = result.error || "Validation failed";
        isValid = false;
      } else {
        sanitized[field] = result.sanitized;
      }
    }

    return { isValid, errors, sanitized };
  };
}
