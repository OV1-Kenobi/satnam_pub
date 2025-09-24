// Netlify Function adapter for /api/communications/attest-contact
// Bridges Netlify event/context to Express-style (req, res)

export const handler = async (event: any) => {
  return new Promise((resolve) => {
    const req: any = {
      method: event.httpMethod,
      headers: event.headers || {},
      url: event.path || "/api/communications/attest-contact",
      body: (() => { if (!event.body) return undefined; try { return JSON.parse(event.body); } catch { return event.body; } })(),
      query: event.queryStringParameters || {},
    };

    const res: any = {
      status(code: number) { this.statusCode = code; return this; },
      json(obj: any) { resolve({ statusCode: this.statusCode || 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) }); },
    };

    (async () => {
      try {
        const { default: route } = await import("../../../api/communications/attest-contact.js");
        await Promise.resolve(route(req, res));
      } catch (e: any) {
        resolve({ statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: e?.message || "Internal error" }) });
      }
    })();
  });
};

