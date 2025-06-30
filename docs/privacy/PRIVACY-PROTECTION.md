# Privacy-First Family Nostr Protection

## Overview

This system implements comprehensive privacy protection for family Nostr key management with zero-knowledge principles, end-to-end encryption, and privacy-first data handling.

## 🔐 Privacy Features

### Data Protection Levels

1. **Level 1 - Basic Protection**

   - Standard encryption for sensitive data
   - Basic username hashing
   - Standard audit logging

2. **Level 2 - Enhanced Protection**

   - Advanced encryption with additional layers
   - Enhanced key derivation
   - Detailed privacy audit trails

3. **Level 3 - Maximum Protection** (Default)
   - Zero-knowledge data handling
   - Double encryption for key shards
   - Comprehensive privacy controls
   - Biometric authentication support

### Encryption Specifications

- **Algorithm**: AES-256-GCM with authenticated encryption
- **Key Derivation**: PBKDF2 with 100,000 iterations (SHA-512)
- **Salt Length**: 32 bytes (cryptographically secure random)
- **IV Length**: 16 bytes (unique per encryption)
- **Tag Length**: 16 bytes (authentication tag)

### Protected Data Types

#### Nostr Keys

- **Nsec (Private Keys)**: Double-encrypted with unique key IDs
- **Npub (Public Keys)**: Encrypted for additional privacy
- **Key Shards**: Triple-encrypted for guardian storage

#### User Information

- **Usernames**: Hashed with PBKDF2 + UUID protection
- **Family IDs**: Encrypted with secure hash derivation
- **Device Info**: Hashed for privacy (IP addresses, user agents)

#### Event Data

- **Event Content**: Fully encrypted in storage
- **Member Signatures**: Encrypted signature collections
- **Session Data**: Encrypted coordination sessions

## 🛡️ Security Architecture

### Encryption Layers

```
Raw Data → Salt Generation → Key Derivation → AES-256-GCM → Secure Storage
           ↓
         UUID Generation → Hash Protection → Privacy Audit Log
```

### Key Management

1. **Master Key**: Environment-based master encryption key
2. **Derived Keys**: Per-operation keys derived from master + salt
3. **Key Rotation**: Automatic rotation every 6 months
4. **Key Recovery**: Guardian-based Shamir Secret Sharing

### Guardian Protection System

```
Nsec → Shamir Secret Sharing → Individual Guardian Shards → Double Encryption → Fedimint Storage
       ↓                       ↓                           ↓                   ↓
     Threshold=2/3           Guardian Notifications      Auto-Expiration     Recovery Consensus
```

## 🔧 Implementation

### Environment Configuration

```bash
# Critical: Set secure master key
PRIVACY_MASTER_KEY=your-super-secure-32-char-minimum-key

# Privacy settings
DEFAULT_PRIVACY_LEVEL=3
ENABLE_ZERO_KNOWLEDGE_RECOVERY=true
REQUIRE_PRIVACY_CONSENT=true

# Data retention
DEFAULT_AUDIT_RETENTION_DAYS=90
DEFAULT_KEY_ROTATION_MONTHS=6
```

### Database Schema

#### Secure Tables

- `secure_profiles` - Encrypted user profiles
- `secure_federated_events` - Encrypted family events
- `secure_family_guardians` - Encrypted guardian data
- `secure_guardian_shards` - Double-encrypted key shards
- `secure_family_nostr_protection` - Encrypted protection metadata
- `privacy_audit_log` - Privacy operation tracking

#### Row Level Security (RLS)

All sensitive tables have RLS enabled. Configure policies based on your authentication system:

```sql
-- Example RLS policy
CREATE POLICY "users_own_data" ON secure_profiles
FOR ALL USING (user_uuid = auth.uid());
```

### API Usage

#### Creating Secure Events

```typescript
import { PrivacyFederatedSigningAPI } from "./lib/api/privacy-federated-signing";

const result = await PrivacyFederatedSigningAPI.createSecureFederatedEvent({
  familyId: "family_123",
  eventType: "family_announcement",
  content: "Sensitive family information",
  authorId: "user_456",
  authorPubkey: "npub1...",
  privacyLevel: 3, // Maximum protection
});
```

#### Signing with Privacy Protection

```typescript
const result = await PrivacyFederatedSigningAPI.signSecureFederatedEvent({
  eventId: "event_789",
  memberId: "user_456",
  memberPubkey: "npub1...",
  memberPrivateKey: "nsec1...", // Automatically cleared from memory
  privacyConsent: true, // Required
  deviceInfo: {
    userAgent: "Mozilla/5.0...", // Will be hashed
    ipAddress: "192.168.1.1", // Will be hashed
  },
});
```

## 🔍 Privacy Audit System

