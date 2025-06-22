# Enhanced OTP Security Implementation

## Overview

This document outlines the comprehensive security measures implemented for the OTP (One-Time Password) authentication system in the Satnam.pub Family Banking platform. The implementation includes multiple layers of rate limiting, progressive delays, comprehensive logging, and monitoring capabilities.

## Security Layers

### 1. Multi-Layer Rate Limiting

#### Memory-Based Rate Limiting

- **Purpose**: Fast, in-memory rate limiting for immediate protection
- **Implementation**: `MemoryRateLimiter` class in `lib/security/rate-limiter.ts`
- **Cleanup**: Automatic cleanup every 5 minutes

#### Database-Backed Rate Limiting

- **Purpose**: Persistent rate limiting that survives server restarts
- **Implementation**: `DatabaseRateLimiter` class with PostgreSQL backend
- **Benefits**:
  - Distributed rate limiting across multiple server instances
  - Persistent across server restarts
  - Comprehensive violation logging

### 2. OTP-Specific Rate Limits

#### OTP Initiation Limits

- **User-specific**: 3 OTP requests per 5 minutes per user account
- **IP-based**: 10 OTP requests per 15 minutes per IP address
- **Database-backed**: 3 requests per 5 minutes (persistent)

#### OTP Verification Limits

- **User-specific**: 10 verification attempts per 15 minutes per user
- **IP-based**: 50 verification attempts per 15 minutes per IP
- **Database-backed**: 15 attempts per 15 minutes (persistent)
- **Per-OTP**: Maximum 3 attempts per individual OTP code

### 3. Progressive Delays

Progressive delays are applied to failed OTP verification attempts:

```typescript
const PROGRESSIVE_DELAYS = [0, 1000, 2000, 5000, 10000]; // 0s, 1s, 2s, 5s, 10s
```

- **1st attempt**: No delay
- **2nd attempt**: 1 second delay
- **3rd attempt**: 2 seconds delay
- **4th attempt**: 5 seconds delay
- **5th+ attempts**: 10 seconds delay

## Database Schema

### Rate Limiting Tables

#### `security_rate_limits`

```sql
CREATE TABLE security_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_limit_key TEXT NOT NULL,
    identifier TEXT,
    hit_count INTEGER DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `security_rate_limit_violations`

```sql
CREATE TABLE security_rate_limit_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_limit_key TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    identifier TEXT,
    violated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `security_audit_log`

```sql
CREATE TABLE security_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

### Database Functions

#### `check_rate_limit()`

- Atomically checks and increments rate limit counters
- Cleans up expired entries
- Returns total hit count for the current window

#### `cleanup_rate_limits()`

- Removes old rate limit entries (24+ hours old)
- Removes old violation logs
- Scheduled to run automatically

## Security Event Logging

### Event Types Logged

1. **`otp_initiate_validation_failed`**: Invalid request data for OTP initiation
2. **`otp_verification_failed`**: Failed OTP verification attempt
3. **`otp_max_attempts_exceeded`**: Maximum attempts exceeded for an OTP
4. **`otp_verification_success`**: Successful OTP verification

### Log Data Structure

Each security event includes:

- Event type
- Detailed context (JSONB)
- IP address
- User agent
- Timestamp
- User identifier (when available)

## API Endpoint Protection

### OTP Initiation Endpoint

```
POST /api/auth/otp/initiate
```

**Rate Limiting Layers:**

1. `authLimiter` - Basic IP-based auth limiting (10 requests/15 min)
2. `otpInitiateRateLimit` - User-specific limiting (3 requests/5 min)
3. `otpIPRateLimit` - IP-based OTP limiting (10 requests/15 min)
4. `dbOtpInitiateLimit` - Database-backed persistent limiting

### OTP Verification Endpoint

```
POST /api/auth/otp/verify
```

**Rate Limiting Layers:**

1. `authLimiter` - Basic IP-based auth limiting
2. `otpVerifyRateLimit` - User-specific limiting (10 attempts/15 min)
3. `otpVerifyIPRateLimit` - IP-based limiting (50 attempts/15 min)
4. `dbOtpVerifyLimit` - Database-backed persistent limiting

## Security Monitoring

### Real-time Monitoring

The system provides comprehensive monitoring capabilities through the `security-monitoring.ts` script:

#### Security Metrics

- Rate limit violations count
- OTP failure count
- Suspicious IP addresses (>10 violations)
- Top failed attempts by user
- Recent security events summary

#### Active Attack Detection

- High rate of OTP failures (>50/hour)
- High rate of rate limit violations (>100/hour)
- Distributed attacks (>5 suspicious IPs)
- Targeted attacks (>20 attempts on specific accounts)

### Security Reports

Generate comprehensive security reports:

```bash
# Generate 24-hour security report
npm run security:report

