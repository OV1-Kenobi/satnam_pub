/**
 * Communications Messages History Endpoint (secured)
 * GET /api/communications/messages
 *
 * Returns paginated, privacy-preserving message history from gift_wrapped_messages
 * grouped and filterable by conversation.
 */

import { allowRequest } from "../../netlify/functions/utils/rate-limiter.js";

function getEnvVar(key) {
  // Netlify Functions: always read from process.env
  return process.env[key];
}

function conversationKey(aHash, bHash) {
  return aHash < bHash ? `${aHash}:${bHash}` : `${bHash}:${aHash}`;
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
    console.log("🔐 DEBUG: SecureSessionManager imported successfully");
    console.log("🔐 DEBUG: Auth header received:", authHeader ? `Bearer ${authHeader.substring(7, 20)}...` : "none");
    const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
    console.log("🔐 DEBUG: Session validation result:", session ? "valid" : "invalid");
    if (!session || !session.hashedId) {
      console.log("🔐 DEBUG: Session missing or no hashedId:", { hasSession: !!session, hasHashedId: session?.hashedId });
      return { error: { statusCode: 401, message: "Invalid token" } };
    }
    console.log("🔐 DEBUG: Session hashedId:", session.hashedId);

    // Use server-side Supabase client (no per-request Authorization header)
    const { supabase } = await import("../../netlify/functions/supabase.js");
    return { client: supabase, sessionHashedId: session.hashedId };
  } catch (importError) {
    console.error("🔐 DEBUG: SecureSessionManager import failed:", importError);
    return { error: { statusCode: 500, message: "Session validation failed" } };
  }
}

export default async function handler(req, res) {
  // CORS (preserve existing behavior)
  res.setHeader("Access-Control-Allow-Origin", getEnvVar("VITE_APP_DOMAIN") || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "GET") { res.status(405).json({ success: false, error: "Method not allowed" }); return; }

  // Best-effort IP rate limiting
  const clientIP = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";
  if (!allowRequest(String(clientIP))) {
    res.status(429).json({ success: false, error: "Rate limit exceeded" });
    return;
  }

  try {
    const clientResult = await getClientFromReq(req);
    if (clientResult.error) {
      res.status(clientResult.error.statusCode).json({ success: false, error: clientResult.error.message });
      return;
    }
    const { client, sessionHashedId } = clientResult;

    // Query params
    const { cursor, limit: limitParam, conversationId, protocol } = req.query || {};
    const limit = Math.min(parseInt(limitParam || "30", 10) || 30, 100);

    // App-layer authorization: only show messages where user is sender or recipient
    console.log("🔐 DEBUG: messages - querying gift_wrapped_messages with sessionHashedId:", sessionHashedId);
    let query = client
      .from("gift_wrapped_messages")
      .select(
        "id, sender_hash, recipient_hash, encryption_level, communication_type, message_type, status, created_at, protocol"
      )
      .or(`sender_hash.eq.${sessionHashedId},recipient_hash.eq.${sessionHashedId}`)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    // Optional protocol filtering for debugging and analytics
    if (protocol && ['nip59', 'nip04', 'nip17', 'mls'].includes(protocol)) {
      query = query.eq("protocol", protocol);
      console.log("🔐 DEBUG: messages - filtering by protocol:", protocol);
    }

    if (conversationId) {
      const parts = String(conversationId).split(":");
      if (parts.length !== 2) {
        res.status(400).json({ success: false, error: "Invalid conversationId" });
        return;
      }
      const [left, right] = parts;
      const hashPattern = /^[A-Za-z0-9_-]+$/;
      if (!hashPattern.test(left) || !hashPattern.test(right)) {
        res.status(400).json({ success: false, error: "Invalid conversationId" });
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
      console.error("🔐 DEBUG: messages - database error:", error);
      res.status(500).json({ success: false, error: "Failed to load messages" });
      return;
    }

    console.log("🔐 DEBUG: messages - query successful, messages found:", data?.length || 0);
    const items = Array.isArray(data) ? data : [];

    const conversations = new Map();
    for (const m of items) {
      const key = conversationKey(m.sender_hash, m.recipient_hash);
      if (!conversations.has(key)) conversations.set(key, []);
      conversations.get(key).push(m);
    }

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? sliced[sliced.length - 1].created_at : null;

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
