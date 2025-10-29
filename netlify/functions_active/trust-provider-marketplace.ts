/**
 * Trust Provider Marketplace API Endpoint
 * Phase 3 Day 5: Trust Provider API Endpoints
 *
 * Handles:
 * - List available trust providers with filtering/pagination
 * - Subscribe to provider
 * - Unsubscribe from provider
 * - Get provider details
 */

import { Handler, HandlerEvent } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

// Security utilities (Phase 4 hardening)
import {
  RATE_LIMITS,
  checkRateLimitStatus,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.js";
import {
  createRateLimitErrorResponse,
  createValidationErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.js";
import {
  errorResponse,
  getSecurityHeaders,
  preflightResponse,
} from "./utils/security-headers.js";

import { getEnvVar } from "./utils/env.js";

interface TrustProvider {
  id: string;
  name: string;
  pubkey: string;
  description: string;
  metrics: {
    rank: number;
    followers: number;
    hops: number;
    influence: number;
    reliability: number;
    recency: number;
  };
  rating: number;
  reviewCount: number;
  subscriptionCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ListProvidersResponse {
  providers: TrustProvider[];
  total: number;
  page: number;
  pageSize: number;
}

interface SubscribeResponse {
  success: boolean;
  subscriptionId: string;
  message: string;
}

interface UnsubscribeResponse {
  success: boolean;
  message: string;
}

interface ProviderDetailsResponse {
  provider: TrustProvider;
  userSubscribed: boolean;
  userRating?: number;
}

const handler: Handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 Trust provider marketplace handler started:", {
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
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    // Initialize Supabase client
    const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
    const supabaseServiceKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      logError(new Error("Missing Supabase environment variables"), {
        requestId,
        endpoint: "trust-provider-marketplace",
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return errorResponse(401, "Invalid token", requestOrigin);
    }

    const userId = user.id;

    // Route handlers
    if (event.httpMethod === "GET" && event.path.includes("/list")) {
      return handleListProviders(supabase, event, requestId, requestOrigin);
    }

    if (event.httpMethod === "GET" && event.path.includes("/details")) {
      return handleGetProviderDetails(
        supabase,
        userId,
        event,
        requestId,
        requestOrigin
      );
    }

    if (event.httpMethod === "POST" && event.path.includes("/subscribe")) {
      return handleSubscribe(supabase, userId, event, requestId, requestOrigin);
    }

    if (event.httpMethod === "DELETE" && event.path.includes("/unsubscribe")) {
      return handleUnsubscribe(
        supabase,
        userId,
        event,
        requestId,
        requestOrigin
      );
    }

    return errorResponse(404, "Endpoint not found", requestOrigin);
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      requestId,
      endpoint: "trust-provider-marketplace",
      method: event.httpMethod,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};

async function handleListProviders(
  supabase: any,
  event: HandlerEvent,
  requestId: string,
  requestOrigin: string | undefined
) {
  try {
    const page = parseInt(event.queryStringParameters?.page || "1");
    const pageSize = parseInt(event.queryStringParameters?.pageSize || "20");
    const search = event.queryStringParameters?.search || "";
    const sortBy = event.queryStringParameters?.sortBy || "rating";

    console.log("handleListProviders - params:", {
      requestId,
      page,
      pageSize,
      search,
      sortBy,
    });

    const offset = (page - 1) * pageSize;

    // Build query
    let query = supabase
      .from("trust_providers")
      .select("*", { count: "exact" });

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Sort options
    if (sortBy === "rating") {
      query = query.order("rating", { ascending: false });
    } else if (sortBy === "newest") {
      query = query.order("created_at", { ascending: false });
    } else if (sortBy === "followers") {
      query = query.order("metrics->followers", { ascending: false });
    }

    query = query.range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;

    console.log("handleListProviders - query result:", {
      requestId,
      dataLength: data?.length,
      count,
      error,
    });

    if (error) {
      logError(error, {
        requestId,
        endpoint: "trust-provider-marketplace/list",
        operation: "database query",
      });
      throw error;
    }

    const response: ListProvidersResponse = {
      providers: data || [],
      total: count || 0,
      page,
      pageSize,
    };

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      requestId,
      endpoint: "trust-provider-marketplace/list",
    });
    return errorResponse(500, "Failed to list providers", requestOrigin);
  }
}

async function handleGetProviderDetails(
  supabase: any,
  userId: string,
  event: HandlerEvent,
  requestId: string,
  requestOrigin: string | undefined
) {
  try {
    const providerId = event.queryStringParameters?.providerId;

    if (!providerId) {
      return createValidationErrorResponse(
        "providerId is required",
        requestId,
        requestOrigin
      );
    }

    // Get provider details
    const { data: provider, error: providerError } = await supabase
      .from("trust_providers")
      .select("*")
      .eq("id", providerId)
      .single();

    if (providerError || !provider) {
      return errorResponse(404, "Provider not found", requestOrigin);
    }

    // Check if user is subscribed
    const { data: subscription } = await supabase
      .from("trust_provider_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("provider_id", providerId)
      .eq("status", "active")
      .single();

    // Get user's rating if exists
    const { data: rating } = await supabase
      .from("trust_provider_ratings")
      .select("rating")
      .eq("user_id", userId)
      .eq("provider_id", providerId)
      .single();

    const response: ProviderDetailsResponse = {
      provider,
      userSubscribed: !!subscription,
      userRating: rating?.rating,
    };

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      requestId,
      endpoint: "trust-provider-marketplace/details",
    });
    return errorResponse(500, "Failed to get provider details", requestOrigin);
  }
}

