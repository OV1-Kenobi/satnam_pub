/*
 * NFC Resolver + SUN verification (contract)
 * ESM-only. This function defines the public contract for:
 *  - GET  /nfc-resolver/resolve?duid=<...>&sdm=<...>&u=<uid>
 *  - POST /nfc-resolver/sun-verify { tagUID, challengeData, encryptedResponse }
 *
 * Notes:
 *  - This is a contract/skeleton. Actual SUN CMAC verification should be
 *    implemented against server-managed per-tag AES keys via a hardware bridge
 *    or secured KMS. Never expose raw keys to clients.
 *  - Keep zero-knowledge: never accept or store private keys. Only verify MACs.
 */

import type { Handler } from "@netlify/functions";
import { allowRequest } from "./utils/rate-limiter.js";

function corsHeaders(): Record<string, string> {
  const isProd = process.env.NODE_ENV === "production";
  const origin = isProd ? process.env.FRONTEND_URL || "https://www.satnam.pub" : "*";
  const allowCredentials = origin !== "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": String(allowCredentials),
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
}

function json(statusCode: number, body: unknown, extra?: Record<string, string>) {
  return { statusCode, headers: { ...corsHeaders(), ...(extra || {}) }, body: JSON.stringify(body) };
}

function lastSegment(path: string): string {
  const parts = (path || "").split("/").filter(Boolean);
  return (parts[parts.length - 1] || "").toLowerCase();
}

export const handler: Handler = async (event) => {
  if ((event.httpMethod || "").toUpperCase() === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  const ip = (event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"] || "").toString().split(",")[0]?.trim() || "unknown";
  const op = lastSegment(event.path || "");

  try {
    if (op === "resolve") {
      if (!allowRequest(ip, 60, 60_000)) return json(429, { success: false, error: "Too many requests" });
      if ((event.httpMethod || "GET").toUpperCase() !== "GET") return json(405, { success: false, error: "Method not allowed" });

      const params = new URLSearchParams(event.rawQuery || event.rawQueryString || event.queryStringParameters as any);
      const duid = params.get("duid") || params.get("d") || "";
      const sdm = params.get("sdm") || "";
      const u = params.get("u") || ""; // NTAG UID echoed by SDM

      if (!duid) return json(400, { success: false, error: "Missing duid" });

      // CONTRACT: Do minimal parsing here. Actual SUN verification happens via POST /sun-verify.
      // Respond with a next-step hint for the app to POST the SUN data if present.
      return json(200, {
        success: true,
        data: {
          duid,
          hasSDM: Boolean(sdm && u),
          next: Boolean(sdm && u) ? "/.netlify/functions/nfc-resolver/sun-verify" : null,
          // UI can decide to auto-call sun-verify when SDM params are present
        },
      });
    }

    if (op === "sun-verify") {
      if (!allowRequest(ip, 20, 60_000)) return json(429, { success: false, error: "Too many requests" });
      if ((event.httpMethod || "POST").toUpperCase() !== "POST") return json(405, { success: false, error: "Method not allowed" });

      const body = (() => { try { return JSON.parse(event.body || "{}"); } catch { return {}; } })() as {
        tagUID?: string;
        challengeData?: string;
        encryptedResponse?: string;
      };

      if (!body.tagUID || !body.challengeData || !body.encryptedResponse) {
        return json(400, { success: false, error: "Missing required fields" });
      }

      // CONTRACT: Verify SUN CMAC using server-managed K0/K1 per tag.
      //  - Inputs: tagUID, challengeData, encryptedResponse (from SDM)
      //  - Expected checks:
      //      1) Look up tag config by privacy-preserving hash (owner scope + tagUID)
      //      2) Recompute CMAC via hardware bridge/KMS
      //      3) Return valid=true/false with minimal metadata
      //  - Never store raw AES keys or emit them in responses.

      // Placeholder until hardware bridge is connected
      const bridgeConfigured = Boolean(process.env.NTAG424_BRIDGE_URL || process.env.NTAG424_HARDWARE_BRIDGE_URL);
      if (!bridgeConfigured) {
        return json(200, {
          success: true,
          data: { valid: true, hint: "not_enforced" },
        });
      }

      // When implemented, forward to bridge and proxy result
      // const res = await fetch(`${process.env.NTAG424_BRIDGE_URL}/ntag424/verify`, { ... })
      // const j = await res.json();
      // return json(res.ok ? 200 : 500, j);

      return json(501, { success: false, error: "Hardware bridge integration not yet implemented" });
    }

    return json(404, { success: false, error: "Not found" });
  } catch (e) {
    return json(500, { success: false, error: "Internal server error", meta: { message: e instanceof Error ? e.message : "Unknown error" } });
  }
};

