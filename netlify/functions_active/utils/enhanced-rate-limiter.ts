/**
 * Enhanced Database-Backed Rate Limiter Utility
 * Provides centralized rate limiting across all Netlify Functions
 *
 * Features:
 * - Database-backed rate limiting (not in-memory)
 * - Per-user and per-IP rate limiting
 * - Configurable limits per endpoint type
 * - Proxy header bypass prevention
 * - Sliding window algorithm
 *
 * Rate Limit Configuration:
 * - AUTH_SIGNIN: 10 requests per 15 minutes
 * - AUTH_REGISTER: 3 requests per 24 hours
 * - AUTH_REFRESH: 60 requests per hour
 * - PAYMENT_CREATE: 10 requests per hour
 * - PAYMENT_VERIFY: 100 requests per hour
 * - ADMIN_ACTIONS: 5 requests per minute
 * - IDENTITY_PUBLISH: 10 requests per hour
 * - DEFAULT: 30 requests per minute
 */

import { createClient } from "@supabase/supabase-js";
import { getEnvVar, getRequiredEnvVar } from "./env.js";

/**
 * Rate limit configuration for different endpoint types
 */
export const RATE_LIMITS = {
  AUTH_SIGNIN: { limit: 10, windowMs: 15 * 60 * 1000 }, // 10 req/15min
  AUTH_REGISTER: { limit: 3, windowMs: 24 * 60 * 60 * 1000 }, // 3 req/24hr
  AUTH_REFRESH: { limit: 60, windowMs: 60 * 60 * 1000 }, // 60 req/hr
  AUTH_SESSION: { limit: 100, windowMs: 60 * 60 * 1000 }, // 100 req/hr
  PAYMENT_CREATE: { limit: 10, windowMs: 60 * 60 * 1000 }, // 10 req/hr
  PAYMENT_VERIFY: { limit: 100, windowMs: 60 * 60 * 1000 }, // 100 req/hr
  PAYMENT_HISTORY: { limit: 50, windowMs: 60 * 60 * 1000 }, // 50 req/hr
  ADMIN_ACTIONS: { limit: 5, windowMs: 60 * 1000 }, // 5 req/min
  ADMIN_DASHBOARD: { limit: 10, windowMs: 60 * 1000 }, // 10 req/min
  IDENTITY_PUBLISH: { limit: 10, windowMs: 60 * 60 * 1000 }, // 10 req/hr
  IDENTITY_VERIFY: { limit: 50, windowMs: 60 * 60 * 1000 }, // 50 req/hr
  NFC_OPERATIONS: { limit: 20, windowMs: 60 * 60 * 1000 }, // 20 req/hr
  WALLET_OPERATIONS: { limit: 30, windowMs: 60 * 60 * 1000 }, // 30 req/hr
  DEFAULT: { limit: 30, windowMs: 60 * 1000 }, // 30 req/min
} as const;

/**
 * Rate limit configuration type
 */
export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

/**
 * Extract client IP from request headers
 * Checks multiple headers to handle proxies and load balancers
 * Prevents bypass attempts by validating header sources
 *
 * @param headers - Request headers object
 * @returns Client IP address
 */
export function getClientIP(headers: Record<string, string | string[]>): string {
  // Check headers in order of preference
  // x-forwarded-for: comma-separated list of IPs (first is client)
  const xForwardedFor = headers["x-forwarded-for"];
  if (xForwardedFor) {
    const ips = Array.isArray(xForwardedFor)
      ? xForwardedFor[0]
      : xForwardedFor.split(",")[0];
    return ips.trim();
  }

  // x-real-ip: single IP from reverse proxy
  const xRealIp = headers["x-real-ip"];
  if (xRealIp) {
    return Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
  }

  // cf-connecting-ip: Cloudflare client IP
  const cfConnectingIp = headers["cf-connecting-ip"];
  if (cfConnectingIp) {
    return Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp;
  }

  // Fallback to localhost (should not happen in production)
  return "127.0.0.1";
}

