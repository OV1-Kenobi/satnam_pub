/**
 * NFC MFA Production Monitoring & Metrics
 * Tracks NFC MFA events, performance metrics, and alerts for production deployment
 * 
 * Metrics Tracked:
 * - NFC signature collection success/failure rates
 * - Verification latency (P-256 ECDSA)
 * - Policy enforcement decisions
 * - High-value operation detection
 * - Guardian approval response times
 * - Audit log entries
 */

export interface NfcMfaMetrics {
  timestamp: number;
  eventType: string;
  familyId?: string;
  operationHash?: string;
  success: boolean;
  latencyMs?: number;
  errorCategory?: string;
}

export interface NfcMfaAlert {
  timestamp: number;
  severity: "info" | "warning" | "error" | "critical";
  message: string;
  context: Record<string, unknown>;
}

// In-memory metrics buffer (production: send to monitoring service)
const metricsBuffer: NfcMfaMetrics[] = [];
const alertsBuffer: NfcMfaAlert[] = [];

// Configuration
const METRICS_BUFFER_SIZE = 1000;
const ALERT_BUFFER_SIZE = 100;
const FLUSH_INTERVAL_MS = 60000; // 1 minute

/**
 * Record NFC MFA metric
 */
export function recordNfcMfaMetric(metric: NfcMfaMetrics): void {
  metricsBuffer.push(metric);

  // Flush if buffer exceeds size
  if (metricsBuffer.length >= METRICS_BUFFER_SIZE) {
    flushMetrics();
  }

  // Alert on critical failures
  if (!metric.success && metric.errorCategory === "signature_invalid") {
    recordAlert({
      timestamp: Date.now(),
      severity: "warning",
      message: "NFC signature verification failed",
      context: {
        operationHash: metric.operationHash?.substring(0, 6) + "...",
        latencyMs: metric.latencyMs,
      },
    });
  }
}

/**
 * Record NFC MFA alert
 */
export function recordAlert(alert: NfcMfaAlert): void {
  alertsBuffer.push(alert);

  // Log critical alerts immediately
  if (alert.severity === "critical") {
    console.error("[NFC-MFA-ALERT] CRITICAL:", alert.message, alert.context);
  } else if (alert.severity === "error") {
    console.error("[NFC-MFA-ALERT] ERROR:", alert.message, alert.context);
  } else if (alert.severity === "warning") {
    console.warn("[NFC-MFA-ALERT] WARNING:", alert.message, alert.context);
  }

  // Flush if buffer exceeds size
  if (alertsBuffer.length >= ALERT_BUFFER_SIZE) {
    flushAlerts();
  }
}

/**
 * Flush metrics to monitoring service
 * In production: send to Datadog, CloudWatch, or similar
 */
export function flushMetrics(): void {
  if (metricsBuffer.length === 0) return;

  const metrics = metricsBuffer.splice(0, metricsBuffer.length);

  // Calculate aggregated metrics
  const successCount = metrics.filter((m) => m.success).length;
  const failureCount = metrics.filter((m) => !m.success).length;
  const avgLatency =
    metrics.reduce((sum, m) => sum + (m.latencyMs || 0), 0) / metrics.length;

  console.log("[NFC-MFA-METRICS] Flushed", {
    count: metrics.length,
    successRate: ((successCount / metrics.length) * 100).toFixed(2) + "%",
    avgLatencyMs: avgLatency.toFixed(2),
    failureCount,
  });

  // TODO: Send to monitoring service
  // await monitoringService.recordMetrics(metrics);
}

/**
 * Flush alerts to monitoring service
 */
export function flushAlerts(): void {
  if (alertsBuffer.length === 0) return;

  const alerts = alertsBuffer.splice(0, alertsBuffer.length);

  console.log("[NFC-MFA-ALERTS] Flushed", {
    count: alerts.length,
    critical: alerts.filter((a) => a.severity === "critical").length,
    errors: alerts.filter((a) => a.severity === "error").length,
    warnings: alerts.filter((a) => a.severity === "warning").length,
  });

  // TODO: Send to monitoring service
  // await monitoringService.recordAlerts(alerts);
}

/**
 * Get current metrics buffer (for testing/debugging)
 */
export function getMetricsBuffer(): NfcMfaMetrics[] {
  return [...metricsBuffer];
}

/**
 * Get current alerts buffer (for testing/debugging)
 */
export function getAlertsBuffer(): NfcMfaAlert[] {
  return [...alertsBuffer];
}

/**
 * Clear buffers (for testing)
 */
export function clearBuffers(): void {
  metricsBuffer.length = 0;
  alertsBuffer.length = 0;
}

/**
 * Start periodic metrics flush
 * Call once at application startup
 */
export function startMetricsFlush(): () => void {
  const interval = setInterval(() => {
    flushMetrics();
    flushAlerts();
  }, FLUSH_INTERVAL_MS);

  // Return cleanup function
  return () => clearInterval(interval);
}

/**
 * Calculate NFC MFA success rate from metrics
 */
export function calculateSuccessRate(metrics: NfcMfaMetrics[]): number {
  if (metrics.length === 0) return 100;
  const successCount = metrics.filter((m) => m.success).length;
  return (successCount / metrics.length) * 100;
}

/**
 * Calculate average latency from metrics
 */
export function calculateAverageLatency(metrics: NfcMfaMetrics[]): number {
  if (metrics.length === 0) return 0;
  const totalLatency = metrics.reduce((sum, m) => sum + (m.latencyMs || 0), 0);
  return totalLatency / metrics.length;
}

/**
 * Get metrics by event type
 */
export function getMetricsByEventType(
  metrics: NfcMfaMetrics[],
  eventType: string
): NfcMfaMetrics[] {
  return metrics.filter((m) => m.eventType === eventType);
}

/**
 * Get failure metrics
 */
export function getFailureMetrics(metrics: NfcMfaMetrics[]): NfcMfaMetrics[] {
  return metrics.filter((m) => !m.success);
}

