
/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = /** @type {Object} */ (import.meta);
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

/**
 * Security Monitoring and Rate Limiting Dashboard
 *
 * This script provides utilities for monitoring OTP security events,
 * rate limiting violations, and generating security reports.
 *
 * Configurable thresholds via environment variables:
 * - SECURITY_OTP_FAILURE_THRESHOLD: OTP failure threshold (default: 50)
 * - SECURITY_RATE_LIMIT_VIOLATION_THRESHOLD: Rate limit violation threshold (default: 100)
 * - SECURITY_SUSPICIOUS_IP_THRESHOLD: Suspicious IP count threshold (default: 5)
 * - SECURITY_TARGETED_ATTACK_THRESHOLD: Targeted attack attempts threshold (default: 20)
 */

import { monitorFailOpenScenarios } from '../lib/security/rate-limiter.js';
import { supabase } from "../lib/supabase";

interface SecurityMetrics {
  rateLimitViolations: number;
  otpFailures: number;
  suspiciousIPs: string[];
  topFailedAttempts: Array<{
    identifier: string;
    attempts: number;
    lastAttempt: string;
  }>;
  recentSecurityEvents: Array<{
    eventType: string;
    count: number;
    lastOccurrence: string;
  }>;
  failOpenEvents: number;
}

interface AttackThresholds {
  otpFailures: number;
  rateLimitViolations: number;
  suspiciousIpCount: number;
  targetedAttackAttempts: number;
}

const DEFAULT_THRESHOLDS: AttackThresholds = {
  otpFailures: parseInt(getEnvVar("SECURITY_OTP_FAILURE_THRESHOLD") || "50"),
  rateLimitViolations: parseInt(
    getEnvVar("SECURITY_RATE_LIMIT_VIOLATION_THRESHOLD") || "100"
  ),
  suspiciousIpCount: parseInt(
    getEnvVar("SECURITY_SUSPICIOUS_IP_THRESHOLD") || "5"
  ),
  targetedAttackAttempts: parseInt(
    getEnvVar("SECURITY_TARGETED_ATTACK_THRESHOLD") || "20"
  ),
};

/**
 * Get attack detection thresholds from environment variables or defaults
 */
export function getAttackThresholds(): AttackThresholds {
  return { ...DEFAULT_THRESHOLDS };
}

/**
 * Create custom attack thresholds
 */
export function createAttackThresholds(
  overrides: Partial<AttackThresholds>
): AttackThresholds {
  return { ...DEFAULT_THRESHOLDS, ...overrides };
}

/**
 * Get comprehensive security metrics
 */
