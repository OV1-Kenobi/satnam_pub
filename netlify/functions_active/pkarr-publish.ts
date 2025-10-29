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
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 PKARR publish handler started:", {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  if (event.httpMethod !== "POST") {
    return errorResponse(405, "Method not allowed", requestOrigin);
  }

  try {
    // Check if PKARR is enabled
    const pkarrEnabled = getEnvVar("VITE_PKARR_ENABLED") === "true";
    if (!pkarrEnabled) {
      return errorResponse(
        503,
        "PKARR integration is not enabled",
        requestOrigin
      );
    }

    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const rateLimitResult = await checkRateLimitStatus(
      rateLimitKey,
      RATE_LIMITS.IDENTITY_PUBLISH
    );

    if (!rateLimitResult.allowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "pkarr-publish",
        method: event.httpMethod,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Parse request body
    let payload: PkarrPublishRequest;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return createValidationErrorResponse(
        "Invalid JSON in request body",
        requestId,
        requestOrigin
      );
    }

    // Validate required fields
    if (!payload.public_key || !Array.isArray(payload.records)) {
      return createValidationErrorResponse(
        "Missing required fields: public_key, records",
        requestId,
        requestOrigin
      );
    }

    if (!payload.signature || payload.timestamp === undefined) {
      return createValidationErrorResponse(
        "Missing required fields: signature, timestamp",
        requestId,
        requestOrigin
      );
    }

    // Validate sequence is present and is a number
    if (
      payload.sequence === undefined ||
      typeof payload.sequence !== "number"
    ) {
      return createValidationErrorResponse(
        "sequence must be a number",
        requestId,
        requestOrigin
      );
    }
    if (payload.sequence < 0 || !Number.isInteger(payload.sequence)) {
      return createValidationErrorResponse(
        "sequence must be a non-negative integer",
        requestId,
        requestOrigin
      );
    }

    // Validate timestamp is a number and reasonable
    if (
      typeof payload.timestamp !== "number" ||
      !Number.isInteger(payload.timestamp)
    ) {
      return createValidationErrorResponse(
        "timestamp must be an integer",
        requestId,
        requestOrigin
      );
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.timestamp < now - 3600 || payload.timestamp > now + 300) {
      return createValidationErrorResponse(
        "timestamp must be within reasonable range (±1 hour past, ±5 min future)",
        requestId,
        requestOrigin
      );
    }

    // Validate public key format (64 hex chars)
    if (!/^[0-9a-fA-F]{64}$/.test(payload.public_key)) {
      return createValidationErrorResponse(
        "Invalid public key format",
        requestId,
        requestOrigin
      );
    }

    // Validate signature format (128 hex chars)
    if (!/^[0-9a-fA-F]{128}$/.test(payload.signature)) {
      return createValidationErrorResponse(
        "Invalid signature format",
        requestId,
        requestOrigin
      );
    }

    // Validate records
    for (const record of payload.records) {
      if (!record.name || !record.type || !record.value) {
        return createValidationErrorResponse(
          "Each record must have name, type, and value",
          requestId,
          requestOrigin
        );
      }
      if (record.ttl && (record.ttl < 60 || record.ttl > 86400)) {
        return createValidationErrorResponse(
          "Record TTL must be between 60 and 86400 seconds",
          requestId,
          requestOrigin
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
      return errorResponse(401, "Invalid signature", requestOrigin);
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
      return errorResponse(
        409,
        `Sequence number must be greater than existing record (current: ${existing.sequence})`,
        requestOrigin
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
      logError(dbError, {
        requestId,
        endpoint: "pkarr-publish",
        operation: "database_upsert",
      });
      return errorResponse(500, "Failed to store PKARR record", requestOrigin);
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

    // Return success response with security headers
    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 201,
      headers: {
        ...headers,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      },
      body: JSON.stringify({
        success: true,
        data: {
          id: insertedRecord.id,
          public_key: payload.public_key,
          sequence: payload.sequence,
          message: "PKARR record published successfully",
          simpleproof_timestamp_id: simpleproofTimestampId,
          simpleproof_enabled: simpleproofEnabled,
        },
      }),
    };
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "pkarr-publish",
      method: event.httpMethod,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
