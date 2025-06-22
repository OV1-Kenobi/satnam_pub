# Rate Limiter Fail-Open Monitoring System

## Overview

The fail-open monitoring system provides comprehensive tracking and alerting for scenarios where the rate limiter fails open due to database connectivity issues or other errors. This ensures security teams are immediately aware when rate limiting protections may be compromised.

## Architecture

### Core Components

1. **Fail-Open Event Logging**: Automatic logging of all fail-open scenarios
2. **Metrics Tracking**: In-memory counters and timestamps
3. **Alert System**: Configurable alert levels based on failure patterns
4. **Database Persistence**: All events stored in `security_audit_log` table

### Security Event Types

- `rate_limit_fail_open`: Individual fail-open events
- `rate_limit_fail_open_alert`: Critical alert notifications

## Implementation Details

### 1. Event Logging

Every fail-open scenario is automatically logged with:

```typescript
await logSecurityEvent("rate_limit_fail_open", {
  key, // Rate limit key (hashed for privacy)
  error: error.message, // Error details
  reason: "database_error", // Failure reason
  windowMs, // Rate limit window
  maxRequests, // Rate limit threshold
  totalFailOpenCount, // Running counter
});
```

### 2. Metrics Tracking

The system maintains real-time metrics:

```typescript
interface FailOpenMetrics {
  totalFailOpenCount: number; // Total failures since startup
  lastFailOpenTime: Date | null; // Timestamp of last failure
  isCurrentlyFailing: boolean; // True if failed within 5 minutes
  timeSinceLastFailure: number | null; // Milliseconds since last failure
}
```

### 3. Alert Levels

- **None**: No failures detected - system operating normally
- **Warning**: Some failures detected - monitor closely
- **Critical**: High frequency failures (>10 in 5 minutes) - immediate attention required

## Usage

### Monitoring Commands

```bash
# Generate comprehensive security report (includes fail-open status)
npm run security:report

# Monitor specifically for fail-open scenarios
npm run security:fail-open

# Monitor for active attacks (includes fail-open events)
npm run security:monitor
```

### Programmatic Access

```typescript
import {
  getFailOpenMetrics,
  monitorFailOpenScenarios,
  resetFailOpenMetrics,
} from "../lib/security/rate-limiter";

// Get current metrics
const metrics = getFailOpenMetrics();

// Check alert status
const status = await monitorFailOpenScenarios();
if (status.alertLevel === "critical") {
  // Take immediate action
}

// Reset counters (useful after resolving issues)
resetFailOpenMetrics();
```

## Database Schema

### Security Audit Log

Fail-open events are stored in the `security_audit_log` table:

```sql
CREATE TABLE security_audit_log (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  details JSONB NOT NULL,
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

### Event Details Structure

```json
{
  "key": "auth:192.168.1.1:a1b2c3d4...",
  "error": "connection timeout",
  "reason": "database_error",
  "windowMs": 900000,
  "maxRequests": 5,
  "totalFailOpenCount": 3
}
```

## Monitoring Integration

### Security Dashboard

The fail-open monitoring integrates with the security monitoring dashboard:

- **Overview Section**: Shows total fail-open events
- **Alert Section**: Displays current fail-open status
- **Detailed Metrics**: Shows failure patterns and timing
- **Recent Events**: Lists recent fail-open occurrences

### Automated Alerts

Critical scenarios trigger automatic alerts:

```typescript
// Critical alert example
{
  alertLevel: "critical",
  message: "🚨 CRITICAL: Rate limiter failing open frequently (15 times, last failure: 2024-01-15T10:30:00Z)",
  metrics: {
    totalFailOpenCount: 15,
    lastFailOpenTime: "2024-01-15T10:30:00Z",
    isCurrentlyFailing: true,
    timeSinceLastFailure: 120000
  }
}
```

## Operational Procedures

### When Fail-Open Events Occur

1. **Immediate Assessment**

   - Check database connectivity
   - Review error logs for patterns
   - Assess current system load

2. **Mitigation Steps**

   - Restore database connectivity if needed
   - Consider enabling emergency rate limiting
   - Monitor for exploitation attempts

3. **Post-Incident**
   - Review fail-open event logs
   - Analyze attack patterns during outage
   - Update monitoring thresholds if needed

### Regular Monitoring

- **Daily**: Check security reports for fail-open events
- **Weekly**: Review fail-open patterns and trends
- **Monthly**: Analyze fail-open metrics for system improvements

## Configuration

### Alert Thresholds

Current thresholds (configurable):

```typescript
// Critical: >10 failures in last 5 minutes
if (metrics.isCurrentlyFailing && metrics.totalFailOpenCount > 10)
  if (metrics.totalFailOpenCount > 0)
    // Warning: Any failures detected
    // Currently failing: Last failure within 5 minutes
    const isCurrentlyFailing = timeSinceLastFailure < 5 * 60 * 1000;
```

### Customization

Thresholds can be adjusted based on:

- System reliability requirements
- Database performance characteristics
- Attack pattern analysis
- Operational team capacity

## Testing

### Manual Testing

```bash
# Run fail-open monitoring test
npx ts-node scripts/test-fail-open-monitoring.ts
```

### Integration Testing

The system includes comprehensive tests for:

- Event logging accuracy
- Metrics calculation
- Alert threshold logic
- Database persistence

## Security Considerations

### Privacy Protection

- Rate limit keys are hashed before logging
- No sensitive user data is stored in logs
- IP addresses are logged for security analysis only

### Data Retention

- Fail-open events are retained for 30 days
- Automatic cleanup prevents log bloat
- Critical events may be archived separately

## Troubleshooting

### Common Issues

1. **No Events Logged**

   - Check database connectivity
   - Verify `security_audit_log` table exists
   - Review application permissions

2. **False Positives**

   - Adjust alert thresholds
   - Review database performance
   - Check network connectivity patterns

3. **Missing Alerts**
   - Verify monitoring functions are called
   - Check alert logic configuration
   - Review log retention settings

### Debug Commands

```bash
# Check current fail-open status
npm run security:fail-open

# Generate detailed security report
npm run security:report 24

# Query recent fail-open events
psql -c "SELECT * FROM security_audit_log WHERE event_type = 'rate_limit_fail_open' ORDER BY timestamp DESC LIMIT 10;"
```

## Future Enhancements

### Planned Features

1. **Real-time Notifications**

   - Webhook integration for critical alerts
   - Email notifications for security teams
   - Slack/Discord integration

2. **Advanced Analytics**

   - Failure pattern analysis
   - Predictive alerting
   - Performance correlation

3. **Automated Response**
   - Emergency rate limiting activation
   - Automatic database failover
   - Load balancer integration

### Integration Opportunities

- **Monitoring Systems**: Prometheus, Grafana, DataDog
- **Alerting Platforms**: PagerDuty, Opsgenie
- **Log Aggregation**: ELK Stack, Splunk
- **Security Tools**: SIEM integration

## Conclusion

The fail-open monitoring system provides essential visibility into rate limiter reliability and security posture. By tracking failures, generating alerts, and maintaining detailed logs, it ensures security teams can respond quickly to potential vulnerabilities while maintaining system availability.

Regular monitoring and proper configuration of alert thresholds are crucial for effective operation. The system is designed to fail safely while providing maximum visibility into security-relevant events.
