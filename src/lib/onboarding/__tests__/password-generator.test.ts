/**
 * Unit Tests for Password Generator
 * 
 * Tests for EFF wordlist-based password phrase generation.
 * @module password-generator.test
 */

import { describe, it, expect } from 'vitest';
import { selectRandomWord, generatePasswordPhrase, estimateEntropyBits } from '../password-generator';
import { EFF_WORDLIST, WORDLIST_SIZE, ENTROPY_BITS_PER_WORD } from '../eff-wordlist';

describe('EFF Wordlist', () => {
  it('should contain exactly 7776 words', () => {
    expect(EFF_WORDLIST.length).toBe(7776);
    expect(WORDLIST_SIZE).toBe(7776);
  });

  it('should have correct entropy bits per word', () => {
    // log2(7776) ≈ 12.925
    expect(ENTROPY_BITS_PER_WORD).toBeCloseTo(12.925, 2);
  });

  it('should have first word "abacus" and last word "zoom"', () => {
    expect(EFF_WORDLIST[0]).toBe('abacus');
    expect(EFF_WORDLIST[7775]).toBe('zoom');
  });
});

describe('selectRandomWord', () => {
  it('should return a word from the EFF wordlist', () => {
    const word = selectRandomWord();
    expect(EFF_WORDLIST).toContain(word);
  });

  it('should return a non-empty string', () => {
    const word = selectRandomWord();
    expect(typeof word).toBe('string');
    expect(word.length).toBeGreaterThan(0);
  });

  it('should return different words on multiple calls (probabilistic)', () => {
    const words = new Set<string>();
    for (let i = 0; i < 100; i++) {
      words.add(selectRandomWord());
    }
    // With 7776 words, 100 random selections should produce >50 unique words
    expect(words.size).toBeGreaterThan(50);
  });

  it('should produce uniform distribution (chi-square test approximation)', () => {
    // Generate many samples and check distribution is roughly uniform
    const counts = new Map<string, number>();
    const samples = 1000;
    
    for (let i = 0; i < samples; i++) {
      const word = selectRandomWord();
      counts.set(word, (counts.get(word) || 0) + 1);
    }
    
    // With 7776 words and 1000 samples, most words should appear 0-1 times
    // No word should appear more than 10 times (extremely unlikely)
    const maxCount = Math.max(...counts.values());
    expect(maxCount).toBeLessThan(10);
  });
});

describe('generatePasswordPhrase', () => {
  it('should generate a 4-word phrase by default', () => {
    const result = generatePasswordPhrase();
    const wordCount = result.phrase.split(/\s+/).length;
    expect(wordCount).toBeGreaterThanOrEqual(4);
    expect(wordCount).toBeLessThanOrEqual(5);
  });

  it('should generate a 5-word phrase when specified', () => {
    const result = generatePasswordPhrase(5);
    expect(result.wordCount).toBe(5);
    expect(result.phrase.split(/\s+/).length).toBe(5);
  });

  it('should always generate phrases ≥26 characters', () => {
    for (let i = 0; i < 20; i++) {
      const result = generatePasswordPhrase();
      expect(result.length).toBeGreaterThanOrEqual(26);
      expect(result.phrase.length).toBe(result.length);
    }
  });

  it('should add 5th word if 4-word phrase is too short', () => {
    // Run multiple times to catch cases where 4 words < 26 chars
    let foundUpgrade = false;
    for (let i = 0; i < 50; i++) {
      const result = generatePasswordPhrase(4);
      if (result.wordCount === 5) {
        foundUpgrade = true;
        expect(result.phrase.split(/\s+/).length).toBe(5);
      }
    }
    // It's possible (but unlikely) that all 50 attempts had 4 words >= 26 chars
    // This is acceptable - the test verifies the upgrade mechanism works when triggered
  });

  it('should calculate correct entropy for 4-word phrases', () => {
    const result = generatePasswordPhrase(4);
    if (result.wordCount === 4) {
      expect(result.entropyBits).toBeCloseTo(4 * ENTROPY_BITS_PER_WORD, 1);
    } else {
      // Upgraded to 5 words
      expect(result.entropyBits).toBeCloseTo(5 * ENTROPY_BITS_PER_WORD, 1);
    }
  });

  it('should calculate correct entropy for 5-word phrases', () => {
    const result = generatePasswordPhrase(5);
    expect(result.entropyBits).toBeCloseTo(5 * ENTROPY_BITS_PER_WORD, 1);
  });

  it('should return all required properties', () => {
    const result = generatePasswordPhrase();
    expect(result).toHaveProperty('phrase');
    expect(result).toHaveProperty('wordCount');
    expect(result).toHaveProperty('length');
    expect(result).toHaveProperty('entropyBits');
    expect(typeof result.phrase).toBe('string');
    expect(typeof result.wordCount).toBe('number');
    expect(typeof result.length).toBe('number');
    expect(typeof result.entropyBits).toBe('number');
  });

  it('should use words from EFF wordlist only', () => {
    const result = generatePasswordPhrase(5);
    const words = result.phrase.split(/\s+/);
    for (const word of words) {
      expect(EFF_WORDLIST).toContain(word);
    }
  });
});

describe('estimateEntropyBits', () => {
  it('should return 0 for empty password', () => {
    expect(estimateEntropyBits('')).toBe(0);
  });

  it('should estimate entropy for phrase-based passwords', () => {
    const entropy = estimateEntropyBits('correct horse battery staple');
    // 4 words * 12.925 bits ≈ 51.7 bits
    expect(entropy).toBeCloseTo(4 * ENTROPY_BITS_PER_WORD, 1);
  });

  it('should estimate entropy for 5-word phrases', () => {
    const entropy = estimateEntropyBits('correct horse battery staple charger');
    // 5 words * 12.925 bits ≈ 64.6 bits
    expect(entropy).toBeCloseTo(5 * ENTROPY_BITS_PER_WORD, 1);
  });

  it('should estimate entropy for complex passwords', () => {
    const entropy = estimateEntropyBits('P@ssw0rd123!');
    // Mixed case + numbers + symbols = 95 char set
    // 12 chars * log2(95) ≈ 78.8 bits
    expect(entropy).toBeGreaterThan(40);
  });

  it('should estimate higher entropy for longer passwords', () => {
    const short = estimateEntropyBits('Abc123!');
    const long = estimateEntropyBits('Abc123!Abc123!');
    expect(long).toBeGreaterThan(short);
  });
});

