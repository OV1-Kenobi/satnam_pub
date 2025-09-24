/*
 * NIP-05 → DID resolver service
 * GET /.netlify/functions/nip05-resolver?nip05=username@domain
 *
 * - Resolves did:scid from the DID document hosted at the nip05 domain
 * - Returns did.json mirror URLs discovered via alsoKnownAs (?src=)
 * - Returns issuer_registry verification status if available
 * - Pure ESM, uses process.env, rate limited, CORS, cache headers
 */

import type { Handler } from "@netlify/functions";
import { getRequestClient } from "./supabase.js";
import { allowRequest } from "./utils/rate-limiter.js";

const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
    "Content-Security-Policy": "default-src 'none'",
  } as const;
}

function json(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function badRequest(body: unknown, status = 400) {
  return json(status, body);
}

function parseNip05(nip05: string): { username: string; domain: string } {
  const parts = nip05.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid NIP-05 format; expected username@domain");
  }
  return { username: parts[0].toLowerCase(), domain: parts[1].toLowerCase() };
}

function extractQueryParam(urlStr: string, key: string): string | null {
  try {
    const u = new URL(urlStr);
    return u.searchParams.get(key);
  } catch {
    return null;
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...corsHeaders() } };
  }
  if (event.httpMethod !== "GET") {
    return badRequest({ error: "Method not allowed" }, 405);
  }

  const nip05 = (event.queryStringParameters?.nip05 || "").trim();
  if (!nip05)
    return badRequest({ error: "Missing nip05 query parameter" }, 422);

  // Rate limit per IP
  const xfwd =
    event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
  const clientIp = Array.isArray(xfwd)
    ? xfwd[0]
    : (xfwd || "").split(",")[0]?.trim() || "unknown";
  if (!allowRequest(clientIp, 60, 60_000))
    return badRequest({ error: "Too many requests" }, 429);

  try {
    const { username, domain } = parseNip05(nip05);

    const didJsonUrl = `https://${domain}/.well-known/did.json`;
    const didRes = await fetch(didJsonUrl, { method: "GET" });
    if (!didRes.ok) {
      return badRequest({ error: `did.json not found at ${didJsonUrl}` }, 404);
    }
    const didDoc: {
      id?: string;
      alsoKnownAs?: string[];
      verificationMethod?: any[];
    } = await didRes.json();

    // Extract did:scid from alsoKnownAs
    const aka = Array.isArray(didDoc.alsoKnownAs) ? didDoc.alsoKnownAs : [];
    const acctEntry = aka.find(
      (v) => typeof v === "string" && v.startsWith("acct:")
    );
    if (acctEntry !== `acct:${username}@${domain}`) {
      return badRequest(
        { error: "DID document acct entry does not match NIP-05" },
        400
      );
    }

    const didScidEntry = aka.find(
      (v) => typeof v === "string" && v.startsWith("did:scid:")
    );
    if (!didScidEntry) {
      return badRequest({ error: "did:scid not present in alsoKnownAs" }, 404);
    }

    const didScidCore = didScidEntry.split("?")[0];

    // Collect mirrors from ?src parameters
    const mirrorSrcs = aka
      .filter((v) => typeof v === "string" && v.startsWith("did:scid:"))
      .map((v) => extractQueryParam(v, "src"))
      .filter((v): v is string => !!v);

    // Query issuer_registry for verification status
    let issuerRegistryStatus: string | null = null;
    try {
      const supabase = getRequestClient(undefined);
      const { data, error } = await supabase
        .from("issuer_registry")
        .select("status")
        .eq("issuer_did", didScidCore)
        .maybeSingle();
      if (error) {
        // Treat as not found for privacy-safety
        issuerRegistryStatus = null;
      } else {
        issuerRegistryStatus = data?.status ?? null;
      }
    } catch {
      issuerRegistryStatus = null;
    }

    // Cache for 5 minutes
    const cacheHeaders = {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    };

    return json(
      200,
      {
        success: true,
        data: {
          nip05,
          didScid: didScidCore,
          mirrors: mirrorSrcs.length > 0 ? mirrorSrcs : [didJsonUrl],
          issuerRegistryStatus,
        },
      },
      cacheHeaders
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return badRequest({ error: message }, 500);
  }
};
