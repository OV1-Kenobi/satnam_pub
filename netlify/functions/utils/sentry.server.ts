/**
 * Sentry Error Tracking for Netlify Functions
 * Phase 2B-2 Day 15: Optional Enhancement 1
 *
 * Provides server-side error tracking for Netlify Functions using Sentry Node.js SDK
 *
 * Features:
 * - Error capture with full context (verificationId, userId, action, metadata)
 * - Performance monitoring for function execution
 * - Privacy-first error reporting (no PII)
 * - Environment-based configuration
 * - Custom error tags and breadcrumbs
 *
 * @compliance Privacy-first, zero-knowledge, no PII in error reports
 */

import * as Sentry from "@sentry/node";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface SentryErrorContext {
  eventType?: string;
  verificationId?: string;
  userId?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// SENTRY INITIALIZATION
// ============================================================================

let sentryInitialized = false;

/**
 * Initialize Sentry error tracking for Netlify Functions
 * Call this once at the start of each function handler
 */
export function initializeSentry(): void {
  // Only initialize once
  if (sentryInitialized) {
    return;
  }

  // Only initialize if explicitly enabled
  // FIXED: Use plain env var names (not VITE_*) for Netlify Functions (server-side)
  const sentryDsn = process.env.SENTRY_DSN;
  const sentryEnabled = process.env.SENTRY_ENABLED === "true";
  const environment = process.env.NODE_ENV || "development";

  if (!sentryDsn || !sentryEnabled) {
    console.log("ℹ️  Sentry error tracking is disabled for Netlify Functions");
    return;
  }

  try {
    Sentry.init({
      dsn: sentryDsn,
      environment,

      // Performance Monitoring
      tracesSampleRate: environment === "production" ? 0.1 : 1.0, // 10% in prod, 100% in dev

      // Privacy: Filter out sensitive data
      beforeSend(event, hint) {
        // Remove PII from error messages
        if (event.message) {
          event.message = sanitizeErrorMessage(event.message);
        }

        // Remove PII from exception values
        if (event.exception?.values) {
          event.exception.values = event.exception.values.map((exception) => ({
            ...exception,
            value: exception.value
              ? sanitizeErrorMessage(exception.value)
              : exception.value,
          }));
        }

        // Remove sensitive breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.filter((breadcrumb) => {
            const message = breadcrumb.message?.toLowerCase() || "";
            return (
              !message.includes("password") &&
              !message.includes("nsec") &&
              !message.includes("private") &&
              !message.includes("secret")
            );
          });
        }

        return event;
      },

      // Ignore certain errors
      ignoreErrors: [
        // Network errors (handled by application)
        "NetworkError",
        "Failed to fetch",
        "ECONNREFUSED",
        "ETIMEDOUT",
      ],

      // Release tracking
      // FIXED: Use plain env var name (not VITE_*) for Netlify Functions
      release: process.env.APP_VERSION || "unknown",
    });

    sentryInitialized = true;
    console.log("✅ Sentry error tracking initialized for Netlify Functions");
  } catch (error) {
    console.error("❌ Failed to initialize Sentry:", error);
  }
}

// ============================================================================
// ERROR CAPTURE HELPERS
// ============================================================================

/**
 * Capture an error with SimpleProof context
 */
export function captureSimpleProofError(
  error: Error | string,
  context: SentryErrorContext
): void {
  // Gracefully handle when Sentry is not initialized
  if (!sentryInitialized) {
    console.warn("Sentry not initialized, skipping error capture");
    return;
  }

  const errorMessage = typeof error === "string" ? error : error.message;

  Sentry.withScope((scope) => {
    // Add custom tags
    if (context.eventType) {
      scope.setTag("simpleproof.event_type", context.eventType);
    }
    if (context.verificationId) {
      scope.setTag("simpleproof.verification_id", context.verificationId);
    }
    if (context.component) {
      scope.setTag("component", context.component);
    }
    if (context.action) {
      scope.setTag("action", context.action);
    }

    // Add user context (privacy-safe: only user ID, no PII)
    if (context.userId) {
      scope.setUser({ id: context.userId });
    }

    // Add extra context
    if (context.metadata) {
      scope.setContext("simpleproof", sanitizeMetadata(context.metadata));
    }

    // Capture the error
    if (typeof error === "string") {
      Sentry.captureMessage(errorMessage, "error");
    } else {
      Sentry.captureException(error);
    }
  });
}

/**
 * Add breadcrumb for SimpleProof operations
 */
export function addSimpleProofBreadcrumb(
  message: string,
  data?: Record<string, any>
): void {
  // Gracefully handle when Sentry is not initialized
  if (!sentryInitialized) {
    return;
  }

  Sentry.addBreadcrumb({
    category: "simpleproof",
    message: sanitizeErrorMessage(message),
    data: data ? sanitizeMetadata(data) : undefined,
    level: "info",
  });
}

/**
 * Start a performance transaction with callback execution
 * FIXED: Accept callback to properly trace work within the span
 *
 * @param name - Transaction name
 * @param op - Operation type (e.g., 'http.server', 'db.query')
 * @param callback - Function to execute within the span
 * @returns Result of callback execution
 *
 * @example
 * const result = await startSimpleProofTransaction(
 *   'create-timestamp',
 *   'simpleproof.create',
 *   async () => {
 *     // Your code here
 *     return await createTimestamp(data);
 *   }
 * );
 */
export function startSimpleProofTransaction<T>(
  name: string,
  op: string,
  callback: () => T | Promise<T>
): T | Promise<T> | undefined {
  if (!sentryInitialized) {
    // Still execute callback even if Sentry is disabled
    return callback();
  }

  return Sentry.startSpan(
    {
      name,
      op,
    },
    callback
  );
}

// ============================================================================
// PRIVACY HELPERS
// ============================================================================

/**
 * Sanitize error message to remove PII
 */
function sanitizeErrorMessage(message: string): string {
  let sanitized = message;

  // Remove nsec keys
  sanitized = sanitized.replace(/nsec1[a-z0-9]{58}/gi, "[REDACTED_NSEC]");

  // Remove npub keys
  sanitized = sanitized.replace(/npub1[a-z0-9]{58}/gi, "[REDACTED_NPUB]");

  // Remove email addresses
  sanitized = sanitized.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "[REDACTED_EMAIL]"
  );

  // Remove potential passwords (common patterns)
  sanitized = sanitized.replace(
    /password[=:]\s*[^\s&]+/gi,
    "password=[REDACTED]"
  );

  // Remove JWT tokens
  sanitized = sanitized.replace(
    /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    "[REDACTED_JWT]"
  );

  return sanitized;
}

/**
 * Sanitize metadata object to remove PII
 */
function sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();

    // Skip sensitive keys
    if (
      lowerKey.includes("password") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("private") ||
      lowerKey.includes("nsec") ||
      lowerKey.includes("token")
    ) {
      sanitized[key] = "[REDACTED]";
      continue;
    }

    // Sanitize string values
    if (typeof value === "string") {
      sanitized[key] = sanitizeErrorMessage(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === "object" && item !== null
          ? sanitizeMetadata(item)
          : typeof item === "string"
          ? sanitizeErrorMessage(item)
          : item
      );
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { Sentry };
