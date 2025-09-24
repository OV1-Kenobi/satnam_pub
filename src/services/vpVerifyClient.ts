/*
 * Client utility for VP verification (NIP-05 cross-check + did:scid validation)
 * - Memoized with 5-minute TTL to avoid duplicate requests
 * - 10s default timeout with AbortController
 * - Graceful error handling with fallback values
 */

export type HolderPublicJwk = {
  kty: "EC";
  crv: "secp256k1";
  x: string; // base64url
  y: string; // base64url
};

export type VpVerifyRequest = {
  nip05: string;
  holderPublicJwk: HolderPublicJwk;
  didJsonUrls?: string[];
};

export type VpVerifyResult = {
  nip05Verified: boolean;
  didDocumentVerified: boolean;
  mirrorsValidated: string[];
  issuerRegistryStatus: string | null;
  didScid: string | null;
};

const CACHE_TTL_MS = 5 * 60_000; // 5 min
const DEFAULT_TIMEOUT_MS = 10_000; // 10s

class VpVerifyClient {
  private cache = new Map<string, { exp: number; value: VpVerifyResult }>();
  private now() { return Date.now(); }
  clear() { this.cache.clear(); }

  private keyOf(req: VpVerifyRequest): string {
    return `${req.nip05.toLowerCase()}|${req.holderPublicJwk.x}|${req.holderPublicJwk.y}|${(req.didJsonUrls||[]).join(',')}`;
  }

  async verify(req: VpVerifyRequest, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<VpVerifyResult> {
    const key = this.keyOf(req);
    const hit = this.cache.get(key);
    if (hit && hit.exp > this.now()) return hit.value;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch('/.netlify/functions/nfc-resolver/vp-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`vp-verify failed: ${res.status}`);
      const body = await res.json();
      if (!body?.success || typeof body?.data !== 'object') throw new Error('vp-verify invalid response');
      const value: VpVerifyResult = {
        nip05Verified: !!body.data.nip05Verified,
        didDocumentVerified: !!body.data.didDocumentVerified,
        mirrorsValidated: Array.isArray(body.data.mirrorsValidated) ? body.data.mirrorsValidated : [],
        issuerRegistryStatus: body.data.issuerRegistryStatus ?? null,
        didScid: typeof body.data.didScid === 'string' ? body.data.didScid : null,
      };
      this.cache.set(key, { exp: this.now() + CACHE_TTL_MS, value });
      return value;
    } catch (e) {
      // Fallback: safe defaults
      return { nip05Verified: false, didDocumentVerified: false, mirrorsValidated: [], issuerRegistryStatus: null, didScid: null };
    } finally {
      clearTimeout(t);
    }
  }
}

export const vpVerifyClient = new VpVerifyClient();
export default vpVerifyClient;

