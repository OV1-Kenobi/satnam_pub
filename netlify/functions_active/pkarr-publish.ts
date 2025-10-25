/**
 * PKARR Record Publishing Endpoint
 * POST /.netlify/functions/pkarr-publish
 *
 * Phase 1: Stores PKARR records in database (DHT publishing to be added in Phase 2)
 * Requires authentication and validates record signatures
 * Pure ESM, uses process.env, rate limited, CORS
 *
 * NOTE: Currently stores records in database with relay_urls as empty array.
 * BitTorrent DHT relay publishing will be implemented in Phase 2.
 */

import type { Handler } from "@netlify/functions";
import { getRequestClient } from "./supabase.js";
import { getEnvVar } from "./utils/env.js";
import { allowRequest } from "./utils/rate-limiter.js";

const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";

/**
 * Verify PKARR signature using Ed25519
 * @param publicKeyHex - Public key in hex format (64 chars)
 * @param recordsJson - JSON stringified records array
 * @param timestamp - Unix timestamp
 * @param sequence - Sequence number
 * @param signatureHex - Signature in hex format (128 chars)
 * @returns true if signature is valid, false otherwise
 */
async function verifyPkarrSignature(
  publicKeyHex: string,
  recordsJson: string,
  timestamp: number,
  sequence: number,
  signatureHex: string
): Promise<boolean> {
  try {
    // Import Ed25519 from noble curves
    const { ed25519 } = await import("@noble/curves/ed25519");

    // Convert hex strings to Uint8Array
    const publicKey = new Uint8Array(
      publicKeyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );
    const signature = new Uint8Array(
      signatureHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    // Create the message to verify: records + timestamp + sequence
    const message = `${recordsJson}${timestamp}${sequence}`;
    const messageBytes = new TextEncoder().encode(message);

    // Verify the signature
    return ed25519.verify(signature, messageBytes, publicKey);
  } catch (error) {
    console.error("PKARR signature verification error:", error);
    return false;
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

interface PkarrPublishRequest {
  public_key: string;
  records: Array<{
    name: string;
    type: string;
    value: string;
    ttl?: number;
  }>;
  timestamp: number;
  sequence: number;
  signature: string;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...corsHeaders() } };
  }
  if (event.httpMethod !== "POST") {
    return badRequest({ error: "Method not allowed" }, 405);
  }

  // Check if PKARR is enabled
  const pkarrEnabled = getEnvVar("VITE_PKARR_ENABLED") === "true";
  if (!pkarrEnabled) {
    return badRequest({ error: "PKARR integration is not enabled" }, 503);
  }

  // Rate limit per IP
  const xfwd =
    event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
  const clientIp = Array.isArray(xfwd)
    ? xfwd[0]
    : (xfwd || "").split(",")[0]?.trim() || "unknown";
  if (!allowRequest(clientIp, 30, 60_000))
    return badRequest({ error: "Too many requests" }, 429);

  try {
    // Parse request body
    let payload: PkarrPublishRequest;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return badRequest({ error: "Invalid JSON in request body" }, 400);
    }

    // Validate required fields
    if (!payload.public_key || !Array.isArray(payload.records)) {
      return badRequest(
        { error: "Missing required fields: public_key, records" },
        400
      );
    }

    if (!payload.signature || payload.timestamp === undefined) {
      return badRequest(
        { error: "Missing required fields: signature, timestamp" },
        400
      );
    }

    // Validate sequence is present and is a number
    if (
      payload.sequence === undefined ||
      typeof payload.sequence !== "number"
    ) {
      return badRequest({ error: "sequence must be a number" }, 400);
    }
    if (payload.sequence < 0 || !Number.isInteger(payload.sequence)) {
      return badRequest(
        { error: "sequence must be a non-negative integer" },
        400
      );
    }

    // Validate timestamp is a number and reasonable
    if (
      typeof payload.timestamp !== "number" ||
      !Number.isInteger(payload.timestamp)
    ) {
      return badRequest({ error: "timestamp must be an integer" }, 400);
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.timestamp < now - 3600 || payload.timestamp > now + 300) {
      return badRequest(
        {
          error:
            "timestamp must be within reasonable range (±1 hour past, ±5 min future)",
        },
        400
      );
    }

    // Validate public key format (64 hex chars)
    if (!/^[0-9a-fA-F]{64}$/.test(payload.public_key)) {
      return badRequest({ error: "Invalid public key format" }, 400);
    }

    // Validate signature format (128 hex chars)
    if (!/^[0-9a-fA-F]{128}$/.test(payload.signature)) {
      return badRequest({ error: "Invalid signature format" }, 400);
    }

    // Validate records
    for (const record of payload.records) {
      if (!record.name || !record.type || !record.value) {
        return badRequest(
          { error: "Each record must have name, type, and value" },
          400
        );
      }
      if (record.ttl && (record.ttl < 60 || record.ttl > 86400)) {
        return badRequest(
          { error: "Record TTL must be between 60 and 86400 seconds" },
          400
        );
      }
    }

    // Verify signature server-side (CRITICAL SECURITY CHECK)
    const recordsJson = JSON.stringify(payload.records);
    const isSignatureValid = await verifyPkarrSignature(
      payload.public_key,
      recordsJson,
      payload.timestamp,
      payload.sequence,
      payload.signature
    );

    if (!isSignatureValid) {
      console.warn(
        `Invalid PKARR signature from public key: ${payload.public_key.substring(
          0,
          16
        )}...`
      );
      return badRequest({ error: "Invalid signature" }, 401);
    }

    // Store PKARR record in database
    const supabase = getRequestClient(undefined);

    // Check if record already exists
    const { data: existing } = await supabase
      .from("pkarr_records")
      .select("id, sequence")
      .eq("public_key", payload.public_key)
      .maybeSingle();

    // Validate sequence number (must be greater than existing)
    if (existing && payload.sequence <= existing.sequence) {
      return badRequest(
        {
          error: "Sequence number must be greater than existing record",
          currentSequence: existing.sequence,
        },
        409
      );
    }

    // Insert or update PKARR record
    const { error: dbError, data: insertedRecord } = await supabase
      .from("pkarr_records")
      .upsert(
        {
          public_key: payload.public_key,
          records: payload.records,
          timestamp: payload.timestamp,
          sequence: payload.sequence,
          signature: payload.signature,
          verified: true, // Signature verified server-side (Ed25519)
          cache_expires_at: Math.floor(Date.now() / 1000) + 3600,
          relay_urls: [],
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
        },
        { onConflict: "public_key" }
      )
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return badRequest({ error: "Failed to store PKARR record" }, 500);
    }

    // Optional: Create SimpleProof timestamp for blockchain verification
    // Feature flag gated: VITE_SIMPLEPROOF_ENABLED
    let simpleproofTimestampId: string | null = null;
    const simpleproofEnabled = getEnvVar("VITE_SIMPLEPROOF_ENABLED") === "true";

    if (simpleproofEnabled) {
      try {
        // Create hash of PKARR record for timestamping
        const recordData = JSON.stringify({
          public_key: payload.public_key,
          records: payload.records,
          timestamp: payload.timestamp,
          sequence: payload.sequence,
        });

        // Call simpleproof-timestamp function
        const timestampResponse = await fetch(
          `${
            process.env.URL || "https://www.satnam.pub"
          }/.netlify/functions/simpleproof-timestamp`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create",
              data: recordData,
              verification_id: insertedRecord.id, // Link to PKARR record
            }),
          }
        );

        if (timestampResponse.ok) {
          const timestampData = await timestampResponse.json();

          // Store timestamp ID in simpleproof_timestamps table
          const { data: timestampRecord } = await supabase
            .from("simpleproof_timestamps")
            .select("id")
            .eq("verification_id", insertedRecord.id)
            .maybeSingle();

          if (timestampRecord) {
            simpleproofTimestampId = timestampRecord.id;

            // Update PKARR record with SimpleProof verification
            await supabase
              .from("pkarr_records")
              .update({
                simpleproof_timestamp_id: timestampRecord.id,
                simpleproof_verified: true,
                simpleproof_verified_at: Math.floor(Date.now() / 1000),
              })
              .eq("id", insertedRecord.id);

            console.log(
              `SimpleProof timestamp created for PKARR record: ${insertedRecord.id}`
            );
          }
        } else {
          console.warn(
            `SimpleProof timestamp creation failed (non-critical): ${timestampResponse.status}`
          );
        }
      } catch (simpleproofError) {
        // Non-critical error: PKARR record is still valid without SimpleProof
        console.warn(
          "SimpleProof timestamp creation failed (non-critical):",
          simpleproofError instanceof Error
            ? simpleproofError.message
            : "Unknown error"
        );
      }
    }

    // Cache for 5 minutes
    const cacheHeaders = {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    };

    return json(
      201,
      {
        success: true,
        data: {
          id: insertedRecord.id,
          public_key: payload.public_key,
          sequence: payload.sequence,
          message: "PKARR record published successfully",
          simpleproof_timestamp_id: simpleproofTimestampId,
          simpleproof_enabled: simpleproofEnabled,
        },
      },
      cacheHeaders
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("PKARR publish error:", message);
    return badRequest({ error: message }, 500);
  }
};
