/**
 * Sentry Error Tracking Integration
 * Phase 2B-2 Day 15: Error Monitoring, Logging & Analytics Enhancement
 *
 * Provides centralized error tracking and monitoring for SimpleProof integration
 * and the entire application using Sentry.
 *
 * Features:
 * - Error capture with full context (eventType, verificationId, userId)
 * - Performance monitoring
 * - Source maps for production debugging
 * - Privacy-first error reporting (no PII)
 * - Environment-based configuration
 * - Custom error tags and breadcrumbs
 *
 * @compliance Privacy-first, zero-knowledge, no PII in error reports
 */

import * as Sentry from "@sentry/react";
import React from "react";

// ============================================================================
// INITIALIZATION STATE
// ============================================================================

// Track if Sentry is initialized
let isSentryInitialized = false;

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

/**
 * Initialize Sentry error tracking
 * Call this once at application startup
 */
export function initializeSentry(): void {
  // Only initialize in production or if explicitly enabled
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  const sentryEnabled = import.meta.env.VITE_SENTRY_ENABLED === "true";
  const environment = import.meta.env.MODE || "development";

  if (!sentryDsn || !sentryEnabled) {
    console.log("ℹ️  Sentry error tracking is disabled");
    return;
  }

  try {
    Sentry.init({
      dsn: sentryDsn,
      environment,

      // Performance Monitoring
      tracesSampleRate: environment === "production" ? 0.1 : 1.0, // 10% in prod, 100% in dev

      // Integrations
      integrations: [
        Sentry.browserTracingIntegration(),
        // Note: Replay integration removed - sample rates are 0.0 for privacy
      ],

      // Privacy: Filter out sensitive data
      beforeSend(event) {
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
            // Filter out breadcrumbs with sensitive data
            const message = breadcrumb.message?.toLowerCase() || "";
            const dataStr = breadcrumb.data
              ? JSON.stringify(breadcrumb.data).toLowerCase()
              : "";
            return (
              !message.includes("password") &&
              !message.includes("nsec") &&
              !message.includes("private") &&
              !message.includes("secret") &&
              !dataStr.includes("password") &&
              !dataStr.includes("nsec") &&
              !dataStr.includes("private") &&
              !dataStr.includes("secret")
            );
          });
        }

        return event;
      },

      // Ignore certain errors
      ignoreErrors: [
        // Browser extension errors
        "Extension context invalidated",
        "message channel closed",
        "dynastic-sovereignty",

        // Network errors (handled by application)
        "NetworkError",
        "Failed to fetch",

        // Nostr extension errors
        "User rejected",
        "User cancelled",
      ],

      // Release tracking
      release: import.meta.env.VITE_APP_VERSION || "unknown",
    });

    isSentryInitialized = true;
    console.log("✅ Sentry error tracking initialized");
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
  // Gracefully handle when Sentry is not initialized (e.g., in tests)
  if (!isSentryInitialized) {
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
  // Gracefully handle when Sentry is not initialized (e.g., in tests)
  if (!isSentryInitialized) {
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
 * Start a performance transaction
 * Wraps an operation with Sentry performance tracing
 */
export function startSimpleProofTransaction<T>(
  name: string,
  op: string,
  callback: () => T | Promise<T>
): T | Promise<T> | undefined {
  if (!isSentryInitialized) {
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

/**
 * Set user context (privacy-safe)
 */
export function setUserContext(userId: string): void {
  if (!isSentryInitialized) {
    return;
  }
  Sentry.setUser({ id: userId });
}

/**
 * Clear user context (on logout)
 */
export function clearUserContext(): void {
  if (!isSentryInitialized) {
    return;
  }
  Sentry.setUser(null);
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
      sanitized[key] = value.map((item) => {
        if (typeof item === "string") {
          return sanitizeErrorMessage(item);
        } else if (typeof item === "object" && item !== null) {
          return sanitizeMetadata(item);
        }
        return item;
      });
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ============================================================================
// ERROR BOUNDARY INTEGRATION
// ============================================================================

/**
 * Create Sentry error boundary wrapper
 * Provides a safe fallback for test environments where Sentry isn't loaded
 */
export const SentryErrorBoundary = Sentry.ErrorBoundary
  ? Sentry.ErrorBoundary
  : ((({ children }: { children: React.ReactNode }) =>
      children) as React.ComponentType<{ children: React.ReactNode }>);

/**
 * Wrap component with Sentry error boundary
 * Returns original component if Sentry is not available (e.g., in tests)
 */
export function withSentryErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactElement
): React.ComponentType<P> {
  // Return original component if Sentry is not available (test environment)
  if (!isSentryInitialized || !Sentry.withErrorBoundary) {
    return Component;
  }

  return Sentry.withErrorBoundary(Component, {
    fallback,
    showDialog: false, // Don't show Sentry dialog (privacy)
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export { Sentry };
