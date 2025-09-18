// Netlify Function: auth-migration-otp-verify
// Purpose: Verify user-submitted TOTP for Account Migration with replay protection and rate limiting

import type { Handler } from "@netlify/functions";
import { TOTP_CONFIG, verifyTOTP } from "../../utils/crypto";
import { supabase } from "./supabase.js";
import { allowRequest } from "./utils/rate-limiter.js";

function parseJSON(body: string | null): any {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function corsHeaders(origin?: string) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  } as Record<string, string>;
}

// Maintain a minimal in-memory replay cache as additional defense (per instance)
const recentCodes = new Map<string, { code: string; ts: number }[]>(); // key: sessionId

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders(event.headers.origin),
      body: "",
    };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders(event.headers.origin),
      body: JSON.stringify({ success: false, error: "Method not allowed" }),
    };
  }

  const headers = corsHeaders(event.headers.origin);

  // Basic IP-based rate limit
  const xForwardedFor = event.headers["x-forwarded-for"];
  const ip = xForwardedFor
    ? xForwardedFor.split(",")[0].trim()
    : event.headers["client-ip"] || "unknown";
  if (!allowRequest(`ver:${ip}`, 20, 60_000)) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Rate limit exceeded. Please wait and try again.",
      }),
    };
  }

  const { sessionId, npub, code } = parseJSON(event.body || null);
  if (!sessionId || typeof sessionId !== "string") {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: "Missing sessionId" }),
    };
  }
  if (!npub || typeof npub !== "string" || !npub.startsWith("npub1")) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Invalid or missing npub",
      }),
    };
  }
  if (!code || typeof code !== "string" || code.length !== TOTP_CONFIG.DIGITS) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: "Invalid code" }),
    };
  }

  try {
    // Load session
    const { data: session, error } = await supabase
      .from("migration_otp_sessions")
      .select(
        "session_id, npub, totp_secret, used_codes, attempt_count, created_at, expires_at, last_attempt_at"
      )
      .eq("session_id", sessionId)
      .eq("npub", npub)
      .single();

    if (error || !session) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, error: "Session not found" }),
      };
    }

    const now = Date.now();
    const exp = Date.parse(session.expires_at);
    if (isNaN(exp) || now > exp) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Code expired",
          expired: true,
        }),
      };
    }

    // Enforce max 3 verification attempts per 15 minutes per npub
    const lastAttempt = session.last_attempt_at
      ? Date.parse(session.last_attempt_at)
      : 0;
    const withinWindow = now - 15 * 60 * 1000 < (lastAttempt || 0);
    const attempts = Number(session.attempt_count) || 0;
    if (attempts >= 3 && withinWindow) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Too many attempts. Please wait 15 minutes.",
        }),
      };
    }

    // Replay protection (DB + in-memory)
    try {
      const recentForSession = (recentCodes.get(sessionId) || []).filter(
        (e) => now - e.ts <= 5 * 60 * 1000
      );
      if (recentForSession.some((e) => e.code === code)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: "Code already used",
            replayAttack: true,
          }),
        };
      }
    } catch {}

    // Verify TOTP (RFC 6238, SHA-256, 120s windows, ±1)
    const result = await verifyTOTP(code, session.totp_secret);
    if (!result.valid) {
      // Increment attempt count and update last_attempt_at
      await supabase
        .from("migration_otp_sessions")
        .update({
          attempt_count: attempts + 1,
          last_attempt_at: new Date().toISOString(),
        })
        .eq("session_id", sessionId);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: "Invalid code" }),
      };
    }

    // Mark code as used (replay blacklist) and optionally shorten session expiry
    const usedList: Array<{ code: string; used_at: string }> = Array.isArray(
      session.used_codes
    )
      ? session.used_codes
      : [];
    // Keep only codes within the last 5 minutes
    const pruned = usedList.filter((e) => {
      const t = Date.parse(e.used_at);
      return !isNaN(t) && now - t <= 5 * 60 * 1000;
    });
    pruned.push({ code, used_at: new Date().toISOString() });

    await supabase
      .from("migration_otp_sessions")
      .update({
        used_codes: pruned,
        attempt_count: attempts + 1,
        last_attempt_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId);

    // Update in-memory replay cache (best-effort)
    const arr = (recentCodes.get(sessionId) || []).filter(
      (e) => now - e.ts <= 5 * 60 * 1000
    );
    arr.push({ code, ts: now });
    recentCodes.set(sessionId, arr);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        verified: true,
        period: TOTP_CONFIG.PERIOD,
      }),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: msg }),
    };
  }
};

export default { handler };
