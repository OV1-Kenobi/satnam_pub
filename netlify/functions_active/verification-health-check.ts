/**
 * Verification Health Check Endpoint
 * Phase 1 Week 3: Monitor verification service health
 * Checks status of kind:0, PKARR, and DNS verification methods
 *
 * Endpoint: GET /api/verification/health
 * Returns: Health status of all verification methods
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { CentralEventPublishingService } from "../../lib/central_event_publishing_service";
import { PubkyDHTClient } from "../../lib/pubky-dht-client-minimal";

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  kind0_relay_health: "healthy" | "degraded" | "unhealthy";
  pkarr_dht_health: "healthy" | "degraded" | "unhealthy";
  dns_resolution_health: "healthy" | "degraded" | "unhealthy";
  average_resolution_time_ms: number;
  failure_rate_24h: number;
  timestamp: number;
  details: {
    kind0_relay?: string;
    pkarr_dht?: string;
    dns_resolution?: string;
  };
}

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

/**
 * Check kind:0 relay health
 */
async function checkKind0Health(): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  message: string;
  response_time_ms: number;
}> {
  const startTime = Date.now();
  try {
    const ceps = new CentralEventPublishingService();

    // Try to resolve a test identity
    const testPubkey =
      "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

    const result = await Promise.race([
      ceps.resolveIdentityFromKind0(testPubkey),
      new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);

    const responseTime = Date.now() - startTime;

    if (result && typeof result === "object" && "success" in result) {
      return {
        status: responseTime > 3000 ? "degraded" : "healthy",
        message: "kind:0 relay responding",
        response_time_ms: responseTime,
      };
    } else {
      return {
        status: "degraded",
        message: "kind:0 relay slow or no response",
        response_time_ms: responseTime,
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: "unhealthy",
      message: `kind:0 relay error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      response_time_ms: responseTime,
    };
  }
}

/**
 * Check PKARR DHT health
 */
async function checkPkarrHealth(): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  message: string;
  response_time_ms: number;
}> {
  const startTime = Date.now();
  try {
    const dhtClient = new PubkyDHTClient(
      ["https://pkarr.relay.pubky.tech", "https://pkarr.relay.synonym.to"],
      3600000,
      3000,
      false
    );

    // Try to resolve a test record
    const testPubkey =
      "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

    const result = await Promise.race([
      dhtClient.resolveRecord(testPubkey),
      new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);

    const responseTime = Date.now() - startTime;

    if (result) {
      return {
        status: responseTime > 3000 ? "degraded" : "healthy",
        message: "PKARR DHT responding",
        response_time_ms: responseTime,
      };
    } else {
      return {
        status: "degraded",
        message: "PKARR DHT slow or no response",
        response_time_ms: responseTime,
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: "unhealthy",
      message: `PKARR DHT error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      response_time_ms: responseTime,
    };
  }
}

/**
 * Check DNS resolution health
 */
async function checkDNSHealth(): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  message: string;
  response_time_ms: number;
}> {
  const startTime = Date.now();
  try {
    // Try to resolve a test DNS record
    const response = await Promise.race([
      fetch("https://satnam.pub/.well-known/nostr.json", {
        method: "GET",
        headers: { Accept: "application/json" },
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);

    const responseTime = Date.now() - startTime;

    if (response && response instanceof Response && response.ok) {
      return {
        status: responseTime > 2000 ? "degraded" : "healthy",
        message: "DNS resolution responding",
        response_time_ms: responseTime,
      };
    } else {
      return {
        status: "degraded",
        message: "DNS resolution slow or no response",
        response_time_ms: responseTime,
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: "unhealthy",
      message: `DNS resolution error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      response_time_ms: responseTime,
    };
  }
}

/**
 * Get failure rate from database
 */
async function getFailureRate24h(): Promise<number> {
  try {
    const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

    const { data, error } = await supabase
      .from("verification_failures")
      .select("id", { count: "exact" })
      .gte("timestamp", twentyFourHoursAgo);

    if (error) {
      console.error("Error fetching failure rate:", error);
      return 0;
    }

    // Calculate failure rate (failures per 1000 attempts)
    const failureCount = data?.length || 0;
    return failureCount > 0 ? (failureCount / 1000) * 100 : 0;
  } catch (error) {
    console.error("Error calculating failure rate:", error);
    return 0;
  }
}

/**
 * Main handler
 */
export const handler: Handler = async (event) => {
  try {
    // Check all verification methods in parallel
    const [kind0Health, pkarrHealth, dnsHealth, failureRate24h] =
      await Promise.all([
        checkKind0Health(),
        checkPkarrHealth(),
        checkDNSHealth(),
        getFailureRate24h(),
      ]);

    // Calculate average response time
    const avgResponseTime =
      (kind0Health.response_time_ms +
        pkarrHealth.response_time_ms +
        dnsHealth.response_time_ms) /
      3;

    // Determine overall health status
    const unhealthyCount = [kind0Health, pkarrHealth, dnsHealth].filter(
      (h) => h.status === "unhealthy"
    ).length;
    const degradedCount = [kind0Health, pkarrHealth, dnsHealth].filter(
      (h) => h.status === "degraded"
    ).length;

    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (unhealthyCount >= 2) {
      overallStatus = "unhealthy";
    } else if (unhealthyCount === 1 || degradedCount >= 2) {
      overallStatus = "degraded";
    }

    // Store health check result in database
    try {
      await supabase.from("verification_health_checks").insert({
        kind0_relay_health: kind0Health.status,
        pkarr_dht_health: pkarrHealth.status,
        dns_resolution_health: dnsHealth.status,
        average_resolution_time_ms: avgResponseTime,
        failure_rate_24h: failureRate24h,
        kind0_relay_status: kind0Health.message,
        pkarr_dht_status: pkarrHealth.message,
        dns_resolution_status: dnsHealth.message,
      });
    } catch (dbError) {
      console.error("Error storing health check:", dbError);
    }

    const result: HealthCheckResult = {
      status: overallStatus,
      kind0_relay_health: kind0Health.status,
      pkarr_dht_health: pkarrHealth.status,
      dns_resolution_health: dnsHealth.status,
      average_resolution_time_ms: avgResponseTime,
      failure_rate_24h: failureRate24h,
      timestamp: Math.floor(Date.now() / 1000),
      details: {
        kind0_relay: kind0Health.message,
        pkarr_dht: pkarrHealth.message,
        dns_resolution: dnsHealth.message,
      },
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error("Health check error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Math.floor(Date.now() / 1000),
      }),
    };
  }
};
