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
import { allowRequest } from "./utils/rate-limiter.js";

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, part) => {
    const [k, ...rest] = part.trim().split("=");
    acc[k] = rest.join("=");
    return acc;
  }, {});
}

function corsHeaders(origin) {
  // In production you may restrict this further to https://www.satnam.pub
  const allowed = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()) || ["*"]; 
  const corsOrigin = allowed.includes("*") ? origin || "*" : (allowed.includes(origin || "") ? origin : allowed[0] || "*");
  return {
    "Access-Control-Allow-Origin": corsOrigin || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

export const handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || "*";
  const headers = corsHeaders(origin);

  // Rate limit by IP (best-effort)
  const clientIP = String(
    event.headers?.["x-forwarded-for"] || event.headers?.["x-real-ip"] || "unknown"
  );
  if (!allowRequest(clientIP, 30, 60_000)) {
    return { statusCode: 429, headers, body: JSON.stringify({ success: false, error: "Too many attempts" }) };
    }

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: "Method not allowed" }) };
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
        return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: "Unauthorized" }) };
      }
      try {
        const { getJwtSecret } = await import("./utils/jwt-secret.js");
        const secret = getJwtSecret();
        const payload = jwt.verify(refresh, secret, {
          algorithms: ["HS256"], issuer: "satnam.pub", audience: "satnam.pub-users",
        });
        const obj = typeof payload === "string" ? JSON.parse(payload) : payload;
        if (obj?.type !== "refresh" || !obj?.nip05) {
          return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: "Invalid token" }) };
        }
        nip05 = obj.nip05;
      } catch {
        return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: "Unauthorized" }) };
      }
    }

    if (!nip05) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: "Unauthorized" }) };
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
      return { statusCode: code, headers, body: JSON.stringify({ success: false, error: "User not found" }) };
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

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: { user: userPayload } }) };
  } catch (error) {
    console.error("auth-session-user error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "Internal server error" }) };
  }
};

