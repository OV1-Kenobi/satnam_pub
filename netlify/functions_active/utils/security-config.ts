/**
 * Centralized Security Configuration
 * Single source of truth for all security-related constants and configurations
 *
 * This file consolidates:
 * - Rate limiting configurations
 * - Timeout configurations
 * - Allowed origins for CORS
 * - Content Security Policy (CSP) directives
 * - Security header defaults
 * - Input validation limits
 *
 * Usage:
 * Import specific configurations as needed:
 * import { SECURITY_CONFIG } from './security-config.js';
 */

/**
 * Rate limit configurations for different endpoint types
 * Used by enhanced-rate-limiter.ts
 */
export const RATE_LIMIT_CONFIG = {
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
 * Timeout configurations (in milliseconds)
 */
export const TIMEOUT_CONFIG = {
  /** Database query timeout */
  DATABASE_QUERY: 10000, // 10 seconds
  /** External API call timeout */
  EXTERNAL_API: 15000, // 15 seconds
  /** Nostr relay connection timeout */
  NOSTR_RELAY: 5000, // 5 seconds
  /** Nostr event publish timeout */
  NOSTR_PUBLISH: 10000, // 10 seconds
  /** Lightning payment timeout */
  LIGHTNING_PAYMENT: 30000, // 30 seconds
  /** NFC operation timeout */
  NFC_OPERATION: 10000, // 10 seconds
  /** Iroh DHT verification timeout */
  IROH_VERIFICATION: 10000, // 10 seconds
  /** PKARR resolution timeout */
  PKARR_RESOLUTION: 5000, // 5 seconds
  /** Default timeout for generic operations */
  DEFAULT: 10000, // 10 seconds
} as const;

/**
 * Allowed origins for CORS
 * Production origins are always included
 * Development origins are conditionally added based on NODE_ENV
 */
export const CORS_CONFIG = {
  /** Production origins (always allowed) */
  PRODUCTION_ORIGINS: [
    "https://www.satnam.pub",
    "https://satnam.pub",
    "https://app.satnam.pub",
    "https://my.satnam.pub",
  ],
  /** Development origins (only allowed in development mode) */
  DEVELOPMENT_ORIGINS: ["http://localhost:5173", "http://localhost:3000"],
  /** Get all allowed origins based on environment */
  getAllowedOrigins(): string[] {
    const origins: string[] = [...this.PRODUCTION_ORIGINS];
    if (process.env.NODE_ENV === "development") {
      origins.push(...this.DEVELOPMENT_ORIGINS);
    }
    return origins;
  },
} as const;

/**
 * Content Security Policy (CSP) directives
 * Provides different CSP policies for different endpoint types
 */
export const CSP_POLICIES = {
  /** Strictest policy - no resources allowed (for API endpoints) */
  STRICT: "default-src 'none'; frame-ancestors 'none'",

  /** API policy - allows JSON responses only */
  API: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",

  /** Default policy for most endpoints */
  DEFAULT:
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://www.satnam.pub https://my.satnam.pub; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",

  /** Relaxed policy for development (includes localhost) */
  DEVELOPMENT:
    "default-src 'self' http://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; font-src 'self'; connect-src 'self' http://localhost:* https://www.satnam.pub https://my.satnam.pub; frame-ancestors 'none'",

  /** Get CSP policy based on environment and endpoint type */
  getPolicy(type: "strict" | "api" | "default" = "api"): string {
    if (process.env.NODE_ENV === "development") {
      return this.DEVELOPMENT;
    }
    switch (type) {
      case "strict":
        return this.STRICT;
      case "api":
        return this.API;
      case "default":
        return this.DEFAULT;
      default:
        return this.API;
    }
  },
} as const;

/**
 * Security header defaults
 */
export const SECURITY_HEADERS_CONFIG = {
  /** HSTS max-age in seconds (1 year) */
  HSTS_MAX_AGE: 31536000,
  /** Include subdomains in HSTS */
  HSTS_INCLUDE_SUBDOMAINS: true,
  /** Include preload directive in HSTS */
  HSTS_PRELOAD: true,
  /** X-Frame-Options value */
  X_FRAME_OPTIONS: "DENY",
  /** X-Content-Type-Options value */
  X_CONTENT_TYPE_OPTIONS: "nosniff",
  /** X-XSS-Protection value */
  X_XSS_PROTECTION: "1; mode=block",
  /** Referrer-Policy value */
  REFERRER_POLICY: "strict-origin-when-cross-origin",
  /** Access-Control-Max-Age in seconds (24 hours) */
  CORS_MAX_AGE: 86400,
} as const;

/**
 * Input validation limits
 * Maximum lengths for various input types
 */
export const INPUT_LIMITS = {
  USERNAME: 64,
  PASSWORD: 256,
  EMAIL: 254,
  MESSAGE: 10000,
  DATA: 10000,
  NPUB: 63, // Nostr public key (bech32 encoded)
  NSEC: 63, // Nostr secret key (bech32 encoded)
  NIP05: 254, // NIP-05 identifier (email-like format)
  DUID: 64, // Decentralized User ID
  INVOICE: 1000, // Lightning invoice
  PAYMENT_AMOUNT: 21000000, // Max satoshis (21M BTC)
  WALLET_ID: 256,
  SIGNATURE: 256,
  HASH: 256,
  UUID: 36, // Standard UUID length
  URL: 2048,
  DESCRIPTION: 5000,
  METADATA: 50000,
  IROH_NODE_ID: 52, // Iroh node ID (base32 encoded)
} as const;

/**
 * Generic error messages for different HTTP status codes
 * Prevents information disclosure by using generic messages
 */
export const ERROR_MESSAGES = {
  400: "Invalid request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not found",
  409: "Conflict",
  429: "Too many requests",
  500: "Server error",
  502: "Bad gateway",
  503: "Service unavailable",
  504: "Gateway timeout",
} as const;

/**
 * Consolidated security configuration
 * Single export for all security-related constants
 */
export const SECURITY_CONFIG = {
  rateLimits: RATE_LIMIT_CONFIG,
  timeouts: TIMEOUT_CONFIG,
  cors: CORS_CONFIG,
  csp: CSP_POLICIES,
  headers: SECURITY_HEADERS_CONFIG,
  inputLimits: INPUT_LIMITS,
  errorMessages: ERROR_MESSAGES,
} as const;

/**
 * Type exports for TypeScript consumers
 */
export type RateLimitType = keyof typeof RATE_LIMIT_CONFIG;
export type TimeoutType = keyof typeof TIMEOUT_CONFIG;
export type CSPPolicyType = "strict" | "api" | "default";
export type InputLimitType = keyof typeof INPUT_LIMITS;
export type ErrorStatusCode = keyof typeof ERROR_MESSAGES;
