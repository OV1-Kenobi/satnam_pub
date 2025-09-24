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
  const origin = isProd
    ? process.env.FRONTEND_URL || "https://www.satnam.pub"
    : "*";
  const allowCredentials = origin !== "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": String(allowCredentials),
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
}

function json(
  statusCode: number,
  body: unknown,
  extra?: Record<string, string>
) {
  return {
    statusCode,
    headers: { ...corsHeaders(), ...(extra || {}) },
    body: JSON.stringify(body),
  };
}

function lastSegment(path: string): string {
  const parts = (path || "").split("/").filter(Boolean);
  return (parts[parts.length - 1] || "").toLowerCase();
}

// Exponential backoff with jitter for fetch; retries on network errors and 5xx
async function fetchWithRetry(
  url: string,
  opts: RequestInit = {},
  maxAttempts = 3,
  baseDelayMs = 500,
  timeoutMs = 8000
): Promise<Response | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(t);
      if (res.ok) return res;
      // Only retry on 5xx
      if (res.status >= 500 && attempt < maxAttempts) {
        const jitter = 0.75 + Math.random() * 0.5; // ±25%
        const delay = Math.round(
          baseDelayMs * Math.pow(2, attempt - 1) * jitter
        );
        console.warn(
          `fetchWithRetry: ${url} failed with ${res.status}, retry ${attempt}/${
            maxAttempts - 1
          } after ${delay}ms`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(t);
      if (attempt < maxAttempts) {
        const jitter = 0.75 + Math.random() * 0.5;
        const delay = Math.round(
          baseDelayMs * Math.pow(2, attempt - 1) * jitter
        );
        console.warn(
          `fetchWithRetry: ${url} error on attempt ${attempt}: ${
            err instanceof Error ? err.message : String(err)
          }; retry after ${delay}ms`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return null;
    }
  }
  return null;
}

export const handler: Handler = async (event) => {
  if ((event.httpMethod || "").toUpperCase() === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  const ip =
    (
      event.headers?.["x-forwarded-for"] ||
      event.headers?.["X-Forwarded-For"] ||
      ""
    )
      .toString()
      .split(",")[0]
      ?.trim() || "unknown";
  const op = lastSegment(event.path || "");

  try {
    if (op === "resolve") {
      if (!allowRequest(ip, 60, 60_000))
        return json(429, { success: false, error: "Too many requests" });
      if ((event.httpMethod || "GET").toUpperCase() !== "GET")
        return json(405, { success: false, error: "Method not allowed" });

      const params = new URLSearchParams(
        event.rawQuery ||
          event.rawQueryString ||
          (event.queryStringParameters as any)
      );
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
          next: Boolean(sdm && u)
            ? "/.netlify/functions/nfc-resolver/sun-verify"
            : null,
          // UI can decide to auto-call sun-verify when SDM params are present
        },
      });
    }

    if (op === "sun-verify") {
      if (!allowRequest(ip, 20, 60_000))
        return json(429, { success: false, error: "Too many requests" });
      if ((event.httpMethod || "POST").toUpperCase() !== "POST")
        return json(405, { success: false, error: "Method not allowed" });

      const body = (() => {
        try {
          return JSON.parse(event.body || "{}");
        } catch {
          return {};
        }
      })() as {
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
      const bridgeConfigured = Boolean(
        process.env.NTAG424_BRIDGE_URL ||
          process.env.NTAG424_HARDWARE_BRIDGE_URL
      );
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

      return json(501, {
        success: false,
        error: "Hardware bridge integration not yet implemented",
      });
    }

    // VP verification endpoint with retries and expanded issuer info
    if (op === "vp-verify") {
      if (!allowRequest(ip, 60, 60_000))
        return json(429, { success: false, error: "Too many requests" });
      if ((event.httpMethod || "POST").toUpperCase() !== "POST")
        return json(405, { success: false, error: "Method not allowed" });

      type VpBody = {
        nip05?: string;
        holderPublicJwk?: {
          kty?: string;
          crv?: string;
          x?: string;
          y?: string;
        };
        didJsonUrls?: string[];
      };
      const body = (() => {
        try {
          return JSON.parse(event.body || "{}");
        } catch {
          return {};
        }
      })() as VpBody;

      const nip05 = (body.nip05 || "").trim().toLowerCase();
      const jwk = body.holderPublicJwk || {};
      if (!nip05 || !nip05.includes("@"))
        return json(400, { success: false, error: "Invalid nip05" });
      if (jwk.kty !== "EC" || jwk.crv !== "secp256k1" || !jwk.x || !jwk.y)
        return json(400, {
          success: false,
          error: "Invalid or missing JWK (EC/secp256k1 required)",
        });

      const [name, domain] = nip05.split("@");
      const primary = `https://${domain}/.well-known/did.json`;
      const mirrorsIn = Array.isArray(body.didJsonUrls) ? body.didJsonUrls : [];
      const candidates = Array.from(new Set([primary, ...mirrorsIn]));

      const mirrorsValidated: string[] = [];
      let acctFound = false;
      let didScid: string | null = null;
      let jwkMatch = false;

      for (const url of candidates) {
        try {
          const res = await fetchWithRetry(url, {}, 3, 500, 8000);
          if (!res || !res.ok) continue;
          const doc: any = await res.json();

          const aka: string[] = Array.isArray(doc?.alsoKnownAs)
            ? doc.alsoKnownAs
            : [];
          const hasAcct = aka.some(
            (a) => typeof a === "string" && a.toLowerCase() === `acct:${nip05}`
          );
          if (!hasAcct) continue;
          acctFound = true;
          mirrorsValidated.push(url);

          const idStr = typeof doc?.id === "string" ? doc.id : null;
          if (idStr && idStr.startsWith("did:scid")) didScid = idStr;
          if (!didScid) {
            const akaDid = aka.find(
              (a) => typeof a === "string" && a.startsWith("did:scid:")
            );
            if (akaDid) didScid = akaDid;
          }

          const vms: any[] = Array.isArray(doc?.verificationMethod)
            ? doc.verificationMethod
            : [];
          for (const vm of vms) {
            const pj = vm?.publicKeyJwk;
            if (
              pj &&
              pj.kty === "EC" &&
              pj.crv === "secp256k1" &&
              typeof pj.x === "string" &&
              typeof pj.y === "string"
            ) {
              if (pj.x === jwk.x && pj.y === jwk.y) {
                jwkMatch = true;
                break;
              }
            }
          }
        } catch (error) {
          // best-effort: skip this mirror
        }
      }

      const didDocumentVerified = acctFound && (Boolean(didScid) || jwkMatch);

      // Strict NIP-05 nostr.json mapping check (no retries by design)
      let nip05Verified = false;
      try {
        const nostrUrl = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(
          name
        )}`;
        const r = await fetch(nostrUrl);
        if (r.ok) {
          const j = await r.json();
          const names = j?.names || {};
          if (
            typeof names?.[name] === "string" &&
            /^[0-9a-fA-F]{64}$/.test(names[name])
          ) {
            nip05Verified = true;
          }
        }
      } catch (error) {
        console.warn(
          `NIP-05 verification failed for ${domain}:`,
          error instanceof Error ? error.message : String(error)
        );
      }

      // Issuer registry info (best-effort)
      let issuerRegistryInfo: {
        status?: string | null;
        issuer_name?: string | null;
        trust_tier?: string | null;
        created_at?: string | null;
        updated_at?: string | null;
      } | null = null;
      let issuerRegistryStatus: string | null = null; // backward-compat alias
      try {
        const supabase = getRequestClient(undefined);
        if (didScid) {
          const { data } = await supabase
            .from("issuer_registry")
            .select("status, issuer_name, trust_tier, created_at, updated_at")
            .eq("issuer_did", didScid)
            .maybeSingle();
          if (data) {
            issuerRegistryInfo = {
              status: data.status ?? null,
              issuer_name: data.issuer_name ?? null,
              trust_tier: data.trust_tier ?? null,
              created_at: data.created_at ?? null,
              updated_at: data.updated_at ?? null,
            };
            issuerRegistryStatus = data.status ?? null;
          }
        }
      } catch {}

      return json(200, {
        success: true,
        data: {
          nip05Verified,
          didDocumentVerified,
          mirrorsValidated,
          issuerRegistryInfo,
          issuerRegistryStatus,
          didScid: didScid || null,
        },
      });
    }

    return json(404, { success: false, error: "Not found" });
  } catch (e) {
    return json(500, {
      success: false,
      error: "Internal server error",
      meta: { message: e instanceof Error ? e.message : "Unknown error" },
    });
  }
};
