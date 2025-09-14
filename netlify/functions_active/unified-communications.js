/**
 * Unified Communications Netlify Function (ESM)
 * Routes to existing API service modules without duplicating logic.
 * Supports both:
 *  - Rewritten paths: /api/communications/messages, /api/communications/get-contacts, /api/communications/giftwrapped
 *  - Direct function calls: /.netlify/functions/unified-communications?[endpoint=messages|get-contacts|giftwrapped]&...
 *    - Heuristics for GET when endpoint is omitted:
 *      - memberId param present => get-contacts
 *      - otherwise => messages
 */

// Statically import service modules so esbuild bundles them into this function
import getContactsHandler from "../../api/communications/get-contacts.js";
import giftwrappedHandler from "../../api/communications/giftwrapped.js";
import messagesHandler from "../../api/communications/messages.js";

// Local utilities and services for consolidated groups handling
import { SecureSessionManager } from "./security/session-manager.js";
import { supabase } from "./supabase.js";


// Simple CORS header builder
function buildCorsHeaders(origin, methods) {
  const allowed = new Set([
    "http://localhost:8888",
    "http://localhost:5173",
    "https://www.satnam.pub",
  ]);
  const allowOrigin = allowed.has(origin || "") ? origin : "https://www.satnam.pub";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  };
}

// Create Node-like req/res facades for API route style handlers
function callApiRouteHandler(event, headers, defaultPath, endpoint) {
  return new Promise((resolve) => {
    const req = {
      method: event.httpMethod,
      headers: event.headers || {},
      url: event.path || defaultPath,
      body: undefined,
      query: event.queryStringParameters || {},
    };

    const res = {
      _status: 200,
      _headers: { ...headers },
      status(code) { this._status = code; return this; },
      setHeader(k, v) { this._headers[k] = v; },
      json(payload) { resolve({ statusCode: this._status, headers: this._headers, body: JSON.stringify(payload) }); },
      end() { resolve({ statusCode: this._status, headers: this._headers, body: "" }); },
    };

    (async () => {
      try {
        const handler = endpoint === "messages"
          ? messagesHandler
          : endpoint === "get-contacts"
            ? getContactsHandler
            : giftwrappedHandler;
        await Promise.resolve(handler(req, res));
      } catch (e) {
        resolve({ statusCode: 500, headers, body: JSON.stringify({ success: false, error: (e && e.message) || "Internal error" }) });
      }
    })();
  });
}

function detectTarget(event) {
  const path = String(event?.path || "").toLowerCase();
  const qs = event?.queryStringParameters || {};
  const endpoint = (qs.endpoint || "").toLowerCase();

  // 1) Path-based detection (after netlify.toml rewrites)
  if (path.endsWith("/api/communications/messages") || path.includes("communications-messages")) return "messages";
  if (path.endsWith("/api/communications/get-contacts") || path.includes("communications-get-contacts")) return "get-contacts";
  if (path.endsWith("/api/communications/giftwrapped") || path.includes("communications-giftwrapped")) return "giftwrapped";
  // New: groups endpoints consolidated here
  if (path.endsWith("/api/groups") || path.includes("/groups")) return "groups";
  if (path.endsWith("/api/group-management") || path.includes("group-management")) return "group-management";

  // 2) Explicit endpoint parameter
  if (["messages", "get-contacts", "giftwrapped", "groups", "group-management"].includes(endpoint)) return endpoint;

  // 3) Heuristics for direct function calls
  if (event.httpMethod === "POST") return "giftwrapped";
  if (event.httpMethod === "GET") {
    if (typeof qs.memberId === "string" && qs.memberId.length > 0) return "get-contacts";
    return "messages"; // default GET -> messages
  }

  return null;
}

