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

  // 2) Explicit endpoint parameter
  if (endpoint === "messages" || endpoint === "get-contacts" || endpoint === "giftwrapped") return endpoint;

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

  const target = detectTarget(event);

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

  // Fallback 404
  return {
    statusCode: 404,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: false, error: "Not Found" })
  };
};

