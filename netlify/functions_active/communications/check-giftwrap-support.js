// Netlify Function adapter for /api/communications/check-giftwrap-support (GET)
// Bridges to API route if present; otherwise returns 404 JSON

export const handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  try {
    const mod = await import("../../../api/communications/check-giftwrap-support.js");
    const handler = mod.default || mod.handler || mod;
    return await Promise.resolve(handler({
      method: event.httpMethod,
      headers: event.headers || {},
      url: event.path || "/api/communications/check-giftwrap-support",
      query: event.queryStringParameters || {},
    }, {
      _status: 200,
      _headers: headers,
      status(code) { this._status = code; return this; },
      setHeader(k, v) { this._headers[k] = v; },
      json(payload) { return { statusCode: this._status, headers: this._headers, body: JSON.stringify(payload) }; },
      end() { return { statusCode: this._status, headers: this._headers, body: "" }; },
    }));
  } catch {
    return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: "check-giftwrap-support not implemented" }) };
  }
};

