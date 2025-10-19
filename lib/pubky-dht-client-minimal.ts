/**
 * Minimal Pubky DHT Client (dependency-free)
 *
 * Purpose: Provide only the functionality required by the verification-health-check
 * Netlify Function to probe PKARR DHT relay health without pulling in optional
 * dependencies (e.g., shamirs-secret-sharing, z32) from the full enhanced client.
 *
 * Exposed API: PubkyDHTClient with resolveRecord(publicKey)
 * - No publishing, no z-base-32 helpers, no secret sharing utilities
 * - Static ESM only; uses global fetch
 */

export interface PubkyDHTRecord {
  public_key: string;
  records: Array<{
    name: string;
    type: string;
    value: string;
    ttl: number;
  }>;
  timestamp: number;
  sequence: number;
  signature: string;
}

interface PubkyDHTCacheEntry {
  record: PubkyDHTRecord;
  expiresAt: number;
}

export class PubkyDHTClient {
  private relays: string[];
  private cache: Map<string, PubkyDHTCacheEntry> = new Map();
  private cacheTtl: number;
  private timeout: number;
  private debug: boolean;

  constructor(
    relays: string[] = [
      "https://pkarr.relay.pubky.tech",
      "https://pkarr.relay.synonym.to",
    ],
    cacheTtl: number = 3600000, // 1 hour
    timeout: number = 5000,
    debug: boolean = false
  ) {
    this.relays = relays;
    this.cacheTtl = cacheTtl;
    this.timeout = timeout;
    this.debug = debug;
  }

  /**
   * Resolve a record from DHT relays
   */
  async resolveRecord(publicKey: string): Promise<PubkyDHTRecord | null> {
    // Check cache first
    const cached = this.cache.get(publicKey);
    if (cached && cached.expiresAt > Date.now()) {
      if (this.debug) console.log(`[PubkyDHT-Min] Cache hit for ${publicKey}`);
      return cached.record;
    }

    // Try each relay sequentially; return on first success
    for (const relay of this.relays) {
      try {
        const record = await this.resolveFromRelay(relay, publicKey);
        if (record) {
          this.cache.set(publicKey, {
            record,
            expiresAt: Date.now() + this.cacheTtl,
          });
          if (this.debug)
            console.log(`[PubkyDHT-Min] Resolved from ${relay}: ${publicKey}`);
          return record;
        }
      } catch (e) {
        if (this.debug)
          console.log(`[PubkyDHT-Min] Failed to resolve from ${relay}:`, e);
      }
    }

    return null;
  }

  /**
   * Resolve from a single relay with timeout
   */
  private async resolveFromRelay(
    relay: string,
    publicKey: string
  ): Promise<PubkyDHTRecord | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${relay}/resolve/${publicKey}`, {
        method: "GET",
        signal: controller.signal,
      });

      if (!response.ok) return null;
      const json = (await response.json()) as unknown;

      // Minimal structural validation
      if (
        json &&
        typeof json === "object" &&
        typeof (json as any).public_key === "string" &&
        Array.isArray((json as any).records)
      ) {
        return json as PubkyDHTRecord;
      }

      return null;
    } catch (error) {
      if (this.debug)
        console.log(`[PubkyDHT-Min] Resolve from ${relay} failed:`, error);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

