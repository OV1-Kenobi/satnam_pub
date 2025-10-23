# NIP-85 Trust Provider Configuration Guide

## Overview

The NIP-85 Trust Provider system in Satnam.pub is controlled by a comprehensive set of feature flags and configuration variables. This guide explains each setting and provides configuration examples for different deployment scenarios.

---

## Feature Flags

### Master Toggle

#### `VITE_NIP85_TRUST_PROVIDER_ENABLED`
- **Type**: Boolean (true/false)
- **Default**: `false` (opt-in)
- **Purpose**: Master toggle for all NIP-85 functionality
- **Impact**: When disabled, all NIP-85 features are unavailable
- **Recommendation**: Enable only after testing in staging environment

### Publishing & Querying

#### `VITE_NIP85_PUBLISHING_ENABLED`
- **Type**: Boolean (true/false)
- **Default**: `false` (opt-in)
- **Purpose**: Enable publishing trust assertions to Nostr network
- **Requires**: `VITE_NIP85_TRUST_PROVIDER_ENABLED=true`
- **Impact**: Users can publish their trust scores to relays
- **Recommendation**: Enable only for trusted providers

#### `VITE_NIP85_QUERY_ENABLED`
- **Type**: Boolean (true/false)
- **Default**: `true` (enabled)
- **Purpose**: Enable querying trust assertions from relays
- **Impact**: Users can view trust scores published by other providers
- **Recommendation**: Keep enabled for read-only access

### Performance & Caching

#### `VITE_NIP85_CACHE_ENABLED`
- **Type**: Boolean (true/false)
- **Default**: `true` (enabled)
- **Purpose**: Enable in-memory caching for assertion queries
- **Impact**: Improves performance by reducing relay queries
- **Recommendation**: Keep enabled for production

#### `VITE_NIP85_CACHE_TTL_MS`
- **Type**: Number (milliseconds)
- **Default**: `300000` (5 minutes)
- **Range**: 60000-3600000 (1 minute to 1 hour)
- **Purpose**: Cache time-to-live before re-querying relays
- **Tuning**:
  - Lower values (60000-180000): More fresh data, higher relay load
  - Higher values (300000-600000): Better performance, slightly stale data
- **Recommendation**: 300000-600000 for production

### Audit & Compliance

#### `VITE_NIP85_AUDIT_LOGGING_ENABLED`
- **Type**: Boolean (true/false)
- **Default**: `true` (enabled)
- **Purpose**: Enable audit logging for all query operations
- **Impact**: All queries logged to `trust_query_audit_log` table
- **Recommendation**: Keep enabled for compliance and security

---

## Configuration Variables

### Relay Configuration

#### `VITE_NIP85_PRIMARY_RELAY`
- **Type**: String (relay URL)
- **Default**: `wss://relay.satnam.pub`
- **Format**: `wss://` or `ws://` URL
- **Purpose**: Primary relay for publishing/querying assertions
- **Examples**:
  - `wss://relay.satnam.pub` (default)
  - `wss://relay.damus.io` (alternative)
  - `wss://nostr.example.com` (custom)

### Privacy Configuration

#### `VITE_NIP85_DEFAULT_EXPOSURE_LEVEL`
- **Type**: String (enum)
- **Default**: `private` (most restrictive)
- **Options**:
  - `private`: Never share trust scores (default)
  - `whitelist`: Share only with whitelisted pubkeys
  - `contacts`: Share only with known contacts
  - `public`: Share with everyone
- **Purpose**: Default privacy level for new users
- **Recommendation**: Keep as `private` for privacy-first approach

---

## Deployment Scenarios

