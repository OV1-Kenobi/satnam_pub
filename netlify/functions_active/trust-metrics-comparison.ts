/**
 * Trust Metrics Comparison API Endpoint
 * Phase 3 Day 5: Trust Provider API Endpoints
 *
 * Handles:
 * - Compare metrics across multiple contacts
 * - Get historical trust score data
 * - Export comparison data (JSON/CSV)
 */

import { Handler, HandlerEvent } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

// Security utilities (Phase 3 hardening)
import {
  RATE_LIMITS,
  checkRateLimitStatus,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.ts";
import {
  createRateLimitErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.ts";
import { errorResponse, preflightResponse } from "./utils/security-headers.ts";

import { getEnvVar } from "./utils/env.js";

interface TrustMetrics {
  rank: number;
  followers: number;
  hops: number;
  influence: number;
  reliability: number;
  recency: number;
}

interface ContactMetrics {
  contactId: string;
  contactName: string;
  metrics: TrustMetrics;
  compositeScore: number;
  timestamp: string;
}

interface ComparisonResponse {
  contacts: ContactMetrics[];
  comparison: {
    highestRank: string;
    highestFollowers: string;
    highestInfluence: string;
    highestReliability: string;
    highestRecency: string;
  };
}

interface HistoryResponse {
  contactId: string;
  history: Array<{
    timestamp: string;
    metrics: TrustMetrics;
    compositeScore: number;
  }>;
  page: number;
  pageSize: number;
  total: number;
}

const handler: Handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 Trust metrics comparison handler started:", {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
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
        endpoint: "trust-metrics-comparison",
        method: event.httpMethod,
      });
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Initialize Supabase client
    const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
    const supabaseServiceKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      logError(new Error("Missing Supabase environment variables"), {
        requestId,
        endpoint: "trust-metrics-comparison",
      });
      return errorResponse(500, "Server configuration error", requestOrigin);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract JWT token
    const authHeader = (event.headers.authorization || "").toString();
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token || token === "Bearer") {
      return errorResponse(401, "Unauthorized", requestOrigin);
    }

    // Verify JWT and get user
    let user;
    try {
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser(token);
      if (authError || !authUser) {
        return errorResponse(401, "Invalid token", requestOrigin);
      }
      user = authUser;
    } catch (authError) {
      logError(authError, {
        requestId,
        endpoint: "trust-metrics-comparison",
        operation: "auth verification",
      });
      return errorResponse(401, "Invalid token", requestOrigin);
    }

    const userId = user.id;

    // Route handlers
    if (event.httpMethod === "POST" && event.path.includes("/compare")) {
      return handleCompareMetrics(
        supabase,
        userId,
        event,
        requestId,
        requestOrigin
      );
    }

    if (event.httpMethod === "GET" && event.path.includes("/history")) {
      return handleGetHistory(
        supabase,
        userId,
        event,
        requestId,
        requestOrigin
      );
    }

    if (event.httpMethod === "GET" && event.path.includes("/export")) {
      return handleExportComparison(
        supabase,
        userId,
        event,
        requestId,
        requestOrigin
      );
    }

    return errorResponse(404, "Endpoint not found", requestOrigin);
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "trust-metrics-comparison",
      method: event.httpMethod,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};

function calculateCompositeScore(metrics: TrustMetrics): number {
  return (
    metrics.rank * 0.25 +
    (metrics.followers / 1000) * 100 * 0.15 +
    ((7 - metrics.hops) / 6) * 100 * 0.15 +
    metrics.influence * 0.2 +
    metrics.reliability * 0.15 +
    metrics.recency * 0.1
  );
}

