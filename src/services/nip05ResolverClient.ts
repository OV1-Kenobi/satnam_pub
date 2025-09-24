/*
 * Client utility for resolving NIP-05 -> did:scid + mirrors via Netlify function
 * - Memoized to avoid duplicate network calls from hover/open interactions
 * - Browser-only (uses fetch); safe for SSR as it only hits same-origin function
 */

export type Nip05Resolution = {
  nip05: string;
  didScid: string;
  mirrors: string[];
  issuerRegistryStatus: string | null;
};

const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

class Nip05ResolverClient {
  private cache = new Map<string, { exp: number; value: Nip05Resolution }>();

  private now() {
    return Date.now();
  }

  clear() {
    this.cache.clear();
  }

  async resolve(nip05: string): Promise<Nip05Resolution> {
    const key = nip05.trim().toLowerCase();
    if (!key || !key.includes('@')) throw new Error('Invalid nip05');

    const hit = this.cache.get(key);
    if (hit && hit.exp > this.now()) {
      return hit.value;
    }

    const url = `/.netlify/functions/nip05-resolver?nip05=${encodeURIComponent(key)}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`nip05-resolver failed: ${res.status}`);
    }
    const body = await res.json();
    if (!body?.success || !body?.data) {
      throw new Error('nip05-resolver: invalid response body');
    }

    const value: Nip05Resolution = body.data as Nip05Resolution;
    this.cache.set(key, { exp: this.now() + CACHE_TTL_MS, value });
    return value;
  }
}

export const nip05ResolverClient = new Nip05ResolverClient();
export default nip05ResolverClient;

