// Netlify Function: /api/communications/messages
// Returns paginated message history with conversation grouping

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

function conversationKey(aHash: string, bHash: string): string {
  return aHash < bHash ? `${aHash}:${bHash}` : `${bHash}:${aHash}`;
}

export const handler = async (event: any) => {
  // Origin-based CORS whitelist for production hardening
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) || ["*"];
  const origin = (event.headers?.origin ||
    event.headers?.Origin ||
    "*") as string;
  const corsOrigin = allowedOrigins.includes("*")
    ? "*"
    : allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0] || "*";

  const headers = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    const cursor = qp.cursor || null;
    const limitParam = qp.limit || "30";
    const conversationId = qp.conversationId || null;
    const limit = Math.min(parseInt(limitParam, 10) || 30, 100);

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

    // Pull caller's allowed hashes via RLS on privacy_users
    const { data: puRows, error: puErr } = await client
      .from("privacy_users")
      .select("hashed_uuid")
      .limit(1000);
    if (puErr) {
      console.error("privacy_users fetch error:", puErr);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Failed to validate user scope",
        }),
      };
    }
    const allowedHashes = new Set(
      (puRows || []).map((r: any) => r.hashed_uuid)
    );

    let left: string | null = null;
    let right: string | null = null;
    if (conversationId) {
      const parts = String(conversationId).split(":");
      if (parts.length !== 2) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: "Invalid conversationId format",
          }),
        };
      }
      [left, right] = parts;
      const hashPattern = /^[a-zA-Z0-9_-]+$/;
      if (!hashPattern.test(left) || !hashPattern.test(right)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: "Invalid hash format in conversationId",
          }),
        };
      }
      if (!allowedHashes.has(left) && !allowedHashes.has(right)) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            success: false,
            error: "Forbidden conversation",
          }),
        };
      }
    }

    let query = client
      .from("gift_wrapped_messages")
      .select(
        "id, sender_hash, recipient_hash, encryption_level, communication_type, message_type, status, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }
    if (left && right) {
      query = query
        .in("sender_hash", [left, right])
        .in("recipient_hash", [left, right]);
    }

    const { data, error } = await query;
    if (error) {
      console.error("messages list query error:", error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Failed to load messages",
        }),
      };
    }

    const items = Array.isArray(data) ? data : [];
    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? sliced[sliced.length - 1].created_at : null;

    const map = new Map<string, any[]>();
    for (const m of sliced) {
      const key = conversationKey(m.sender_hash, m.recipient_hash);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        nextCursor,
        items: sliced,
        conversations: Array.from(map.entries()).map(([key, msgs]) => ({
          id: key,
          count: msgs.length,
          lastCreatedAt: msgs[0]?.created_at || null,
        })),
      }),
    };
  } catch (e) {
    console.error("messages endpoint error:", e);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: "Unexpected error" }),
    };
  }
};
