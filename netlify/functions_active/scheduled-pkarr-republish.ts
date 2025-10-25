/**
 * Scheduled PKARR Republishing Function
 * Runs every 6 hours to republish expired PKARR records to DHT relays
 *
 * Phase 2B-1 Day 6: Enhanced Scheduled Republishing System
 *
 * PKARR records have a 24-hour TTL in the BitTorrent DHT.
 * This function queries the database for records older than 18 hours (75% of TTL)
 * and republishes them to maintain continuous availability.
 *
 * Features:
 * - Stale record detection (>18 hours old)
 * - Batch processing with rate limiting (max 50 records per run)
 * - Comprehensive error handling and retry logic
 * - Metrics collection (success/failure counts, timing)
 * - Privacy-safe logging (no PII)
 * - Integration with error handling infrastructure
 *
 * Schedule: 0 *\/6 * * * (every 6 hours)
 * Timeout: 60 seconds (Netlify scheduled function limit)
 *
 * @compliance ESM-only, uses process.env, privacy-first, zero-knowledge
 */

import type { Handler, HandlerContext, HandlerEvent } from "@netlify/functions";
import {
  classifyError,
  PkarrErrorCode,
  retryWithBackoff,
} from "../functions/utils/pkarr-error-handler.js";
import { supabase } from "./supabase.js";

const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";

// Configuration constants
const MAX_RECORDS_PER_BATCH = 50; // Rate limiting: max 50 records per run
const STALE_THRESHOLD_HOURS = 18; // 75% of 24-hour TTL
const DHT_PUBLISH_TIMEOUT_MS = 5000; // 5 seconds per relay
const MAX_RETRY_ATTEMPTS = 3; // Max retries per record

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  } as const;
}

function json(status: number, body: unknown) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
    body: JSON.stringify(body),
  };
}

/**
 * Metrics collector for republishing operations
 */
interface RepublishMetrics {
  totalRecords: number;
  successfulPublishes: number;
  failedPublishes: number;
  totalRelayAttempts: number;
  successfulRelayPublishes: number;
  failedRelayPublishes: number;
  averagePublishTimeMs: number;
  errors: Array<{ code: PkarrErrorCode; count: number }>;
  startTime: number;
  endTime?: number;
}

/**
 * Initialize metrics collector
 */
function initMetrics(): RepublishMetrics {
  return {
    totalRecords: 0,
    successfulPublishes: 0,
    failedPublishes: 0,
    totalRelayAttempts: 0,
    successfulRelayPublishes: 0,
    failedRelayPublishes: 0,
    averagePublishTimeMs: 0,
    errors: [],
    startTime: Date.now(),
  };
}

/**
 * Record error in metrics
 */
function recordError(
  metrics: RepublishMetrics,
  errorCode: PkarrErrorCode
): void {
  const existing = metrics.errors.find((e) => e.code === errorCode);
  if (existing) {
    existing.count++;
  } else {
    metrics.errors.push({ code: errorCode, count: 1 });
  }
}

/**
 * Publish a PKARR record to DHT relays with retry logic
 * Phase 2B-1 Day 6: Enhanced with error handling and metrics
 */
