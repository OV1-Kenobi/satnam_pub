# Privacy-First Security Implementation

## Overview

This document outlines the privacy-first approach implemented in the enhanced OTP security system. All security measures are designed to protect user privacy while maintaining robust security monitoring and protection capabilities.

## Privacy Protection Principles

### 1. Data Minimization

- Only collect data necessary for security purposes
- Never store sensitive user identifiers in plaintext
- Use hashed identifiers for correlation while protecting privacy

### 2. Encryption and Hashing

- All user identifiers are hashed before storage or logging
- Multiple salt values for different purposes
- Truncated hashes to prevent rainbow table attacks

### 3. Fail-Safe Privacy

- System defaults to protecting privacy when in doubt
- No sensitive data in error messages or logs
- Graceful degradation without exposing user data

## Privacy-Preserving Implementations

### Rate Limiting Key Hashing

All rate limiting keys use privacy-preserving hashes:

```typescript
function hashRateLimitKey(data: string): string {
  const salt = process.env.RATE_LIMIT_SALT;
  if (!salt) {
    throw new Error("RATE_LIMIT_SALT environment variable is required");
  }
  const hash = crypto.createHash("sha256");
  hash.update(data + salt);
  return hash.digest("hex").substring(0, 32); // Truncated for privacy
}
```

**Applied to:**

- OTP initiation rate limiting
- OTP verification rate limiting
- Authentication rate limiting
- Database-backed rate limiting

### Security Event Logging

Security events use hashed identifiers:

```typescript
async function hashForLogging(data: string): Promise<string> {
  const salt = process.env.LOGGING_SALT;
  if (!salt) {
    throw new Error("LOGGING_SALT environment variable is required");
  }
  const hash = crypto.createHash("sha256");
  hash.update(data + salt);
  return hash.digest("hex").substring(0, 16); // Truncated for privacy
}
```

**Security Events Logged:**

- `otp_initiate_validation_failed` - No user data, only field count
- `otp_verification_failed` - Hashed npub/nip05, no raw identifiers
- `otp_max_attempts_exceeded` - Hashed identifiers only
- `otp_verification_success` - Hashed identifiers only

### Database Storage

#### Rate Limit Violations Table

```sql
CREATE TABLE security_rate_limit_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_limit_key TEXT NOT NULL,        -- Hashed key, not raw identifier
    ip_address INET,                     -- IP for security monitoring
    user_agent TEXT,                     -- User agent for analysis
    identifier TEXT,                     -- Set to NULL for privacy
    violated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Security Audit Log Table

```sql
CREATE TABLE security_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    details JSONB,                       -- Contains only hashed identifiers
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

## Environment Variables for Privacy

### Required Salt Values

```env
# Rate limiting key hashing
RATE_LIMIT_SALT=your-secure-rate-limit-salt-256-chars-minimum

# Database rate limiting key hashing
DB_RATE_LIMIT_SALT=your-secure-db-rate-limit-salt-256-chars-minimum

# Security event logging hashing
LOGGING_SALT=your-secure-logging-salt-256-chars-minimum

# OTP hashing (existing)
OTP_SALT=your-secure-otp-salt-256-chars-minimum
```

### Salt Generation

Generate cryptographically secure salts:

```bash
# Generate secure salts
openssl rand -hex 128  # For RATE_LIMIT_SALT
openssl rand -hex 128  # For DB_RATE_LIMIT_SALT
openssl rand -hex 128  # For LOGGING_SALT
openssl rand -hex 128  # For OTP_SALT
```

## Privacy-Preserving Monitoring

### Security Reports

Security monitoring reports show:

- **Hashed rate limit keys** instead of user identifiers
- **IP addresses** for network-level analysis
- **Event counts and patterns** without exposing user data
- **Temporal analysis** without user correlation

### Example Report Output

```
🔒 Security Report - Last 24 hours
==================================================

📊 Overview:
  Rate Limit Violations: 15
  OTP Failures: 8
  Suspicious IPs: 2

🚨 Suspicious IP Addresses:
  - 192.168.1.100
  - 10.0.0.50

🎯 Top Failed Attempts by Rate Limit Key (Privacy-Hashed):
  - otp-initiate:a1b2c3d4e5f6g7h8: 5 attempts (last: 2024-01-01 12:30:00)
  - otp-verify:x9y8z7w6v5u4t3s2: 3 attempts (last: 2024-01-01 11:45:00)
```

