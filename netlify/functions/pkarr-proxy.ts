/*
  PKARR Unified Proxy (ESM, TypeScript)
  - Consolidates verify-contact-pkarr, verify-contacts-batch, pkarr-analytics, and admin actions
  - Preserves response shape: { success: true, data } | { success: false, error }
  - Uses process.env only; never import browser env
  - Strict action allow-list with user and admin scopes
  - Maintains circuit breaker, error handling, caching, and retry logic
*/

export const config = { path: "/pkarr-proxy" };

import type { Handler } from "@netlify/functions";
import { SecureSessionManager } from "./security/session-manager.js";
import { getRequestClient } from "./supabase.js";
import {
  CircuitBreaker,
  classifyError,
  ErrorMetricsCollector,
  retryWithBackoff,
  type PkarrError,
} from "./utils/pkarr-error-handler.js";
import { allowRequest } from "./utils/rate-limiter.js";

const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";
const MAX_BATCH_SIZE = 50;

// ============================================================================
// ACTIONS DEFINITION
// ============================================================================

const ACTIONS = {
  // User-scoped operations (requires authentication)
  verify_contact: { scope: "user" as const },
  verify_batch: { scope: "user" as const },
  get_analytics: { scope: "user" as const },
  // Admin-scoped operations (requires guardian/steward role)
  reset_circuit_breaker: { scope: "admin" as const },
  get_circuit_breaker_state: { scope: "admin" as const },
  force_open_circuit_breaker: { scope: "admin" as const },
  force_close_circuit_breaker: { scope: "admin" as const },
} as const;

type ActionName = keyof typeof ACTIONS;

// ============================================================================
// ERROR HANDLING: Circuit Breaker & Metrics
// ============================================================================

// Global circuit breaker for PKARR DHT operations
const pkarrCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5, // Open after 5 failures
  successThreshold: 2, // Close after 2 successes in half-open
  timeoutMs: 30000, // 30 seconds before half-open
});

// Global error metrics collector
const errorMetrics = new ErrorMetricsCollector();

// ============================================================================
// PERFORMANCE OPTIMIZATION: In-Memory Caching
// ============================================================================

interface CacheEntry {
  result: any;
  timestamp: number;
}

// Query result cache (5-minute TTL)
const queryCache = new Map<string, CacheEntry>();
const QUERY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Request deduplication cache (60-second window)
const deduplicationCache = new Map<string, Promise<any>>();
const DEDUPLICATION_TTL = 60 * 1000; // 60 seconds

/**
 * Generate cache key from contact_hash and owner_hash
 * Privacy-safe: uses already-hashed identifiers
 */
function getCacheKey(ownerHash: string, contactHash: string): string {
  return `${ownerHash}:${contactHash}`;
}

/**
 * Get cached query result if available and not expired
 */
function getCachedResult(cacheKey: string): any | null {
  const entry = queryCache.get(cacheKey);
  if (!entry) return null;

  const age = Date.now() - entry.timestamp;
  if (age > QUERY_CACHE_TTL) {
    queryCache.delete(cacheKey);
    return null;
  }

  return entry.result;
}

/**
 * Store query result in cache
 */
function setCachedResult(cacheKey: string, result: any): void {
  queryCache.set(cacheKey, {
    result,
    timestamp: Date.now(),
  });
}

/**
 * Clean up expired cache entries (called on each invocation for serverless)
 */
