// netlify/functions_active/lnbits-get-wallet-url.ts
// Returns the user's LNbits wallet URL for direct access to Boltcard extension

import type { Handler } from "@netlify/functions";
import { getRequestClient } from "../functions/supabase.js";
import { allowRequest } from "../functions/utils/rate-limiter.js";

const BASE_URL =
  process.env.LNBITS_BASE_URL || process.env.VITE_VOLTAGE_LNBITS_URL || "";
const FEATURE_ENABLED =
  (process.env.VITE_LNBITS_INTEGRATION_ENABLED || "").toLowerCase() === "true";

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function clientIpFrom(event: any): string {
  return (
    event.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    event.headers?.["x-real-ip"] ||
    "unknown"
  );
}

export const handler: Handler = async (event) => {
  try {
    if (!FEATURE_ENABLED)
      return json(503, {
        success: false,
        error: "LNbits integration disabled",
      });

    const ip = clientIpFrom(event);
    if (!allowRequest(ip, 20, 60_000))
      return json(429, { success: false, error: "Too many attempts" });
    if (event.httpMethod !== "POST")
      return json(405, { success: false, error: "Method not allowed" });

    const token = (
      event.headers?.authorization ||
      event.headers?.Authorization ||
      ""
    ).replace(/^Bearer\s+/i, "");
    if (!token)
      return json(401, { success: false, error: "Missing Authorization" });
    const supabase = getRequestClient(token);

    const { data: me, error: meErr } = await supabase.auth.getUser();
    if (meErr || !me?.user?.id)
      return json(401, { success: false, error: "Unauthorized" });
    const user_duid: string = me.user.id;

    // Fetch wallet row to get wallet ID
    const { data: walletRow, error: rowErr } = await supabase
      .from("lnbits_wallets")
      .select("wallet_id")
      .eq("user_duid", user_duid)
      .single();
    if (rowErr || !walletRow)
      return json(400, {
        success: false,
        error: "No wallet found. Please create an LNbits wallet first.",
      });

    if (!BASE_URL)
      return json(500, {
        success: false,
        error: "LNbits base URL not configured",
      });

    // Generate wallet URL with Boltcard extension
    const walletUrl = `${BASE_URL}/wallet?usr=${encodeURIComponent(
      walletRow.wallet_id
    )}&ext=boltcards`;

    return json(200, {
      success: true,
      walletUrl,
      walletId: walletRow.wallet_id,
      baseUrl: BASE_URL,
    });
  } catch (e: any) {
    return json(500, { success: false, error: e?.message || "Server error" });
  }
};
