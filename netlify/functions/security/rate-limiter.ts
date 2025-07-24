/**
 * @fileoverview Rate Limiting Middleware for Satnam.pub Family Banking
 * @description Prevents brute force attacks on authentication and payment endpoints
 */

import * as crypto from "crypto";
import {
  NextFunction,
  Request,
  Response,
} from "../../../types/netlify-functions";
import { supabase } from "../supabase";

// Extend Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        [key: string]: any;
      };
    }
  }
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
}

/**
 * Log security event for monitoring
 * Ensures no sensitive data is logged while maintaining security monitoring
 */
async function logSecurityEvent(
  event: string,
  details: Record<string, any>,
  req?: Request
): Promise<void> {
  try {
    await supabase.from("security_audit_log").insert({
      event_type: event,
      details: JSON.stringify(details),
      ip_address: req?.ip || "system",
      user_agent: req?.get("User-Agent") || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to log security event:", error);
  }
}

/**
 * Create privacy-preserving hash for rate limiting keys
 * Ensures user identifiers are not stored in plaintext
 */
async function hashRateLimitKey(data: string): Promise<string> {
  const salt = "satnam-rate-limit-salt-2024";
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 32); // Use first 32 chars for uniqueness
}

class MemoryRateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.store.entries());
    for (const [key, entry] of entries) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  increment(
    key: string,
    windowMs: number,
    maxRequests: number
  ): RateLimitEntry {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || now > existing.resetTime) {
      // Create new entry or reset expired entry
      const entry: RateLimitEntry = {
        count: 1,
        resetTime: now + windowMs,
        blocked: false,
      };
      this.store.set(key, entry);
      return entry;
    }

    // Increment existing entry
    existing.count++;
    if (existing.count > maxRequests) {
      existing.blocked = true;
      // Extend block time for repeated violations
      existing.resetTime = now + windowMs * 2;
    }

    this.store.set(key, existing);
    return existing;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

// Global rate limiter instance
const memoryRateLimiter = new MemoryRateLimiter();

// Fail-open monitoring counters
let failOpenCount = 0;
let lastFailOpenTime: Date | null = null;

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  message?: string; // Custom error message
}

/**
 * Create rate limiting middleware
 */
