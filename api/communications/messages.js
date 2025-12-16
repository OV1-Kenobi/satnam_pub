/**
 * Communications Messages History Endpoint (secured)
 * GET /api/communications/messages
 *
 * Returns paginated, privacy-preserving message history from gift_wrapped_messages
 * grouped and filterable by conversation.
 */



function getEnvVar(key) {
  // Netlify Functions: always read from process.env
  return process.env[key];
}

function conversationKey(aHash, bHash) {
  return aHash < bHash ? `${aHash}:${bHash}` : `${bHash}:${aHash}`;
}

let allowRequestFn;
async function allowRate(ip) {
  if (!allowRequestFn) {
    const mod = await import("../../netlify/functions/utils/rate-limiter.js");
    allowRequestFn = mod.allowRequest;
  }
  // 30 requests per 60 seconds per IP
  return allowRequestFn(ip, 30, 60_000);
}

async function getClientFromReq(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: { statusCode: 401, message: "Authentication required" } };
  }

  // Validate using our SecureSessionManager (custom JWT), not Supabase auth
  try {
    const { SecureSessionManager } = await import(
      "../../netlify/functions/security/session-manager.js"
    );
    // Gate debug logging behind environment variable - never log tokens
    if (process.env.DEBUG_AUTH === 'true') {
      console.log("🔐 DEBUG: SecureSessionManager imported");
      console.log("🔐 DEBUG: Auth header present:", !!authHeader);
    }
    const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
    if (!session || !session.hashedId) {
      if (process.env.DEBUG_AUTH === 'true') {
        console.log("🔐 DEBUG: Session validation failed");
      }
      return { error: { statusCode: 401, message: "Invalid token" } };
    }

    // Use server-side Supabase client (no per-request Authorization header)
    const { supabase } = await import("../../netlify/functions/supabase.js");
    return { client: supabase, sessionHashedId: session.hashedId };
  } catch (importError) {
    console.error("Session validation failed");
    return { error: { statusCode: 500, message: "Session validation failed" } };
  }
}

export default async function handler(req, res) {
  // CORS with proper caching headers
  res.setHeader("Access-Control-Allow-Origin", getEnvVar("VITE_APP_DOMAIN") || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Vary", "Origin");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "GET") { res.status(405).json({ success: false, error: "Method not allowed" }); return; }

  try {
    const clientIp =
      req.headers["x-forwarded-for"] ||
      req.headers["x-real-ip"] ||
      req.headers["client-ip"] ||
      req.socket?.remoteAddress ||
      req.connection?.remoteAddress ||
      req.ip;

    if (!clientIp) {
      res
        .status(400)
        .json({ success: false, error: "Client identification required" });
      return;
    }

    if (!(await allowRate(String(clientIp)))) {
      res
        .status(429)
        .json({ success: false, error: "Rate limit exceeded" });
      return;
    }

    const clientResult = await getClientFromReq(req);
    if (clientResult.error) {
      res.status(clientResult.error.statusCode).json({ success: false, error: clientResult.error.message });
      return;
    }
    const { client, sessionHashedId } = clientResult;

    // Query params
    const { cursor, limit: limitParam, conversationId, protocol } = req.query || {};
    const parsedLimit = parseInt(limitParam || "30", 10);
    const limit = Math.min(Math.max(parsedLimit || 30, 1), 100);

    // App-layer authorization: only show messages where user is sender or recipient
    // Include content (NIP-44 encrypted ciphertext) for client-side decryption
    // Also include sender_npub and recipient_npub for conversation key derivation
    let query = client
      .from("gift_wrapped_messages")
      .select(
        "id, sender_hash, recipient_hash, sender_npub, recipient_npub, content, encryption_level, communication_type, message_type, status, created_at, protocol"
      )
      .or(`sender_hash.eq.${sessionHashedId},recipient_hash.eq.${sessionHashedId}`)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    // Optional protocol filtering
    if (protocol && ['nip59', 'nip04', 'nip17', 'mls'].includes(protocol)) {
      query = query.eq("protocol", protocol);
    }

    if (conversationId) {
      const parts = String(conversationId).split(":");
      if (parts.length !== 2) {
        res.status(400).json({ success: false, error: "Invalid conversationId" });
        return;
      }
      const [left, right] = parts;
      // Strengthen validation: must start and end with alphanumeric, allow underscores/hyphens in middle
      const hashPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*[A-Za-z0-9]$/;
      if (!hashPattern.test(left) || !hashPattern.test(right)) {
        res.status(400).json({ success: false, error: "Invalid conversationId" });
        return;
      }
      // Check for reasonable length limits
      if (left.length > 64 || right.length > 64) {
        res.status(400).json({ success: false, error: "Invalid conversationId length" });
        return;
      }
      // Ensure user is part of the conversation
      if (sessionHashedId !== left && sessionHashedId !== right) {
        res.status(403).json({ success: false, error: "Forbidden conversation" });
        return;
      }
      query = query.in("sender_hash", [left, right]).in("recipient_hash", [left, right]);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Database query failed");
      res.status(500).json({ success: false, error: "Failed to load messages" });
      return;
    }

    const items = Array.isArray(data) ? data : [];

    // Determine pagination before grouping
    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? sliced[sliced.length - 1].created_at : null;

    // Group conversations based on actual returned items (not all items)
    const conversations = new Map();
    for (const m of sliced) {
      const key = conversationKey(m.sender_hash, m.recipient_hash);
      if (!conversations.has(key)) conversations.set(key, []);
      conversations.get(key).push(m);
    }

    res.status(200).json({
      success: true,
      nextCursor,
      items: sliced,
      conversations: Array.from(conversations.entries()).map(([key, msgs]) => ({
        id: key,
        count: msgs.length,
        lastCreatedAt: msgs[0]?.created_at || null,
      })),
    });
  } catch (e) {
    const code = e && typeof e === "object" && "statusCode" in e ? e.statusCode : 500;
    console.error("messages endpoint error:", e);
    res.status(code).json({ success: false, error: e?.message || "Unexpected error" });
  }
}
