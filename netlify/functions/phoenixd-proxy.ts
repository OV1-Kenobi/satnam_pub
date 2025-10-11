/*
  Phoenixd Proxy (ESM, TypeScript)
  - Server-only credentials via process.env
  - Actions: getNodeInfo, getBalance, createInvoice, payInvoice, decodeInvoice, listPayments, healthCheck
  - Response shape: { success: true, data } | { success: false, error }
*/

export const config = { path: "/phoenixd-proxy" };

import { allowRequest } from "./utils/rate-limiter.js";

const json = (statusCode: number, body: any) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const must = (v: string | undefined, name: string) => {
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
};

const API_URL = must(process.env.PHOENIXD_API_URL, "PHOENIXD_API_URL");
const API_PASSWORD = must(
  process.env.PHOENIXD_API_PASSWORD,
  "PHOENIXD_API_PASSWORD"
);
const AUTH_HEADER =
  "Basic " + Buffer.from(":" + API_PASSWORD).toString("base64");

async function pxd(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const res = await fetch(`${API_URL.replace(/\/$/, "")}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.headers || {}),
        Authorization: AUTH_HEADER,
        "Content-Type": "application/json",
      },
    });
    const text = await res.text();
    let jsonBody: any;
    try {
      jsonBody = text ? JSON.parse(text) : {};
    } catch {
      jsonBody = { raw: text };
    }
    if (!res.ok) {
      const msg =
        jsonBody?.message || jsonBody?.error || `phoenixd error ${res.status}`;
      throw new Error(msg);
    }
    return jsonBody;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const handler = async (event: any) => {
  try {
    if (event.httpMethod !== "POST")
      return json(405, { success: false, error: "Method Not Allowed" });
    const xfwd =
      event.headers?.["x-forwarded-for"] ||
      event.headers?.["X-Forwarded-For"] ||
      "";
    const ip =
      (Array.isArray(xfwd) ? xfwd[0] : xfwd).split(",")[0]?.trim() ||
      event.headers?.["x-real-ip"] ||
      "unknown";
    if (!allowRequest(ip, 10, 60_000))
      return json(429, { success: false, error: "Too Many Requests" });

    const body = event.body ? JSON.parse(event.body) : {};
    const action = body?.action as string;
    const payload = body?.payload || {};
    if (!action) return json(400, { success: false, error: "Missing action" });

    switch (action) {
      case "healthCheck": {
        const data = await pxd(`/health`);
        return json(200, { success: true, data });
      }
      case "getNodeInfo": {
        const data = await pxd(`/getinfo`);
        return json(200, { success: true, data });
      }
      case "getBalance": {
        const data = await pxd(`/balance`);
        return json(200, { success: true, data });
      }
      case "decodeInvoice": {
        const invoice = String(payload?.invoice || "");
        if (!invoice)
          return json(400, { success: false, error: "Missing invoice" });
        const data = await pxd(
          `/decodeinvoice?invoice=${encodeURIComponent(invoice)}`
        );
        return json(200, { success: true, data });
      }
      case "createInvoice": {
        const amountMsat = Number(payload?.amountMsat);
        if (!Number.isFinite(amountMsat) || amountMsat <= 0)
          return json(400, { success: false, error: "Invalid amountMsat" });
        const data = await pxd(`/createinvoice`, {
          method: "POST",
          body: JSON.stringify({
            amountMsat,
            description: payload?.description,
          }),
        });
        return json(200, { success: true, data });
      }
      case "payInvoice": {
        const invoice = String(payload?.invoice || "");
        const maxFeeMsat =
          payload?.maxFeeMsat != null ? Number(payload.maxFeeMsat) : undefined;
        if (!invoice)
          return json(400, { success: false, error: "Missing invoice" });
        const data = await pxd(`/payinvoice`, {
          method: "POST",
          body: JSON.stringify({ invoice, maxFeeMsat }),
        });
        return json(200, { success: true, data });
      }
      case "listPayments": {
        const q: string[] = [];
        const limit =
          payload?.limit != null ? Number(payload.limit) : undefined;
        const offset =
          payload?.offset != null ? Number(payload.offset) : undefined;
        if (Number.isFinite(limit)) q.push(`limit=${limit}`);
        if (Number.isFinite(offset)) q.push(`offset=${offset}`);
        const qs = q.length ? `?${q.join("&")}` : "";
        const data = await pxd(`/listpayments${qs}`);
        return json(200, { success: true, data });
      }
      default:
        return json(400, { success: false, error: "Unsupported action" });
    }
  } catch (error: any) {
    console.error("[phoenixd-proxy]", error);
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
