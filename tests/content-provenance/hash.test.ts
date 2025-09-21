import { describe, it, expect } from 'vitest';
import { sha256Hex } from '../../src/lib/content-provenance/hashing';

describe('Content Provenance hashing', () => {
  it('SHA-256 of "abc" equals known vector', async () => {
    const h = await sha256Hex('abc');
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

