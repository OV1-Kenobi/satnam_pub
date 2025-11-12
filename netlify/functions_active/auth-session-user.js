/**
 * Netlify Function: /api/auth/session-user
 * Purpose: Return authenticated user's essential data for SecureSession creation
 * Method: GET (credentials: include or Authorization: Bearer)
 * ESM-only. No CommonJS.
 */

import jwt from "jsonwebtoken";
import { generateDUIDFromNIP05 } from "../../lib/security/duid-generator.js";
import { SecureSessionManager } from "./security/session-manager.js";
import { supabase } from "./supabase.js";
import {
    RATE_LIMITS,
    checkRateLimit,
    createRateLimitIdentifier,
    getClientIP,
} from "./utils/enhanced-rate-limiter.js";
import {
    createRateLimitErrorResponse,
    generateRequestId,
    logError,
} from "./utils/error-handler.js";
import {
    errorResponse,
    jsonResponse,
    preflightResponse,
} from "./utils/security-headers.js";

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, part) => {
    const [k, ...rest] = part.trim().split("=");
    acc[k] = rest.join("=");
    return acc;
  }, {});
}

export const handler = async (event) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(event.headers);
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 Session user handler started:", {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  // Database-backed rate limiting
  const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
  const rateLimitAllowed = await checkRateLimit(
    rateLimitKey,
    RATE_LIMITS.AUTH_SESSION
  );

  if (!rateLimitAllowed) {
    logError(new Error("Rate limit exceeded"), {
      requestId,
      endpoint: "auth-session-user",
      method: event.httpMethod,
    });
    return createRateLimitErrorResponse(requestId, requestOrigin);
  }

  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }
  if (event.httpMethod !== "GET") {
    return errorResponse(405, "Method not allowed", requestId, requestOrigin);
  }

  try {
    // 1) Try Authorization: Bearer
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    let nip05 = undefined;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
        if (session?.nip05) nip05 = session.nip05;
      } catch {}
    }

    // 2) Fallback: refresh cookie
    if (!nip05) {
      const cookies = parseCookies(event.headers?.cookie);
      const refresh = cookies?.["satnam_refresh_token"];
      if (!refresh) {
        const response = errorResponse(401, "Unauthorized", requestId, requestOrigin);
        response.headers["X-Auth-Handler"] = "auth-session-user-fn";
        return response;
      }
      try {
        const { getJwtSecret } = await import("./utils/jwt-secret.js");
        const secret = getJwtSecret();
        const payload = jwt.verify(refresh, secret, {
          algorithms: ["HS256"],
          issuer: "satnam.pub",
          audience: "satnam.pub-users",
        });
        const obj = typeof payload === "string" ? JSON.parse(payload) : payload;
        if (obj?.type !== "refresh" || !obj?.nip05) {
          return errorResponse(401, "Invalid token", requestId, requestOrigin);
        }
        nip05 = obj.nip05;
      } catch {
        const response = errorResponse(401, "Unauthorized", requestId, requestOrigin);
        response.headers["X-Auth-Handler"] = "auth-session-user-fn";
        return response;
      }
    }

    if (!nip05) {
      const response = errorResponse(401, "Unauthorized", requestId, requestOrigin);
      response.headers["X-Auth-Handler"] = "auth-session-user-fn";
      return response;
    }

    // 3) Look up user by DUID derived from nip05 (server-side)
    const duid = await generateDUIDFromNIP05(nip05);

    // CRITICAL FIX: Use correct privacy-first schema column names
    const { data: user, error: userError, status } = await supabase
      .from("user_identities")
      .select(`
        id,
        role,
        is_active,
        user_salt,
        encrypted_nsec,
        encrypted_nsec_iv
      `)
      .eq("id", duid)
      .single();

    if (userError || !user) {
      const code = status === 406 ? 404 : 500;
      return errorResponse(code, "User not found", requestId, requestOrigin);
    }

    // CRITICAL FIX: Map privacy-first schema fields correctly
    const userPayload = {
      id: user.id,
      nip05,
      role: user.role || "private",
      is_active: user.is_active !== false,
      user_salt: user.user_salt || null,
      encrypted_nsec: user.encrypted_nsec || null,
      encrypted_nsec_iv: user.encrypted_nsec_iv || null
    };

    const response = jsonResponse(200, { success: true, data: { user: userPayload } }, requestOrigin);
    response.headers["X-Auth-Handler"] = "auth-session-user-fn";
    response.headers["X-Has-Encrypted"] = userPayload.encrypted_nsec ? "1" : "0";
    response.headers["X-Has-Salt"] = userPayload.user_salt ? "1" : "0";
    response.headers["X-Has-Encrypted-IV"] = userPayload.encrypted_nsec_iv ? "1" : "0";
    return response;
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "auth-session-user",
      method: event.httpMethod,
    });
    return errorResponse(500, "Internal server error", requestId, requestOrigin);
  }
};