# Generate custom timeframe report
npm run security:report 48

# Monitor for active attacks
npm run security:monitor

# Clean up old security data
npm run security:cleanup
```

## Configuration

### Environment Variables

```env
# OTP Security
OTP_SALT=your-secure-salt-for-otp-hashing
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret

# Database
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Rate Limit Configuration

Rate limits can be adjusted in `lib/security/rate-limiter.ts`:

```typescript
// OTP Initiation Rate Limits
export const otpInitiateRateLimit = createRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 3, // Adjust as needed
  // ...
});
```

## Best Practices

### 1. Regular Monitoring

- Review security reports daily
- Monitor for unusual patterns
- Set up alerts for high-volume attacks

### 2. Rate Limit Tuning

- Monitor legitimate user patterns
- Adjust limits based on usage patterns
- Consider different limits for different user tiers

### 3. Database Maintenance

- Run cleanup functions regularly
- Monitor database performance
- Archive old security logs if needed

### 4. Incident Response

- Have procedures for handling detected attacks
- Consider IP blocking for severe violations
- Implement user account lockout for repeated failures

## Security Headers

The system adds appropriate rate limiting headers to responses:

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 2024-01-01T12:00:00Z
```

## Fail-Safe Behavior

The system is designed to "fail open" when rate limiting services are unavailable:

- If database rate limiting fails, requests are allowed
- If memory rate limiting fails, requests continue
- Errors are logged but don't block legitimate users

## Performance Considerations

### Database Optimization

- Indexes on frequently queried columns
- Automatic cleanup of old entries
- Efficient query patterns

### Memory Usage

- Automatic cleanup of in-memory rate limiters
- Bounded memory usage with TTL
- Graceful degradation under load

## Compliance and Auditing

### Audit Trail

- All security events are logged with timestamps
- IP addresses and user agents are recorded
- Detailed context for forensic analysis

### Data Retention

- Rate limit data: 24 hours
- Security audit logs: 30 days
- Violation logs: 24 hours

### Privacy Considerations

- IP addresses are stored for security purposes
- User identifiers are hashed where possible
- Logs can be purged for privacy compliance

## Testing

### Rate Limiting Tests

```bash
# Test OTP rate limiting
npm run test:security

# Load test rate limiting
npm run test:load-rate-limits
```

### Security Validation

- Verify rate limits are enforced
- Test progressive delays
- Validate logging functionality
- Confirm cleanup operations

## Troubleshooting

### Common Issues

1. **Rate limits too strict**: Adjust limits in configuration
2. **Database performance**: Check indexes and cleanup frequency
3. **False positives**: Review legitimate user patterns
4. **Memory usage**: Monitor cleanup intervals

### Debug Commands

```bash
# Check current rate limit status
npm run security:status

# View recent violations
npm run security:violations

# Test rate limiting
npm run security:test
```

## Future Enhancements

### Planned Improvements

1. Machine learning-based anomaly detection
2. Geolocation-based risk scoring
3. Device fingerprinting
4. Adaptive rate limiting based on user behavior
5. Integration with external threat intelligence

### Monitoring Enhancements

1. Real-time dashboards
2. Alert notifications
3. Automated response actions
4. Integration with SIEM systems

This comprehensive OTP security implementation provides robust protection against various attack vectors while maintaining usability for legitimate users.
