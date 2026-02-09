/**
 * Password Phrase Generator for High-Volume Onboarding
 * 
 * Generates cryptographically secure password phrases using the EFF long wordlist.
 * Uses Web Crypto API for browser-compatible random number generation.
 * 
 * @module password-generator
 * @sensitive This module generates password material
 */

import { EFF_WORDLIST, WORDLIST_SIZE, ENTROPY_BITS_PER_WORD } from './eff-wordlist';
import {
  ONBOARDING_PASSWORD_MIN_LENGTH,
  ONBOARDING_PASSWORD_MIN_WORDS,
  ONBOARDING_PASSWORD_MAX_WORDS,
} from '../../config/onboarding';

/**
 * Result of password phrase generation
 */
export interface PasswordPhraseResult {
  /** Space-separated words, e.g., "correct horse battery staple" */
  phrase: string;
  /** Number of words in the phrase */
  wordCount: 4 | 5;
  /** Total character count (including spaces) */
  length: number;
  /** Calculated entropy in bits (~51.6 for 4 words, ~64.5 for 5) */
  entropyBits: number;
}

/**
 * Selects a cryptographically random word from the EFF wordlist.
 * 
 * Uses Web Crypto API with rejection sampling to eliminate modulo bias.
 * This ensures uniform distribution across all 7776 words.
 * 
 * @sensitive This function is part of the password generation pipeline
 * @returns A random word from the 7776-word EFF wordlist
 */
export function selectRandomWord(): string {
  // Calculate the maximum valid value to avoid modulo bias
  // We want values in range [0, maxValidValue) to be evenly divisible by WORDLIST_SIZE
  const maxValidValue = Math.floor((2 ** 32) / WORDLIST_SIZE) * WORDLIST_SIZE;
  
  let randomValue: number;
  
  // Rejection sampling: keep generating until we get a value in the valid range
  do {
    const randomArray = new Uint32Array(1);
    crypto.getRandomValues(randomArray);
    randomValue = randomArray[0];
  } while (randomValue >= maxValidValue);
  
  // Now we can safely use modulo without bias
  const index = randomValue % WORDLIST_SIZE;
  
  return EFF_WORDLIST[index];
}

/**
 * Generates a secure password phrase using the EFF wordlist.
 * 
 * Automatically ensures the phrase meets the minimum length requirement (26 characters)
 * by adding a 5th word if needed.
 * 
 * @sensitive This function generates password material
 * @param wordCount - Number of words (4 or 5). Defaults to 4.
 * @returns PasswordPhraseResult with phrase, metadata, and entropy calculation
 */
export function generatePasswordPhrase(wordCount: 4 | 5 = 4): PasswordPhraseResult {
  const words: string[] = [];
  
  // Generate the requested number of words
  for (let i = 0; i < wordCount; i++) {
    words.push(selectRandomWord());
  }
  
  let phrase = words.join(' ');
  let finalWordCount = wordCount;
  
  // If phrase is too short, add a 5th word
  if (phrase.length < ONBOARDING_PASSWORD_MIN_LENGTH && wordCount === 4) {
    words.push(selectRandomWord());
    phrase = words.join(' ');
    finalWordCount = 5;
  }
  
  // Calculate entropy: each word provides ~12.925 bits
  const entropyBits = finalWordCount * ENTROPY_BITS_PER_WORD;
  
  return {
    phrase,
    wordCount: finalWordCount,
    length: phrase.length,
    entropyBits,
  };
}

/**
 * Estimates entropy bits for a given password string.
 * 
 * Used for password strength indicators in the UI.
 * 
 * For phrase-based passwords (4-5 words, ≥26 chars): returns wordCount * 12.925
 * For complex passwords: estimates based on character set size and length
 * 
 * @param password - The password to analyze
 * @returns Estimated entropy in bits
 */
export function estimateEntropyBits(password: string): number {
  if (!password) return 0;
  
  const length = password.length;
  
  // Check if it looks like a phrase-based password (4-5 words, ≥26 chars)
  if (length >= ONBOARDING_PASSWORD_MIN_LENGTH) {
    const wordCount = password.trim().split(/\s+/).length;
    if (wordCount >= ONBOARDING_PASSWORD_MIN_WORDS && wordCount <= ONBOARDING_PASSWORD_MAX_WORDS) {
      // Phrase-based password: use EFF wordlist entropy
      return wordCount * ENTROPY_BITS_PER_WORD;
    }
  }
  
  // Complex password: estimate based on character set
  let charsetSize = 0;
  
  if (/[a-z]/.test(password)) charsetSize += 26; // lowercase
  if (/[A-Z]/.test(password)) charsetSize += 26; // uppercase
  if (/[0-9]/.test(password)) charsetSize += 10; // digits
  if (/[^A-Za-z0-9]/.test(password)) charsetSize += 33; // symbols (approximate)
  
  // Entropy = log2(charsetSize^length) = length * log2(charsetSize)
  if (charsetSize === 0) return 0;
  
  return length * Math.log2(charsetSize);
}

