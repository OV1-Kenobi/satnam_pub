// Netlify (active) Function: /api/phoenixd/status
// Delegates to API implementation at api/phoenixd/status.js

export const handler = async (event, context) => {
  try {
    const mod = await import('../../api/phoenixd/status.js');
    const fn = (mod && (mod.default || mod.handler));
    if (typeof fn !== 'function') {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: 'PhoenixD status handler not available' }) };
    }

    let statusCode = 200;
    let headers = { 'Content-Type': 'application/json' };
    let body = '';

    const res = {
      setHeader: (k, v) => { headers[k] = v; },
      status: (code) => { statusCode = code; return res; },
      json: (obj) => { body = JSON.stringify(obj); return res; },
      end: (txt = '') => { body = txt; return res; },
    };

    const safeParse = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

    const req = {
      method: event.httpMethod,
      headers: event.headers || {},
      body: typeof event.body === 'string' ? safeParse(event.body) : (event.body || {}),
      query: event.queryStringParameters || {},
    };

    await fn(req, res);
    return { statusCode, headers, body };
  } catch (e) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: 'Server error', details: e instanceof Error ? e.message : String(e) }) };
  }
};
