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

// Security utilities (Phase 2 hardening)
import {
  RATE_LIMITS,
  checkRateLimitStatus,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.ts";
import {
  createRateLimitErrorResponse,
  createValidationErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.ts";
import {
  errorResponse,
  getSecurityHeaders,
  preflightResponse,
} from "./utils/security-headers.ts";

import { SecureSessionManager } from "./security/session-manager.js";
import { getRequestClient } from "./supabase.js";

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
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 Issuer registry handler started:", {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  const method = (event.httpMethod || "GET").toUpperCase();

  try {
    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitResult = await checkRateLimitStatus(
      rateLimitKey,
      RATE_LIMITS.IDENTITY_PUBLISH
    );

    if (!rateLimitResult.allowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "issuer-registry",
        method,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Anonymous GET by issuer_did
    if (method === "GET") {
      const issuer_did = event.queryStringParameters?.issuer_did?.trim();
      const supabase = getRequestClient(undefined);
      if (issuer_did) {
        const { data, error } = await supabase
          .from("issuer_registry")
          .select(
            "issuer_did, method, status, scid_format, scid_version, src_urls"
          )
          .eq("issuer_did", issuer_did)
          .maybeSingle();
        if (error) {
          return errorResponse(404, "Not found", requestOrigin);
        }
        const headers = getSecurityHeaders(requestOrigin);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: data || null }),
        };
      }

      // Auth required for list
      const auth = event.headers?.authorization;
      const session = await SecureSessionManager.validateSessionFromHeader(
        auth
      );
      if (!session || !isStewardOrGuardian(session.federationRole)) {
        return errorResponse(401, "Unauthorized", requestOrigin);
      }
      const supAuthed = getRequestClient(auth?.slice(7));
      const { data, error } = await supAuthed
        .from("issuer_registry")
        .select(
          "issuer_did, method, status, scid_format, scid_version, src_urls"
        )
        .limit(100);
      if (error) {
        logError(error, {
          requestId,
          endpoint: "issuer-registry",
          operation: "list",
        });
        return errorResponse(500, error.message, requestOrigin);
      }
      const headers = getSecurityHeaders(requestOrigin);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data }),
      };
    }

    // POST (create) & PATCH (update) require steward/guardian
    if (method === "POST" || method === "PATCH") {
      const auth = event.headers?.authorization;
      const session = await SecureSessionManager.validateSessionFromHeader(
        auth
      );
      if (!session || !isStewardOrGuardian(session.federationRole)) {
        return errorResponse(401, "Unauthorized", requestOrigin);
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
          return createValidationErrorResponse(
            "issuer_did and method required",
            requestId,
            requestOrigin
          );
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
          scid_version:
            typeof body.scid_version === "number" ? body.scid_version : null,
          src_urls: Array.isArray(body.src_urls) ? body.src_urls : null,
        };

        const { error } = await supabase
          .from("issuer_registry")
          .insert(payload);
        if (error) {
          logError(error, {
            requestId,
            endpoint: "issuer-registry",
            operation: "create",
          });
          return errorResponse(400, error.message, requestOrigin);
        }
        const headers = getSecurityHeaders(requestOrigin);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true }),
        };
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
        if (!body.issuer_did) {
          return createValidationErrorResponse(
            "issuer_did required",
            requestId,
            requestOrigin
          );
        }

        const updates: any = {};
        if (typeof body.status === "string") updates.status = body.status;
        if (typeof body.scid_format === "string" || body.scid_format === null)
          updates.scid_format = body.scid_format;
        if (typeof body.scid_version === "number" || body.scid_version === null)
          updates.scid_version = body.scid_version;
        if (Array.isArray(body.src_urls) || body.src_urls === null)
          updates.src_urls = body.src_urls;

        if (Object.keys(updates).length === 0) {
          return createValidationErrorResponse(
            "No updatable fields provided",
            requestId,
            requestOrigin
          );
        }

        const { error } = await supabase
          .from("issuer_registry")
          .update(updates)
          .eq("issuer_did", body.issuer_did);
        if (error) {
          logError(error, {
            requestId,
            endpoint: "issuer-registry",
            operation: "update",
          });
          return errorResponse(400, error.message, requestOrigin);
        }
        const headers = getSecurityHeaders(requestOrigin);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true }),
        };
      }
    }

    return errorResponse(405, "Method not allowed", requestOrigin);
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "issuer-registry",
      method,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
