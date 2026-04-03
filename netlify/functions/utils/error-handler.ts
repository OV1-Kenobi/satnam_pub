/**
 * Error handling utilities for Netlify Functions
 * Provides standardized error responses and logging
 */

import { logError } from "./logging";

export interface EconomicFailureHint {
  reason:
    | "INSUFFICIENT_FUNDS"
    | "INVALID_PAYMENT"
    | "EXPIRED_TOKEN"
    | "INVALID_TOKEN";
  required_sats?: number;
  suggested_action:
    | "BUY_TOKENS"
    | "RESUBMIT_PAYMENT"
    | "REFRESH_TOKEN"
    | "CONTACT_SUPPORT";
  details: string;
}

export interface ErrorResponse {
  error: string;
  economic_failure?: EconomicFailureHint;
  request_id?: string;
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: string,
  economic_failure?: EconomicFailureHint,
  request_id?: string,
): ErrorResponse {
  return {
    error,
    economic_failure,
    request_id,
  };
}

/**
 * Generate a unique request ID for tracking
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Log an error with context
 */
export function logErrorWithContext(
  error: Error | string,
  context?: {
    component?: string;
    action?: string;
    userId?: string;
    requestId?: string;
    metadata?: Record<string, any>;
  },
): void {
  if (typeof error === "string") {
    error = new Error(error);
  }

  logError(error.message, {
    ...context,
    metadata: {
      ...context?.metadata,
      stack: error.stack,
    },
  });
}