export const handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "";
  const method = event?.httpMethod || "GET";

  // CORS preflight
  if (method === "OPTIONS") {
    const headers = buildCorsHeaders(origin, "GET, POST, OPTIONS");
    return { statusCode: 200, headers, body: "" };
  }

  // Debug logging for routing
  try {

    console.info("[unified-communications] incoming:", {
      method,
      path: event?.path,
      endpoint: event?.queryStringParameters?.endpoint,
      origin,
    });
  } catch {}

  const target = detectTarget(event);
  try { console.info("[unified-communications] resolved target:", target); } catch {}


  // Route: messages (GET)
  if (target === "messages") {
    const headers = buildCorsHeaders(origin, "GET, OPTIONS");
    if (method !== "GET") return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: "Method not allowed" }) };
    return callApiRouteHandler(
      event,
      headers,
      "/api/communications/messages",
      "messages"
    );
  }

  // Route: get-contacts (GET)
  if (target === "get-contacts") {
    const headers = buildCorsHeaders(origin, "GET, OPTIONS");
    if (method !== "GET") return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: "Method not allowed" }) };
    return callApiRouteHandler(
      event,
      headers,
      "/api/communications/get-contacts",
      "get-contacts"
    );
  }

  // Route: giftwrapped (POST)
  if (target === "giftwrapped") {
    const headers = buildCorsHeaders(origin, "POST, OPTIONS");
    if (method !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: "Method not allowed" }) };

    try {
      const mod = await import("../../api/communications/giftwrapped.js");
      const fn = mod.default || giftwrappedHandler;
      const resp = await Promise.resolve(fn(event));

      const statusCode = (resp && typeof resp.statusCode === "number") ? resp.statusCode : 200;
      const respHeaders = {
        ...headers,
        ...(resp && typeof resp === "object" && resp.headers ? resp.headers : {}),
      };
      const body = (resp && typeof resp === "object" && "body" in resp)
        ? (typeof resp.body === "string" ? resp.body : JSON.stringify(resp.body))
        : JSON.stringify({ success: true });

      return { statusCode, headers: respHeaders, body };
    } catch (e) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: (e && e.message) || "Internal error" })
      };
    }
  }

  // Route: groups (GET/POST)
  if (target === "groups") {
    const headers = buildCorsHeaders(origin, "GET, POST, OPTIONS");
    // Validate session via SecureSessionManager
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: "Authentication required" }) };
    }
    let session;
    try { session = await SecureSessionManager.validateSessionFromHeader(authHeader); } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "Session validation failed" }) };
    }
    if (!session?.hashedId) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: "Invalid token" }) };
    }
    const userHash = session.hashedId;

    if (method === "GET") {
      // Try selecting with muted column; if it fails (column missing), fallback without it
      let memberRows = null; let memErr = null;
      {
        const { data, error } = await supabase
          .from("privacy_group_members")
          .select("group_session_id, role, muted")
          .eq("member_hash", userHash)
          .limit(2000);
        memberRows = data || null; memErr = error || null;
      }
      if (memErr) {
        const { data, error } = await supabase
          .from("privacy_group_members")
          .select("group_session_id, role")
          .eq("member_hash", userHash)
          .limit(2000);
        if (error) {
          const msg = String(error?.message || "").toLowerCase();
          const code = String(error?.code || "");
          // RLS/permission-denied: return empty list gracefully to avoid UI-blocking 500s
          if (msg.includes("permission") || msg.includes("rls") || code === "42501") {
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: [] }) };
          }
          return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "Failed to load groups" }) };
        }
        memberRows = data || [];
      }
      const byGroupId = new Map();
      const rolePriority = { admin: 3, moderator: 2, member: 1 };
      for (const row of memberRows || []) {
        const existing = byGroupId.get(row.group_session_id);
        const ep = existing?.role ? rolePriority[existing.role] || 0 : 0;
        const np = row?.role ? rolePriority[row.role] || 1 : 1;
        if (!existing || np > ep) byGroupId.set(row.group_session_id, { role: row.role, muted: !!row.muted });
        else if (np === ep && !existing.muted && row.muted) existing.muted = true;
      }
      const groupIds = Array.from(byGroupId.keys());
      if (groupIds.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: [] }) };
      let groupsRows = null; let gErr = null;
      {
        const { data, error } = await supabase
          .from("privacy_groups")
          .select("session_id, name_hash, group_type, encryption_type, member_count, updated_at, avatar_url")
          .in("session_id", groupIds)
          .limit(2000);
        groupsRows = data || null; gErr = error || null;
      }
      if (gErr) {
        const { data, error } = await supabase
          .from("privacy_groups")
          .select("session_id, name_hash, group_type, encryption_type, member_count, updated_at")
          .in("session_id", groupIds)
          .limit(2000);
        if (error) return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "Failed to load groups" }) };
        groupsRows = data || [];
      }
      const payload = (groupsRows || []).map((g) => {
        const m = byGroupId.get(g.session_id) || {};
        return {
          id: g.session_id,
          name: g.name_hash,
          group_type: g.group_type,
          encryption_type: g.encryption_type,
          member_count: g.member_count,
          lastActivity: g.updated_at,
          role: m.role || "member",
          avatar_url: ("avatar_url" in g ? g.avatar_url : null) || null,
          muted: typeof m.muted === "boolean" ? m.muted : false,
        };
      });
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: payload }) };
    }

    if (method === "POST") {
      let body = {}; try { body = event.body ? JSON.parse(event.body) : {}; } catch {}
      const { action } = body || {};
      if (action === "update_preferences") {
        const { groupId, muted } = body || {};
        if (!groupId || typeof muted !== "boolean") return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Invalid request" }) };
        const { error: updErr } = await supabase
          .from("privacy_group_members")
          .update({ muted })
          .eq("group_session_id", groupId)
          .eq("member_hash", userHash);
        if (updErr) {
          const code = updErr?.code; const msg = String(updErr?.message || "").toLowerCase();
          if (code === "42703" || (msg.includes("column") && msg.includes("muted")) || msg.includes("no such column")) {
            return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: "Group preferences not supported" }) };
          }
          return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "Failed to update preferences" }) };
        }
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
      if (action === "leave_group") {
        const { groupId } = body || {};
        if (!groupId) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Invalid request" }) };
        const { error: delErr } = await supabase
          .from("privacy_group_members")
          .delete()
          .eq("group_session_id", groupId)
          .eq("member_hash", userHash);
        if (delErr) return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "Failed to leave group" }) };
        try {
          const { count, error: cntErr } = await supabase
            .from("privacy_group_members")
            .select("member_hash", { count: "exact", head: true })
            .eq("group_session_id", groupId);
          if (!cntErr && typeof count === "number") {
            await supabase.from("privacy_groups").update({ member_count: count }).eq("session_id", groupId);
          }
        } catch {}
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Unknown action" }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: "Method not allowed" }) };
  }

  // Route: group-management (admin ops)
  if (target === "group-management") {
    const headers = buildCorsHeaders(origin, "GET, POST, OPTIONS");
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: "Authentication required" }) };
    }
    let session; try { session = await SecureSessionManager.validateSessionFromHeader(authHeader); } catch { return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "Session validation failed" }) }; }
    if (!session?.hashedId) return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: "Invalid token" }) };
    const userHash = session.hashedId;

    // Helpers
    const randomHex32 = () => {
      const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    };
    const sha256Hex = async (s) => {
      const enc = new TextEncoder(); const buf = await crypto.subtle.digest("SHA-256", enc.encode(String(s))); const arr = Array.from(new Uint8Array(buf)); return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
    };

    if (method === "POST") {
      let body = {}; try { body = event.body ? JSON.parse(event.body) : {}; } catch {}
      const { action } = body || {};
      if (action === "create_group") {
        const { name, group_type = "family", encryption_type = "gift-wrap", avatar_url = null, group_description = null } = body || {};
        if (!name || typeof name !== "string") return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Invalid name" }) };
        const groupId = randomHex32();
        const nameHash = await sha256Hex(name);
        // Insert group (minimal columns to be schema-tolerant)
        let inserted = false;
        try {
          const { error } = await supabase.from("privacy_groups").insert([{ session_id: groupId, name_hash: nameHash, group_type, encryption_type, member_count: 1, avatar_url, description: group_description }]);
          if (!error) inserted = true;
        } catch {}
        if (!inserted) {
          const { error } = await supabase.from("privacy_groups").insert([{ session_id: groupId, name_hash: nameHash, group_type, encryption_type, member_count: 1 }]);
          if (error) return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "Failed to create group" }) };
        }
        // Add creator as admin
        await supabase.from("privacy_group_members").insert([{ group_session_id: groupId, member_hash: userHash, role: "admin" }]);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: { groupId } }) };
      }
      if (action === "add_member") {
        const { groupId, memberHash } = body || {};
        if (!groupId || !memberHash) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Invalid request" }) };
        const { error } = await supabase.from("privacy_group_members").insert([{ group_session_id: groupId, member_hash: memberHash, role: "member" }]);
        if (error) return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "Failed to add member" }) };
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
      if (action === "remove_member") {
        const { groupId, memberHash } = body || {};
        if (!groupId || !memberHash) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Invalid request" }) };
        const { error } = await supabase.from("privacy_group_members").delete().eq("group_session_id", groupId).eq("member_hash", memberHash);
        if (error) return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "Failed to remove member" }) };
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
      if (action === "create_topic") {
        const { groupId, topicName, description = null } = body || {};
        if (!groupId || !topicName || typeof topicName !== "string") {
          return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Invalid request" }) };
        }
        try {
          // Derive privacy-preserving hash of topic name
          const nameHash = await (async (s) => {
            const enc = new TextEncoder();
            const buf = await crypto.subtle.digest("SHA-256", enc.encode(String(s)));
            return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
          })(topicName);

          // Try a rich insert; fallback to minimal if schema differs
          let insertedRow = null;
          try {
            const { data } = await supabase
              .from("privacy_groups_topics")
              .insert([
                {
                  group_session_id: groupId,
                  name_hash: nameHash,
                  description,
                  created_by_hash: userHash,
                },
              ])
              .select("id, group_session_id, name_hash, description, created_at, updated_at, is_archived")
              .limit(1);
            insertedRow = (data && data[0]) || null;
          } catch (e) {
            // fall through to minimal insert below
          }

          if (!insertedRow) {
            // Fallback to minimal set of columns
            const { data, error } = await supabase
              .from("privacy_groups_topics")
              .insert([
                {
                  group_session_id: groupId,
                  name_hash: nameHash,
                },
              ])
              .select("id, group_session_id, name_hash")
              .limit(1);
            if (error) {
              return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "Failed to create topic" }) };
            }
            insertedRow = (data && data[0]) || null;
          }

          return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: { topic: insertedRow } }) };
        } catch (e) {
          return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "Failed to create topic" }) };
        }
      }
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Unknown action" }) };
    }

    // GET details
    if (method === "GET") {
      const groupId = event.queryStringParameters?.groupId;
      if (!groupId) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Missing groupId" }) };
      // Fetch group with extended columns; fallback to minimal if needed
      let group = null;
      {
        const { data, error } = await supabase
          .from("privacy_groups")
          .select("session_id, name_hash, group_type, encryption_type, member_count, updated_at, avatar_url, description, description_hash")
          .eq("session_id", groupId)
          .limit(1);
        if (!error) group = (data && data[0]) || null;
      }
      if (!group) {
        const { data, error } = await supabase
          .from("privacy_groups")
          .select("session_id, name_hash, group_type, encryption_type, member_count, updated_at")
          .eq("session_id", groupId)
          .limit(1);
        if (error) return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "Failed to load group" }) };
        group = (data && data[0]) || null;
      }
      // Try selecting with muted column; if it fails (column missing), fallback without it
      let memRows = null; let mErr = null;
      {
        const { data, error } = await supabase
          .from("privacy_group_members")
          .select("member_hash, role, muted")
          .eq("group_session_id", groupId)
          .limit(2000);
        memRows = data || null; mErr = error || null;
      }
      if (mErr) {
        const { data, error } = await supabase
          .from("privacy_group_members")
          .select("member_hash, role")
          .eq("group_session_id", groupId)
          .limit(2000);
        if (error) return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "Failed to load members" }) };
        memRows = data || [];
      }

      // Fetch topics with extended columns; fallback to minimal if needed
      let topics = [];
      try {
        const { data, error } = await supabase
          .from("privacy_groups_topics")
          .select("id, name_hash, description, created_at, is_archived, created_by_hash")
          .eq("group_session_id", groupId)
          .limit(2000);
        if (!error) {
          topics = data || [];
        } else {
          const { data: data2, error: err2 } = await supabase
            .from("privacy_groups_topics")
            .select("id, name_hash")
            .eq("group_session_id", groupId)
            .limit(2000);
          if (!err2) topics = data2 || [];
        }
      } catch (_) {
        // Table may not exist yet; ignore and return empty topics
      }

      const details = {
        name: group?.name_hash || group?.description || null,
        avatar_url: (group && ("avatar_url" in group)) ? group.avatar_url : null,
        description: (group && ("description" in group) && group.description) ? group.description : ((group && ("description_hash" in group)) ? group.description_hash : null),
        member_count: group?.member_count ?? null,
        topics,
      };
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: { group, members: memRows || [], details } }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: "Method not allowed" }) };
  }

  // Fallback 404
  return {
    statusCode: 404,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: false, error: "Not Found" })
  };
};

