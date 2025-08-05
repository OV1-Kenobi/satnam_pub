import { NetlifyRequest, NetlifyResponse } from "../types/netlify-functions";
import { getCorsHeaders, validateOrigin } from "./auth-crypto";

/**
 * CRITICAL SECURITY: Master Context environment variable access pattern
 * Ensures browser compatibility with import.meta.env while maintaining serverless support
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = import.meta as any;
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

/**
 * Standard allowed origins configuration
 */
export const ALLOWED_ORIGINS = [
  "https://satnam.pub",
  "https://www.satnam.pub",
  "https://app.satnam.pub",
  "http://localhost:3000",
  "http://localhost:3002",
  "http://localhost:4173",
  "http://localhost:5173",
];

/**
 * Environment-aware CORS configuration
 */
export function getAllowedOrigins(): string[] {
  const nodeEnv = getEnvVar("NODE_ENV");
  if (nodeEnv === "production") {
    const frontendUrl = getEnvVar("FRONTEND_URL");
    return [
      frontendUrl || "https://satnam.pub",
      "https://satnam.pub",
      "https://www.satnam.pub",
      "https://app.satnam.pub",
    ].filter(Boolean);
  }

  return ALLOWED_ORIGINS;
}

/**
 * Handle CORS for API endpoints with environment-aware configuration
 *
 * @param req - API request object
 * @param res - API response object
 * @param options - CORS options
 */
export function setCorsHeaders(
  req: NetlifyRequest,
  res: NetlifyResponse,
  options: {
    methods?: string;
    credentials?: boolean;
    maxAge?: string;
  } = {}
): void {
  const {
    methods = "POST, GET, OPTIONS",
    credentials = true,
    maxAge = "86400",
  } = options;

  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  // SECURITY: Explicit, separate validation checks for transparency and debugging
  const isExplicitlyAllowed = origin && allowedOrigins.includes(origin);
  const isValidatedOrigin = origin && validateOrigin(origin);

  // Log validation results for security auditing
  if (origin) {
    if (isExplicitlyAllowed) {
      console.log(`[CORS] Origin allowed via explicit allowlist: ${origin}`);
    } else if (isValidatedOrigin) {
      console.log(`[CORS] Origin allowed via validation function: ${origin}`);
    } else {
      console.warn(`[CORS] Origin rejected: ${origin}`);
    }
  }

  // Allow origin if it passes either validation method
  if (isExplicitlyAllowed || isValidatedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", maxAge);
  res.setHeader("Vary", "Origin");

  if (credentials) {
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

/**
 * Set CORS headers using the shared getCorsHeaders function
 *
 * @param req - API request object
 * @param res - API response object
 * @param options - CORS options
 */
export function setCorsHeadersFromShared(
  req: NetlifyRequest,
  res: NetlifyResponse,
  options: {
    methods?: string;
    credentials?: boolean;
  } = {}
): void {
  const { methods = "POST, GET, OPTIONS", credentials = true } = options;

  const origin = req.headers.origin;
  const headers = getCorsHeaders(origin, methods, credentials);

  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

/**
 * Handle CORS for custom API endpoints
 *
 * @param req - Custom API request object
 * @param res - Custom API response object
 * @param options - CORS options
 */
export function setCorsHeadersForCustomAPI(
  req: NetlifyRequest,
  res: NetlifyResponse,
  options: {
    methods?: string;
    credentials?: boolean;
    maxAge?: string;
  } = {}
): void {
  const {
    methods = "POST, GET, OPTIONS",
    credentials = true,
    maxAge = "86400",
  } = options;

  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  // SECURITY: Explicit, separate validation checks for transparency and debugging
  const isExplicitlyAllowed = origin && allowedOrigins.includes(origin);
  const isValidatedOrigin = origin && validateOrigin(origin);

  // Log validation results for security auditing
  if (origin) {
    if (isExplicitlyAllowed) {
      console.log(
        `[CORS-Custom] Origin allowed via explicit allowlist: ${origin}`
      );
    } else if (isValidatedOrigin) {
      console.log(
        `[CORS-Custom] Origin allowed via validation function: ${origin}`
      );
    } else {
      console.warn(`[CORS-Custom] Origin rejected: ${origin}`);
    }
  }

  // Allow origin if it passes either validation method
  if (isExplicitlyAllowed || isValidatedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", maxAge);
  res.setHeader("Vary", "Origin");

  if (credentials) {
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

/**
 * Generic CORS response for any request/response format
 *
 * @param origin - Request origin
 * @param options - CORS options
 * @returns Headers object
 */
export function getCorsHeadersForAnyAPI(
  origin: string | undefined,
  options: {
    methods?: string;
    credentials?: boolean;
  } = {}
): Record<string, string> {
  const { methods = "POST, GET, OPTIONS", credentials = true } = options;

  return getCorsHeaders(origin, methods, credentials);
}