### Audit Log Features

- **Operation Tracking**: All encrypt/decrypt operations logged
- **Data Type Classification**: Categorized by sensitivity level
- **Success/Failure Tracking**: Comprehensive error logging
- **Automatic Retention**: Configurable data retention policies
- **Privacy-Compliant**: Audit data itself is encrypted

### Audit Endpoints

```typescript
// Get user's privacy audit trail
GET /api/privacy/audit-log/:userId?days=30

// Update privacy settings
POST /api/privacy/settings
{
  "privacyLevel": 3,
  "zeroKnowledgeEnabled": true,
  "dataRetentionDays": 90
}
```

## 🚀 Migration & Setup

### 1. Run Privacy Migration

```bash
# Generate configuration template
npm run migrate:privacy -- --config

# Run privacy health check
npm run migrate:privacy -- --health

# Execute migration
npm run migrate:privacy
```

### 2. Configure Environment

```bash
# Copy privacy configuration template
cp .env.privacy.template .env.privacy

# Generate secure master key (example using openssl)
openssl rand -base64 32
```

### 3. Set Up Monitoring

```typescript
// Monitor privacy operations
import { PrivacyUtils } from "./lib/privacy/encryption";

// All operations automatically logged
const auditEntry = PrivacyUtils.logPrivacyOperation({
  action: "encrypt",
  dataType: "nsec",
  userId: "user_123",
  success: true,
});
```

## 🔒 Zero-Knowledge Principles

### Data Minimization

- Only necessary data is stored
- Automatic data expiration
- Configurable retention policies

### Encryption by Default

- All sensitive data encrypted at rest
- Transport layer security (TLS)
- Client-side encryption before transmission

### Privacy Consent

- Explicit consent required for all operations
- Granular privacy controls
- Transparent audit trails

### Access Controls

- Row Level Security (RLS) enabled
- User-based data isolation
- Guardian consensus for key recovery

## ⚠️ Security Considerations

### Critical Requirements

1. **Master Key Security**: Store PRIVACY_MASTER_KEY securely (vault, KMS)
2. **Database Security**: Enable SSL, configure firewalls
3. **Access Controls**: Implement proper RLS policies
4. **Key Rotation**: Set up automatic key rotation
5. **Audit Monitoring**: Monitor privacy audit logs

### Threat Mitigation

- **Data Breaches**: All data encrypted, useless without keys
- **Key Compromise**: Guardian-based recovery system
- **Insider Threats**: Comprehensive audit trails
- **Regulatory Compliance**: GDPR/CCPA compliant by design

## 📊 Privacy Health Check

```bash
# Run comprehensive privacy health check
npm run migrate:privacy -- --health
```

This checks:

- ✅ Privacy tables existence
- ✅ Master key configuration
- ✅ Encryption functionality
- ✅ Audit log integrity
- ✅ RLS policy status

## 🆘 Emergency Procedures

### Key Recovery

1. Gather guardian consensus (threshold signatures)
2. Execute secure recovery protocol
3. Verify identity through multiple channels
4. Generate new keys and re-shard

### Data Breach Response

1. All data is encrypted - assess encryption integrity
2. Rotate master keys immediately
3. Audit access logs for suspicious activity
4. Notify users if personal data potentially compromised

### Compliance Requests

1. Use privacy audit logs for transparency
2. Honor data deletion requests (right to be forgotten)
3. Provide data portability where required
4. Maintain encryption throughout process

## 📈 Performance Considerations

### Encryption Overhead

- Initial setup: ~100ms per encryption operation
- Ongoing operations: ~10-50ms per operation
- Bulk operations: Batch processing available

### Storage Requirements

- Encrypted data: ~150% of original size
- Audit logs: ~1MB per 1000 operations
- Guardian shards: ~500 bytes per shard

### Optimization Tips

- Use connection pooling for database operations
- Implement caching for frequently accessed data
- Consider read replicas for audit log queries
- Monitor encryption/decryption performance metrics

## 🔄 Maintenance

### Regular Tasks

- [ ] Monitor privacy audit logs
- [ ] Review key rotation schedules
- [ ] Check guardian availability
- [ ] Validate encryption integrity
- [ ] Update privacy policies

### Quarterly Reviews

- [ ] Security assessment
- [ ] Performance optimization
- [ ] Compliance audit
- [ ] Guardian contact verification
- [ ] Privacy settings review

---

## Support & Documentation

- **Issues**: Report privacy concerns immediately
- **Questions**: Consult privacy team before changes
- **Updates**: Follow secure deployment procedures
- **Training**: Ensure team understands privacy implications

**Remember**: Privacy is not just a feature, it's a fundamental right. This system is designed to protect family data with the highest standards of cryptographic security and privacy engineering.
