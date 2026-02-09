/**
 * Password Validation for High-Volume Onboarding
 * 
 * Dual-path validation supporting:
 * - Phrase-based passwords (≥26 chars, 4-5 words)
 * - Complexity-based passwords (≥12 chars with mixed case, numbers, symbols)
 * 
 * @module password-validator
 * @sensitive This module validates password material
 */

import type { PasswordMode, PasswordType, PasswordStrength, PasswordValidationResult } from '../../types/onboarding';
import { estimateEntropyBits } from './password-generator';
import {
  ONBOARDING_PASSWORD_MIN_LENGTH,
  ONBOARDING_PASSWORD_MIN_WORDS,
  ONBOARDING_PASSWORD_MAX_WORDS,
  ONBOARDING_PASSWORD_COMPLEX_MIN_LENGTH,
} from '../../config/onboarding';

/**
 * Validates a password as a phrase-based password.
 * 
 * Requirements:
 * - Minimum 26 characters
 * - 4-5 words separated by spaces
 * 
 * @sensitive This function validates password material
 * @param password - The password to validate
 * @returns PasswordValidationResult with type, errors, strength, and entropy
 */
export function validatePasswordPhrase(password: string): PasswordValidationResult {
  const errors: string[] = [];
  const trimmed = password.trim();
  const length = trimmed.length;
  const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length;
  
  // Check minimum length
  if (length < ONBOARDING_PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${ONBOARDING_PASSWORD_MIN_LENGTH} characters`);
  }
  
  // Check word count
  if (wordCount < ONBOARDING_PASSWORD_MIN_WORDS || wordCount > ONBOARDING_PASSWORD_MAX_WORDS) {
    errors.push(`Password must contain ${ONBOARDING_PASSWORD_MIN_WORDS}-${ONBOARDING_PASSWORD_MAX_WORDS} words separated by spaces`);
  }
  
  if (errors.length === 0) {
    return {
      valid: true,
      type: 'phrase',
      errors: [],
      strength: 'very_strong',
      entropyBits: estimateEntropyBits(trimmed),
    };
  }
  
  return {
    valid: false,
    type: 'invalid',
    errors,
    strength: 'weak',
    entropyBits: 0,
  };
}

/**
 * Validates a password as a complexity-based password.
 * 
 * Requirements:
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one symbol
 * 
 * @sensitive This function validates password material
 * @param password - The password to validate
 * @returns PasswordValidationResult with type, errors, strength, and entropy
 */
export function validateComplexPassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  
  // Check minimum length
  if (password.length < ONBOARDING_PASSWORD_COMPLEX_MIN_LENGTH) {
    errors.push(`Password must be at least ${ONBOARDING_PASSWORD_COMPLEX_MIN_LENGTH} characters`);
  }
  
  // Check character requirements
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must include at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must include at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must include at least one number');
  }
  
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must include at least one symbol');
  }
  
  const entropyBits = estimateEntropyBits(password);
  
  if (errors.length === 0) {
    // Determine strength based on entropy
    let strength: PasswordStrength;
    if (entropyBits >= 80) strength = 'very_strong';
    else if (entropyBits >= 60) strength = 'strong';
    else if (entropyBits >= 40) strength = 'medium';
    else strength = 'weak';
    
    return {
      valid: true,
      type: 'complex',
      errors: [],
      strength,
      entropyBits,
    };
  }
  
  return {
    valid: false,
    type: 'invalid',
    errors,
    strength: 'weak',
    entropyBits,
  };
}

/**
 * Validates a password with dual-path support.
 * 
 * - If mode is "phrase": validates as phrase only
 * - If mode is "complex": validates as complex only  
 * - If mode is "auto" (default): tries phrase first, then complex
 * 
 * @sensitive This function validates password material
 * @param password - The password to validate
 * @param mode - Validation mode: "phrase", "complex", or "auto"
 * @returns PasswordValidationResult with type, errors, strength, and entropy
 */
export function validateOnboardingPassword(
  password: string,
  mode: PasswordMode | 'auto' = 'auto'
): PasswordValidationResult {
  if (!password) {
    return {
      valid: false,
      type: 'invalid',
      errors: ['Password is required'],
      strength: 'weak',
      entropyBits: 0,
    };
  }
  
  // Mode-specific validation
  if (mode === 'coordinator-assigned') {
    return validatePasswordPhrase(password);
  }
  
  if (mode === 'user-chosen') {
    return validateComplexPassword(password);
  }
  
  // Auto mode: try phrase first, then complex
  const phraseResult = validatePasswordPhrase(password);
  if (phraseResult.valid) {
    return phraseResult;
  }
  
  const complexResult = validateComplexPassword(password);
  return complexResult;
}

