// Netlify Function: /api/communications/get-contacts
// Returns encrypted contacts for the given owner hash (memberId)
// Privacy-first: server returns encrypted blobs; client decrypts

// Per-request Supabase client with Authorization header for RLS
let getRequestClient: any;
async function getClient(accessToken: string) {
  if (!getRequestClient) {
    const mod = await import("../supabase.js");
    getRequestClient = mod.getRequestClient;
  }
  return getRequestClient(accessToken);
}

// Shared rate limiter (lazy)
let allowRequestFn:
  | ((ip: string, limit?: number, windowMs?: number) => boolean)
  | undefined;
async function allowRate(ip: string): Promise<boolean> {
  if (!allowRequestFn) {
    const mod = await import("../utils/rate-limiter");
    allowRequestFn = mod.allowRequest as any;
  }
  return allowRequestFn!(ip, 10, 60_000);
}

export const handler = async (event: any) => {
  const origin = event?.headers?.origin || "";
  const allowed = new Set([
    "http://localhost:8888",
    "http://localhost:5173",
    "https://www.satnam.pub",
  ]);
  const allowOrigin = allowed.has(origin) ? origin : "https://www.satnam.pub";
  const headers = {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  } as const;

  // Rate limiting (best-effort)
  const clientIP =
    event.headers?.["x-forwarded-for"] ||
    event.headers?.["x-real-ip"] ||
    "unknown";
  if (!(await allowRate(String(clientIP)))) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ success: false, error: "Rate limit exceeded" }),
    };
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: "Method not allowed" }),
    };
  }

  try {
    const qp = event.queryStringParameters || {};
    const memberId = (qp.memberId || "").trim();
    const isValid = /^[a-f0-9]{64}$/i.test(memberId);
    if (!memberId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: "memberId is required" }),
      };
    }
    if (!isValid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: "invalid memberId format",
        }),
      };
    }

    // Require Authorization: Bearer <token>
    const authHeader =
      event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Authentication required",
        }),
      };
    }
    const accessToken = authHeader.substring(7);

    // Treat memberId as owner_hash (privacy-first). No decryption server-side.
    const client = await getClient(accessToken);

    // Validate token (ensures RLS context binds to auth.uid())
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData?.user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: "Invalid token" }),
      };
    }

    const { data, error } = await client
      .from("encrypted_contacts")
      .select(
        "id, owner_hash, encrypted_contact, contact_encryption_salt, contact_encryption_iv, contact_hash, contact_hash_salt, trust_level, family_role, supports_gift_wrap, preferred_encryption, added_at, last_contact_at, contact_count"
      )
      .eq("owner_hash", memberId)
      .order("added_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("get-contacts query error:", error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Failed to load contacts",
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, contacts: data || [] }),
    };
  } catch (e) {
    console.error("get-contacts handler error:", e);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: "Unexpected error" }),
    };
  }
};
