// Netlify Function adapter for /api/communications/search-contacts

export const handler = async (event: any) => {
  return new Promise((resolve) => {
    const req: any = {
      method: event.httpMethod,
      headers: event.headers || {},
      url: event.path || "/api/communications/search-contacts",
      body: (() => {
        if (!event.body) return undefined;
        try {
          return JSON.parse(event.body);
        } catch {
          return event.body;
        }
      })(),
      query: event.queryStringParameters || {},
    };
    const res: any = {
      _status: 200,
      _headers: {} as Record<string, string>,
      setHeader(k: string, v: string) {
        this._headers[k] = v;
      },
      status(code: number) { this._status = code; return this; },
      json(payload: any) { resolve({ statusCode: this._status, headers: this._headers, body: JSON.stringify(payload) }); },
      end() { resolve({ statusCode: this._status, headers: this._headers, body: "" }); },
    };
    // Lazy-load the handler to conserve memory
    (async () => {
      try {
        const { default: searchContacts } = await import("../../../api/communications/search-contacts.js");
        await Promise.resolve(searchContacts(req, res));
      } catch (e: any) {
        resolve({ statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: e?.message || "Internal error" }) });
      }
    })();
      json(payload: any) {
        resolve({
          statusCode: this._status,
          headers: this._headers,
          body: JSON.stringify(payload),
        });
      },
      end() {
        resolve({ statusCode: this._status, headers: this._headers, body: "" });
      },
    };
    Promise.resolve(searchContacts(req, res)).catch((e) => {
      resolve({
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: e?.message || "Internal error",
        }),
      });
    });
  });
};
