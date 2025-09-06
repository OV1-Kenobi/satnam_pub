// Netlify Function adapter for /api/communications/giftwrapped
// Adapts Express-style (req, res) handler to Netlify event/context signature

export const handler = async (event: any, _context: any) => {
  return new Promise((resolve) => {
    // Minimal Express-like req/res bridge
    const req: any = {
      method: event.httpMethod,
      headers: event.headers || {},
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
      setHeader(key: string, value: string) {
        this._headers[key] = value;
      },
      status(code: number) {
        this._status = code;
        return this;
      },
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

    // Lazy-load underlying Express-style handler on invocation
    (async () => {
      try {
        const { default: giftwrapped } = await import(
          "../../../api/communications/giftwrapped.js"
        );
        await Promise.resolve(giftwrapped(req, res));
      } catch (e: any) {
        resolve({
          statusCode: 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            success: false,
            error: e?.message || "Internal error",
          }),
        });
      }
    })();
  });
};
