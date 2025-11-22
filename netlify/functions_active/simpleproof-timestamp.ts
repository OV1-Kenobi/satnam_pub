/*
 * SimpleProof Timestamp Creation Function
 * POST /.netlify/functions/simpleproof-timestamp
 *
 * Creates OpenTimestamps proofs anchored to Bitcoin blockchain
 * - Accepts: data (string), verification_id (UUID)
 * - Returns: ots_proof, bitcoin_block, bitcoin_tx, verified_at
 * - Rate limiting: 10 requests/hour per user
 * - Privacy-first: No PII stored, only hashes and proofs
 *
 * Phase 2B-2 Day 15: Enhanced with structured logging + Sentry error tracking
 */

import type { Handler } from "@netlify/functions";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Security utilities (Phase 3 hardening)
import {
  RATE_LIMITS,
  checkRateLimit,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.ts";
import {
  createRateLimitErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.ts";
import { errorResponse, preflightResponse } from "./utils/security-headers.ts";

import {
  createLogger,
  logApiCall,
  logDatabaseOperation,
} from "../functions/utils/logging.js";
import {
  addSimpleProofBreadcrumb,
  captureSimpleProofError,
  initializeSentry,
} from "../functions/utils/sentry.server.js";
import { supabaseAdmin } from "../functions/supabase.js";
import { getEnvVar } from "./utils/env.js";
import {
  compressProof,
  calculateCompressionRatio,
} from "./utils/proof-compression.ts";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { OpenTimestampsClient } from "@alexalves87/opentimestamps-client";

// Security: Input validation patterns
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DATA_LENGTH = 10000; // 10KB max for data field

interface SimpleProofRequest {
  action?: string; // Action-based routing: "create", "verify", "history", "get"
  data?: string;
  verification_id?: string;
  user_id?: string;
  timestamp_id?: string;
  limit?: number;
  /**
   * Optional provider hint for timestamp creation.
   * - "opentimestamps" (default when omitted) uses local OTS stamping only.
   * - "simpleproof" uses the remote SimpleProof API when SIMPLEPROOF_REMOTE_ENABLED=true.
   */
  provider?: "opentimestamps" | "simpleproof";
}

interface SimpleProofResponse {
  ots_proof: string;
  bitcoin_block: number | null;
  bitcoin_tx: string | null;
  verified_at: number;
}

interface SimpleProofApiResponse {
  ots_proof: string;
  bitcoin_block?: number;
  bitcoin_tx?: string;
  timestamp?: number;
}

// Old helper functions removed - now using centralized security utilities

type SimpleProofProvider = "simpleproof" | "opentimestamps_fallback";

type ProviderHealthProvider = "simpleproof" | "opentimestamps";

const PROVIDER_HEALTH_WINDOW_MS = 60 * 60 * 1000; // 1 hour rolling window

interface ProviderHealthRow {
  provider: ProviderHealthProvider;
  last_success_at: string | null;
  last_error_at: string | null;
  success_count: number;
  error_count: number;
  window_start_at: string | null;
}

interface SerializeToBytesCapable {
  serializeToBytes: () => Uint8Array | Buffer;
}

function isSerializeToBytesCapable(
  value: unknown
): value is SerializeToBytesCapable {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { serializeToBytes?: unknown }).serializeToBytes ===
      "function"
  );
}

function mapToHealthProvider(
  provider: SimpleProofProvider
): ProviderHealthProvider {
  return provider === "opentimestamps_fallback"
    ? "opentimestamps"
    : "simpleproof";
}

