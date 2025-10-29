/*
 * NIP-05 → DID resolver service with Hybrid Verification Support
 * GET /.netlify/functions/nip05-resolver?nip05=username@domain&hybrid=true&pubkey=...
 *
 * - Resolves did:scid from the DID document hosted at the nip05 domain
 * - Returns did.json mirror URLs discovered via alsoKnownAs (?src=)
 * - Returns issuer_registry verification status if available
 * - Phase 1: Supports hybrid verification (kind:0 → PKARR → DNS) when hybrid=true
 * - Pure ESM, uses process.env, rate limited, CORS, cache headers
 */

import type { Handler } from "@netlify/functions";

// Security utilities (Phase 2 hardening)
import {
  RATE_LIMITS,
  checkRateLimitStatus,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.ts";
import {
  createRateLimitErrorResponse,
  createValidationErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.ts";
import {
  errorResponse,
  getSecurityHeaders,
  preflightResponse,
} from "./utils/security-headers.ts";

import { getRequestClient } from "./supabase.js";
import { getEnvVar } from "./utils/env.js";

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
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 NIP-05 resolver handler started:", {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  if (event.httpMethod !== "GET") {
    return errorResponse(405, "Method not allowed", requestOrigin);
  }

  try {
    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitResult = await checkRateLimitStatus(
      rateLimitKey,
      RATE_LIMITS.IDENTITY_VERIFY
    );

    if (!rateLimitResult.allowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "nip05-resolver",
        method: event.httpMethod,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    const nip05 = (event.queryStringParameters?.nip05 || "").trim();
    if (!nip05) {
      return createValidationErrorResponse(
        "Missing nip05 query parameter",
        requestId,
        requestOrigin
      );
    }

    // Phase 1: Check for hybrid verification request
    const hybridEnabled = getEnvVar("VITE_HYBRID_IDENTITY_ENABLED") === "true";
    const useHybrid =
      hybridEnabled &&
      (event.queryStringParameters?.hybrid || "").toLowerCase() === "true";
    const pubkey = (event.queryStringParameters?.pubkey || "").trim();

    const { username, domain } = parseNip05(nip05);

    const didJsonUrl = `https://${domain}/.well-known/did.json`;
    const didRes = await fetch(didJsonUrl, { method: "GET" });
    if (!didRes.ok) {
      return errorResponse(
        404,
        `did.json not found at ${didJsonUrl}`,
        requestOrigin
      );
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
      return createValidationErrorResponse(
        "DID document acct entry does not match NIP-05",
        requestId,
        requestOrigin
      );
    }

    const didScidEntry = aka.find(
      (v) => typeof v === "string" && v.startsWith("did:scid:")
    );
    if (!didScidEntry) {
      return errorResponse(
        404,
        "did:scid not present in alsoKnownAs",
        requestOrigin
      );
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

    // Phase 1: Add hybrid verification metadata if requested
    const responseData: any = {
      nip05,
      didScid: didScidCore,
      mirrors: mirrorSrcs.length > 0 ? mirrorSrcs : [didJsonUrl],
      issuerRegistryStatus,
    };

    if (useHybrid && pubkey) {
      responseData.hybridVerification = {
        enabled: true,
        pubkey,
        verificationMethods: ["kind:0", "pkarr", "dns"],
        status: "pending", // Will be resolved client-side
      };
    }

    // Return success response with security headers
    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers: {
        ...headers,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      },
      body: JSON.stringify({
        success: true,
        data: responseData,
      }),
    };
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "nip05-resolver",
      method: event.httpMethod,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
