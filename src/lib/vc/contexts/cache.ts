/**
 * JSON-LD Context Cache (offline-first)
 * Light-weight utilities to avoid heavy JSON-LD libs while enabling basic validation.
 * - Offline cache for common contexts
 * - Optional network fetch to populate cache
 * - Deterministic JSON canonicalization helper
 */

export interface ContextResolution {
  ok: boolean;
  context?: unknown;
  error?: string;
  fromCache?: boolean;
}

// Minimal offline contexts to avoid network during validation
const OFFLINE_CONTEXTS: Record<string, unknown> = {
  "https://www.w3.org/ns/credentials/v2": { "@context": { "@version": 1.1 } },
  "https://w3id.org/security/suites/jws-2020/v1": {
    "@context": { "@version": 1.1 },
  },
  "https://w3id.org/security/suites/ed25519-2020/v1": {
    "@context": { "@version": 1.1 },
  },
};

// In-memory, runtime-populated cache for fetched contexts
const RUNTIME_CONTEXTS: Record<string, unknown> = {};

export function resolveContext(url: string): ContextResolution {
  try {
    if (OFFLINE_CONTEXTS[url]) {
      return { ok: true, context: OFFLINE_CONTEXTS[url], fromCache: true };
    }
    if (RUNTIME_CONTEXTS[url]) {
      return { ok: true, context: RUNTIME_CONTEXTS[url], fromCache: true };
    }
    return { ok: false, error: "not-in-cache" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

/**
 * Attempt to resolve a context from the network and cache it. Offline-first.
 */
export async function resolveContextAsync(
  url: string
): Promise<ContextResolution> {
  const r = resolveContext(url);
  if (r.ok) return r;
  try {
    if (typeof fetch !== "function")
      return { ok: false, error: "fetch-unavailable" };
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return { ok: false, error: `http-${res.status}` };
    const json = await res.json();
    RUNTIME_CONTEXTS[url] = json;
    return { ok: true, context: json, fromCache: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

/**
 * Deterministic canonicalization for JSON objects: sorts keys, drops undefined, recurses
 */
export function canonicalizeJSON(obj: unknown): string {
  const seen = new WeakSet();
  const canon = (x: any): any => {
    if (x === null || typeof x !== "object") return x;
    if (seen.has(x)) return null;
    seen.add(x);
    if (Array.isArray(x)) return x.map(canon);
    const out: Record<string, any> = {};
    Object.keys(x)
      .filter((k) => typeof x[k] !== "undefined")
      .sort()
      .forEach((k) => {
        out[k] = canon(x[k]);
      });
    return out;
  };
  return JSON.stringify(canon(obj));
}
