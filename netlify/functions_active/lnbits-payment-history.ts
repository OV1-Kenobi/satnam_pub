// netlify/functions_active/lnbits-payment-history.ts
// Returns paginated LNbits payment events for the authenticated user

import type { Handler } from "@netlify/functions";
import { getRequestClient } from "../functions/supabase.js";
import { allowRequest } from "../functions/utils/rate-limiter.js";

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function clientIpFrom(event: any): string {
  const xfwd =
    event.headers?.["x-forwarded-for"] ||
    event.headers?.["X-Forwarded-For"] ||
    "";
  return (
    (Array.isArray(xfwd) ? xfwd[0] : xfwd).split(",")[0]?.trim() ||
    event.headers?.["x-real-ip"] ||
    "unknown"
  );
}

export const handler: Handler = async (event) => {
  try {
    const FEATURE_ENABLED =
      (process.env.VITE_LNBITS_INTEGRATION_ENABLED || "").toLowerCase() ===
      "true";
    if (!FEATURE_ENABLED)
      return json(503, {
        success: false,
        error: "LNbits integration disabled",
      });
    if (event.httpMethod !== "GET")
      return json(405, { success: false, error: "Method not allowed" });

    const ip = clientIpFrom(event);
    if (!allowRequest(ip, 30, 60_000))
      return json(429, { success: false, error: "Too many requests" });

    const authz = event.headers?.authorization || event.headers?.Authorization;
    const token =
      authz && authz.startsWith("Bearer ") ? authz.slice(7) : undefined;
    if (!token)
      return json(401, { success: false, error: "Missing Authorization" });

    // Guard against NaN for page
    const pageParam = event.queryStringParameters?.page as string | undefined;
    const parsedPage = Number.parseInt(pageParam ?? "", 10);
    const page = Math.max(1, Number.isNaN(parsedPage) ? 1 : parsedPage);

    // Guard against NaN for limit
    const limitParam = event.queryStringParameters?.limit as string | undefined;
    const parsedLimit = Number.parseInt(limitParam ?? "", 10);
    const limit = Math.min(
      50,
      Math.max(1, Number.isNaN(parsedLimit) ? 20 : parsedLimit)
    );

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const supa = getRequestClient(token);
    const query = supa
      .from("lnbits_payment_events")
      .select(
        "id, created_at, amount_sats, lightning_address, memo, payment_hash",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    const { data, error, count } = await query;
    if (error)
      return json(500, {
        success: false,
        error: error.message || "Query failed",
      });

    return json(200, {
      success: true,
      data: data || [],
      page,
      limit,
      total: typeof count === "number" ? count : null,
    });
  } catch (e: any) {
    return json(500, { success: false, error: e?.message || "Server error" });
  }
};