async function updateProviderHealth(
  provider: ProviderHealthProvider,
  outcome: "success" | "error"
): Promise<void> {
  try {
    if (!supabaseAdmin) {
      logger.warn(
        "supabaseAdmin not configured; skipping provider health update",
        {
          provider,
        }
      );
      return;
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const selectResult = await supabaseAdmin
      .from("attestation_provider_health")
      .select(
        "provider, window_start_at, success_count, error_count, last_success_at, last_error_at"
      )
      .eq("provider", provider)
      .single();

    const fetchError = selectResult.error;
    if (fetchError && (fetchError as { code?: string }).code !== "PGRST116") {
      const errorMsg =
        fetchError instanceof Error
          ? fetchError.message
          : String((fetchError as { message?: unknown }).message ?? fetchError);
      logger.error("Failed to load provider health row", {
        provider,
        metadata: { error: errorMsg },
      });
      return;
    }

    const existing = (selectResult.data as ProviderHealthRow | null) || null;

    let windowStartMs: number | null = null;
    if (existing?.window_start_at) {
      const parsed = new Date(existing.window_start_at).getTime();
      windowStartMs = Number.isFinite(parsed) ? parsed : null;
    }

    const windowExpired =
      windowStartMs === null ||
      now.getTime() - windowStartMs > PROVIDER_HEALTH_WINDOW_MS;

    const isSuccess = outcome === "success";

    const next: ProviderHealthRow = {
      provider,
      window_start_at: windowExpired
        ? nowIso
        : existing?.window_start_at ?? nowIso,
      success_count:
        (windowExpired ? 0 : existing?.success_count ?? 0) +
        (isSuccess ? 1 : 0),
      error_count:
        (windowExpired ? 0 : existing?.error_count ?? 0) + (isSuccess ? 0 : 1),
      last_success_at: isSuccess ? nowIso : existing?.last_success_at ?? null,
      last_error_at: isSuccess ? existing?.last_error_at ?? null : nowIso,
    };

    const { error: upsertError } = await supabaseAdmin
      .from("attestation_provider_health")
      .upsert(next, { onConflict: "provider" });

    if (upsertError) {
      const errorMsg =
        upsertError instanceof Error
          ? upsertError.message
          : String(
              (upsertError as { message?: unknown }).message ?? upsertError
            );
      logger.error("Failed to upsert provider health row", {
        provider,
        metadata: { error: errorMsg },
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("Unexpected error while recording provider health", {
      provider,
      metadata: { error: errorMsg },
    });
  }
}

function recordProviderSuccess(provider: SimpleProofProvider): void {
  const dbProvider = mapToHealthProvider(provider);
  void updateProviderHealth(dbProvider, "success");
}

function recordProviderError(provider: SimpleProofProvider): void {
  const dbProvider = mapToHealthProvider(provider);
  void updateProviderHealth(dbProvider, "error");
}

// Primary SimpleProof API helper
async function callSimpleProofApi(
  data: string,
  apiKey: string,
  apiUrl: string
): Promise<SimpleProofApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const response = await fetch(`${apiUrl}/timestamp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `SimpleProof API error: ${response.status} ${response.statusText}`
      );
    }

    const result = (await response.json()) as SimpleProofApiResponse;
    recordProviderSuccess("simpleproof");
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

// OpenTimestamps fallback helper - stamps data using default public calendars
async function createOpenTimestampsFallbackProof(
  data: string,
  otsClient: OpenTimestampsClient
): Promise<SimpleProofApiResponse> {
  let hashInput: Buffer;
  try {
    // Always treat data as UTF-8 text and hash with SHA-256 to derive the file digest
    const messageBuffer = Buffer.from(data, "utf8");
    hashInput = createHash("sha256").update(messageBuffer).digest();
  } catch (error) {
    throw new Error(
      `Failed to prepare data for OpenTimestamps: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }

  const fallbackStartTime = Date.now();
  logger.info("Stamping data with OpenTimestamps fallback provider", {
    action: "create",
    provider: "opentimestamps_fallback",
  });

  try {
    const stampResult = (await otsClient.stamp(hashInput)) as unknown;

    let proofBytes: Uint8Array | Buffer;
    if (Buffer.isBuffer(stampResult)) {
      proofBytes = stampResult;
    } else if (isSerializeToBytesCapable(stampResult)) {
      proofBytes = stampResult.serializeToBytes();
    } else if (isSerializeToBytesCapable(hashInput)) {
      proofBytes = hashInput.serializeToBytes();
    } else {
      throw new Error(
        "Unexpected stamp() return type from OpenTimestamps client"
      );
    }

    const otsProof = Buffer.from(proofBytes).toString("hex");
    const duration = Date.now() - fallbackStartTime;

    recordProviderSuccess("opentimestamps_fallback");
    logger.info("OpenTimestamps fallback stamp completed", {
      action: "create",
      provider: "opentimestamps_fallback",
      metadata: { duration },
    });

    return {
      ots_proof: otsProof,
      bitcoin_block: undefined,
      bitcoin_tx: undefined,
      timestamp: Math.floor(Date.now() / 1000),
    };
  } catch (error) {
    recordProviderError("opentimestamps_fallback");
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logger.error("OpenTimestamps fallback stamp failed", {
      action: "create",
      provider: "opentimestamps_fallback",
      metadata: { error: errorMsg },
    });

    captureSimpleProofError(
      error instanceof Error ? error : new Error(errorMsg),
      {
        component: "simpleproof-timestamp",
        action: "createTimestampFallback",
        metadata: {
          provider: "opentimestamps_fallback",
          error: errorMsg,
        },
      }
    );

    throw new Error(errorMsg);
  }
}

async function storeTimestamp(
  supabase: SupabaseClient<any, "public", any>,
  verificationId: string,
  otsProof: string,
  bitcoinBlock: number | null,
  bitcoinTx: string | null,
  performanceMs?: number
): Promise<string> {
  // Check for existing timestamp to prevent duplicates
  const { data: existing, error: checkError } = await supabase
    .from("simpleproof_timestamps")
    .select("id")
    .eq("verification_id", verificationId)
    .single();

  if (checkError && checkError.code !== "PGRST116") {
    // PGRST116 = no rows found (expected when no duplicate exists)
    throw new Error(
      `Database error checking for duplicates: ${checkError.message}`
    );
  }

  if (existing) {
    throw new Error("Timestamp already exists for this verification_id");
  }

  const { data, error } = await supabase
    .from("simpleproof_timestamps")
    .insert({
      verification_id: verificationId,
      ots_proof: otsProof,
      bitcoin_block: bitcoinBlock,
      bitcoin_tx: bitcoinTx,
      verified_at: Math.floor(Date.now() / 1000),
      is_valid: true,
      performance_ms: performanceMs || null, // Store actual operation duration
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error("Failed to store timestamp: no ID returned");
  }

  return data.id as string;
}

// Create logger instance
const logger = createLogger({ component: "simpleproof-timestamp" });

// PERFORMANCE: Initialize Sentry once at module load time (not per request)
initializeSentry();

export const handler: Handler = async (event) => {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  logger.info("🚀 SimpleProof timestamp handler started");

  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  if (event.httpMethod !== "POST") {
    logger.warn("Method not allowed", {
      metadata: { method: event.httpMethod, requestId },
    });
    return errorResponse(405, "Method not allowed", requestOrigin);
  }

  try {
    // Database-backed rate limiting
    const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
    const allowed = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.IDENTITY_PUBLISH
    );

    if (!allowed) {
      logError(new Error("Rate limit exceeded"), {
        requestId,
        endpoint: "simpleproof-timestamp",
        method: event.httpMethod,
      });
      logger.warn("Rate limit exceeded", {
        metadata: { clientIP, requestId },
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Parse request body
    let body: SimpleProofRequest;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      logger.error("Invalid JSON in request body");
      return errorResponse(400, "Invalid JSON in request body", requestOrigin);
    }

    // Route based on action (default: "create" for backward compatibility)
    const requestAction = body.action || "create";

    logger.info("Request received", {
      action: requestAction,
      verificationId: body.verification_id,
    });

    // Add Sentry breadcrumb for request
    addSimpleProofBreadcrumb("SimpleProof timestamp request received", {
      action: requestAction,
      verification_id: body.verification_id,
    });

    switch (requestAction) {
      case "create":
        const result = await handleCreateTimestamp(body, requestOrigin);
        const duration = Date.now() - startTime;
        logger.info("Request completed", {
          action: requestAction,
          verificationId: body.verification_id,
          metadata: { duration, statusCode: result.statusCode },
        });

        // Add Sentry breadcrumb for success
        addSimpleProofBreadcrumb("SimpleProof timestamp created successfully", {
          verification_id: body.verification_id,
          duration,
        });

        return result;
      default:
        logger.warn("Unknown action", {
          action: requestAction,
          metadata: { requestedAction: requestAction },
        });
        return errorResponse(
          400,
          `Unknown action: ${requestAction}`,
          requestOrigin
        );
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logError(error, {
      requestId,
      endpoint: "simpleproof-timestamp",
      method: event.httpMethod,
      duration,
    });

    // Capture error in Sentry
    captureSimpleProofError(
      error instanceof Error ? error : new Error(String(error)),
      {
        component: "simpleproof-timestamp",
        action: "handler",
        metadata: {
          duration,
          httpMethod: event.httpMethod,
          requestId,
        },
      }
    );

    return errorResponse(500, "Internal server error", requestOrigin);
  }
};

// ============================================================================
// ACTION HANDLERS
// ============================================================================

async function handleCreateTimestamp(
  body: SimpleProofRequest,
  requestOrigin?: string
) {
  // Phase 2: Performance tracking - capture start time for metrics
  const operationStartTime = Date.now();

  // Security: Validate input
  if (!body.data || typeof body.data !== "string") {
    return errorResponse(
      400,
      "Missing or invalid required field: data (string)",
      requestOrigin
    );
  }

  // Security: Prevent DoS via large payloads
  if (body.data.length > MAX_DATA_LENGTH) {
    return errorResponse(
      400,
      `Data field exceeds maximum length of ${MAX_DATA_LENGTH} characters`,
      requestOrigin
    );
  }

  if (!body.verification_id || typeof body.verification_id !== "string") {
    return errorResponse(
      400,
      "Missing or invalid required field: verification_id (UUID)",
      requestOrigin
    );
  }

  // Security: Validate UUID format to prevent injection attacks
  if (!UUID_PATTERN.test(body.verification_id)) {
    return errorResponse(
      400,
      "Invalid verification_id format (must be valid UUID)",
      requestOrigin
    );
  }

  // Provider selection and remote SimpleProof gating
  const requestedProvider =
    body.provider === "simpleproof" ? "simpleproof" : "opentimestamps";

  const simpleProofRemoteEnabled =
    (getEnvVar("SIMPLEPROOF_REMOTE_ENABLED") || "false")
      .toString()
      .toLowerCase() === "true";

  if (requestedProvider === "simpleproof" && !simpleProofRemoteEnabled) {
    logger.warn("SimpleProof remote provider disabled via env flag", {
      action: "create",
      provider: "simpleproof",
      verificationId: body.verification_id,
      metadata: { envFlag: "SIMPLEPROOF_REMOTE_ENABLED=false" },
    });
    return errorResponse(
      400,
      "SimpleProof remote provider is disabled",
      requestOrigin
    );
  }

  let provider: SimpleProofProvider =
    requestedProvider === "simpleproof"
      ? "simpleproof"
      : "opentimestamps_fallback";

  // Create a new OpenTimestamps client per request to avoid shared state
  const otsClient = new OpenTimestampsClient();

  // Call timestamp provider (OpenTimestamps primary, SimpleProof optional)
  let apiResult: SimpleProofApiResponse | null = null;
  const apiStartTime = Date.now();

  if (provider === "simpleproof") {
    // Get API credentials only when remote SimpleProof is used
    const apiKey = getEnvVar("VITE_SIMPLEPROOF_API_KEY");
    const apiUrl =
      getEnvVar("VITE_SIMPLEPROOF_API_URL") || "https://api.simpleproof.com";

    if (!apiKey) {
      logger.error("SimpleProof API key not configured");
      return errorResponse(
        500,
        "SimpleProof service not configured",
        requestOrigin
      );
    }

    try {
      logger.debug("Calling SimpleProof API", {
        action: "create",
        provider: "simpleproof",
        verificationId: body.verification_id,
      });
      apiResult = await callSimpleProofApi(body.data!, apiKey, apiUrl);
      const apiDuration = Date.now() - apiStartTime;
      logApiCall("POST", apiUrl, 200, apiDuration, {
        component: "simpleproof-timestamp",
        action: "create",
        provider: "simpleproof",
        verificationId: body.verification_id,
      });
    } catch (error) {
      const apiDuration = Date.now() - apiStartTime;
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      recordProviderError("simpleproof");
      logger.error("SimpleProof API call failed", {
        action: "create",
        provider: "simpleproof",
        verificationId: body.verification_id,
        metadata: { error: errorMsg, duration: apiDuration },
      });

      // Capture error in Sentry
      captureSimpleProofError(
        error instanceof Error ? error : new Error(errorMsg),
        {
          component: "simpleproof-timestamp",
          action: "createTimestamp",
          verificationId: body.verification_id,
          metadata: {
            apiUrl,
            duration: apiDuration,
            status: "api_error",
          },
        }
      );

      // Fallback: attempt local OpenTimestamps stamping
      try {
        logger.warn(
          "SimpleProof API failed, attempting OpenTimestamps fallback provider",
          {
            action: "create",
            provider: "opentimestamps_fallback",
            verificationId: body.verification_id,
          }
        );
        provider = "opentimestamps_fallback";
        apiResult = await createOpenTimestampsFallbackProof(
          body.data!,
          otsClient
        );
      } catch (fallbackError) {
        const fallbackErrorMsg =
          fallbackError instanceof Error
            ? fallbackError.message
            : "Unknown fallback error";
        logger.error(
          "OpenTimestamps fallback provider failed after SimpleProof error",
          {
            action: "create",
            provider: "opentimestamps_fallback",
            verificationId: body.verification_id,
            metadata: {
              simpleProofError: errorMsg,
              fallbackError: fallbackErrorMsg,
            },
          }
        );

        return errorResponse(
          500,
          "SimpleProof provider unavailable and OpenTimestamps fallback also failed. Please try again later.",
          requestOrigin
        );
      }
    }
  } else {
    // Primary OpenTimestamps path (no SimpleProof API calls)
    try {
      logger.info("Stamping data with OpenTimestamps primary provider", {
        action: "create",
        provider: "opentimestamps_fallback",
        verificationId: body.verification_id,
      });
      apiResult = await createOpenTimestampsFallbackProof(
        body.data!,
        otsClient
      );
    } catch (error) {
      const apiDuration = Date.now() - apiStartTime;
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("OpenTimestamps primary provider failed", {
        action: "create",
        provider: "opentimestamps_fallback",
        verificationId: body.verification_id,
        metadata: { error: errorMsg, duration: apiDuration },
      });

      captureSimpleProofError(
        error instanceof Error ? error : new Error(errorMsg),
        {
          component: "simpleproof-timestamp",
          action: "createTimestamp",
          verificationId: body.verification_id,
          metadata: {
            provider: "opentimestamps_fallback",
            duration: apiDuration,
            status: "api_error",
          },
        }
      );

      return errorResponse(
        500,
        "OpenTimestamps provider failed. Please try again later.",
        requestOrigin
      );
    }
  }

  if (!apiResult || !apiResult.ots_proof) {
    logger.error("Invalid response from timestamp provider", {
      action: "create",
      provider,
      verificationId: body.verification_id,
    });
    return errorResponse(
      500,
      "Invalid response from timestamp provider",
      requestOrigin
    );
  }

  // Store in database
  const supabaseUrl =
    getEnvVar("SUPABASE_URL") || getEnvVar("VITE_SUPABASE_URL");
  const supabaseKey =
    getEnvVar("SUPABASE_ANON_KEY") || getEnvVar("VITE_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    logger.error("Missing Supabase configuration", {
      action: "create",
      verificationId: body.verification_id,
    });
    return errorResponse(500, "Database configuration error", requestOrigin);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let timestampId: string;
  const dbStartTime = Date.now();
  try {
    // Phase 2: Calculate total operation duration for performance metrics
    const performanceMs = Date.now() - operationStartTime;

    timestampId = await storeTimestamp(
      supabase,
      body.verification_id!,
      apiResult.ots_proof,
      apiResult.bitcoin_block || null,
      apiResult.bitcoin_tx || null,
      performanceMs // Pass actual operation duration to database
    );
    const dbDuration = Date.now() - dbStartTime;
    logDatabaseOperation("INSERT", "simpleproof_timestamps", true, dbDuration, {
      component: "simpleproof-timestamp",
      action: "create",
      provider,
      verificationId: body.verification_id,
    });
  } catch (error) {
    const dbDuration = Date.now() - dbStartTime;
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logDatabaseOperation(
      "INSERT",
      "simpleproof_timestamps",
      false,
      dbDuration,
      {
        component: "simpleproof-timestamp",
        action: "create",
        provider,
        verificationId: body.verification_id,
        metadata: { error: errorMsg },
      }
    );
    logger.error("Failed to store timestamp", {
      action: "create",
      provider,
      verificationId: body.verification_id,
      metadata: { error: errorMsg },
    });
    return errorResponse(500, `Database error: ${errorMsg}`, requestOrigin);
  }

  // Compress and store proof in attestation_records (non-blocking)
  try {
    const compressedProof = await compressProof(apiResult.ots_proof);
    const compressionRatio = calculateCompressionRatio(
      apiResult.ots_proof,
      compressedProof
    );

    logger.info("Compressing OTS proof for attestation_records", {
      action: "create",
      provider,
      verificationId: body.verification_id,
      metadata: {
        original_size: apiResult.ots_proof.length,
        compressed_size: compressedProof.length,
        compression_ratio: compressionRatio,
        storage_reduction_pct: Math.round((1 - compressionRatio) * 100),
      },
    });

    const { error: attestationError } = await supabase
      .from("attestation_records")
      .insert({
        verification_id: body.verification_id!,
        method:
          provider === "opentimestamps_fallback"
            ? "opentimestamps"
            : "simpleproof",
        proof_data: compressedProof,
        proof_compressed: true,
        is_valid: true,
      });

    if (attestationError) {
      logger.error("Failed to store compressed proof in attestation_records", {
        action: "create",
        provider,
        verificationId: body.verification_id,
        metadata: {
          error: attestationError.message,
        },
      });
    }
  } catch (compressionError) {
    const errorMsg =
      compressionError instanceof Error
        ? compressionError.message
        : "Unknown compression error";

    logger.error("Proof compression failed", {
      action: "create",
      provider,
      verificationId: body.verification_id,
      metadata: {
        error: errorMsg,
      },
    });
  }

  // Return success response
  const response: SimpleProofResponse = {
    ots_proof: apiResult.ots_proof,
    bitcoin_block: apiResult.bitcoin_block || null,
    bitcoin_tx: apiResult.bitcoin_tx || null,
    verified_at: Math.floor(Date.now() / 1000),
  };

  logger.info("Timestamp created successfully", {
    action: "create",
    provider,
    verificationId: body.verification_id,
    metadata: {
      timestampId,
      bitcoinBlock: apiResult.bitcoin_block,
    },
  });

  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Access-Control-Allow-Origin":
      requestOrigin || process.env.VITE_CORS_ORIGIN || "https://www.satnam.pub",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(response),
  };
}
