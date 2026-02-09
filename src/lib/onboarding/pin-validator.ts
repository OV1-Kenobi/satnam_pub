/**
 * PIN Validation for High-Volume Onboarding
 *
 * Provides format validation and input sanitization for PIN codes.
 * Verification logic (constant-time comparison) is in pin-manager.ts.
 *
 * @module pin-validator
 * @sensitive This module validates PIN material
 */

import { ONBOARDING_PIN_LENGTH } from "../../config/onboarding";

/**
 * Result of PIN format validation
 */
export interface PINValidationResult {
  /** Whether the PIN format is valid */
  valid: boolean;
  /** Validation errors (empty if valid) */
  errors: string[];
  /** Sanitized PIN (digits only, or empty if invalid) */
  sanitizedPIN: string;
}

/**
 * Validates PIN format for input.
 *
 * Requirements:
 * - Exactly 6 digits
 * - Only numeric characters (0-9)
 *
 * @sensitive This function validates PIN material
 * @param pin - The PIN string to validate
 * @returns PINValidationResult with validation status and sanitized value
 */
export function validatePINFormat(pin: string): PINValidationResult {
  const errors: string[] = [];

  // Remove any non-digit characters for sanitization
  const sanitizedPIN = pin.replace(/\D/g, "");

  // Check if the original input contains non-numeric characters
  if (pin !== sanitizedPIN) {
    errors.push("PIN must contain only numbers");
  }

  // Check length
  if (sanitizedPIN.length !== ONBOARDING_PIN_LENGTH) {
    errors.push(`PIN must be exactly ${ONBOARDING_PIN_LENGTH} digits`);
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedPIN: errors.length === 0 ? sanitizedPIN : "",
  };
}

/**
 * Sanitizes PIN input for display (masks all but last digit).
 *
 * @param pin - The PIN to mask
 * @returns Masked PIN string (e.g., "•••••3")
 */
export function maskPIN(pin: string): string {
  if (!pin) return "";

  const sanitized = pin.replace(/\D/g, "");
  if (sanitized.length === 0) return "";

  // Show only the last digit
  const masked = "•".repeat(sanitized.length - 1) + sanitized.slice(-1);
  return masked;
}

/**
 * Validates PIN confirmation matches original.
 *
 * @sensitive This function compares PIN values
 * @param pin - The original PIN
 * @param confirmation - The confirmation PIN to compare
 * @returns True if PINs match, false otherwise
 */
export function validatePINConfirmation(
  pin: string,
  confirmation: string,
): boolean {
  // Sanitize both inputs
  const sanitizedPIN = pin.replace(/\D/g, "");
  const sanitizedConfirmation = confirmation.replace(/\D/g, "");

  // Check if both are valid format first
  if (
    sanitizedPIN.length !== ONBOARDING_PIN_LENGTH ||
    sanitizedConfirmation.length !== ONBOARDING_PIN_LENGTH
  ) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  let result = 0;
  for (let i = 0; i < sanitizedPIN.length; i++) {
    result |= sanitizedPIN.charCodeAt(i) ^ sanitizedConfirmation.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Checks if a PIN is weak (common patterns like 123456, 000000, etc.).
 *
 * @param pin - The PIN to check
 * @returns True if PIN is considered weak
 */
export function isPINWeak(pin: string): boolean {
  const sanitized = pin.replace(/\D/g, "");

  if (sanitized.length !== ONBOARDING_PIN_LENGTH) {
    return true; // Invalid format is considered weak
  }

  // Common weak patterns
  const weakPatterns = [
    "000000",
    "111111",
    "222222",
    "333333",
    "444444",
    "555555",
    "666666",
    "777777",
    "888888",
    "999999",
    "123456",
    "654321",
    "012345",
    "543210",
    "123123",
    "121212",
    "696969",
  ];

  if (weakPatterns.includes(sanitized)) {
    return true;
  }

  // Check for sequential digits (ascending or descending)
  let isSequential = true;
  for (let i = 1; i < sanitized.length; i++) {
    const diff = parseInt(sanitized[i]) - parseInt(sanitized[i - 1]);
    if (Math.abs(diff) !== 1 && diff !== 0) {
      isSequential = false;
      break;
    }
  }

  if (isSequential) {
    // Check if all differences are the same (true sequence)
    const diffs: number[] = [];
    for (let i = 1; i < sanitized.length; i++) {
      diffs.push(parseInt(sanitized[i]) - parseInt(sanitized[i - 1]));
    }
    if (
      diffs.every((d) => d === diffs[0]) &&
      (diffs[0] === 1 || diffs[0] === -1)
    ) {
      return true;
    }
  }

  return false;
}