export async function getSecurityMetrics(
  hoursBack: number = 24,
  suspiciousIpViolationThreshold: number = 10
): Promise<SecurityMetrics> {
  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  try {
    // Get rate limit violations
    const { data: violations, error: violationsError } = await supabase
      .from("security_rate_limit_violations")
      .select("*")
      .gte("violated_at", cutoffTime.toISOString());

    if (violationsError) {
      console.error("Error fetching rate limit violations:", violationsError);
    }

    // Get OTP failures
    const { data: otpFailures, error: otpError } = await supabase
      .from("security_audit_log")
      .select("*")
      .in("event_type", [
        "otp_verification_failed",
        "otp_max_attempts_exceeded",
      ])
      .gte("timestamp", cutoffTime.toISOString());

    if (otpError) {
      console.error("Error fetching OTP failures:", otpError);
    }

    // Get suspicious IPs (more than threshold violations)
    const ipCounts = new Map<string, number>();
    violations?.forEach((v) => {
      if (v.ip_address) {
        ipCounts.set(v.ip_address, (ipCounts.get(v.ip_address) || 0) + 1);
      }
    });

    const suspiciousIPs = Array.from(ipCounts.entries())
      .filter(([_, count]) => count > suspiciousIpViolationThreshold)
      .map(([ip, _]) => ip);

    // Get top failed attempts by rate limit key (identifiers are hashed for privacy)
    const keyViolationCounts = new Map<
      string,
      { count: number; lastAttempt: string }
    >();
    violations?.forEach((v) => {
      if (v.rate_limit_key) {
        const existing = keyViolationCounts.get(v.rate_limit_key);
        keyViolationCounts.set(v.rate_limit_key, {
          count: (existing?.count || 0) + 1,
          lastAttempt:
            v.violated_at > (existing?.lastAttempt || "")
              ? v.violated_at
              : existing?.lastAttempt || v.violated_at,
        });
      }
    });

    const topFailedAttempts = Array.from(keyViolationCounts.entries())
      .map(([rateLimitKey, data]) => ({
        identifier: rateLimitKey, // This is a hashed key, not raw identifier
        attempts: data.count,
        lastAttempt: data.lastAttempt,
      }))
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 10);

    // Get recent security events summary
    const { data: securityEvents, error: eventsError } = await supabase
      .from("security_audit_log")
      .select("event_type, timestamp")
      .gte("timestamp", cutoffTime.toISOString());

    if (eventsError) {
      console.error("Error fetching security events:", eventsError);
    }

    const eventCounts = new Map<
      string,
      { count: number; lastOccurrence: string }
    >();
    securityEvents?.forEach((event) => {
      const existing = eventCounts.get(event.event_type);
      eventCounts.set(event.event_type, {
        count: (existing?.count || 0) + 1,
        lastOccurrence:
          event.timestamp > (existing?.lastOccurrence || "")
            ? event.timestamp
            : existing?.lastOccurrence || event.timestamp,
      });
    });

    const recentSecurityEvents = Array.from(eventCounts.entries())
      .map(([eventType, data]) => ({
        eventType,
        count: data.count,
        lastOccurrence: data.lastOccurrence,
      }))
      .sort((a, b) => b.count - a.count);

    // Get fail-open events from security audit log
    const { data: failOpenEvents, error: failOpenError } = await supabase
      .from("security_audit_log")
      .select("*")
      .eq("event_type", "rate_limit_fail_open")
      .gte("timestamp", cutoffTime.toISOString());

    if (failOpenError) {
      console.error("Error fetching fail-open events:", failOpenError);
    }

    return {
      rateLimitViolations: violations?.length || 0,
      otpFailures: otpFailures?.length || 0,
      suspiciousIPs,
      topFailedAttempts,
      recentSecurityEvents,
      failOpenEvents: failOpenEvents?.length || 0,
    };
  } catch (error) {
    console.error("Error getting security metrics:", error);
    return {
      rateLimitViolations: 0,
      otpFailures: 0,
      suspiciousIPs: [],
      topFailedAttempts: [],
      recentSecurityEvents: [],
      failOpenEvents: 0,
    };
  }
}

/**
 * Generate security report
 */
export async function generateSecurityReport(
  hoursBack: number = 24
): Promise<void> {
  console.log(`\n🔒 Security Report - Last ${hoursBack} hours`);
  console.log("=".repeat(50));

  const metrics = await getSecurityMetrics(hoursBack);

  console.log(`\n📊 Overview:`);
  console.log(`  Rate Limit Violations: ${metrics.rateLimitViolations}`);
  console.log(`  OTP Failures: ${metrics.otpFailures}`);
  console.log(`  Suspicious IPs: ${metrics.suspiciousIPs.length}`);
  console.log(`  Fail-Open Events: ${metrics.failOpenEvents}`);

  if (metrics.suspiciousIPs.length > 0) {
    console.log(`\n🚨 Suspicious IP Addresses:`);
    metrics.suspiciousIPs.forEach((ip) => {
      console.log(`  - ${ip}`);
    });
  }

  if (metrics.topFailedAttempts.length > 0) {
    console.log(`\n🎯 Top Failed Attempts by Rate Limit Key (Privacy-Hashed):`);
    metrics.topFailedAttempts.forEach((attempt) => {
      console.log(
        `  - ${attempt.identifier}: ${attempt.attempts} attempts (last: ${new Date(attempt.lastAttempt).toLocaleString()})`
      );
    });
  }

  if (metrics.recentSecurityEvents.length > 0) {
    console.log(`\n📋 Security Events Summary:`);
    metrics.recentSecurityEvents.forEach((event) => {
      console.log(
        `  - ${event.eventType}: ${event.count} occurrences (last: ${new Date(event.lastOccurrence).toLocaleString()})`
      );
    });
  }

  // Check current fail-open status
  const failOpenStatus = await monitorFailOpenScenarios();
  console.log(`\n🛡️  Rate Limiter Fail-Open Status:`);
  console.log(`  ${failOpenStatus.message}`);

  if (failOpenStatus.alertLevel !== "none") {
    console.log(`  Alert Level: ${failOpenStatus.alertLevel.toUpperCase()}`);
    console.log(
      `  Total Fail-Open Count: ${failOpenStatus.metrics.totalFailOpenCount}`
    );
    if (failOpenStatus.metrics.lastFailOpenTime) {
      console.log(
        `  Last Failure: ${failOpenStatus.metrics.lastFailOpenTime.toLocaleString()}`
      );
    }
    if (failOpenStatus.metrics.timeSinceLastFailure !== null) {
      const minutesAgo = Math.floor(
        failOpenStatus.metrics.timeSinceLastFailure / (1000 * 60)
      );
      console.log(`  Time Since Last Failure: ${minutesAgo} minutes ago`);
    }
  }

  console.log(`\n✅ Report generated at: ${new Date().toLocaleString()}`);
}

