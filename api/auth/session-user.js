/**
 * Session User API Endpoint
 * GET /api/auth/session-user - Return authenticated user's essential fields for SecureSession creation
 *
 * Requirements:
 * - ESM module (package.json type: module)
 * - GET with credentials: include (uses HttpOnly refresh cookie) or Authorization Bearer access token
 * - Validates session via Authorization header (preferred) or refresh cookie fallback
 * - Returns user object with user_salt and encrypted_nsec (decryptable ciphertext)
 * - Proper CORS and lightweight IP rate limiting
 */

/**
 * Parse cookies from request headers
 * @param {string|undefined} cookieHeader
 */
function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((cookies, cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    cookies[name] = rest.join("=");
    return cookies;
  }, /** @type {{[k:string]: string}} */ ({}));
}

/**
 * Build CORS headers for Netlify Functions response
 */
function buildCorsHeaders(originHeader) {
  const origin = originHeader || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function handler(event, context) {
  const cors = buildCorsHeaders(event?.headers?.origin || event?.headers?.Origin);

  if ((event.httpMethod || 'GET').toUpperCase() === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  // Simple IP-based rate limiting via Supabase RPC (60s window, 60 attempts)
  try {
    const xfwd = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
    const clientIp = Array.isArray(xfwd)
      ? xfwd[0]
      : (xfwd || "").split(",")[0]?.trim() || "unknown";
    const windowSec = 60;
    const windowStart = new Date(
      Math.floor(Date.now() / (windowSec * 1000)) * (windowSec * 1000)
    ).toISOString();
    const helper = await import("../../netlify/functions/supabase.js");
    const { supabase } = helper;
    const { data, error } = await supabase.rpc("increment_auth_rate", {
      p_identifier: clientIp,
      p_scope: "ip",
      p_window_start: windowStart,
      p_limit: 60,
    });
    const limited = Array.isArray(data) ? data?.[0]?.limited : data?.limited;
    if (error || limited) {
      return { statusCode: 429, headers: cors, body: JSON.stringify({ success: false, error: "Too many attempts" }) };
    }
  } catch {
    // Fail-closed on rate limiter error
    return { statusCode: 429, headers: cors, body: JSON.stringify({ success: false, error: "Too many attempts" }) };
  }

  if ((event.httpMethod || 'GET').toUpperCase() !== "GET") {
    return { statusCode: 405, headers: { ...cors, Allow: 'GET' }, body: JSON.stringify({ success: false, error: "Method not allowed" }) };
  }

  try {
    // 1) Validate session using Authorization header (preferred)
    const authHeader = event.headers?.["authorization"] || event.headers?.["Authorization"];

    let validated = null;

    if (authHeader && String(authHeader).startsWith("Bearer ")) {
      try {
        const mod = await import("../../netlify/functions/security/session-manager.js");
        const { SecureSessionManager } = mod;
        const session = await SecureSessionManager.validateSessionFromHeader(String(authHeader));
        if (session && session.nip05) {
          validated = { nip05: session.nip05 };
        }
      } catch (e) {
        // fall through to cookie-based validation
      }
    }

    // 2) Fallback: validate using HttpOnly refresh cookie
    if (!validated) {
      const cookies = parseCookies(event.headers?.cookie);
      const refreshToken = cookies?.["satnam_refresh_token"];
      if (!refreshToken) {
        return { statusCode: 401, headers: cors, body: JSON.stringify({ success: false, error: "Unauthorized" }) };
      }
      try {
        const jwtMod = await import("jsonwebtoken");
        const secretMod = await import("../../netlify/functions/utils/jwt-secret.js");
        const jwtSecret = secretMod.getJwtSecret();
        const payload = jwtMod.default.verify(refreshToken, jwtSecret, {
          algorithms: ["HS256"],
          issuer: "satnam.pub",
          audience: "satnam.pub-users",
        });
        const obj = typeof payload === "string" ? JSON.parse(payload) : payload;
        if (!obj || obj.type !== "refresh") {
          return { statusCode: 401, headers: cors, body: JSON.stringify({ success: false, error: "Invalid token" }) };
        }
        validated = { nip05: obj.nip05 };
      } catch (err) {
        return { statusCode: 401, headers: cors, body: JSON.stringify({ success: false, error: "Unauthorized" }) };
      }
    }

    if (!validated?.nip05) {
      return { statusCode: 401, headers: cors, body: JSON.stringify({ success: false, error: "Unauthorized" }) };
    }

    // 3) Lookup user by NIP-05 using server-side DUID generation
    const { supabase } = await import("../../netlify/functions/supabase.js");

    // Generate DUID from NIP-05 for user lookup
    let duid;
    try {
      const { getEnvVar } = await import("../../netlify/functions/utils/env.js");
      const secret = getEnvVar('DUID_SERVER_SECRET');
      if (!secret) throw new Error('DUID_SERVER_SECRET not configured');
      const crypto = await import('node:crypto');
      duid = crypto.createHmac('sha256', secret).update(validated.nip05).digest('hex');
    } catch (error) {
      console.error('DUID generation failed:', error);
      return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: "Authentication system error" }) };
    }

    const { data: user, error: userError, status } = await supabase
      .from("user_identities")
      .select("id, role, is_active, user_salt, encrypted_nsec, encrypted_nsec_iv, npub, username")
      .eq("id", duid)
      .single();

    if (userError || !user) {
      const code = status === 406 ? 404 : 500;
      return { statusCode: code, headers: cors, body: JSON.stringify({ success: false, error: "User not found" }) };
    }

    const userPayload = {
      id: user.id,
      nip05: validated.nip05,
      role: user.role || "private",
      is_active: user.is_active !== false,
      user_salt: user.user_salt || null,
      encrypted_nsec: user.encrypted_nsec || null,
      encrypted_nsec_iv: user.encrypted_nsec_iv || null,
      npub: user.npub || null,
      username: user.username || null,
    };

    return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, data: { user: userPayload } }) };
  } catch (error) {
    console.error("session-user error:", error);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: "Internal server error" }) };
  }
}
