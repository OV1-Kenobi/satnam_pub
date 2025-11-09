/**
 * Type declarations for Sentry server-side error tracking
 */

export interface SentryErrorContext {
  eventType?: string;
  verificationId?: string;
  userId?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, any>;
}

export function initializeSentry(): void;
export function captureSimpleProofError(
  error: Error | string,
  context: SentryErrorContext
): void;
export function addSimpleProofBreadcrumb(
  message: string,
  data?: Record<string, any>
): void;
export function startSimpleProofTransaction<T>(
  name: string,
  op: string,
  callback: () => T | Promise<T>
): T | Promise<T> | undefined;
