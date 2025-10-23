/**
 * Trust Provider Ratings API Endpoint
 * Phase 3 Day 5: Trust Provider API Endpoints
 *
 * Handles:
 * - Get provider ratings/reviews
 * - Submit provider rating
 * - Get user's rating for a provider
 * - Update existing rating
 */

import { Handler, HandlerContext, HandlerEvent } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "./utils/env.js";

interface ProviderRating {
  id: string;
  userId: string;
  providerId: string;
  rating: number;
  review: string;
  helpful: number;
  unhelpful: number;
  createdAt: string;
  updatedAt: string;
}

interface RatingsResponse {
  ratings: ProviderRating[];
  averageRating: number;
  totalRatings: number;
  page: number;
  pageSize: number;
}

interface SubmitRatingResponse {
  success: boolean;
  ratingId: string;
  message: string;
}

interface UserRatingResponse {
  rating: ProviderRating | null;
  hasRated: boolean;
}

const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin":
      process.env.VITE_CORS_ORIGIN || "https://www.satnam.pub",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
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
    if (event.httpMethod === "GET" && event.path.includes("/list")) {
      return handleGetRatings(supabase, event, headers);
    }

    if (event.httpMethod === "GET" && event.path.includes("/user-rating")) {
      return handleGetUserRating(supabase, userId, event, headers);
    }

    if (event.httpMethod === "POST" && event.path.includes("/submit")) {
      return handleSubmitRating(supabase, userId, event, headers);
    }

    if (event.httpMethod === "PUT" && event.path.includes("/update")) {
      return handleUpdateRating(supabase, userId, event, headers);
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: "Endpoint not found" }),
    };
  } catch (error) {
    console.error("Error in trust-provider-ratings:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

async function handleGetRatings(
  supabase: any,
  event: HandlerEvent,
  headers: any
) {
  try {
    const providerId = event.queryStringParameters?.providerId;
    const page = parseInt(event.queryStringParameters?.page || "1");
    const pageSize = parseInt(event.queryStringParameters?.pageSize || "10");

    if (!providerId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "providerId is required" }),
      };
    }

    const offset = (page - 1) * pageSize;

    // Get ratings
    const {
      data: ratings,
      count,
      error,
    } = await supabase
      .from("trust_provider_ratings")
      .select("*", { count: "exact" })
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    // Calculate average rating
    const { data: avgData } = await supabase
      .from("trust_provider_ratings")
      .select("rating")
      .eq("provider_id", providerId);

    const averageRating =
      avgData && avgData.length > 0
        ? avgData.reduce((sum: number, r: any) => sum + r.rating, 0) /
          avgData.length
        : 0;

    const response: RatingsResponse = {
      ratings: ratings || [],
      averageRating: Math.round(averageRating * 10) / 10,
      totalRatings: count || 0,
      page,
      pageSize,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Error getting ratings:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to get ratings" }),
    };
  }
}

async function handleGetUserRating(
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

    // Get user's rating
    const { data: rating, error } = await supabase
      .from("trust_provider_ratings")
      .select("*")
      .eq("user_id", userId)
      .eq("provider_id", providerId)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    const response: UserRatingResponse = {
      rating: rating || null,
      hasRated: !!rating,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Error getting user rating:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to get user rating" }),
    };
  }
}

async function handleSubmitRating(
  supabase: any,
  userId: string,
  event: HandlerEvent,
  headers: any
) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { providerId, rating, review } = body;

    // Validate input
    if (!providerId || rating === undefined) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "providerId and rating are required" }),
      };
    }

    if (rating < 1 || rating > 5) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "rating must be between 1 and 5" }),
      };
    }

    // Check if user already rated
    const { data: existingRating } = await supabase
      .from("trust_provider_ratings")
      .select("id")
      .eq("user_id", userId)
      .eq("provider_id", providerId)
      .single();

    if (existingRating) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: "You have already rated this provider" }),
      };
    }

    // Create rating
    const { data: newRating, error } = await supabase
      .from("trust_provider_ratings")
      .insert({
        user_id: userId,
        provider_id: providerId,
        rating,
        review: review || "",
        helpful: 0,
        unhelpful: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) throw error;

    const response: SubmitRatingResponse = {
      success: true,
      ratingId: newRating.id,
      message: "Rating submitted successfully",
    };

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Error submitting rating:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to submit rating" }),
    };
  }
}

async function handleUpdateRating(
  supabase: any,
  userId: string,
  event: HandlerEvent,
  headers: any
) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { providerId, rating, review } = body;

    if (!providerId || rating === undefined) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "providerId and rating are required" }),
      };
    }

    if (rating < 1 || rating > 5) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "rating must be between 1 and 5" }),
      };
    }

    // Update rating
    const { error } = await supabase
      .from("trust_provider_ratings")
      .update({
        rating,
        review: review || "",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("provider_id", providerId);

    if (error) throw error;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: "Rating updated successfully",
      }),
    };
  } catch (error) {
    console.error("Error updating rating:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to update rating" }),
    };
  }
}

export { handler };
