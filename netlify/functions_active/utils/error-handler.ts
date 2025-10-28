/**
 * Standardized Error Handling Utility
 * Provides consistent error handling and response formatting across all Netlify Functions
 *
 * Features:
 * - Production-safe error messages (no information disclosure)
 * - Request ID tracking for debugging
 * - Sentry integration for error capture
 * - Generic error message mapping
 * - Structured error logging
 * - Security headers included in all responses
 */

import { getEnvVar } from "./env.js";

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

/**
 * Error context for logging and debugging
 */
export interface ErrorContext {
  requestId?: string;
  userId?: string;
  endpoint?: string;
  method?: string;
  timestamp?: Date;
  severity?: ErrorSeverity;
  [key: string]: unknown;
}

/**
 * Error response structure
 */
export interface ErrorResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Generic error messages for different HTTP status codes
 * Prevents information disclosure by using generic messages
 */
const GENERIC_ERROR_MESSAGES: Record<number, string> = {
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
};

/**
 * Generate unique request ID for tracking
 *
 * @returns Request ID (UUID format)
 */
export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get generic error message for HTTP status code
 * Prevents information disclosure
 *
 * @param status - HTTP status code
 * @returns Generic error message
 */
export function getGenericErrorMessage(status: number): string {
  return GENERIC_ERROR_MESSAGES[status] || "An error occurred";
}

/**
 * Create error response with security headers
 *
 * @param status - HTTP status code
 * @param message - Error message (should be generic)
 * @param requestId - Request ID for tracking
 * @param origin - Request origin for CORS
 * @returns Error response object
 */
export function createErrorResponse(
  status: number,
  message?: string,
  requestId?: string,
  origin?: string
): ErrorResponse {
  const errorMessage = message || getGenericErrorMessage(status);
  const reqId = requestId || generateRequestId();

  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": reqId,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      ...(origin && { "Access-Control-Allow-Origin": origin }),
    },
    body: JSON.stringify({
      success: false,
      error: errorMessage,
      requestId: reqId,
    }),
  };
}

/**
 * Create validation error response
 * Used for 400 Bad Request errors
 *
 * @param message - Validation error message
 * @param requestId - Request ID for tracking
 * @param origin - Request origin for CORS
 * @returns Error response object
 */
export function createValidationErrorResponse(
  message: string = "Invalid request",
  requestId?: string,
  origin?: string
): ErrorResponse {
  return createErrorResponse(400, message, requestId, origin);
}

/**
 * Create authentication error response
 * Used for 401 Unauthorized errors
 *
 * @param message - Error message (default: "Unauthorized")
 * @param requestId - Request ID for tracking
 * @param origin - Request origin for CORS
 * @returns Error response object
 */
export function createAuthErrorResponse(
  message: string = "Unauthorized",
  requestId?: string,
  origin?: string
): ErrorResponse {
  return createErrorResponse(401, message, requestId, origin);
}

/**
 * Create authorization error response
 * Used for 403 Forbidden errors
 *
 * @param message - Error message (default: "Forbidden")
 * @param requestId - Request ID for tracking
 * @param origin - Request origin for CORS
 * @returns Error response object
 */
export function createAuthzErrorResponse(
  message: string = "Forbidden",
  requestId?: string,
  origin?: string
): ErrorResponse {
  return createErrorResponse(403, message, requestId, origin);
}

/**
 * Create not found error response
 * Used for 404 Not Found errors
 *
 * @param message - Error message (default: "Not found")
 * @param requestId - Request ID for tracking
 * @param origin - Request origin for CORS
 * @returns Error response object
 */
export function createNotFoundErrorResponse(
  message: string = "Not found",
  requestId?: string,
  origin?: string
): ErrorResponse {
  return createErrorResponse(404, message, requestId, origin);
}

/**
 * Create rate limit error response
 * Used for 429 Too Many Requests errors
 *
 * @param requestId - Request ID for tracking
 * @param origin - Request origin for CORS
 * @returns Error response object
 */
export function createRateLimitErrorResponse(
  requestId?: string,
  origin?: string
): ErrorResponse {
  return createErrorResponse(429, "Too many requests", requestId, origin);
}

/**
 * Create server error response
 * Used for 500 Internal Server Error
 *
 * @param requestId - Request ID for tracking
 * @param origin - Request origin for CORS
 * @returns Error response object
 */