async function handleCompareMetrics(
  supabase: any,
  userId: string,
  event: HandlerEvent,
  requestId: string,
  requestOrigin: string | undefined
) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { contactIds } = body;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return errorResponse(400, "contactIds array is required", requestOrigin);
    }

    if (contactIds.length > 10) {
      return errorResponse(
        400,
        "Maximum 10 contacts can be compared",
        requestOrigin
      );
    }

    // Get metrics for each contact
    const { data: metricsData, error } = await supabase
      .from("trust_metrics")
      .select("*")
      .in("contact_id", contactIds)
      .eq("user_id", userId)
      .order("timestamp", { ascending: false })
      .limit(contactIds.length);

    if (error) throw error;

    // Get contact names
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name")
      .in("id", contactIds);

    const contactMap = new Map(contacts?.map((c: any) => [c.id, c.name]) || []);

    // Build comparison data
    const comparisonData: ContactMetrics[] = metricsData.map((metric: any) => ({
      contactId: metric.contact_id,
      contactName: contactMap.get(metric.contact_id) || "Unknown",
      metrics: {
        rank: metric.rank,
        followers: metric.followers,
        hops: metric.hops,
        influence: metric.influence,
        reliability: metric.reliability,
        recency: metric.recency,
      },
      compositeScore: calculateCompositeScore({
        rank: metric.rank,
        followers: metric.followers,
        hops: metric.hops,
        influence: metric.influence,
        reliability: metric.reliability,
        recency: metric.recency,
      }),
      timestamp: metric.timestamp,
    }));

    // Find highest values
    const comparison = {
      highestRank: comparisonData.reduce((max, c) =>
        c.metrics.rank > max.metrics.rank ? c : max
      ).contactId,
      highestFollowers: comparisonData.reduce((max, c) =>
        c.metrics.followers > max.metrics.followers ? c : max
      ).contactId,
      highestInfluence: comparisonData.reduce((max, c) =>
        c.metrics.influence > max.metrics.influence ? c : max
      ).contactId,
      highestReliability: comparisonData.reduce((max, c) =>
        c.metrics.reliability > max.metrics.reliability ? c : max
      ).contactId,
      highestRecency: comparisonData.reduce((max, c) =>
        c.metrics.recency > max.metrics.recency ? c : max
      ).contactId,
    };

    const response: ComparisonResponse = {
      contacts: comparisonData,
      comparison,
    };

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin":
        requestOrigin ||
        process.env.VITE_CORS_ORIGIN ||
        "https://www.satnam.pub",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "trust-metrics-comparison/compare",
    });
    return errorResponse(500, "Failed to compare metrics", requestOrigin);
  }
}

async function handleGetHistory(
  supabase: any,
  userId: string,
  event: HandlerEvent,
  requestId: string,
  requestOrigin: string | undefined
) {
  try {
    const contactId = event.queryStringParameters?.contactId;
    const page = parseInt(event.queryStringParameters?.page || "1");
    const pageSize = parseInt(event.queryStringParameters?.pageSize || "30");
    const days = parseInt(event.queryStringParameters?.days || "90");

    if (!contactId) {
      return errorResponse(400, "contactId is required", requestOrigin);
    }

    const offset = (page - 1) * pageSize;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get historical metrics
    const {
      data: history,
      count,
      error,
    } = await supabase
      .from("trust_metrics")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .eq("contact_id", contactId)
      .gte("timestamp", startDate.toISOString())
      .order("timestamp", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const historyData = history.map((metric: any) => ({
      timestamp: metric.timestamp,
      metrics: {
        rank: metric.rank,
        followers: metric.followers,
        hops: metric.hops,
        influence: metric.influence,
        reliability: metric.reliability,
        recency: metric.recency,
      },
      compositeScore: calculateCompositeScore({
        rank: metric.rank,
        followers: metric.followers,
        hops: metric.hops,
        influence: metric.influence,
        reliability: metric.reliability,
        recency: metric.recency,
      }),
    }));

    const response: HistoryResponse = {
      contactId,
      history: historyData,
      page,
      pageSize,
      total: count || 0,
    };

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin":
        requestOrigin ||
        process.env.VITE_CORS_ORIGIN ||
        "https://www.satnam.pub",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "trust-metrics-comparison/history",
    });
    return errorResponse(500, "Failed to get history", requestOrigin);
  }
}

async function handleExportComparison(
  supabase: any,
  userId: string,
  event: HandlerEvent,
  requestId: string,
  requestOrigin: string | undefined
) {
  try {
    const format = event.queryStringParameters?.format || "json";
    const contactIds =
      event.queryStringParameters?.contactIds?.split(",") || [];

    if (contactIds.length === 0) {
      return errorResponse(400, "contactIds are required", requestOrigin);
    }

    // Get metrics
    const { data: metricsData } = await supabase
      .from("trust_metrics")
      .select("*")
      .in("contact_id", contactIds)
      .eq("user_id", userId)
      .order("timestamp", { ascending: false })
      .limit(contactIds.length);

    const headers = {
      "Content-Type": format === "csv" ? "text/csv" : "application/json",
      "Access-Control-Allow-Origin":
        requestOrigin ||
        process.env.VITE_CORS_ORIGIN ||
        "https://www.satnam.pub",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (format === "csv") {
      const csv = convertToCSV(metricsData || []);
      return {
        statusCode: 200,
        headers,
        body: csv,
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(metricsData),
    };
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "trust-metrics-comparison/export",
    });
    return errorResponse(500, "Failed to export comparison", requestOrigin);
  }
}

function convertToCSV(data: any[]): string {
  if (data.length === 0) return "";

  const headers = [
    "Contact ID",
    "Rank",
    "Followers",
    "Hops",
    "Influence",
    "Reliability",
    "Recency",
    "Timestamp",
  ];
  const rows = data.map((d) => [
    d.contact_id,
    d.rank,
    d.followers,
    d.hops,
    d.influence,
    d.reliability,
    d.recency,
    d.timestamp,
  ]);

  const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
  return csv;
}

export { handler };
