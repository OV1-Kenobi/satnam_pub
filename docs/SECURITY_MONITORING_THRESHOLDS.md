# Security Monitoring Configurable Thresholds

This document describes the configurable attack detection thresholds feature in the security monitoring system.

## Overview

The security monitoring system now supports configurable thresholds for attack detection, allowing different security postures for different environments (development, staging, production).

## Configuration

### Environment Variables

You can configure thresholds using the following environment variables:

- `SECURITY_OTP_FAILURE_THRESHOLD`: OTP failure threshold (default: 50)
- `SECURITY_RATE_LIMIT_VIOLATION_THRESHOLD`: Rate limit violation threshold (default: 100)
- `SECURITY_SUSPICIOUS_IP_THRESHOLD`: Suspicious IP count threshold (default: 5)
- `SECURITY_TARGETED_ATTACK_THRESHOLD`: Targeted attack attempts threshold (default: 20)

### Example Environment Configuration

```bash
# High security environment
SECURITY_OTP_FAILURE_THRESHOLD=10
SECURITY_RATE_LIMIT_VIOLATION_THRESHOLD=25
SECURITY_SUSPICIOUS_IP_THRESHOLD=2
SECURITY_TARGETED_ATTACK_THRESHOLD=5

# Development environment
SECURITY_OTP_FAILURE_THRESHOLD=200
SECURITY_RATE_LIMIT_VIOLATION_THRESHOLD=500
SECURITY_SUSPICIOUS_IP_THRESHOLD=20
SECURITY_TARGETED_ATTACK_THRESHOLD=100
```

## API Usage

### Using Default Thresholds

```typescript
import { monitorActiveAttacks } from "../scripts/security-monitoring";

// Uses thresholds from environment variables or defaults
await monitorActiveAttacks();
```

### Using Custom Thresholds

```typescript
import {
  monitorActiveAttacks,
  createAttackThresholds,
} from "../scripts/security-monitoring";

// Create custom thresholds
const customThresholds = createAttackThresholds({
  otpFailures: 30,
  rateLimitViolations: 75,
  suspiciousIpCount: 3,
  targetedAttackAttempts: 10,
});

await monitorActiveAttacks(customThresholds);
```

### Getting Current Thresholds

```typescript
import { getAttackThresholds } from "../scripts/security-monitoring";

const currentThresholds = getAttackThresholds();
console.log("Current thresholds:", currentThresholds);
```

## Threshold Types

### AttackThresholds Interface

```typescript
interface AttackThresholds {
  otpFailures: number; // OTP failure threshold per hour
  rateLimitViolations: number; // Rate limit violation threshold per hour
  suspiciousIpCount: number; // Number of suspicious IPs to trigger alert
  targetedAttackAttempts: number; // Attempts per rate limit key to consider targeted
}
```

## Security Posture Recommendations

### Production Environment

- **OTP Failures**: 30-50 (moderate sensitivity)
- **Rate Limit Violations**: 75-100 (moderate sensitivity)
- **Suspicious IP Count**: 3-5 (high sensitivity)
- **Targeted Attack Attempts**: 10-20 (high sensitivity)

### Staging Environment

- **OTP Failures**: 100-150 (lower sensitivity for testing)
- **Rate Limit Violations**: 200-300 (lower sensitivity for testing)
- **Suspicious IP Count**: 8-10 (moderate sensitivity)
- **Targeted Attack Attempts**: 30-50 (moderate sensitivity)

### Development Environment

- **OTP Failures**: 200+ (low sensitivity)
- **Rate Limit Violations**: 500+ (low sensitivity)
- **Suspicious IP Count**: 20+ (low sensitivity)
- **Targeted Attack Attempts**: 100+ (low sensitivity)

## Monitoring Output

When using configurable thresholds, the monitoring output will include:

1. **Threshold Information**: Shows the active thresholds being used
2. **Alert Context**: Includes threshold values in alert messages
3. **Environment Awareness**: Adapts sensitivity based on configuration

Example output:

```
🔍 Monitoring for active attacks...
Using thresholds: OTP failures: 30, Rate limit violations: 75, Suspicious IPs: 3, Targeted attacks: 10

🚨 HIGH ALERT: 45 OTP failures in the last hour! (threshold: 30)
🚨 DISTRIBUTED ATTACK DETECTED: 5 suspicious IPs (threshold: 3)
```

## Migration from Hardcoded Thresholds

The system maintains backward compatibility:

- **Default behavior unchanged**: Without configuration, uses the same thresholds as before
- **Gradual adoption**: Can configure individual thresholds while leaving others as defaults
- **Environment-specific**: Can use different configurations per environment

## Examples

See `examples/security-monitoring-thresholds-example.ts` for comprehensive usage examples including:

- Default threshold usage
- High-security configurations
- Development environment settings
- Environment-specific configurations
- Threshold inspection utilities

## Best Practices

1. **Start Conservative**: Begin with lower thresholds in production and adjust based on false positive rates
2. **Environment Separation**: Use different thresholds for different environments
3. **Monitor and Adjust**: Regularly review alert frequency and adjust thresholds accordingly
4. **Document Changes**: Keep track of threshold changes and their rationale
5. **Test Thoroughly**: Test threshold changes in staging before applying to production