export function createServerErrorResponse(
  requestId?: string,
  origin?: string
): ErrorResponse {
  return createErrorResponse(500, "Server error", requestId, origin);
}

/**
 * Log error with context
 * Logs detailed error information server-side only
 * Never logs sensitive data (passwords, tokens, keys)
 *
 * @param error - Error object
 * @param context - Error context
 */
export function logError(error: unknown, context: ErrorContext = {}): void {
  const timestamp = context.timestamp || new Date();
  const severity = context.severity || ErrorSeverity.MEDIUM;

  // Extract error message safely
  let errorMessage = "Unknown error";
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === "string") {
    errorMessage = error;
  }

  // Log structured error (never log sensitive data)
  console.error(
    JSON.stringify({
      timestamp: timestamp.toISOString(),
      severity,
      requestId: context.requestId,
      userId: context.userId,
      endpoint: context.endpoint,
      method: context.method,
      error: errorMessage,
      // Note: Do NOT include stack trace, sensitive data, or full error object
    })
  );
}

/**
 * Capture error with Sentry (if available)
 * Sends error to Sentry for monitoring and alerting
 *
 * @param error - Error object
 * @param context - Error context
 */
export async function captureError(
  error: unknown,
  context: ErrorContext = {}
): Promise<void> {
  try {
    // Check if Sentry is configured
    const sentryDsn = getEnvVar("SENTRY_DSN");
    if (!sentryDsn) {
      return; // Sentry not configured
    }

    // Import Sentry dynamically to avoid bundle bloat
    const Sentry = await import("@sentry/node");

    // Set context
    if (context.requestId) {
      Sentry.setTag("requestId", context.requestId);
    }
    if (context.userId) {
      Sentry.setTag("userId", context.userId);
    }
    if (context.endpoint) {
      Sentry.setTag("endpoint", context.endpoint);
    }
    if (context.severity) {
      Sentry.captureException(error, {
        level: context.severity as any,
      });
    } else {
      // Capture exception
      Sentry.captureException(error);
    }
  } catch (sentryError) {
    console.error("Failed to capture error with Sentry:", sentryError);
  }
}

/**
 * Handle error and return response
 * Comprehensive error handling with logging and Sentry capture
 *
 * @param error - Error object
 * @param status - HTTP status code
 * @param context - Error context
 * @param origin - Request origin for CORS
 * @returns Error response object
 */
export async function handleError(
  error: unknown,
  status: number = 500,
  context: ErrorContext = {},
  origin?: string
): Promise<ErrorResponse> {
  // Log error
  logError(error, { ...context, severity: ErrorSeverity.HIGH });

  // Capture with Sentry
  await captureError(error, { ...context, severity: ErrorSeverity.HIGH });

  // Return generic error response
  return createErrorResponse(
    status,
    getGenericErrorMessage(status),
    context.requestId,
    origin
  );
}

/**
 * Validate required fields
 * Returns error response if any required field is missing
 *
 * @param data - Data object to validate
 * @param requiredFields - Array of required field names
 * @param requestId - Request ID for tracking
 * @param origin - Request origin for CORS
 * @returns Error response if validation fails, null if valid
 */
export function validateRequiredFields(
  data: Record<string, unknown>,
  requiredFields: string[],
  requestId?: string,
  origin?: string
): ErrorResponse | null {
  for (const field of requiredFields) {
    if (!(field in data) || data[field] === undefined || data[field] === null) {
      return createValidationErrorResponse(
        `Missing required field: ${field}`,
        requestId,
        origin
      );
    }
  }

  return null;
}

/**
 * Validate field type
 * Returns error response if field type doesn't match
 *
 * @param data - Data object
 * @param field - Field name
 * @param expectedType - Expected type name
 * @param requestId - Request ID for tracking
 * @param origin - Request origin for CORS
 * @returns Error response if validation fails, null if valid
 */
export function validateFieldType(
  data: Record<string, unknown>,
  field: string,
  expectedType: string,
  requestId?: string,
  origin?: string
): ErrorResponse | null {
  const value = data[field];
  const actualType = typeof value;

  if (actualType !== expectedType) {
    return createValidationErrorResponse(
      `Invalid type for field ${field}: expected ${expectedType}, got ${actualType}`,
      requestId,
      origin
    );
  }

  return null;
}
