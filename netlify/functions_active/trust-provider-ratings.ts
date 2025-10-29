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

const handler: Handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    event.headers as Record<string, string | string[]>
  );
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  console.log("🚀 Trust provider ratings handler started:", {
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
        endpoint: "trust-provider-ratings",
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
      logError(
        authError instanceof Error ? authError : new Error(String(authError)),
        {
          requestId,
          endpoint: "trust-provider-ratings",
          operation: "auth verification",
        }
      );
      return errorResponse(401, "Invalid token", requestOrigin);
    }

    const userId = user.id;

    // Route handlers
    if (event.httpMethod === "GET" && event.path.includes("/list")) {
      return handleGetRatings(supabase, event, requestId, requestOrigin);
    }

    if (event.httpMethod === "GET" && event.path.includes("/user-rating")) {
      return handleGetUserRating(
        supabase,
        userId,
        event,
        requestId,
        requestOrigin
      );
    }

    if (event.httpMethod === "POST" && event.path.includes("/submit")) {
      return handleSubmitRating(
        supabase,
        userId,
        event,
        requestId,
        requestOrigin
      );
    }

    if (event.httpMethod === "PUT" && event.path.includes("/update")) {
      return handleUpdateRating(
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
      endpoint: "trust-provider-ratings",
      method: event.httpMethod,
    });
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};

async function handleGetRatings(
  supabase: any,
  event: HandlerEvent,
  requestId: string,
  requestOrigin: string | undefined
) {
  try {
    const providerId = event.queryStringParameters?.providerId;
    const page = parseInt(event.queryStringParameters?.page || "1");
    const pageSize = parseInt(event.queryStringParameters?.pageSize || "10");

    if (!providerId) {
      return createValidationErrorResponse(
        "providerId is required",
        requestId,
        requestOrigin
      );
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

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      requestId,
      endpoint: "trust-provider-ratings/list",
    });
    return errorResponse(500, "Failed to get ratings", requestOrigin);
  }
}

async function handleGetUserRating(
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

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      requestId,
      endpoint: "trust-provider-ratings/user-rating",
    });
    return errorResponse(500, "Failed to get user rating", requestOrigin);
  }
}

async function handleSubmitRating(
  supabase: any,
  userId: string,
  event: HandlerEvent,
  requestId: string,
  requestOrigin: string | undefined
) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { providerId, rating, review } = body;

    // Validate input
    if (!providerId || rating === undefined) {
      return createValidationErrorResponse(
        "providerId and rating are required",
        requestId,
        requestOrigin
      );
    }

    if (rating < 1 || rating > 5) {
      return createValidationErrorResponse(
        "rating must be between 1 and 5",
        requestId,
        requestOrigin
      );
    }

    // Check if user already rated
    const { data: existingRating } = await supabase
      .from("trust_provider_ratings")
      .select("id")
      .eq("user_id", userId)
      .eq("provider_id", providerId)
      .single();

    if (existingRating) {
      return errorResponse(
        409,
        "You have already rated this provider",
        requestOrigin
      );
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

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 201,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      requestId,
      endpoint: "trust-provider-ratings/submit",
    });
    return errorResponse(500, "Failed to submit rating", requestOrigin);
  }
}

async function handleUpdateRating(
  supabase: any,
  userId: string,
  event: HandlerEvent,
  requestId: string,
  requestOrigin: string | undefined
) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { providerId, rating, review } = body;

    if (!providerId || rating === undefined) {
      return createValidationErrorResponse(
        "providerId and rating are required",
        requestId,
        requestOrigin
      );
    }

    if (rating < 1 || rating > 5) {
      return createValidationErrorResponse(
        "rating must be between 1 and 5",
        requestId,
        requestOrigin
      );
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

    const headers = getSecurityHeaders(requestOrigin);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: "Rating updated successfully",
      }),
    };
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      requestId,
      endpoint: "trust-provider-ratings/update",
    });
    return errorResponse(500, "Failed to update rating", requestOrigin);
  }
}

export { handler };
