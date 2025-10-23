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

import { Handler, HandlerContext, HandlerEvent } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
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

const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin":
      process.env.VITE_CORS_ORIGIN || "https://www.satnam.pub",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Invalid token" }),
      };
    }

    const userId = user.id;

    // Route handlers
    if (event.httpMethod === "GET" && event.path.includes("/list")) {
      return handleListProviders(supabase, event, headers);
    }

    if (event.httpMethod === "GET" && event.path.includes("/details")) {
      return handleGetProviderDetails(supabase, userId, event, headers);
    }

    if (event.httpMethod === "POST" && event.path.includes("/subscribe")) {
      return handleSubscribe(supabase, userId, event, headers);
    }

    if (event.httpMethod === "DELETE" && event.path.includes("/unsubscribe")) {
      return handleUnsubscribe(supabase, userId, event, headers);
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: "Endpoint not found" }),
    };
  } catch (error) {
    console.error("Error in trust-provider-marketplace:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

async function handleListProviders(
  supabase: any,
  event: HandlerEvent,
  headers: any
) {
  try {
    const page = parseInt(event.queryStringParameters?.page || "1");
    const pageSize = parseInt(event.queryStringParameters?.pageSize || "20");
    const search = event.queryStringParameters?.search || "";
    const sortBy = event.queryStringParameters?.sortBy || "rating";

    console.log("handleListProviders - params:", {
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
      dataLength: data?.length,
      count,
      error,
    });

    if (error) {
      console.error("handleListProviders - database error:", error);
      throw error;
    }

    const response: ListProvidersResponse = {
      providers: data || [],
      total: count || 0,
      page,
      pageSize,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Error listing providers:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to list providers" }),
    };
  }
}

async function handleGetProviderDetails(
  supabase: any,
  userId: string,
  event: HandlerEvent,
  headers: any
) {
  try {
    const providerId = event.queryStringParameters?.providerId;

    if (!providerId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "providerId is required" }),
      };
    }

    // Get provider details
    const { data: provider, error: providerError } = await supabase
      .from("trust_providers")
      .select("*")
      .eq("id", providerId)
      .single();

    if (providerError || !provider) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: "Provider not found" }),
      };
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Error getting provider details:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to get provider details" }),
    };
  }
}

async function handleSubscribe(
  supabase: any,
  userId: string,
  event: HandlerEvent,
  headers: any
) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { providerId } = body;

    if (!providerId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "providerId is required" }),
      };
    }

    // Get provider details
    const { data: provider, error: providerError } = await supabase
      .from("trust_providers")
      .select("id, name, pubkey")
      .eq("id", providerId)
      .single();

    if (providerError || !provider) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: "Provider not found" }),
      };
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

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Error subscribing to provider:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to subscribe to provider" }),
    };
  }
}

async function handleUnsubscribe(
  supabase: any,
  userId: string,
  event: HandlerEvent,
  headers: any
) {
  try {
    const providerId = event.queryStringParameters?.providerId;

    if (!providerId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "providerId is required" }),
      };
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Error unsubscribing from provider:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to unsubscribe from provider" }),
    };
  }
}

export { handler };
