/*
 * Federation Client (cross-instance Satnam federation communication)
 * ESM-only, static imports, Netlify Functions compatible
 *
 * Federation-only scope: do not use for individual/private user workflows.
 * Individual users must use self-sovereign recovery and local flows.
 */

import type { FederationRole } from "../../src/types/auth";
import { verifyFederationResponsePayload } from "../functions/utils/federation-signature-verifier.js";
import { resolvePlatformLightningDomainServer } from "../functions/utils/domain.server.js";

/** Lightweight typed options for federation fetch */
export interface FederationRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  /**
   * Body will be JSON.stringify()'d if an object is provided and
   * Content-Type is not explicitly set. Pass a string/Uint8Array for raw.
   */
  body?: unknown;
  /** Defaults to true; if false, returns raw bytes as Uint8Array. */
  expectJson?: boolean;
  /** Optional: explicit public key (hex) for the target instance */
  publicKeyHex?: string;
}

/**
 * Resolve the federation instance public key.
 * Priority: explicit param > env var mapping > throw
 *
 * Env var convention (example):
 *   FEDERATION_PUBKEY_SATNAM_PUB = <hex>
 *   FEDERATION_PUBKEY_RELAY_SATNAM_PUB = <hex>
 */
function getFederationPublicKeyHex(domain: string, explicit?: string): string {
  if (explicit && typeof explicit === "string" && explicit.length > 0) {
    return explicit;
  }
  // Normalize domain to ENV key format
  const norm = domain.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const candidates = [
    `FEDERATION_PUBKEY_${norm}`,
  ];
  for (const key of candidates) {
    const v = process.env[key];
    if (v && v.length >= 64) return v;
  }
  throw new Error(
    `Federation public key not configured for domain: ${domain}. Provide publicKeyHex or set FEDERATION_PUBKEY_${norm}`
  );
}

export class FederatedSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FederatedSignatureError";
  }
}

export class FederationPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FederationPolicyError";
  }
}

export interface FederationFetchParams<TExpected = unknown> {
  /** Target instance domain, e.g., "api.satnam.pub" or "federation.example.org" */
  domain: string;
  /** Path on the target instance, e.g., "/api/identity/verify?nip05=..." */
  path: string;
  /** Federation role context; must not be "private" */
  contextRole: FederationRole;
  /** Optional public key hex for the target instance */
  publicKeyHex?: string;
  /** Request options */
  options?: FederationRequestOptions;
}

/**
 * Typed federation fetch wrapper with enforced signature verification.
 *
 * - Rejects role="private" callers (federation-only)
 * - Verifies Ed25519 signature via X-Signature headers from the response
 * - Parses JSON by default; set expectJson=false for raw bytes
 * - Throws clear, actionable errors for policy, network, and signature failures
 */
export async function federationFetch<T = unknown>(params: FederationFetchParams<T>): Promise<T> {
  const { domain, path, contextRole, publicKeyHex, options } = params;

  if (contextRole === "private") {
    throw new FederationPolicyError(
      "Federation-only operation: individual/private users must use self-sovereign flows"
    );
  }

  const method = (options?.method || "GET").toUpperCase();
  const headers: Record<string, string> = { ...(options?.headers || {}) };
  let bodyToSend: BodyInit | undefined;

  if (options?.body !== undefined && options?.body !== null) {
    if (typeof options.body === "string" || options.body instanceof Uint8Array) {
      bodyToSend = options.body as any;
    } else {
      // JSON body by default
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
      bodyToSend = JSON.stringify(options.body);
    }
  }

  if (!headers["Accept"]) headers["Accept"] = "application/json";

  // Resolve domain using server-side helper if provided a token like "platform"; otherwise use as-is
  let resolvedDomain = domain;
  try {
    // resolvePlatformLightningDomainServer returns a domain; if it throws or not relevant, use original domain
    resolvedDomain = resolvePlatformLightningDomainServer(domain) || domain;
  } catch {
    // Ignore, fall back to provided domain
  }

  const url = `https://${resolvedDomain}${path.startsWith("/") ? path : `/${path}`}`;

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: bodyToSend });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown network error";
    // eslint-disable-next-line no-console
    console.warn("[FederationClient] Network error", { domain: resolvedDomain, path, method, msg });
    throw new Error(`Federation fetch network error: ${msg}`);
  }

  // Read body for signature verification and parsing
  const rawBody = new Uint8Array(await res.clone().arrayBuffer());

  // Get or resolve target instance public key
  const targetPk = getFederationPublicKeyHex(resolvedDomain, publicKeyHex);

  // Verify signature (always, regardless of status)
  const verification = await verifyFederationResponsePayload(rawBody, res.headers as any, targetPk, contextRole);
  if (!verification.ok) {
    // eslint-disable-next-line no-console
    console.warn("[FederationClient] Signature verification failed", {
      domain: resolvedDomain,
      path,
      status: res.status,
      error: verification.error,
    });
    throw new FederatedSignatureError(`Federation signature invalid: ${verification.error || "unknown"}`);
  }

  // Non-2xx handling after signature verification
  if (!res.ok) {
    // Attempt to parse error payload for more info
    try {
      const txt = new TextDecoder().decode(rawBody);
      const maybeJson = JSON.parse(txt);
      throw new Error(`Federation responded ${res.status}: ${maybeJson?.error || txt || "unknown error"}`);
    } catch {
      throw new Error(`Federation responded ${res.status}`);
    }
  }

  // Parse according to expectation
  if (options?.expectJson === false) {
    return rawBody as unknown as T;
  }
  const text = new TextDecoder().decode(rawBody);
  try {
    return JSON.parse(text) as T;
  } catch {
    // eslint-disable-next-line no-console
    console.warn("[FederationClient] JSON parse failed; returning raw text", { domain: resolvedDomain, path });
    return text as unknown as T;
  }
}

/**
 * Usage example (documentation only):
 *
 * import { federationFetch } from "./federation-client";
 *
 * // Inside a Netlify function handler with a non-private federation role
 * const payload = await federationFetch<{ success: boolean; data: any }>({
 *   domain: "api.sibling.satnam.pub", // or a configured alias your resolver understands
 *   path: "/api/identity/verify?nip05=user@my.satnam.pub",
 *   contextRole: "steward",
 *   publicKeyHex: process.env.FEDERATION_PUBKEY_API_SIBLING_SATNAM_PUB, // or rely on env lookup
 *   options: { method: "GET" },
 * });
 *
 * // Use `payload` safely after signature verification
 */

/**
 * Testing guidance:
 * - Unit tests: mock global fetch to return a Response with specific headers/body.
 *   Compute a valid Ed25519 signature over SHA-256(body) and set X-Signature and X-Signature-Timestamp.
 * - Integration tests: point to a test federation instance and configure FEDERATION_PUBKEY_* env.
 * - For development, consider local fixtures and a dry-run mode that bypasses network (do not bypass signature in prod).
 */