## Data Retention and Cleanup

### Automatic Cleanup

```typescript
// Rate limit data: 24 hours
await supabase
  .from("security_rate_limits")
  .delete()
  .lt("created_at", cutoffTime.toISOString());

// Security audit logs: 30 days
await supabase
  .from("security_audit_log")
  .delete()
  .lt("timestamp", thirtyDaysAgo.toISOString());

// Rate limit violations: 24 hours
await supabase
  .from("security_rate_limit_violations")
  .delete()
  .lt("violated_at", cutoffTime.toISOString());
```

### Manual Cleanup Commands

```bash
# Clean up old security data
npm run security:cleanup

# Clean up specific timeframes
npm run security:cleanup --days=7
```

## Privacy Compliance Features

### GDPR Compliance

1. **Data Minimization**: Only necessary data is collected
2. **Purpose Limitation**: Data used only for security purposes
3. **Storage Limitation**: Automatic cleanup of old data
4. **Pseudonymization**: All identifiers are hashed
5. **Right to Erasure**: User data can be purged on request

### User Data Purging

```typescript
// Purge all data for a specific user (by hashed identifier)
async function purgeUserSecurityData(npub: string): Promise<void> {
  const hashedNpub = await hashForLogging(npub);

  // Remove from audit logs
  await supabase
    .from("security_audit_log")
    .delete()
    .like("details", `%${hashedNpub}%`);

  // Rate limit data expires automatically
}
```

## Security vs Privacy Balance

### What We Log

- **Event types and counts** - For pattern analysis
- **Hashed identifiers** - For correlation without exposure
- **IP addresses** - For network-level security
- **Timestamps** - For temporal analysis
- **User agents** - For bot detection

### What We Don't Log

- **Raw npub/pubkey values** - Never stored in logs
- **Raw nip05 addresses** - Never stored in logs
- **OTP codes** - Never logged (only hashed for verification)
- **Request bodies** - Never logged in full
- **Session tokens** - Never logged

## Monitoring Without Compromise

### Attack Detection

The system can detect attacks while preserving privacy:

1. **Distributed attacks** - Multiple IPs targeting the system
2. **Targeted attacks** - High volume against specific hashed keys
3. **Brute force attempts** - Pattern analysis without user exposure
4. **Anomaly detection** - Statistical analysis of hashed data

### Forensic Analysis

Security incidents can be investigated using:

- **Hashed identifier correlation** - Track patterns across events
- **IP-based analysis** - Network-level investigation
- **Temporal correlation** - Time-based pattern analysis
- **Rate limit pattern analysis** - Behavioral analysis

## Implementation Checklist

### Development

- [ ] All user identifiers hashed before storage
- [ ] Separate salts for different purposes
- [ ] No sensitive data in error messages
- [ ] Privacy-preserving key generators
- [ ] Truncated hashes for additional privacy

### Deployment

- [ ] Secure salt generation and storage
- [ ] Environment variable validation
- [ ] Automatic cleanup scheduling
- [ ] Monitoring dashboard privacy review
- [ ] Log rotation and archival

### Operations

- [ ] Regular security report review
- [ ] Salt rotation procedures
- [ ] Data retention policy enforcement
- [ ] Privacy impact assessments
- [ ] Incident response procedures

## Testing Privacy Protection

### Unit Tests

```bash
# Test hash consistency
npm run test:privacy-hashing

# Test data minimization
npm run test:data-minimization

# Test cleanup procedures
npm run test:cleanup
```

### Privacy Validation

```bash
# Verify no sensitive data in logs
npm run privacy:audit-logs

# Check database for raw identifiers
npm run privacy:scan-database

# Validate salt usage
npm run privacy:validate-salts
```

## Future Privacy Enhancements

### Planned Improvements

1. **Zero-knowledge proofs** for rate limiting
2. **Differential privacy** for usage statistics
3. **Homomorphic encryption** for advanced analytics
4. **Secure multi-party computation** for distributed monitoring

### Research Areas

1. **Privacy-preserving anomaly detection**
2. **Federated learning for security patterns**
3. **Blockchain-based audit trails**
4. **Quantum-resistant cryptography**

This privacy-first approach ensures that robust security monitoring and protection can be maintained without compromising user privacy or violating data protection regulations.
