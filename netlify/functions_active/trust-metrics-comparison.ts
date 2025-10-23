/**
 * Trust Metrics Comparison API Endpoint
 * Phase 3 Day 5: Trust Provider API Endpoints
 *
 * Handles:
 * - Compare metrics across multiple contacts
 * - Get historical trust score data
 * - Export comparison data (JSON/CSV)
 */

import { Handler, HandlerContext, HandlerEvent } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
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

const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin":
      process.env.VITE_CORS_ORIGIN || "https://www.satnam.pub",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
    const supabaseServiceKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase environment variables");
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Server configuration error" }),
      };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract JWT token
    const authHeader = (event.headers.authorization || "").toString();
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token || token === "Bearer") {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    // Verify JWT and get user
    let user;
    try {
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser(token);
      if (authError || !authUser) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: "Invalid token" }),
        };
      }
      user = authUser;
    } catch (authError) {
      console.error("Auth verification error:", authError);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Invalid token" }),
      };
    }

    const userId = user.id;

    // Route handlers
    if (event.httpMethod === "POST" && event.path.includes("/compare")) {
      return handleCompareMetrics(supabase, userId, event, headers);
    }

    if (event.httpMethod === "GET" && event.path.includes("/history")) {
      return handleGetHistory(supabase, userId, event, headers);
    }

    if (event.httpMethod === "GET" && event.path.includes("/export")) {
      return handleExportComparison(supabase, userId, event, headers);
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: "Endpoint not found" }),
    };
  } catch (error) {
    console.error("Error in trust-metrics-comparison:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
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
  headers: any
) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { contactIds } = body;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "contactIds array is required" }),
      };
    }

    if (contactIds.length > 10) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Maximum 10 contacts can be compared" }),
      };
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Error comparing metrics:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to compare metrics" }),
    };
  }
}

async function handleGetHistory(
  supabase: any,
  userId: string,
  event: HandlerEvent,
  headers: any
) {
  try {
    const contactId = event.queryStringParameters?.contactId;
    const page = parseInt(event.queryStringParameters?.page || "1");
    const pageSize = parseInt(event.queryStringParameters?.pageSize || "30");
    const days = parseInt(event.queryStringParameters?.days || "90");

    if (!contactId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "contactId is required" }),
      };
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Error getting history:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to get history" }),
    };
  }
}

async function handleExportComparison(
  supabase: any,
  userId: string,
  event: HandlerEvent,
  headers: any
) {
  try {
    const format = event.queryStringParameters?.format || "json";
    const contactIds =
      event.queryStringParameters?.contactIds?.split(",") || [];

    if (contactIds.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "contactIds are required" }),
      };
    }

    // Get metrics
    const { data: metricsData } = await supabase
      .from("trust_metrics")
      .select("*")
      .in("contact_id", contactIds)
      .eq("user_id", userId)
      .order("timestamp", { ascending: false })
      .limit(contactIds.length);

    if (format === "csv") {
      const csv = convertToCSV(metricsData || []);
      return {
        statusCode: 200,
        headers: { ...headers, "Content-Type": "text/csv" },
        body: csv,
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(metricsData),
    };
  } catch (error) {
    console.error("Error exporting comparison:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to export comparison" }),
    };
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
