/*
 * Issuer Registry management (multi-issuer governance controls)
 * ESM-only, JWT auth via SecureSessionManager (no cookies), RLS-friendly with per-request Supabase client
 *
 * Routes:
 * - GET  /.netlify/functions/issuer-registry?issuer_did=did:...
 *         Anonymous read of a single issuer record (privacy-safe status)
 * - GET  /.netlify/functions/issuer-registry            (auth required: steward|guardian) - list
 * - POST /.netlify/functions/issuer-registry            (auth required: steward|guardian) - create
 * - PATCH/.netlify/functions/issuer-registry            (auth required: steward|guardian) - update
 */

import type { Handler } from "@netlify/functions";
import { allowRequest } from "./utils/rate-limiter.js";
import { getRequestClient } from "./supabase.js";
import { SecureSessionManager } from "./security/session-manager.js";

const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
    "Content-Security-Policy": "default-src 'none'",
  } as const;
}

function json(status: number, body: unknown) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
    body: JSON.stringify(body),
  };
}

function isStewardOrGuardian(role: string | undefined | null): boolean {
  return role === "steward" || role === "guardian";
}

function parseBody<T>(eventBody: string | null | undefined): T {
  try {
    return (eventBody ? JSON.parse(eventBody) : {}) as T;
  } catch {
    return {} as T;
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...corsHeaders() }, body: "" };
  }

  // Minimal per-IP rate limiting
  const xfwd = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
  const clientIp = Array.isArray(xfwd) ? xfwd[0] : (xfwd || "").split(",")[0]?.trim() || "unknown";
  if (!allowRequest(clientIp, 180, 60_000)) return json(429, { success: false, error: "Too many requests" });

  const method = (event.httpMethod || "GET").toUpperCase();

  // Anonymous GET by issuer_did
  if (method === "GET") {
    const issuer_did = event.queryStringParameters?.issuer_did?.trim();
    try {
      const supabase = getRequestClient(undefined);
      if (issuer_did) {
        const { data, error } = await supabase
          .from("issuer_registry")
          .select("issuer_did, method, status, scid_format, scid_version, src_urls")
          .eq("issuer_did", issuer_did)
          .maybeSingle();
        if (error) return json(404, { success: false, error: "Not found" });
        return json(200, { success: true, data: data || null });
      }

      // Auth required for list
      const auth = event.headers?.authorization;
      const session = await SecureSessionManager.validateSessionFromHeader(auth);
      if (!session || !isStewardOrGuardian(session.federationRole)) {
        return json(401, { success: false, error: "Unauthorized" });
      }
      const supAuthed = getRequestClient(auth?.slice(7));
      const { data, error } = await supAuthed
        .from("issuer_registry")
        .select("issuer_did, method, status, scid_format, scid_version, src_urls")
        .limit(100);
      if (error) return json(500, { success: false, error: error.message });
      return json(200, { success: true, data });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return json(500, { success: false, error: message });
    }
  }

  // POST (create) & PATCH (update) require steward/guardian
  if (method === "POST" || method === "PATCH") {
    const auth = event.headers?.authorization;
    const session = await SecureSessionManager.validateSessionFromHeader(auth);
    if (!session || !isStewardOrGuardian(session.federationRole)) {
      return json(401, { success: false, error: "Unauthorized" });
    }
    const supabase = getRequestClient(auth?.slice(7));

    if (method === "POST") {
      type CreateBody = {
        issuer_did: string;
        method: string; // expect 'did:scid' or 'did:web'
        status?: string; // active|paused|revoked|pending
        scid_format?: string | null;
        scid_version?: number | null;
        src_urls?: string[] | null;
      };
      const body = parseBody<CreateBody>(event.body);
      if (!body.issuer_did || !body.method) {
        return json(422, { success: false, error: "issuer_did and method required" });
      }
      if (!/^did:(scid|web):/i.test(body.method)) {
        // method is column value (e.g., 'did:scid'), issuer_did is the DID value
        // We allow did:web rows as well for completeness
      }

      const payload: any = {
        issuer_did: body.issuer_did,
        method: body.method,
        status: body.status || "pending",
        scid_format: body.scid_format ?? null,
        scid_version: typeof body.scid_version === 'number' ? body.scid_version : null,
        src_urls: Array.isArray(body.src_urls) ? body.src_urls : null,
      };

      const { error } = await supabase.from("issuer_registry").insert(payload);
      if (error) return json(400, { success: false, error: error.message });
      return json(200, { success: true });
    }

    if (method === "PATCH") {
      type UpdateBody = {
        issuer_did: string; // required key
        status?: string;
        scid_format?: string | null;
        scid_version?: number | null;
        src_urls?: string[] | null;
      };
      const body = parseBody<UpdateBody>(event.body);
      if (!body.issuer_did) return json(422, { success: false, error: "issuer_did required" });

      const updates: any = {};
      if (typeof body.status === 'string') updates.status = body.status;
      if (typeof body.scid_format === 'string' || body.scid_format === null) updates.scid_format = body.scid_format;
      if (typeof body.scid_version === 'number' || body.scid_version === null) updates.scid_version = body.scid_version;
      if (Array.isArray(body.src_urls) || body.src_urls === null) updates.src_urls = body.src_urls;

      if (Object.keys(updates).length === 0) {
        return json(422, { success: false, error: "No updatable fields provided" });
      }

      const { error } = await supabase
        .from("issuer_registry")
        .update(updates)
        .eq("issuer_did", body.issuer_did);
      if (error) return json(400, { success: false, error: error.message });
      return json(200, { success: true });
    }
  }

  return json(405, { success: false, error: "Method not allowed" });
};