/**
 * Clean up old security data
 */
export async function cleanupSecurityData(): Promise<void> {
  console.log("\n🧹 Cleaning up old security data...");

  try {
    // Clean up rate limits
    const { data: rateLimitCleanup, error: rateLimitError } =
      await supabase.rpc("cleanup_rate_limits");

    if (rateLimitError) {
      console.error("Error cleaning up rate limits:", rateLimitError);
    } else {
      console.log(
        `  ✅ Cleaned up ${rateLimitCleanup || 0} old rate limit entries`
      );
    }

    // Clean up audit logs (keep 30 days)
    const { data: auditCleanup, error: auditError } = await supabase.rpc(
      "cleanup_security_audit_log"
    );

    if (auditError) {
      console.error("Error cleaning up audit logs:", auditError);
    } else {
      console.log(`  ✅ Cleaned up ${auditCleanup || 0} old audit log entries`);
    }

    console.log("  🎉 Security data cleanup completed");
  } catch (error) {
    console.error("Error during security cleanup:", error);
  }
}

/**
 * Monitor for active attacks
 */
export async function monitorActiveAttacks(
  thresholds: AttackThresholds = DEFAULT_THRESHOLDS
): Promise<void> {
  console.log("\n🔍 Monitoring for active attacks...");
  console.log(
    `Using thresholds: OTP failures: ${thresholds.otpFailures}, Rate limit violations: ${thresholds.rateLimitViolations}, Suspicious IPs: ${thresholds.suspiciousIpCount}, Targeted attacks: ${thresholds.targetedAttackAttempts}`
  );

  const metrics = await getSecurityMetrics(1, 10); // Last hour, using default 10 violations for suspicious IP detection

  // Check for high rate of failures
  if (metrics.otpFailures > thresholds.otpFailures) {
    console.log(
      `🚨 HIGH ALERT: ${metrics.otpFailures} OTP failures in the last hour! (threshold: ${thresholds.otpFailures})`
    );
  }

  if (metrics.rateLimitViolations > thresholds.rateLimitViolations) {
    console.log(
      `🚨 HIGH ALERT: ${metrics.rateLimitViolations} rate limit violations in the last hour! (threshold: ${thresholds.rateLimitViolations})`
    );
  }

  // Check for fail-open events
  if (metrics.failOpenEvents > 0) {
    console.log(
      `🚨 SECURITY ALERT: ${metrics.failOpenEvents} rate limiter fail-open events in the last hour!`
    );
    console.log(
      "  This indicates database connectivity issues or rate limiter failures."
    );
    console.log("  Security controls may be bypassed during these events.");
  }

  // Check for distributed attacks
  if (metrics.suspiciousIPs.length > thresholds.suspiciousIpCount) {
    console.log(
      `🚨 DISTRIBUTED ATTACK DETECTED: ${metrics.suspiciousIPs.length} suspicious IPs (threshold: ${thresholds.suspiciousIpCount})`
    );
    console.log("Suspicious IPs:", metrics.suspiciousIPs.join(", "));
  }

  // Check for targeted attacks
  const highVolumeTargets = metrics.topFailedAttempts.filter(
    (attempt) => attempt.attempts > thresholds.targetedAttackAttempts
  );
  if (highVolumeTargets.length > 0) {
    console.log(
      `🚨 TARGETED ATTACK DETECTED: High volume attacks on specific rate limit keys`
    );
    highVolumeTargets.forEach((target) => {
      console.log(
        `  - Rate Limit Key ${target.identifier}: ${target.attempts} attempts`
      );
    });
  }

  if (
    metrics.otpFailures <= Math.floor(thresholds.otpFailures * 0.2) &&
    metrics.rateLimitViolations <=
      Math.floor(thresholds.rateLimitViolations * 0.2) &&
    metrics.suspiciousIPs.length === 0 &&
    metrics.failOpenEvents === 0
  ) {
    console.log("✅ No active attacks detected");
  }
}