function cleanupCache(): void {
  const now = Date.now();

  // Clean query cache
  for (const [key, entry] of queryCache.entries()) {
    if (now - entry.timestamp > QUERY_CACHE_TTL) {
      queryCache.delete(key);
    }
  }

  // Note: Deduplication cache entries are automatically removed after DEDUPLICATION_TTL
  // via setTimeout in the verification promise (see line ~466)
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Set RLS context for Supabase queries
 * Tries multiple RPC function names for compatibility
 */
async function setRlsContext(client: any, ownerHash: string): Promise<boolean> {
  let ok = false;
  try {
    await client.rpc("set_app_current_user_hash", { val: ownerHash });
    ok = true;
  } catch (e1) {
    console.error(
      "RLS set_app_current_user_hash failed:",
      e1 instanceof Error ? e1.message : e1
    );
  }
  if (!ok) {
    try {
      await client.rpc("set_app_config", {
        setting_name: "app.current_user_hash",
        setting_value: ownerHash,
        is_local: true,
      });
      ok = true;
    } catch (e2) {
      console.error(
        "RLS set_app_config failed:",
        e2 instanceof Error ? e2.message : e2
      );
    }
  }
  if (!ok) {
    try {
      await client.rpc("app_set_config", {
        setting_name: "app.current_user_hash",
        setting_value: ownerHash,
        is_local: true,
      });
      ok = true;
    } catch (e3) {
      console.error(
        "RLS app_set_config failed:",
        e3 instanceof Error ? e3.message : e3
      );
    }
  }
  return ok;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

/**
 * Calculate time range in seconds based on period
 */
function getTimeRange(period: string): { start: number; end: number } {
  const now = Math.floor(Date.now() / 1000);
  let start: number;

  switch (period) {
    case "1h":
      start = now - 60 * 60;
      break;
    case "24h":
      start = now - 24 * 60 * 60;
      break;
    case "7d":
      start = now - 7 * 24 * 60 * 60;
      break;
    case "30d":
      start = now - 30 * 24 * 60 * 60;
      break;
    default:
      start = now - 24 * 60 * 60; // Default to 24h
  }

  return { start, end: now };
}

/**
 * Get user context from event (authentication)
 */
async function getUserContext(event: any) {
  const authHeader =
    event.headers?.authorization || event.headers?.Authorization || "";
  if (!authHeader) return null;

  const session = await SecureSessionManager.validateSessionFromHeader(
    String(authHeader)
  );
  if (!session || !session.hashedId) return null;

  const client = await getRequestClient(event);
  return { session, client } as const;
}

/**
 * Check if user has admin role (guardian or steward)
 */
async function hasAdminRole(session: any): Promise<boolean> {
  try {
    return await SecureSessionManager.hasRolePermission(session, "steward");
  } catch (error) {
    console.error("Error checking admin role:", error);
    return false;
  }
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

/**
 * Action: verify_contact
 * Verifies a single contact via PKARR resolution
 */
async function handleVerifyContact(
  _event: any,
  payload: any,
  userContext: any
) {
  const startTime = Date.now();
  const { session, client } = userContext;

  // Validate required fields
  const { contact_hash, nip05, pubkey } = payload;
  if (!contact_hash || !nip05 || !pubkey) {
    return json(400, {
      success: false,
      error: "Missing required fields: contact_hash, nip05, pubkey",
    });
  }

  // Validate NIP-05 format
  if (!nip05.includes("@")) {
    return json(400, {
      success: false,
      error: "Invalid NIP-05 format (must contain @)",
    });
  }

  // Set RLS context
  const rlsOk = await setRlsContext(client, session.hashedId);
  if (!rlsOk) {
    console.error("RLS context setup failed for verify_contact", {
      ownerHash: session.hashedId,
    });
    return json(500, {
      success: false,
      error: "RLS context setup failed",
    });
  }

  // Find contact by owner_hash + contact_hash
  const { data: contact, error: findErr } = await client
    .from("encrypted_contacts")
    .select("id, pkarr_verified, verification_level")
    .eq("owner_hash", session.hashedId)
    .eq("contact_hash", contact_hash)
    .limit(1)
    .maybeSingle();

  if (findErr) {
    console.error("Error finding contact:", findErr);
    return json(500, { success: false, error: "Database error" });
  }

  if (!contact) {
    return json(404, { success: false, error: "Contact not found" });
  }

  // If already verified, return current status
  if (contact.pkarr_verified) {
    return json(200, {
      success: true,
      verified: true,
      verification_level: contact.verification_level || "basic",
      response_time_ms: Date.now() - startTime,
    });
  }

  // Check cache first
  const cacheKey = getCacheKey(session.hashedId, contact_hash);
  const cachedResult = getCachedResult(cacheKey);

  if (cachedResult) {
    return json(200, {
      ...cachedResult,
      cached: true,
      response_time_ms: Date.now() - startTime,
    });
  }

  // Request deduplication
  const existingRequest = deduplicationCache.get(cacheKey);
  if (existingRequest) {
    try {
      const result = await existingRequest;
      return json(200, {
        ...result,
        cached: false,
        deduplicated: true,
        response_time_ms: Date.now() - startTime,
      });
    } catch (error) {
      deduplicationCache.delete(cacheKey);
    }
  }

  // Perform PKARR verification
  const { HybridNIP05Verifier } = await import(
    "../../src/lib/nip05-verification.js"
  );

  const verificationPromise = (async () => {
    let wasRetried = false;

    try {
      const verificationResult = await pkarrCircuitBreaker.execute(async () => {
        try {
          return await retryWithBackoff(
            async () => {
              const verifier = new HybridNIP05Verifier({
                pkarrTimeout: 3000,
                default_timeout_ms: 3000,
                kind0Timeout: 3000,
                enablePkarrResolution: true,
                enableKind0Resolution: false,
                enableDnsResolution: false,
              });

              return await verifier.verifyHybrid(nip05, pubkey);
            },
            {
              baseDelayMs: 1000,
              maxDelayMs: 8000,
              maxRetries: 3,
              jitterFactor: 0.3,
            }
          );
        } catch (retryError) {
          wasRetried = true;
          throw retryError;
        }
      });

      // Update pkarr_verified flag if verification succeeded
      if (verificationResult.verified) {
        const { data: updatedContact, error: updateErr } = await client
          .from("encrypted_contacts")
          .update({
            pkarr_verified: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", contact.id)
          .eq("owner_hash", session.hashedId)
          .select("verification_level")
          .single();

        if (updateErr) {
          console.error("Error updating pkarr_verified flag:", updateErr);
          throw new Error("Failed to update verification status");
        }

        const result = {
          success: true,
          verified: true,
          verification_level: updatedContact.verification_level || "basic",
          retried: wasRetried,
        };

        setCachedResult(cacheKey, result);
        return result;
      } else {
        const result = {
          success: true,
          verified: false,
          verification_level: contact.verification_level || "unverified",
          error: verificationResult.error || "PKARR verification failed",
          retried: wasRetried,
        };

        setCachedResult(cacheKey, result);
        return result;
      }
    } catch (error) {
      const pkarrError = classifyError(error) as PkarrError;
      errorMetrics.recordError(pkarrError, wasRetried);

      console.error("PKARR verification error:", {
        code: pkarrError.code,
        message: pkarrError.message,
        isTransient: pkarrError.isTransient,
        retryable: pkarrError.retryable,
        wasRetried,
      });

      const result = {
        success: true,
        verified: false,
        verification_level: contact.verification_level || "unverified",
        error: pkarrError.message,
        error_code: pkarrError.code,
        retried: wasRetried,
      };

      setCachedResult(cacheKey, result);
      return result;
    } finally {
      setTimeout(() => {
        deduplicationCache.delete(cacheKey);
      }, DEDUPLICATION_TTL);
    }
  })();

  deduplicationCache.set(cacheKey, verificationPromise);
  const result = await verificationPromise;

  return json(200, {
    ...result,
    cached: false,
    response_time_ms: Date.now() - startTime,
  });
}

/**
 * Verify a single contact via PKARR (helper for batch verification)
 */
async function verifySingleContact(
  client: any,
  ownerHash: string,
  contact: { contact_hash: string; nip05: string; pubkey: string }
): Promise<{
  contact_hash: string;
  verified: boolean;
  verification_level: string;
  error?: string;
}> {
  try {
    const { data: contactRecord, error: findErr } = await client
      .from("encrypted_contacts")
      .select("id, pkarr_verified, verification_level")
      .eq("owner_hash", ownerHash)
      .eq("contact_hash", contact.contact_hash)
      .limit(1)
      .maybeSingle();

    if (findErr) {
      return {
        contact_hash: contact.contact_hash,
        verified: false,
        verification_level: "unverified",
        error: "Database error",
      };
    }

    if (!contactRecord) {
      return {
        contact_hash: contact.contact_hash,
        verified: false,
        verification_level: "unverified",
        error: "Contact not found",
      };
    }

    if (contactRecord.pkarr_verified) {
      return {
        contact_hash: contact.contact_hash,
        verified: true,
        verification_level: contactRecord.verification_level || "basic",
      };
    }

    const { HybridNIP05Verifier } = await import(
      "../../src/lib/nip05-verification.js"
    );

    const verifier = new HybridNIP05Verifier({
      pkarrTimeout: 5000,
      default_timeout_ms: 3000,
      kind0Timeout: 3000,
      enablePkarrResolution: true,
      enableKind0Resolution: false,
      enableDnsResolution: false,
    });

    const verificationResult = await verifier.verifyHybrid(
      contact.nip05,
      contact.pubkey
    );

    if (verificationResult.verified) {
      const { data: updatedContact, error: updateErr } = await client
        .from("encrypted_contacts")
        .update({
          pkarr_verified: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", contactRecord.id)
        .eq("owner_hash", ownerHash)
        .select("verification_level")
        .single();

      if (updateErr) {
        return {
          contact_hash: contact.contact_hash,
          verified: false,
          verification_level: contactRecord.verification_level || "unverified",
          error: "Failed to update verification status",
        };
      }

      return {
        contact_hash: contact.contact_hash,
        verified: true,
        verification_level: updatedContact.verification_level || "basic",
      };
    } else {
      return {
        contact_hash: contact.contact_hash,
        verified: false,
        verification_level: contactRecord.verification_level || "unverified",
        error: verificationResult.error || "PKARR verification failed",
      };
    }
  } catch (error) {
    return {
      contact_hash: contact.contact_hash,
      verified: false,
      verification_level: "unverified",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Action: verify_batch
 * Verifies multiple contacts in parallel via PKARR resolution
 */
async function handleVerifyBatch(_event: any, payload: any, userContext: any) {
  const startTime = Date.now();
  const { session, client } = userContext;

  // Validate contacts array
  const { contacts } = payload;
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return json(400, {
      success: false,
      error: "contacts must be a non-empty array",
    });
  }

  // Enforce max batch size
  if (contacts.length > MAX_BATCH_SIZE) {
    return json(400, {
      success: false,
      error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} contacts`,
    });
  }

  // Validate each contact
  for (const contact of contacts) {
    if (!contact.contact_hash || !contact.nip05 || !contact.pubkey) {
      return json(400, {
        success: false,
        error: "Each contact must have contact_hash, nip05, and pubkey",
      });
    }
    if (!contact.nip05.includes("@")) {
      return json(400, {
        success: false,
        error: `Invalid NIP-05 format for ${contact.contact_hash} (must contain @)`,
      });
    }
  }

  // Set RLS context
  const rlsOk = await setRlsContext(client, session.hashedId);
  if (!rlsOk) {
    console.error("RLS context setup failed for verify_batch", {
      ownerHash: session.hashedId,
    });
    return json(500, {
      success: false,
      error: "RLS context setup failed",
    });
  }

  // Verify all contacts in parallel
  const verificationPromises = contacts.map((contact: any) =>
    verifySingleContact(client, session.hashedId, contact)
  );

  const settledResults = await Promise.allSettled(verificationPromises);

  const results = settledResults.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      return {
        contact_hash: contacts[index].contact_hash,
        verified: false,
        verification_level: "unverified",
        error:
          result.reason instanceof Error
            ? result.reason.message
            : "Verification failed",
      };
    }
  });

  const totalProcessed = results.length;
  const totalVerified = results.filter((r) => r.verified).length;
  const totalFailed = results.filter((r) => !r.verified).length;

  return json(200, {
    success: true,
    results,
    total_processed: totalProcessed,
    total_verified: totalVerified,
    total_failed: totalFailed,
    response_time_ms: Date.now() - startTime,
  });
}

/**
 * Action: get_analytics
 * Retrieves PKARR analytics data
 */
async function handleGetAnalytics(_event: any, payload: any, userContext: any) {
  const startTime = Date.now();
  const { client } = userContext;

  // Parse query parameters from payload
  const period = payload.period || "24h";
  const includeRelayHealth = payload.include_relay_health !== false;
  const includeDistribution = payload.include_distribution !== false;
  const includeRecent = payload.include_recent !== false;
  const includeErrorMetrics = payload.include_error_metrics === true;
  const errorPeriod = payload.error_period || "24h";

  // Validate period
  if (!["24h", "7d", "30d"].includes(period)) {
    return json(400, {
      success: false,
      error: "Invalid period. Must be one of: 24h, 7d, 30d",
    });
  }

  // Validate error period
  if (includeErrorMetrics && !["1h", "24h", "7d"].includes(errorPeriod)) {
    return json(400, {
      success: false,
      error: "Invalid error_period. Must be one of: 1h, 24h, 7d",
    });
  }

  // Get time range
  const { start, end } = getTimeRange(period);

  // Query verification stats
  const { data: statsData, error: statsError } = await client.rpc(
    "get_pkarr_stats",
    {
      start_time: start,
      end_time: end,
    }
  );

  if (statsError) {
    console.error("Error fetching verification stats:", statsError);
    return json(500, {
      success: false,
      error: "Failed to fetch verification statistics",
    });
  }

  const verificationStats =
    statsData && statsData.length > 0
      ? statsData[0]
      : {
          total_verifications: 0,
          successful_verifications: 0,
          failed_verifications: 0,
          success_rate_percent: 0,
          unique_users: 0,
          unique_relays: 0,
        };

  const responseData: any = {
    period,
    verification_stats: verificationStats,
  };

  // Query relay health (optional)
  if (includeRelayHealth) {
    const { data: relayHealth, error: relayError } = await client
      .from("pkarr_relay_health")
      .select("*")
      .limit(20);

    if (!relayError) {
      responseData.relay_health = relayHealth || [];
    }
  }

  // Query verification distribution (optional)
  if (includeDistribution) {
    const { data: distribution, error: distError } = await client
      .from("pkarr_verification_method_distribution")
      .select("*")
      .limit(1);

    if (!distError && distribution && distribution.length > 0) {
      const dist = distribution[0];
      responseData.verification_distribution = {
        total_contacts: dist.total_contacts,
        pkarr_verified_count: dist.pkarr_verified_count,
        simpleproof_verified_count: dist.simpleproof_verified_count,
        kind0_verified_count: dist.kind0_verified_count,
        physical_mfa_verified_count: dist.physical_mfa_verified_count,
        multi_method_verified_count: dist.multi_method_verified_count,
        verification_levels: {
          unverified: dist.unverified_count,
          basic: dist.basic_count,
          verified: dist.verified_count,
          trusted: dist.trusted_count,
        },
        percentages: {
          pkarr_verified_percent: dist.pkarr_verified_percent,
          simpleproof_verified_percent: dist.simpleproof_verified_percent,
          kind0_verified_percent: dist.kind0_verified_percent,
          physical_mfa_verified_percent: dist.physical_mfa_verified_percent,
        },
      };
    }
  }

  // Query recent activity (optional)
  if (includeRecent) {
    const { data: recentActivity, error: recentError } = await client
      .from("pkarr_recent_activity")
      .select("*")
      .limit(50);

    if (!recentError) {
      responseData.recent_activity = recentActivity || [];
    }
  }

  // Query error metrics (optional, admin only)
  if (includeErrorMetrics) {
    try {
      const errorTimeRange = getTimeRange(errorPeriod);

      const { data: errorLogs, error: errorLogsError } = await client
        .from("pkarr_publish_history")
        .select("success, error_message, response_time_ms, publish_timestamp")
        .gte("publish_timestamp", errorTimeRange.start)
        .lte("publish_timestamp", errorTimeRange.end)
        .order("publish_timestamp", { ascending: false })
        .limit(1000);

      if (!errorLogsError && errorLogs) {
        const totalRequests = errorLogs.length;
        const failedRequests = errorLogs.filter(
          (log: any) => !log.success
        ).length;
        const successfulRequests = totalRequests - failedRequests;

        const transientErrors = errorLogs.filter(
          (log: any) =>
            !log.success &&
            log.error_message &&
            (log.error_message.toLowerCase().includes("timeout") ||
              log.error_message.toLowerCase().includes("unavailable") ||
              log.error_message.toLowerCase().includes("rate limit"))
        ).length;

        const permanentErrors = failedRequests - transientErrors;
        const errorRate =
          totalRequests > 0
            ? ((failedRequests / totalRequests) * 100).toFixed(2)
            : "0.00";

        responseData.error_metrics = {
          period: errorPeriod,
          total_requests: totalRequests,
          successful_requests: successfulRequests,
          failed_requests: failedRequests,
          error_rate_percent: parseFloat(errorRate),
          transient_errors: transientErrors,
          permanent_errors: permanentErrors,
        };
      }
    } catch (errorMetricsError) {
      console.error("Error fetching error metrics:", errorMetricsError);
    }
  }

  return json(200, {
    success: true,
    data: responseData,
    response_time_ms: Date.now() - startTime,
  });
}

/**
 * Action: reset_circuit_breaker (Admin only)
 * Resets the circuit breaker to CLOSED state
 */
async function handleResetCircuitBreaker(
  _event: any,
  _payload: any,
  userContext: any
) {
  const { session } = userContext;

  // Verify admin role
  const isAdmin = await hasAdminRole(session);
  if (!isAdmin) {
    return json(403, {
      success: false,
      error: "Admin access required (guardian/steward role)",
    });
  }

  const previousState = pkarrCircuitBreaker.getState();
  pkarrCircuitBreaker.reset();
  const newState = pkarrCircuitBreaker.getState();

  return json(200, {
    success: true,
    action: "reset_circuit_breaker",
    result: {
      previous_state: previousState,
      new_state: newState,
      reset_at: Date.now(),
    },
  });
}

/**
 * Action: get_circuit_breaker_state (Admin only)
 * Gets the current circuit breaker state
 */
async function handleGetCircuitBreakerState(
  _event: any,
  _payload: any,
  userContext: any
) {
  const { session } = userContext;

  // Verify admin role
  const isAdmin = await hasAdminRole(session);
  if (!isAdmin) {
    return json(403, {
      success: false,
      error: "Admin access required (guardian/steward role)",
    });
  }

  const state = pkarrCircuitBreaker.getState();
  const metrics = errorMetrics.getMetrics();

  return json(200, {
    success: true,
    action: "get_circuit_breaker_state",
    result: {
      state,
      metrics,
      timestamp: Date.now(),
    },
  });
}

/**
 * Action: force_open_circuit_breaker (Admin only, testing only)
 * Forces the circuit breaker to OPEN state
 */
async function handleForceOpenCircuitBreaker(
  _event: any,
  _payload: any,
  userContext: any
) {
  const { session } = userContext;

  // Verify admin role
  const isAdmin = await hasAdminRole(session);
  if (!isAdmin) {
    return json(403, {
      success: false,
      error: "Admin access required (guardian/steward role)",
    });
  }

  const previousState = pkarrCircuitBreaker.getState();
  // Force open by recording failures
  for (let i = 0; i < 10; i++) {
    pkarrCircuitBreaker.recordFailure();
  }
  const newState = pkarrCircuitBreaker.getState();

  return json(200, {
    success: true,
    action: "force_open_circuit_breaker",
    result: {
      previous_state: previousState,
      new_state: newState,
      forced_at: Date.now(),
      warning:
        "This is for testing only. Use reset_circuit_breaker to restore.",
    },
  });
}

/**
 * Action: force_close_circuit_breaker (Admin only, emergency only)
 * Forces the circuit breaker to CLOSED state
 */
async function handleForceCloseCircuitBreaker(
  _event: any,
  _payload: any,
  userContext: any
) {
  const { session } = userContext;

  // Verify admin role
  const isAdmin = await hasAdminRole(session);
  if (!isAdmin) {
    return json(403, {
      success: false,
      error: "Admin access required (guardian/steward role)",
    });
  }

  const previousState = pkarrCircuitBreaker.getState();
  pkarrCircuitBreaker.reset();
  const newState = pkarrCircuitBreaker.getState();

  return json(200, {
    success: true,
    action: "force_close_circuit_breaker",
    result: {
      previous_state: previousState,
      new_state: newState,
      forced_at: Date.now(),
      warning: "Emergency action. Monitor system closely.",
    },
  });
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export const handler: Handler = async (event) => {
  // Lazy cleanup on each invocation (serverless-friendly)
  cleanupCache();

  try {
    // Handle CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: corsHeaders(),
        body: "",
      };
    }

    // Rate limit baseline (10 requests per minute)
    const xfwd =
      event.headers?.["x-forwarded-for"] ||
      event.headers?.["X-Forwarded-For"] ||
      "";
    const ip =
      (Array.isArray(xfwd) ? xfwd[0] : xfwd).split(",")[0]?.trim() ||
      event.headers?.["x-real-ip"] ||
      "unknown";

    // Determine action
    const isGet = event.httpMethod === "GET";
    const qs = event.queryStringParameters || {};

    let action: ActionName | undefined = undefined;
    let payload: any = {};

    if (isGet) {
      action = qs.action as ActionName;
      // For GET requests, use query parameters as payload
      payload = { ...qs };
    } else if (event.httpMethod === "POST") {
      try {
        const body = event.body ? JSON.parse(event.body) : {};
        action = body?.action as ActionName;
        payload = body?.payload || body;
      } catch (parseError) {
        return json(400, {
          success: false,
          error: "Invalid JSON in request body",
        });
      }
    } else {
      return json(405, { success: false, error: "Method Not Allowed" });
    }

    if (!action || !(action in ACTIONS)) {
      return json(400, { success: false, error: "Invalid or missing action" });
    }

    const scope = ACTIONS[action].scope;

    // Apply action-specific rate limiting
    if (action === "verify_contact") {
      // 60 requests/hour for single contact verification
      if (!allowRequest(String(ip), 60, 3600_000)) {
        return json(429, { success: false, error: "Rate limit exceeded" });
      }
    } else if (action === "verify_batch") {
      // 10 requests/hour for batch verification
      if (!allowRequest(String(ip), 10, 3600_000)) {
        return json(429, { success: false, error: "Rate limit exceeded" });
      }
    } else {
      // Default rate limiting for other actions (60 requests/hour)
      if (!allowRequest(String(ip), 60, 3600_000)) {
        return json(429, { success: false, error: "Rate limit exceeded" });
      }
    }

    // Handle user-scoped and admin-scoped actions (require authentication)
    if (scope === "user" || scope === "admin") {
      const userContext = await getUserContext(event);
      if (!userContext) {
        return json(401, { success: false, error: "Unauthorized" });
      }

      // Route to appropriate handler
      switch (action) {
        case "verify_contact":
          return await handleVerifyContact(event, payload, userContext);

        case "verify_batch":
          return await handleVerifyBatch(event, payload, userContext);

        case "get_analytics":
          return await handleGetAnalytics(event, payload, userContext);

        case "reset_circuit_breaker":
          return await handleResetCircuitBreaker(event, payload, userContext);

        case "get_circuit_breaker_state":
          return await handleGetCircuitBreakerState(
            event,
            payload,
            userContext
          );

        case "force_open_circuit_breaker":
          return await handleForceOpenCircuitBreaker(
            event,
            payload,
            userContext
          );

        case "force_close_circuit_breaker":
          return await handleForceCloseCircuitBreaker(
            event,
            payload,
            userContext
          );
      }
    }

    return json(400, { success: false, error: "Unsupported action" });
  } catch (error: any) {
    console.error("[pkarr-proxy]", error);
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
