/**
 * Bind SUN/SDM nonce to NIP-42 auth by embedding a deterministic tag in a signed event
 */

export interface ChallengeBinding {
  tagName: string; // e.g., 'sun'
  value: string;   // opaque nonce (hex/base64)
}

export function makeSunBinding(nonce: string): ChallengeBinding {
  if (typeof nonce !== 'string' || !nonce.trim()) throw new Error('nonce required');
  return { tagName: 'sun', value: nonce };
}

export function bindingToTags(binding: ChallengeBinding): string[][] {
  return [[binding.tagName, binding.value]];
}

