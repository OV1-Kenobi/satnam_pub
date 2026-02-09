/**
 * Unit Tests for Password Validator
 * 
 * Tests for dual-path password validation (phrase + complex).
 * @module password-validator.test
 */

import { describe, it, expect } from 'vitest';
import { 
  validatePasswordPhrase, 
  validateComplexPassword, 
  validateOnboardingPassword 
} from '../password-validator';

describe('validatePasswordPhrase', () => {
  it('should accept valid 4-word phrases ≥26 chars', () => {
    const result = validatePasswordPhrase('correct horse battery staple');
    expect(result.valid).toBe(true);
    expect(result.type).toBe('phrase');
    expect(result.strength).toBe('very_strong');
    expect(result.errors).toHaveLength(0);
  });

  it('should accept valid 5-word phrases ≥26 chars', () => {
    const result = validatePasswordPhrase('correct horse battery staple charger');
    expect(result.valid).toBe(true);
    expect(result.type).toBe('phrase');
    expect(result.strength).toBe('very_strong');
  });

  it('should reject phrases <26 characters', () => {
    const result = validatePasswordPhrase('one two three four');
    expect(result.valid).toBe(false);
    expect(result.type).toBe('invalid');
    expect(result.errors.some(e => e.includes('26'))).toBe(true);
  });

  it('should reject phrases with <4 words', () => {
    const result = validatePasswordPhrase('one two three');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('4-5 words'))).toBe(true);
  });

  it('should reject phrases with >5 words', () => {
    const result = validatePasswordPhrase('one two three four five six seven');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('4-5 words'))).toBe(true);
  });

  it('should calculate entropy for valid phrases', () => {
    const result = validatePasswordPhrase('correct horse battery staple');
    expect(result.entropyBits).toBeGreaterThan(50);
  });

  it('should handle extra whitespace', () => {
    const result = validatePasswordPhrase('  correct  horse  battery  staple  ');
    expect(result.valid).toBe(true);
  });
});

describe('validateComplexPassword', () => {
  it('should accept valid complex passwords', () => {
    const result = validateComplexPassword('P@ssw0rd123!');
    expect(result.valid).toBe(true);
    expect(result.type).toBe('complex');
    expect(result.errors).toHaveLength(0);
  });

  it('should reject passwords <12 characters', () => {
    const result = validateComplexPassword('P@ss1');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('12'))).toBe(true);
  });

  it('should reject passwords without uppercase', () => {
    const result = validateComplexPassword('p@ssw0rd123!');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('uppercase'))).toBe(true);
  });

  it('should reject passwords without lowercase', () => {
    const result = validateComplexPassword('P@SSW0RD123!');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('lowercase'))).toBe(true);
  });

  it('should reject passwords without numbers', () => {
    const result = validateComplexPassword('P@sswordABC!');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('number'))).toBe(true);
  });

  it('should reject passwords without symbols', () => {
    const result = validateComplexPassword('Passw0rd1234');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('symbol'))).toBe(true);
  });

  it('should calculate strength based on entropy', () => {
    const weak = validateComplexPassword('P@ssw0rd1234');
    const strong = validateComplexPassword('P@ssw0rd1234!@#$%^&*()');
    
    expect(['weak', 'medium', 'strong']).toContain(weak.strength);
    expect(['strong', 'very_strong']).toContain(strong.strength);
  });

  it('should return multiple errors for multiple violations', () => {
    const result = validateComplexPassword('abc');
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('validateOnboardingPassword', () => {
  it('should accept phrase-based passwords in auto mode', () => {
    const result = validateOnboardingPassword('correct horse battery staple');
    expect(result.valid).toBe(true);
    expect(result.type).toBe('phrase');
  });

  it('should accept complex passwords in auto mode', () => {
    const result = validateOnboardingPassword('P@ssw0rd123!');
    expect(result.valid).toBe(true);
    expect(result.type).toBe('complex');
  });

  it('should enforce coordinator-assigned mode (phrase)', () => {
    const result = validateOnboardingPassword('P@ssw0rd123!', 'coordinator-assigned');
    expect(result.valid).toBe(false);
  });

  it('should enforce user-chosen mode (complex)', () => {
    const result = validateOnboardingPassword('correct horse battery staple', 'user-chosen');
    expect(result.valid).toBe(false);
  });

  it('should reject empty passwords', () => {
    const result = validateOnboardingPassword('');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('required'))).toBe(true);
  });

  it('should provide clear error messages', () => {
    const result = validateOnboardingPassword('weak');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every(e => typeof e === 'string' && e.length > 0)).toBe(true);
  });

  it('should prefer phrase validation in auto mode', () => {
    // A valid phrase should be detected as phrase, not complex
    const result = validateOnboardingPassword('correct horse battery staple');
    expect(result.type).toBe('phrase');
  });
});