export function createRateLimit(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (req) => req.ip || "unknown",
    skipSuccessfulRequests = false,
    message = "Too many requests, please try again later",
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${keyGenerator(req)}:${req.route?.path || req.path}`;
    const result = memoryRateLimiter.increment(key, windowMs, maxRequests);

    if (result.blocked) {
      console.warn(`🚨 Rate limit exceeded for ${key}`, {
        count: result.count,
        resetTime: new Date(result.resetTime).toISOString(),
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(429).json({
        success: false,
        error: message,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      });
      return;
    }

    // Add rate limit headers
    res.set({
      "X-RateLimit-Limit": maxRequests.toString(),
      "X-RateLimit-Remaining": Math.max(
        0,
        maxRequests - result.count
      ).toString(),
      "X-RateLimit-Reset": new Date(result.resetTime).toISOString(),
    });

    // Handle successful requests
    if (skipSuccessfulRequests) {
      const originalSend = res.send;
      res.send = function (data: any) {
        // If response is successful, decrement the counter
        if (res.statusCode < 400) {
          const currentEntry = memoryRateLimiter.increment(
            key,
            windowMs,
            maxRequests
          );
          if (currentEntry.count > 1) {
            currentEntry.count--;
          }
        }
        return originalSend.call(this, data);
      };
    }

    next();
  };
}

/**
 * Strict rate limiting for authentication endpoints
 */
export const authRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts per 15 minutes
  keyGenerator: (req) => {
    const identifier = req.body?.username || req.body?.npub || "unknown";
    return `auth:${req.ip}:${hashRateLimitKey(identifier)}`;
  },
  message:
    "Too many authentication attempts. Please wait 15 minutes before trying again.",
});

/**
 * Enhanced OTP rate limiting with multiple layers
 */
export const otpInitiateRateLimit = createRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 3, // 3 OTP requests per 5 minutes per user
  keyGenerator: (req) => {
    const identifier = req.body?.npub || req.body?.pubkey || "unknown";
    return `otp-initiate:${hashRateLimitKey(identifier)}`;
  },
  message:
    "Too many OTP requests for this account. Please wait 5 minutes before requesting another code.",
});

/**
 * IP-based OTP rate limiting to prevent distributed attacks
 */
export const otpIPRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 OTP requests per 15 minutes per IP
  keyGenerator: (req) => `otp-ip:${req.ip}`,
  message:
    "Too many OTP requests from this IP address. Please wait 15 minutes.",
});

/**
 * Strict OTP verification rate limiting
 */
export const otpVerifyRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 verification attempts per 15 minutes per user
  keyGenerator: (req) => {
    const identifier = req.body?.otpKey?.split("_")[0] || "unknown";
    return `otp-verify:${hashRateLimitKey(identifier)}`;
  },
  message: "Too many OTP verification attempts. Please wait 15 minutes.",
});

/**
 * Global OTP verification IP rate limiting
 */
export const otpVerifyIPRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 50, // 50 verification attempts per 15 minutes per IP
  keyGenerator: (req) => `otp-verify-ip:${req.ip}`,
  message:
    "Too many OTP verification attempts from this IP. Please wait 15 minutes.",
});

/**
 * Lightning payment rate limiting
 */
export const paymentRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 payments per minute
  keyGenerator: (req) => `payment:${req.ip}:${req.user?.id || "unknown"}`,
  message:
    "Payment rate limit exceeded. Please wait before making another payment.",
  skipSuccessfulRequests: true, // Don't penalize successful payments
});

/**
 * Session refresh rate limiting to prevent brute force attacks on refresh tokens
 */
export const sessionRefreshRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 refresh attempts per 15 minutes per IP
  keyGenerator: (req) => {
    // Use IP and refresh token hash for more specific rate limiting
    const refreshToken = req.cookies?.family_refresh;
    const tokenHash = refreshToken
      ? hashRateLimitKey(refreshToken.substring(0, 20))
      : "no-token";
    return `session-refresh:${req.ip}:${tokenHash}`;
  },
  message:
    "Too many session refresh attempts. Please wait 15 minutes before trying again.",
});

/**
 * General API rate limiting
 */
export const apiRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // 100 requests per 15 minutes
  keyGenerator: (req) => `api:${req.ip}`,
  message: "API rate limit exceeded. Please reduce your request frequency.",
});

/**
 * General rate limiter (alias for apiRateLimit)
 */
export const rateLimiter = apiRateLimit;

/**
 * Rate limit function (alias for createRateLimit)
 */
export const rateLimit = createRateLimit;

/**
 * Get fail-open monitoring metrics
 */
export function getFailOpenMetrics(): {
  totalFailOpenCount: number;
  lastFailOpenTime: Date | null;
  isCurrentlyFailing: boolean;
  timeSinceLastFailure: number | null;
} {
  const now = new Date();
  const timeSinceLastFailure = lastFailOpenTime
    ? now.getTime() - lastFailOpenTime.getTime()
    : null;

  // Consider "currently failing" if last failure was within 5 minutes
  const isCurrentlyFailing =
    timeSinceLastFailure !== null && timeSinceLastFailure < 5 * 60 * 1000;

  return {
    totalFailOpenCount: failOpenCount,
    lastFailOpenTime,
    isCurrentlyFailing,
    timeSinceLastFailure,
  };
}

/**
 * Reset fail-open counters (useful for testing or after resolving issues)
 */
export function resetFailOpenMetrics(): void {
  failOpenCount = 0;
  lastFailOpenTime = null;
}

/**
 * Monitor fail-open scenarios and emit alerts
 * Call this periodically to check for concerning patterns
 */
export async function monitorFailOpenScenarios(): Promise<{
  alertLevel: "none" | "warning" | "critical";
  message: string;
  metrics: ReturnType<typeof getFailOpenMetrics>;
}> {
  const metrics = getFailOpenMetrics();

  // Critical: High frequency of failures (>10 in last 5 minutes)
  if (metrics.isCurrentlyFailing && metrics.totalFailOpenCount > 10) {
    const alertMessage = `🚨 CRITICAL: Rate limiter failing open frequently (${
      metrics.totalFailOpenCount
    } times, last failure: ${metrics.lastFailOpenTime?.toISOString()})`;

    await logSecurityEvent("rate_limit_fail_open_alert", {
      alertLevel: "critical",
      totalFailOpenCount: metrics.totalFailOpenCount,
      lastFailOpenTime: metrics.lastFailOpenTime?.toISOString(),
      message: alertMessage,
    });

    return {
      alertLevel: "critical",
      message: alertMessage,
      metrics,
    };
  }

  // Warning: Some failures detected
  if (metrics.totalFailOpenCount > 0) {
    const alertMessage = `⚠️  WARNING: Rate limiter has failed open ${
      metrics.totalFailOpenCount
    } times (last: ${metrics.lastFailOpenTime?.toISOString()})`;

    return {
      alertLevel: "warning",
      message: alertMessage,
      metrics,
    };
  }

  return {
    alertLevel: "none",
    message: "✅ Rate limiter operating normally",
    metrics,
  };
}

/**
 * Cleanup rate limiter on process exit
 */
process.on("exit", () => {
  memoryRateLimiter.destroy();
});

process.on("SIGINT", () => {
  memoryRateLimiter.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  memoryRateLimiter.destroy();
  process.exit(0);
});

/**
 * Database-backed rate limiter for persistent rate limiting
 * Survives server restarts and provides distributed rate limiting
 */
export class DatabaseRateLimiter {
  /**
   * Check and increment rate limit counter in database
   */
  static async checkRateLimit(
    key: string,
    windowMs: number,
    maxRequests: number,
    identifier?: string
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: Date;
    totalHits: number;
  }> {
    try {
      const windowStart = new Date(Date.now() - windowMs);
      const resetTime = new Date(Date.now() + windowMs);

      // Call database function to check and increment rate limit
      const { data, error } = await supabase.rpc("check_rate_limit", {
        p_key: key,
        p_window_start: windowStart.toISOString(),
        p_max_requests: maxRequests,
        p_identifier: identifier || null,
      });

      if (error) {
        console.error("Database rate limit check failed:", error);

        // Increment fail-open counter and update timestamp
        failOpenCount++;
        lastFailOpenTime = new Date();

        // Emit metric or alert for monitoring
        await logSecurityEvent("rate_limit_fail_open", {
          key,
          error: error.message,
          reason: "database_error",
          windowMs,
          maxRequests,
          totalFailOpenCount: failOpenCount,
        });

        // Fail open - allow request if database is unavailable
        return {
          allowed: true,
          remaining: maxRequests - 1,
          resetTime,
          totalHits: 1,
        };
      }

      const result = data?.[0];
      const totalHits = result?.total_hits || 0;
      const allowed = totalHits <= maxRequests;

      return {
        allowed,
        remaining: Math.max(0, maxRequests - totalHits),
        resetTime,
        totalHits,
      };
    } catch (error) {
      console.error("Rate limit check error:", error);

      // Increment fail-open counter and update timestamp
      failOpenCount++;
      lastFailOpenTime = new Date();

      // Emit metric or alert for monitoring
      await logSecurityEvent("rate_limit_fail_open", {
        key,
        error: error instanceof Error ? error.message : "Unknown error",
        reason: "exception_caught",
        windowMs,
        maxRequests,
        totalFailOpenCount: failOpenCount,
      });

      // Fail open - allow request if there's an error
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetTime: new Date(Date.now() + windowMs),
        totalHits: 1,
      };
    }
  }

  /**
   * Log rate limit violation for security monitoring
   * Note: identifier is already hashed by the key generator, so we don't store it separately
   */
  static async logRateLimitViolation(
    key: string,
    ip: string,
    userAgent?: string,
    identifier?: string
  ): Promise<void> {
    try {
      await supabase.from("security_rate_limit_violations").insert({
        rate_limit_key: key, // Key is already hashed for privacy
        ip_address: ip,
        user_agent: userAgent || null,
        // Don't store raw identifier - it's already hashed in the key
        identifier: null,
        violated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to log rate limit violation:", error);
    }
  }

  /**
   * Clean up old rate limit entries
   */
  static async cleanup(): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

      await supabase
        .from("security_rate_limits")
        .delete()
        .lt("created_at", cutoffTime.toISOString());

      await supabase
        .from("security_rate_limit_violations")
        .delete()
        .lt("violated_at", cutoffTime.toISOString());
    } catch (error) {
      console.error("Rate limit cleanup failed:", error);
    }
  }
}

/**
 * Enhanced OTP rate limiting middleware with database persistence
 */
export function createDatabaseRateLimit(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  keyGenerator?: (req: Request) => string;
  message?: string;
  logViolations?: boolean;
}) {
  const {
    windowMs,
    maxRequests,
    keyPrefix,
    keyGenerator = (req) => req.ip || "unknown",
    message = "Rate limit exceeded",
    logViolations = true,
  } = options;

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const identifier = keyGenerator(req);
      const key = `${keyPrefix}:${identifier}`;

      const rateLimitResult = await DatabaseRateLimiter.checkRateLimit(
        key,
        windowMs,
        maxRequests,
        identifier
      );

      if (!rateLimitResult.allowed) {
        // Log violation if enabled
        if (logViolations) {
          await DatabaseRateLimiter.logRateLimitViolation(
            key,
            req.ip || "unknown",
            req.get("User-Agent"),
            identifier
          );
        }

        console.warn(`🚨 Database rate limit exceeded for ${key}`, {
          totalHits: rateLimitResult.totalHits,
          maxRequests,
          resetTime: rateLimitResult.resetTime.toISOString(),
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        });

        res.status(429).json({
          success: false,
          error: message,
          retryAfter: Math.ceil(
            (rateLimitResult.resetTime.getTime() - Date.now()) / 1000
          ),
          remaining: rateLimitResult.remaining,
          resetTime: rateLimitResult.resetTime.toISOString(),
        });
        return;
      }

      // Add rate limit headers
      res.set({
        "X-RateLimit-Limit": maxRequests.toString(),
        "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
        "X-RateLimit-Reset": rateLimitResult.resetTime.toISOString(),
      });

      next();
    } catch (error) {
      console.error("Database rate limit middleware error:", error);
      // Fail open - continue with request if rate limiting fails
      next();
    }
  };
}

// Schedule cleanup every hour
setInterval(() => {
  DatabaseRateLimiter.cleanup();
}, 60 * 60 * 1000);
