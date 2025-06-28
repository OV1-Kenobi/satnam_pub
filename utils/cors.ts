import { Request, Response } from "express";
import { ApiRequest, ApiResponse } from "../types/api";
import { getCorsHeaders, validateOrigin } from "./auth-crypto";

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
  if (process.env.NODE_ENV === "production") {
    return [
      process.env.FRONTEND_URL || "https://satnam.pub",
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
 * @param req - Express request object
 * @param res - Express response object
 * @param options - CORS options
 */
export function setCorsHeaders(
  req: Request,
  res: Response,
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

  // Check if origin is allowed
  const isOriginAllowed =
    origin && (allowedOrigins.includes(origin) || validateOrigin(origin)); // Use shared validation logic

  if (isOriginAllowed) {
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
 * @param req - Express request object
 * @param res - Express response object
 * @param options - CORS options
 */
export function setCorsHeadersFromShared(
  req: Request,
  res: Response,
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
  req: ApiRequest,
  res: ApiResponse,
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

  // Check if origin is allowed
  const isOriginAllowed =
    origin && (allowedOrigins.includes(origin) || validateOrigin(origin));

  if (isOriginAllowed) {
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
