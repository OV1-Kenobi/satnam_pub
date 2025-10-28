/**
 * Centralized Security Headers Utility
 * Provides consistent security headers and CORS validation across all Netlify Functions
 *
 * Security Headers Applied:
 * - X-Content-Type-Options: nosniff (prevent MIME type sniffing)
 * - X-Frame-Options: DENY (prevent clickjacking)
 * - X-XSS-Protection: 1; mode=block (enable XSS protection)
 * - Strict-Transport-Security: max-age=31536000 (enforce HTTPS)
 * - Content-Security-Policy: default-src 'self' (restrict resource loading)
 * - Referrer-Policy: strict-origin-when-cross-origin (control referrer info)
 * - Vary: Origin (cache-aware CORS)
 *
 * CORS Validation:
 * - Strict whitelist-based origin validation
 * - No wildcard "*" origins allowed
 * - Environment-aware (dev vs prod)
 * - Configurable per function
 */

import { getEnvVar } from "./env.js";

/**
 * Security headers configuration options
 */
export interface SecurityHeadersOptions {
  /** Allowed origins for CORS (defaults to production origins) */
  allowedOrigins?: string[];
  /** Custom CSP policy (defaults to restrictive policy) */
  cspPolicy?: string;
  /** Custom HSTS max-age in seconds (defaults to 1 year) */
  hstsMaxAge?: number;
  /** Include preload directive in HSTS (defaults to true) */
  hstsPreload?: boolean;
  /** Include subdomains in HSTS (defaults to true) */
  hstsIncludeSubdomains?: boolean;
}

/**
 * Default allowed origins for CORS
 * Production origins are always included
 * Development origins are added when NODE_ENV=development
 */
function getDefaultAllowedOrigins(): string[] {
  const origins = [
    "https://www.satnam.pub",
    "https://satnam.pub",
    "https://app.satnam.pub",
    "https://my.satnam.pub",
  ];

  // Add development origins if in development mode
  if (process.env.NODE_ENV === "development") {
    origins.push("http://localhost:5173", "http://localhost:3000");
  }

  return origins;
}

/**
 * Validate origin against whitelist
 * Returns the validated origin or the first allowed origin as fallback
 *
 * @param origin - The origin to validate (from request headers)
 * @param allowedOrigins - List of allowed origins
 * @returns The validated origin or first allowed origin
 */
export function validateOrigin(
  origin: string | undefined,
  allowedOrigins: string[] = getDefaultAllowedOrigins()
): string {
  if (!origin) {
    return allowedOrigins[0];
  }

  // Check if origin is in whitelist
  if (allowedOrigins.includes(origin)) {
    return origin;
  }

  // Return first allowed origin as fallback (never use wildcard)
  return allowedOrigins[0];
}

/**
 * Get all security headers for a response
 *
 * @param origin - The request origin (from headers)
 * @param options - Configuration options
 * @returns Object containing all security headers
 */
export function getSecurityHeaders(
  origin?: string,
  options: SecurityHeadersOptions = {}
): Record<string, string> {
  const allowedOrigins = options.allowedOrigins || getDefaultAllowedOrigins();
  const validatedOrigin = validateOrigin(origin, allowedOrigins);

  const hstsMaxAge = options.hstsMaxAge ?? 31536000; // 1 year
  const hstsPreload = options.hstsPreload ?? true;
  const hstsIncludeSubdomains = options.hstsIncludeSubdomains ?? true;

  // Build HSTS header
  let hstsHeader = `max-age=${hstsMaxAge}`;
  if (hstsIncludeSubdomains) {
    hstsHeader += "; includeSubDomains";
  }
  if (hstsPreload) {
    hstsHeader += "; preload";
  }

  // Default CSP policy (restrictive)
  const cspPolicy =
    options.cspPolicy || "default-src 'none'; frame-ancestors 'none'";

  return {
    // CORS headers
    "Access-Control-Allow-Origin": validatedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400", // 24 hours
    Vary: "Origin",

    // Security headers
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": hstsHeader,
    "Content-Security-Policy": cspPolicy,
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

/**
 * Get CORS preflight headers for OPTIONS requests
 * Includes all security headers plus CORS-specific headers
 *
 * @param origin - The request origin
 * @param options - Configuration options
 * @returns Object containing preflight headers
 */
export function getCorsPreflightHeaders(
  origin?: string,
  options: SecurityHeadersOptions = {}
): Record<string, string> {
  return {
    ...getSecurityHeaders(origin, options),
    "Content-Length": "0",
  };
}

/**
 * Create a JSON response with security headers
 * Convenience function for consistent response formatting
 *
 * @param status - HTTP status code
 * @param body - Response body (will be JSON stringified)
 * @param origin - Request origin for CORS validation
 * @param options - Security headers options
 * @returns Netlify Functions response object
 */
export function jsonResponse(
  status: number,
  body: unknown,
  origin?: string,
  options: SecurityHeadersOptions = {}
): {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
} {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      ...getSecurityHeaders(origin, options),
    },
    body: JSON.stringify(body),
  };
}

/**
 * Create an error response with security headers
 * Ensures generic error messages without information disclosure
 *
 * @param status - HTTP status code
 * @param message - Generic error message (no sensitive details)
 * @param origin - Request origin for CORS validation
 * @param options - Security headers options
 * @returns Netlify Functions response object
 */
export function errorResponse(
  status: number,
  message: string,
  origin?: string,
  options: SecurityHeadersOptions = {}
): {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
} {
  return jsonResponse(
    status,
    {
      success: false,
      error: message,
    },
    origin,
    options
  );
}

/**
 * Create a success response with security headers
 *
 * @param data - Response data
 * @param origin - Request origin for CORS validation
 * @param options - Security headers options
 * @returns Netlify Functions response object
 */
export function successResponse(
  data: unknown,
  origin?: string,
  options: SecurityHeadersOptions = {}
): {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
} {
  return jsonResponse(
    200,
    {
      success: true,
      data,
    },
    origin,
    options
  );
}

/**
 * Create a preflight response for OPTIONS requests
 *
 * @param origin - Request origin for CORS validation
 * @param options - Security headers options
 * @returns Netlify Functions response object
 */
export function preflightResponse(
  origin?: string,
  options: SecurityHeadersOptions = {}
): {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
} {
  return {
    statusCode: 204,
    headers: getCorsPreflightHeaders(origin, options),
    body: "",
  };
}