/**
 * Monitor fail-open scenarios specifically
 */
export async function monitorFailOpenStatus(): Promise<void> {
  console.log("\n🛡️  Monitoring Rate Limiter Fail-Open Scenarios...");

  const failOpenStatus = await monitorFailOpenScenarios();
  console.log(`Status: ${failOpenStatus.message}`);

  if (failOpenStatus.alertLevel === "critical") {
    console.log("🚨 CRITICAL: Immediate attention required!");
    console.log("  - Database connectivity issues detected");
    console.log("  - Rate limiting may be compromised");
    console.log("  - Security controls are failing open");
    console.log(
      "  - Consider enabling emergency rate limiting or maintenance mode"
    );
  } else if (failOpenStatus.alertLevel === "warning") {
    console.log("⚠️  WARNING: Monitor closely");
    console.log("  - Some rate limiter failures detected");
    console.log("  - Check database connectivity and performance");
    console.log("  - Review error logs for patterns");
  } else {
    console.log("✅ Rate limiter operating normally");
  }

  // Show detailed metrics
  const metrics = failOpenStatus.metrics;
  console.log(`\nDetailed Metrics:`);
  console.log(`  Total Fail-Open Count: ${metrics.totalFailOpenCount}`);
  console.log(
    `  Currently Failing: ${metrics.isCurrentlyFailing ? "Yes" : "No"}`
  );

  if (metrics.lastFailOpenTime) {
    console.log(`  Last Failure: ${metrics.lastFailOpenTime.toLocaleString()}`);
  }

  if (metrics.timeSinceLastFailure !== null) {
    const minutesAgo = Math.floor(metrics.timeSinceLastFailure / (1000 * 60));
    console.log(`  Time Since Last Failure: ${minutesAgo} minutes ago`);
  }

  // Get recent fail-open events from database
  const recentFailOpenEvents = await supabase
    .from("security_audit_log")
    .select("details, timestamp")
    .eq("event_type", "rate_limit_fail_open")
    .gte("timestamp", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order("timestamp", { ascending: false })
    .limit(10);

  if (recentFailOpenEvents.data && recentFailOpenEvents.data.length > 0) {
    console.log(`\n📋 Recent Fail-Open Events (Last 24 hours):`);
    recentFailOpenEvents.data.forEach((event, index) => {
      const details = JSON.parse(event.details);
      console.log(
        `  ${index + 1}. ${new Date(event.timestamp).toLocaleString()}`
      );
      console.log(`     Reason: ${details.reason || "unknown"}`);
      console.log(`     Error: ${details.error || "unknown"}`);
      if (details.key) {
        console.log(`     Rate Limit Key: ${details.key.substring(0, 20)}...`);
      }
    });
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  const hours = parseInt(process.argv[3]) || 24;

  switch (command) {
    case "report":
      generateSecurityReport(hours);
      break;
    case "cleanup":
      cleanupSecurityData();
      break;
    case "monitor":
      monitorActiveAttacks();
      break;
    case "fail-open":
      monitorFailOpenStatus();
      break;
    default:
      console.log("Usage:");
      console.log(
        "  npm run security:report [hours]  - Generate security report"
      );
      console.log(
        "  npm run security:cleanup         - Clean up old security data"
      );
      console.log(
        "  npm run security:monitor         - Monitor for active attacks"
      );
      console.log(
        "  npm run security:fail-open       - Monitor rate limiter fail-open scenarios"
      );
  }
}
