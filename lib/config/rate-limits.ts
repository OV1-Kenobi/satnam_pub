/**
 * Rate Limiting Configuration
 *
 * Centralized configuration for all rate limiting settings.
 * This allows for easy adjustment of rate limits based on environment
 * and provides a single source of truth for rate limiting parameters.
 */

export interface RateLimitConfig {
  /** Maximum number of requests allowed within the time window */
  limit: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Human-readable description of the rate limit */
  description: string;
}

/**
 * Rate limit configurations for different operations
 */
export const RATE_LIMITS = {
  /** Peer invitation generation */
  PEER_INVITES: {
    limit: parseInt(process.env.INVITE_RATE_LIMIT || "5"),
    windowMs:
      parseInt(process.env.INVITE_RATE_WINDOW_HOURS || "1") * 60 * 60 * 1000,
    description: `${process.env.INVITE_RATE_LIMIT || "5"} invites per ${process.env.INVITE_RATE_WINDOW_HOURS || "1"} hour(s)`,
  } as RateLimitConfig,

  /** User registration */
  USER_REGISTRATION: {
    limit: parseInt(process.env.REGISTRATION_RATE_LIMIT || "3"),
    windowMs:
      parseInt(process.env.REGISTRATION_RATE_WINDOW_HOURS || "24") *
      60 *
      60 *
      1000,
    description: `${process.env.REGISTRATION_RATE_LIMIT || "3"} registrations per ${process.env.REGISTRATION_RATE_WINDOW_HOURS || "24"} hour(s)`,
  } as RateLimitConfig,

  /** API calls (general) */
  API_CALLS: {
    limit: parseInt(process.env.API_RATE_LIMIT || "100"),
    windowMs: parseInt(process.env.API_RATE_WINDOW_MINUTES || "15") * 60 * 1000,
    description: `${process.env.API_RATE_LIMIT || "100"} API calls per ${process.env.API_RATE_WINDOW_MINUTES || "15"} minute(s)`,
  } as RateLimitConfig,
} as const;

/**
 * Get rate limit configuration by type
 */
export function getRateLimitConfig(
  type: keyof typeof RATE_LIMITS
): RateLimitConfig {
  return RATE_LIMITS[type];
}

/**
 * Validate rate limit configuration
 */
export function validateRateLimitConfig(config: RateLimitConfig): boolean {
  return (
    config.limit > 0 && config.windowMs > 0 && config.description.length > 0
  );
}

/**
 * Format time window for human display
 */
export function formatTimeWindow(windowMs: number): string {
  const seconds = Math.floor(windowMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""}`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  } else {
    return `${seconds} second${seconds > 1 ? "s" : ""}`;
  }
}

/**
 * Calculate when rate limit will reset
 */
export function calculateResetTime(windowMs: number): Date {
  return new Date(Date.now() + windowMs);
}

/**
 * Check if a reset time has passed
 */
export function isResetTimePassed(resetTime: Date): boolean {
  return new Date() > resetTime;
}
