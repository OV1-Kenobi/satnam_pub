// Netlify Function adapter for /api/communications/add-contact
// Bridges Netlify event/context to Express-style (req, res)

export const handler = async (event: any) => {
  return new Promise((resolve) => {
    const req: any = {
      method: event.httpMethod,
      headers: event.headers || {},
      url: event.path || "/api/communications/add-contact",
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
    // Lazy-load the handler to conserve memory
    (async () => {
      try {
        const { default: addContact } = await import(
          "../../../api/communications/add-contact.js"
        );
        await Promise.resolve(addContact(req, res));
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
