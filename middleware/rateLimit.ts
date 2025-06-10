import { NextRequest, NextResponse } from "next/server";
import { connectRedis } from "../lib";

interface RateLimitOptions {
  limit: number; // Maximum number of requests
  window: number; // Time window in seconds
  keyGenerator?: (req: NextRequest) => string; // Function to generate a unique key
}

/**
 * Rate limiting middleware for Next.js API routes
 * Uses Redis to track request counts
 */
export async function rateLimitMiddleware(
  req: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: RateLimitOptions,
): Promise<NextResponse> {
  const { limit, window, keyGenerator } = options;

  /**
   * Default key generator uses IP address with fallbacks
   * Handles various proxy headers to get the real client IP
   */
  const getKey =
    keyGenerator ||
    ((req: NextRequest) => {
      const ip =
        req.ip ||
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        req.headers.get("cf-connecting-ip") ||
        "unknown";
      return `rate-limit:${ip}:${req.nextUrl.pathname}`;
    });

  const key = getKey(req);

  try {
    // Connect to Redis
    const redis = await connectRedis();

    // Use atomic operations to prevent race conditions
    const count = await redis.incr(key);

    // Set expiry on first request (when count is 1)
    if (count === 1) {
      await redis.expire(key, window);
    }

    // Check if limit exceeded after increment
    if (count > limit) {
      return NextResponse.json(
        { error: "Too many requests, please try again later" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": "0",
            "Retry-After": window.toString(),
          },
        },
      );
    }

    // Add rate limit headers
    const response = await handler(req);
    response.headers.set("X-RateLimit-Limit", limit.toString());
    response.headers.set(
      "X-RateLimit-Remaining",
      Math.max(0, limit - count).toString(),
    );

    return response;
  } catch (error) {
    // Redis connection or operation failed
    // In production, you might want to fail closed or use a fallback strategy
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Service temporarily unavailable" },
        { status: 503 },
      );
    }
    // In development, allow requests to proceed
    return handler(req);
  }
}