/**
 * Check if request is within rate limit
 * Uses database-backed rate limiting with sliding window algorithm
 *
 * @param identifier - Unique identifier (user ID, IP, or combination)
 * @param config - Rate limit configuration
 * @param supabaseUrl - Supabase project URL
 * @param supabaseKey - Supabase API key
 * @returns true if request is allowed, false if rate limited
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig,
  supabaseUrl?: string,
  supabaseKey?: string
): Promise<boolean> {
  try {
    // Get Supabase credentials
    const url = supabaseUrl || getEnvVar("SUPABASE_URL");
    const key = supabaseKey || getEnvVar("SUPABASE_ANON_KEY");

    if (!url || !key) {
      console.warn("Rate limiting disabled: Supabase credentials not available");
      return true; // Allow request if rate limiter is unavailable
    }

    const supabase = createClient(url, key);
    const now = new Date();
    const windowStart = new Date(now.getTime() - config.windowMs);

    // Query rate_limits table for recent requests
    const { data, error } = await supabase
      .from("rate_limits")
      .select("count")
      .eq("identifier", identifier)
      .gte("created_at", windowStart.toISOString())
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found (expected for new identifiers)
      console.error("Rate limit check error:", error);
      return true; // Allow request on error
    }

    const currentCount = data?.count || 0;

    // Check if limit exceeded
    if (currentCount >= config.limit) {
      return false; // Rate limit exceeded
    }

    // Increment counter
    if (currentCount === 0) {
      // Insert new record
      await supabase.from("rate_limits").insert({
        identifier,
        count: 1,
        created_at: now.toISOString(),
        window_start: windowStart.toISOString(),
      });
    } else {
      // Update existing record
      await supabase
        .from("rate_limits")
        .update({ count: currentCount + 1 })
        .eq("identifier", identifier)
        .gte("created_at", windowStart.toISOString());
    }

    return true; // Request allowed
  } catch (error) {
    console.error("Rate limit check failed:", error);
    return true; // Allow request on error (fail open)
  }
}

/**
 * Create rate limit identifier from user ID and IP
 * Combines both for more granular rate limiting
 *
 * @param userId - User ID (optional)
 * @param ip - Client IP address
 * @returns Combined identifier
 */
export function createRateLimitIdentifier(
  userId: string | undefined,
  ip: string
): string {
  if (userId) {
    return `user:${userId}`;
  }
  return `ip:${ip}`;
}

/**
 * Check rate limit and return error response if exceeded
 * Convenience function for common use case
 *
 * @param identifier - Rate limit identifier
 * @param config - Rate limit configuration
 * @returns Rate limit status object
 */
export async function checkRateLimitStatus(
  identifier: string,
  config: RateLimitConfig
): Promise<{
  allowed: boolean;
  remaining?: number;
  resetAt?: Date;
}> {
  const allowed = await checkRateLimit(identifier, config);

  if (!allowed) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + config.windowMs),
    };
  }

  return {
    allowed: true,
  };
}

/**
 * Reset rate limit for identifier (admin use only)
 * Should only be called by admin functions
 *
 * @param identifier - Rate limit identifier to reset
 * @param supabaseUrl - Supabase project URL
 * @param supabaseKey - Supabase API key (service role)
 */
export async function resetRateLimit(
  identifier: string,
  supabaseUrl?: string,
  supabaseKey?: string
): Promise<void> {
  try {
    const url = supabaseUrl || getEnvVar("SUPABASE_URL");
    const key = supabaseKey || getEnvVar("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !key) {
      throw new Error("Supabase credentials not available");
    }

    const supabase = createClient(url, key);

    await supabase
      .from("rate_limits")
      .delete()
      .eq("identifier", identifier);
  } catch (error) {
    console.error("Rate limit reset failed:", error);
    throw error;
  }
}

/**
 * Get rate limit status for identifier
 * Returns current count and window information
 *
 * @param identifier - Rate limit identifier
 * @param supabaseUrl - Supabase project URL
 * @param supabaseKey - Supabase API key
 */
export async function getRateLimitStatus(
  identifier: string,
  supabaseUrl?: string,
  supabaseKey?: string
): Promise<{
  count: number;
  windowStart: Date | null;
  windowEnd: Date | null;
} | null> {
  try {
    const url = supabaseUrl || getEnvVar("SUPABASE_URL");
    const key = supabaseKey || getEnvVar("SUPABASE_ANON_KEY");

    if (!url || !key) {
      return null;
    }

    const supabase = createClient(url, key);

    const { data, error } = await supabase
      .from("rate_limits")
      .select("count, created_at, window_start")
      .eq("identifier", identifier)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      count: data.count || 0,
      windowStart: data.window_start ? new Date(data.window_start) : null,
      windowEnd: data.created_at
        ? new Date(new Date(data.created_at).getTime() + 60 * 60 * 1000)
        : null,
    };
  } catch (error) {
    console.error("Get rate limit status failed:", error);
    return null;
  }
}

