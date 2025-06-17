/**
 * @fileoverview Rate Limiting Middleware for Satnam.pub Family Banking
 * @description Prevents brute force attacks on authentication and payment endpoints
 */

import { NextFunction, Request, Response } from "express";

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
}

class MemoryRateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000
    );
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
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
const rateLimiter = new MemoryRateLimiter();

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
    const result = rateLimiter.increment(key, windowMs, maxRequests);

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
          const currentEntry = rateLimiter.increment(
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
  keyGenerator: (req) =>
    `auth:${req.ip}:${req.body?.username || req.body?.npub || "unknown"}`,
  message:
    "Too many authentication attempts. Please wait 15 minutes before trying again.",
});

/**
 * Moderate rate limiting for OTP requests
 */
export const otpRateLimit = createRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 3, // 3 OTP requests per 5 minutes
  keyGenerator: (req) =>
    `otp:${req.ip}:${req.body?.npub || req.body?.pubkey || "unknown"}`,
  message: "Too many OTP requests. Please wait before requesting another code.",
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
 * General API rate limiting
 */
export const apiRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // 100 requests per 15 minutes
  keyGenerator: (req) => `api:${req.ip}`,
  message: "API rate limit exceeded. Please reduce your request frequency.",
});

/**
 * Cleanup rate limiter on process exit
 */
process.on("exit", () => {
  rateLimiter.destroy();
});

process.on("SIGINT", () => {
  rateLimiter.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  rateLimiter.destroy();
  process.exit(0);
});
