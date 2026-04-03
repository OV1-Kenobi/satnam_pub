// OTS Proof Generator for Agent Attestations
// Purpose: Server-side Netlify Function that generates OpenTimestamps proofs for agent Nostr events
// Aligned with: docs/planning/OTS-AGENT-PROOF-GENERATION-IMPLEMENTATION-PLAN.md Phase 1

import { OpenTimestampsClient } from "@alexalves87/opentimestamps-client";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {
    captureSimpleProofError,
    initializeSentry,
    logError,
} from "../functions/utils/sentry.server.js";
import {
    checkRateLimit,
    createRateLimitIdentifier,
    RATE_LIMITS,
} from "./utils/enhanced-rate-limiter.js";
import { getEnvVar } from "./utils/env.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger({ component: "ots-proof-generator" });

// Initialize Sentry once at module load time
initializeSentry();

// Initialize Supabase admin client (service role)
const supabaseUrl = getEnvVar("SUPABASE_URL") || getEnvVar("VITE_SUPABASE_URL");
const supabaseServiceKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Missing Supabase configuration (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)",
  );
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Generate OpenTimestamps proof for agent Nostr event
 * @param {Object} event - Netlify function event
 * @returns {Object} Response with proof metadata
 */
export const handler = async (event) => {
  const startTime = Date.now();
  const requestId = `ots-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  logger.info("🚀 OTS proof generator started", { requestId });

  // Only accept POST requests
  if (event.httpMethod !== "POST") {
    logger.warn("Method not allowed", { method: event.httpMethod, requestId });
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Rate limiting (prevent abuse)
    const clientIP =
      event.headers["x-forwarded-for"] ||
      event.headers["client-ip"] ||
      "unknown";
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const allowed = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.IDENTITY_PUBLISH,
    );

    if (!allowed) {
      logger.warn("Rate limit exceeded", { clientIP, requestId });
      return {
        statusCode: 429,
        body: JSON.stringify({ error: "Rate limit exceeded" }),
      };
    }

    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      logger.error("Invalid JSON in request body", { requestId });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid JSON in request body" }),
      };
    }

    // Validate required fields
    const {
      attested_event_kind,
      attested_event_id,
      agent_pubkey,
      data,
      storage_backend = "supabase",
    } = body;

    if (!attested_event_kind || !attested_event_id || !agent_pubkey || !data) {
      logger.error("Missing required fields", { requestId, body });
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Missing required fields: attested_event_kind, attested_event_id, agent_pubkey, data",
        }),
      };
    }

    logger.info("Generating OTS proof", {
      requestId,
      attested_event_kind,
      attested_event_id,
      agent_pubkey,
      storage_backend,
    });

    // 1. Compute SHA-256 hash of data
    const proof_hash = createHash("sha256").update(data).digest("hex");
    logger.debug("Computed proof hash", { requestId, proof_hash });

    // 2. Generate OTS proof using OpenTimestamps client
    const otsClient = new OpenTimestampsClient();
    const hashBuffer = Buffer.from(proof_hash, "hex");

    let otsProofBytes;
    try {
      const stampResult = await otsClient.stamp(hashBuffer);

      // Handle different return types from OTS client
      if (Buffer.isBuffer(stampResult)) {
        otsProofBytes = stampResult;
      } else if (
        stampResult &&
        typeof stampResult.serializeToBytes === "function"
      ) {
        otsProofBytes = stampResult.serializeToBytes();
      } else {
        throw new Error(
          "Unexpected stamp() return type from OpenTimestamps client",
        );
      }

      logger.info("OTS proof generated successfully", {
        requestId,
        proof_hash,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("OTS proof generation failed", {
        requestId,
        error: errorMsg,
      });

      captureSimpleProofError(
        error instanceof Error ? error : new Error(errorMsg),
        {
          component: "ots-proof-generator",
          action: "generateProof",
          metadata: { requestId, proof_hash, attested_event_kind },
        },
      );

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "OTS proof generation failed",
          details: errorMsg,
        }),
      };
    }

    // 3. Store .ots proof file in Supabase Storage
    const otsFileName = `${proof_hash}.ots`;
    const otsFilePath = `${agent_pubkey}/${otsFileName}`;

    let ots_proof_file_url;
    try {
      const { data: uploadData, error: uploadError } =
        await supabaseAdmin.storage
          .from("ots-proofs")
          .upload(otsFilePath, Buffer.from(otsProofBytes), {
            contentType: "application/octet-stream",
            upsert: true,
          });

      if (uploadError) {
        throw new Error(
          `Supabase Storage upload failed: ${uploadError.message}`,
        );
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from("ots-proofs")
        .getPublicUrl(otsFilePath);

      ots_proof_file_url = urlData.publicUrl;
      logger.info("OTS proof file uploaded to Supabase Storage", {
        requestId,
        ots_proof_file_url,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Supabase Storage upload failed", {
        requestId,
        error: errorMsg,
      });

      logError(error instanceof Error ? error : new Error(errorMsg), {
        requestId,
        endpoint: "ots-proof-generator",
        action: "uploadProof",
      });

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Proof file upload failed",
          details: errorMsg,
        }),
      };
    }

    // 4. Insert row into ots_proof_records table
    let ots_proof_record_id;
    try {
      const { data: proofRecord, error: insertError } = await supabaseAdmin
        .from("ots_proof_records")
        .insert({
          proof_hash,
          ots_proof_file_url,
          agent_pubkey,
          attested_event_kind,
          attested_event_id,
          proof_status: "pending",
          storage_backend,
          storage_metadata: {
            uploaded_at: new Date().toISOString(),
            request_id: requestId,
          },
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Database insert failed: ${insertError.message}`);
      }

      ots_proof_record_id = proofRecord.id;
      logger.info("OTS proof record inserted into database", {
        requestId,
        ots_proof_record_id,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Database insert failed", { requestId, error: errorMsg });

      logError(error instanceof Error ? error : new Error(errorMsg), {
        requestId,
        endpoint: "ots-proof-generator",
        action: "insertProofRecord",
      });

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Database insert failed",
          details: errorMsg,
        }),
      };
    }

    // 5. Update agent_profiles metrics
    try {
      const { error: rpcError } = await supabaseAdmin.rpc(
        "increment_ots_attestation_count",
        {
          agent_pk: agent_pubkey,
        },
      );

      if (rpcError) {
        // Non-fatal: log warning but don't fail the request
        logger.warn("Failed to update agent metrics (non-fatal)", {
          requestId,
          error: rpcError.message,
        });
      } else {
        logger.debug("Agent metrics updated", { requestId, agent_pubkey });
      }
    } catch (error) {
      // Non-fatal: log warning but don't fail the request
      logger.warn("Failed to update agent metrics (non-fatal)", {
        requestId,
        error: error.message,
      });
    }

    // 6. Return success response
    const duration = Date.now() - startTime;
    logger.info("✅ OTS proof generation completed successfully", {
      requestId,
      proof_hash,
      ots_proof_record_id,
      duration,
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        proof_hash,
        ots_proof_file_url,
        proof_status: "pending",
        ots_proof_record_id,
        request_id: requestId,
        duration_ms: duration,
      }),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logger.error("❌ OTS proof generation failed", {
      requestId,
      error: errorMsg,
      duration,
    });

    logError(error instanceof Error ? error : new Error(errorMsg), {
      requestId,
      endpoint: "ots-proof-generator",
      action: "generateProof",
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal server error",
        details: errorMsg,
        request_id: requestId,
      }),
    };
  }
};