### Scenario 1: Development/Testing
```env
VITE_NIP85_TRUST_PROVIDER_ENABLED=false
VITE_NIP85_PUBLISHING_ENABLED=false
VITE_NIP85_QUERY_ENABLED=true
VITE_NIP85_CACHE_ENABLED=true
VITE_NIP85_CACHE_TTL_MS=60000
VITE_NIP85_AUDIT_LOGGING_ENABLED=true
VITE_NIP85_DEFAULT_EXPOSURE_LEVEL=private
VITE_NIP85_PRIMARY_RELAY=wss://relay.satnam.pub
```

### Scenario 2: Staging/Pre-Production
```env
VITE_NIP85_TRUST_PROVIDER_ENABLED=true
VITE_NIP85_PUBLISHING_ENABLED=false
VITE_NIP85_QUERY_ENABLED=true
VITE_NIP85_CACHE_ENABLED=true
VITE_NIP85_CACHE_TTL_MS=300000
VITE_NIP85_AUDIT_LOGGING_ENABLED=true
VITE_NIP85_DEFAULT_EXPOSURE_LEVEL=private
VITE_NIP85_PRIMARY_RELAY=wss://relay.satnam.pub
```

### Scenario 3: Production (Read-Only)
```env
VITE_NIP85_TRUST_PROVIDER_ENABLED=true
VITE_NIP85_PUBLISHING_ENABLED=false
VITE_NIP85_QUERY_ENABLED=true
VITE_NIP85_CACHE_ENABLED=true
VITE_NIP85_CACHE_TTL_MS=600000
VITE_NIP85_AUDIT_LOGGING_ENABLED=true
VITE_NIP85_DEFAULT_EXPOSURE_LEVEL=private
VITE_NIP85_PRIMARY_RELAY=wss://relay.satnam.pub
```

### Scenario 4: Production (Full Provider)
```env
VITE_NIP85_TRUST_PROVIDER_ENABLED=true
VITE_NIP85_PUBLISHING_ENABLED=true
VITE_NIP85_QUERY_ENABLED=true
VITE_NIP85_CACHE_ENABLED=true
VITE_NIP85_CACHE_TTL_MS=600000
VITE_NIP85_AUDIT_LOGGING_ENABLED=true
VITE_NIP85_DEFAULT_EXPOSURE_LEVEL=private
VITE_NIP85_PRIMARY_RELAY=wss://relay.satnam.pub
```

---

## Performance Tuning

### High-Traffic Scenarios
- Increase `VITE_NIP85_CACHE_TTL_MS` to 600000-900000
- Keep `VITE_NIP85_CACHE_ENABLED=true`
- Monitor relay connection performance

### Privacy-First Scenarios
- Set `VITE_NIP85_DEFAULT_EXPOSURE_LEVEL=private`
- Keep `VITE_NIP85_PUBLISHING_ENABLED=false`
- Enable `VITE_NIP85_AUDIT_LOGGING_ENABLED=true`

### Compliance Scenarios
- Always enable `VITE_NIP85_AUDIT_LOGGING_ENABLED=true`
- Set `VITE_NIP85_DEFAULT_EXPOSURE_LEVEL=private`
- Monitor `trust_query_audit_log` table regularly

---

## Troubleshooting

### Feature Not Working
1. Check `VITE_NIP85_TRUST_PROVIDER_ENABLED=true`
2. Check specific feature flag (publishing/query/cache)
3. Check browser console for error messages
4. Verify relay connectivity

### Performance Issues
1. Increase `VITE_NIP85_CACHE_TTL_MS`
2. Verify `VITE_NIP85_CACHE_ENABLED=true`
3. Check relay response times
4. Monitor database query performance

### Audit Log Issues
1. Verify `VITE_NIP85_AUDIT_LOGGING_ENABLED=true`
2. Check `trust_query_audit_log` table exists
3. Verify database permissions
4. Check for database connection errors

---

## Security Considerations

- Always use `VITE_NIP85_DEFAULT_EXPOSURE_LEVEL=private` by default
- Enable audit logging for compliance
- Use HTTPS-only relays (`wss://`)
- Regularly review audit logs
- Test feature flags in staging before production

