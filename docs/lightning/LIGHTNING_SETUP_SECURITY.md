# Secure Lightning Setup Architecture

## Problem Fixed

The original Lightning setup process created database records first, then made external API calls to Voltage/BTCPay, but never persisted the returned service IDs back to the database. This left the `lightning_addresses` table with NULL values for `btcpay_store_id` and `voltage_node_id`, causing database inconsistency.

## Security-First Solution

### 🔒 Atomic Database Operations

- **Atomic Transactions**: All Lightning setup steps wrapped in database transactions
- **Rollback Capability**: Automatic cleanup on any failure
- **Consistent State**: Database always reflects actual service state
- **Audit Trail**: Complete logging of all setup operations

### 🔒 Encrypted Configuration Storage

```typescript
// Service configurations are encrypted before storage
const encryptedConfig = PrivacyManager.encryptServiceConfig(
  serviceConfig,
  process.env.SERVICE_ENCRYPTION_KEY,
);

// Stored encrypted in database
await CitadelDatabase.updateLightningServiceIds(userId, {
  btcpay_store_id: serviceId,
  encrypted_btcpay_config: encryptedConfig,
});
```

### 🔒 Minimal Network Exposure

- **Service Credentials**: Never logged or exposed in plaintext
- **API Keys**: Encrypted at rest, decrypted only when needed
- **Configuration Data**: Encrypted with service-specific keys
- **Network Calls**: Minimized and properly error-handled

## Architecture Flow

### 1. Initial Setup

```
User Registration Request
      ↓
Create Lightning Address Record (minimal data)
      ↓
Setup External Services (Voltage + BTCPay)
      ↓
Atomic Update with Service IDs + Encrypted Configs
      ↓
Success Response (no sensitive data exposed)
```

### 2. Error Handling

```
External Service Failure
      ↓
Automatic Rollback of Database Changes
      ↓
Audit Log Entry Created
      ↓
Safe Error Response to User
      ↓
Retry Mechanism Available
```

## Security Features

### Database Security

- **RLS Policies**: Row-level security on all Lightning tables
- **Encrypted Columns**: Sensitive service configs encrypted
- **Audit Logging**: Complete trail of all operations
- **Atomic Functions**: PostgreSQL functions ensure consistency

### Application Security

- **Zero Secrets in Logs**: No service credentials in application logs
- **Encrypted Storage**: All sensitive data encrypted at rest
- **Secure Key Management**: Proper key derivation and storage
- **Error Sanitization**: Safe error messages to users

### Network Security

- **TLS Required**: All external API calls over HTTPS
- **API Key Rotation**: Support for key rotation without downtime
- **Rate Limiting**: Protection against API abuse
- **Circuit Breaker**: Fail-fast on external service issues

## Usage Examples

### Basic Lightning Setup

```typescript
const result = await IdentityRegistration.registerIdentity({
  userId: "auth-user-id",
  username: "SwiftEagle42",
  usernameChoice: "user_provided",
  userEncryptionKey: "user-passphrase",
  optionalData: {
    lightningAddress: "swifteagle42@satnam.pub",
  },
});

// Result includes complete Lightning setup with encrypted configs
console.log(result.lightning_setup.status); // "fully_configured"
```

### Retry Failed Setup

```typescript
const retryResult = await IdentityRegistration.retryLightningSetup(
  userId,
  username,
  "swifteagle42@satnam.pub",
);

if (retryResult.success) {
  console.log("Lightning setup successful on retry");
}
```

### Check Setup Status

```typescript
const status = await IdentityRegistration.getLightningSetupStatus(userId);

console.log({
  hasLightningAddress: status.status.hasLightningAddress,
  hasBTCPayStore: status.status.hasBTCPayStore,
  hasVoltageNode: status.status.hasVoltageNode,
  canRetry: status.status.canRetry,
});
```

## Database Schema

### Lightning Addresses Table

```sql
CREATE TABLE lightning_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  address TEXT NOT NULL,
  btcpay_store_id TEXT,                    -- External service ID
  voltage_node_id TEXT,                    -- External service ID
  encrypted_btcpay_config TEXT,            -- Encrypted service config
  encrypted_voltage_config TEXT,           -- Encrypted service config
  active BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,               -- Last successful sync
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Audit Log Table

```sql
CREATE TABLE lightning_setup_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  lightning_address_id UUID REFERENCES lightning_addresses(id),
  operation_type TEXT NOT NULL,
  btcpay_configured BOOLEAN DEFAULT FALSE,
  voltage_configured BOOLEAN DEFAULT FALSE,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Migration Path

1. **Run Migration**: Apply `006_atomic_lightning_setup.sql`
2. **Update Environment**: Set `SERVICE_ENCRYPTION_KEY`
3. **Test Setup**: Verify atomic operations work
4. **Migrate Existing**: Fix any existing NULL records
5. **Monitor**: Check audit logs for successful operations

## Best Practices

### For Developers

- Always use the atomic setup functions
- Never log sensitive service configurations
- Test rollback scenarios thoroughly
- Monitor audit logs regularly

### For Operations

- Rotate service encryption keys regularly
- Monitor external service health
- Set up alerts for failed Lightning setups
- Regular backup of encrypted configurations

### For Security

- Encrypt all service configurations
- Use separate keys for different services
- Implement proper key rotation procedures
- Regular security audits of Lightning setup flow

## Monitoring & Alerts

### Key Metrics

- Lightning setup success rate
- External service response times
- Rollback frequency
- Configuration encryption status

### Alert Conditions

- Lightning setup failure rate > 5%
- External service timeout > 30s
- Missing service encryption key
- Audit log gaps or anomalies

This architecture ensures that Lightning setup is secure, atomic, and recoverable while maintaining minimal exposure of sensitive information.