async function publishToDHT(
  record: {
    public_key: string;
    records: string;
    timestamp: number;
    sequence: number;
    signature: string;
  },
  metrics: RepublishMetrics
): Promise<{ success: boolean; relays: string[]; publishTimeMs: number }> {
  const relays = [
    "https://pkarr.relay.pubky.tech",
    "https://pkarr.relay.synonym.to",
  ];

  const publishedRelays: string[] = [];
  const publishStartTime = Date.now();

  for (const relay of relays) {
    metrics.totalRelayAttempts++;

    try {
      // Use retry logic with exponential backoff
      const publishResult = await retryWithBackoff(
        async () => {
          const controller = new AbortController();
          const timer = setTimeout(
            () => controller.abort(),
            DHT_PUBLISH_TIMEOUT_MS
          );

          const response = await fetch(`${relay}/publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              public_key: record.public_key,
              records: JSON.parse(record.records),
              timestamp: record.timestamp,
              sequence: record.sequence,
              signature: record.signature,
            }),
            signal: controller.signal,
          });

          clearTimeout(timer);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          return response;
        },
        {
          baseDelayMs: 1000,
          maxDelayMs: 5000,
          maxRetries: 2, // 2 retries per relay (3 total attempts)
          jitterFactor: 0.3,
        }
      );

      publishedRelays.push(relay);
      metrics.successfulRelayPublishes++;
      console.log(
        `✅ Published to ${relay} (public_key: ${record.public_key.substring(
          0,
          16
        )}...)`
      );
    } catch (error) {
      metrics.failedRelayPublishes++;

      // Classify error for metrics
      const pkarrError = classifyError(error);
      recordError(metrics, pkarrError.code);

      console.warn(
        `⚠️ Failed to publish to ${relay} (public_key: ${record.public_key.substring(
          0,
          16
        )}...): ${pkarrError.message}`
      );
    }
  }

  const publishTimeMs = Date.now() - publishStartTime;

  return {
    success: publishedRelays.length > 0,
    relays: publishedRelays,
    publishTimeMs,
  };
}

/**
 * Main handler for scheduled PKARR republishing
 * Phase 2B-1 Day 6: Enhanced with comprehensive metrics and error handling
 */
export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  console.log("🔄 Starting scheduled PKARR republishing job...");
  console.log(
    `⏰ Scheduled at: ${new Date().toISOString()} (Netlify timeout: 60s)`
  );

  // Initialize metrics
  const metrics = initMetrics();

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return json(200, { message: "OK" });
  }

  try {
    // Check if PKARR is enabled
    const pkarrEnabled = process.env.VITE_PKARR_ENABLED === "true";
    if (!pkarrEnabled) {
      console.log("⏭️ PKARR disabled, skipping republishing");
      return json(200, {
        success: true,
        message: "PKARR disabled",
        recordsProcessed: 0,
        metrics: null,
      });
    }

    // Use database function to find stale records efficiently
    // This uses the optimized query from migration 039
    const { data: staleRecords, error: queryError } = await supabase.rpc(
      "find_stale_pkarr_records",
      {
        p_limit: MAX_RECORDS_PER_BATCH,
        p_stale_threshold_hours: STALE_THRESHOLD_HOURS,
      }
    );

    if (queryError) {
      console.error("❌ Database query error:", queryError);
      recordError(metrics, PkarrErrorCode.UNKNOWN_ERROR);
      return json(500, {
        success: false,
        error: "Database query failed",
        details: queryError.message,
        metrics: null,
      });
    }

    if (!staleRecords || staleRecords.length === 0) {
      console.log("✅ No stale records to republish");
      metrics.endTime = Date.now();
      return json(200, {
        success: true,
        message: "No stale records found",
        recordsProcessed: 0,
        metrics: {
          durationMs: metrics.endTime - metrics.startTime,
          totalRecords: 0,
        },
      });
    }

    console.log(
      `📋 Found ${staleRecords.length} stale records to republish (threshold: ${STALE_THRESHOLD_HOURS}h)`
    );
    console.log(
      `   - Never published: ${
        staleRecords.filter((r: any) => !r.last_published_at).length
      }`
    );
    console.log(
      `   - Oldest: ${Math.max(
        ...staleRecords.map((r: any) => r.hours_since_publish || 0)
      )}h ago`
    );

    metrics.totalRecords = staleRecords.length;

    // Process each record with comprehensive error handling
    const publishTimes: number[] = [];

    for (const record of staleRecords) {
      try {
        // Increment sequence number for republishing
        const newSequence = (record.sequence || 0) + 1;
        const newTimestamp = Math.floor(Date.now() / 1000);

        // Publish to DHT relays with retry logic and metrics
        const publishResult = await publishToDHT(
          {
            public_key: record.public_key,
            records: JSON.stringify(record.records),
            timestamp: newTimestamp,
            sequence: newSequence,
            signature: record.signature,
          },
          metrics
        );

        publishTimes.push(publishResult.publishTimeMs);

        if (publishResult.success) {
          // Use database function to update republish metrics
          const { error: updateError } = await supabase.rpc(
            "update_pkarr_republish_metrics",
            {
              p_public_key: record.public_key,
              p_success: true,
              p_new_sequence: newSequence,
              p_new_timestamp: newTimestamp,
              p_relay_urls: publishResult.relays,
            }
          );

          if (updateError) {
            console.error(
              `❌ Failed to update metrics for ${record.public_key.substring(
                0,
                16
              )}...:`,
              updateError
            );
            recordError(metrics, PkarrErrorCode.UNKNOWN_ERROR);
          } else {
            metrics.successfulPublishes++;

            // Log to publish history
            await supabase.from("pkarr_publish_history").insert({
              pkarr_record_id: record.id,
              relay_url: publishResult.relays.join(","),
              publish_timestamp: newTimestamp,
              success: true,
              response_time_ms: publishResult.publishTimeMs,
              attempt_number: 1,
            });

            console.log(
              `✅ Republished ${record.public_key.substring(
                0,
                16
              )}... (seq: ${newSequence}, relays: ${
                publishResult.relays.length
              }, time: ${publishResult.publishTimeMs}ms)`
            );
          }
        } else {
          // Failed to publish to any relay
          metrics.failedPublishes++;

          // Update failure metrics
          await supabase.rpc("update_pkarr_republish_metrics", {
            p_public_key: record.public_key,
            p_success: false,
            p_new_sequence: newSequence,
            p_new_timestamp: newTimestamp,
            p_relay_urls: [],
          });

          // Log failed publish attempt
          await supabase.from("pkarr_publish_history").insert({
            pkarr_record_id: record.id,
            relay_url: "none",
            publish_timestamp: newTimestamp,
            success: false,
            error_message: "Failed to publish to any relay",
            response_time_ms: publishResult.publishTimeMs,
            attempt_number: 1,
          });

          recordError(metrics, PkarrErrorCode.DHT_UNAVAILABLE);
          console.warn(
            `⚠️ Failed to republish ${record.public_key.substring(
              0,
              16
            )}... (no relays succeeded)`
          );
        }
      } catch (error) {
        metrics.failedPublishes++;

        const pkarrError = classifyError(error);
        recordError(metrics, pkarrError.code);

        console.error(
          `❌ Error processing ${record.public_key.substring(0, 16)}...:`,
          pkarrError.message
        );

        // Update failure metrics even on exception
        try {
          await supabase.rpc("update_pkarr_republish_metrics", {
            p_public_key: record.public_key,
            p_success: false,
            p_new_sequence: record.sequence,
            p_new_timestamp: Math.floor(Date.now() / 1000),
            p_relay_urls: [],
          });
        } catch (updateError) {
          console.error("Failed to update failure metrics:", updateError);
        }
      }
    }

    // Calculate final metrics
    metrics.endTime = Date.now();
    metrics.averagePublishTimeMs =
      publishTimes.length > 0
        ? Math.round(
            publishTimes.reduce((sum, time) => sum + time, 0) /
              publishTimes.length
          )
        : 0;

    const durationMs = metrics.endTime - metrics.startTime;
    const successRate =
      metrics.totalRecords > 0
        ? ((metrics.successfulPublishes / metrics.totalRecords) * 100).toFixed(
            2
          )
        : "0.00";

    console.log(`✅ Republishing job complete in ${durationMs}ms`);
    console.log(
      `   - Success: ${metrics.successfulPublishes}/${metrics.totalRecords} (${successRate}%)`
    );
    console.log(
      `   - Relay publishes: ${metrics.successfulRelayPublishes}/${metrics.totalRelayAttempts}`
    );
    console.log(`   - Avg publish time: ${metrics.averagePublishTimeMs}ms`);
    if (metrics.errors.length > 0) {
      console.log(`   - Errors: ${JSON.stringify(metrics.errors)}`);
    }

    return json(200, {
      success: true,
      message: "Republishing job complete",
      results: {
        totalRecords: metrics.totalRecords,
        successfulPublishes: metrics.successfulPublishes,
        failedPublishes: metrics.failedPublishes,
        successRate: parseFloat(successRate),
        durationMs,
        averagePublishTimeMs: metrics.averagePublishTimeMs,
        relayStats: {
          totalAttempts: metrics.totalRelayAttempts,
          successful: metrics.successfulRelayPublishes,
          failed: metrics.failedRelayPublishes,
        },
        errors: metrics.errors.slice(0, 10), // Limit to 10 most common errors
      },
    });
  } catch (error) {
    metrics.endTime = Date.now();
    const pkarrError = classifyError(error);
    recordError(metrics, pkarrError.code);

    console.error("❌ Scheduled republishing job failed:", pkarrError.message);

    return json(500, {
      success: false,
      error: "Republishing job failed",
      details: pkarrError.message,
      errorCode: pkarrError.code,
      metrics: {
        durationMs: metrics.endTime - metrics.startTime,
        recordsProcessed: metrics.successfulPublishes + metrics.failedPublishes,
        errors: metrics.errors,
      },
    });
  }
};