async function handleSubscribe(
  supabase: any,
  userId: string,
  event: HandlerEvent,
  requestId: string,
  requestOrigin: string | undefined
) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { providerId } = body;

    if (!providerId) {
      return createValidationErrorResponse(
        "providerId is required",
        requestId,
        requestOrigin
      );
    }

    // Get provider details
    const { data: provider, error: providerError } = await supabase
      .from("trust_providers")
      .select("id, name, pubkey")
      .eq("id", providerId)
      .single();

    if (providerError || !provider) {
      return errorResponse(404, "Provider not found", requestOrigin);
    }

    // Create subscription
    const { data: subscription, error: subscriptionError } = await supabase
      .from("trust_provider_subscriptions")
      .insert({
        user_id: userId,
        provider_id: providerId,
        provider_name: provider.name,
        provider_pubkey: provider.pubkey,
        status: "active",
        subscribed_at: new Date().toISOString(),
        usage_count: 0,
        metrics_count: 0,
      })
      .select("id")
      .single();

    if (subscriptionError) throw subscriptionError;

    const response: SubscribeResponse = {
      success: true,
      subscriptionId: subscription.id,
      message: `Successfully subscribed to ${provider.name}`,
    };

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 201,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      requestId,
      endpoint: "trust-provider-marketplace/subscribe",
    });
    return errorResponse(500, "Failed to subscribe to provider", requestOrigin);
  }
}

async function handleUnsubscribe(
  supabase: any,
  userId: string,
  event: HandlerEvent,
  requestId: string,
  requestOrigin: string | undefined
) {
  try {
    const providerId = event.queryStringParameters?.providerId;

    if (!providerId) {
      return createValidationErrorResponse(
        "providerId is required",
        requestId,
        requestOrigin
      );
    }

    // Delete subscription
    const { error } = await supabase
      .from("trust_provider_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("provider_id", providerId);

    if (error) throw error;

    const response: UnsubscribeResponse = {
      success: true,
      message: "Successfully unsubscribed from provider",
    };

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      requestId,
      endpoint: "trust-provider-marketplace/unsubscribe",
    });
    return errorResponse(
      500,
      "Failed to unsubscribe from provider",
      requestOrigin
    );
  }
}

export { handler };
