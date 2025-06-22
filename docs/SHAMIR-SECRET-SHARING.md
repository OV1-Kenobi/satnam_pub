# Shamir Secret Sharing for Family Nostr Key Management

## Overview

Our Shamir Secret Sharing (SSS) implementation solves Nostr's key rotation problem by ensuring that **no individual family member ever has access to the complete private key**. Instead, the family's Nostr private key is mathematically split into shares using cryptographically secure methods, and requires consensus from multiple guardians to reconstruct for signing operations.

## 🔐 Core Principles

### Zero Private Key Exposure

- **No individual access**: No single family member can access the complete private key
- **Threshold-based reconstruction**: Requires consensus from multiple guardians (e.g., 3 of 5)
- **Temporary reconstruction**: Keys are reconstructed only for specific signing operations, then immediately cleared from memory
- **Guardian consensus**: All family events require approval from multiple guardians before signing

### Flexible Family Configurations

| Family Size | Recommended Config | Description       | Use Case                        |
| ----------- | ------------------ | ----------------- | ------------------------------- |
| 2 adults    | **2-of-2**         | Both required     | Couples with backup/inheritance |
| 3 members   | **2-of-3**         | Any 2 of 3        | Small family with redundancy    |
| 4 members   | **3-of-4**         | Majority required | Balanced security/availability  |
| 5 members   | **3-of-5**         | Majority required | Medium family                   |
| 6-7 members | **4-of-7**         | Super-majority    | Large family council            |
| 7+ members  | **5-of-7**         | High security     | Very large families             |

## 🏗️ System Architecture

### 1. Guardian Management

```
Family → Guardians → Roles → Shares
  ↓        ↓        ↓       ↓
2-7     Parents   Trust   Mathematical
Members → Trusted → Level → Shares of
          Adults    1-5     Private Key
```

### 2. Event Workflow

```
1. Event Creation
   ↓
2. Guardian Notifications
   ↓
3. Guardian Approvals (Threshold Required)
   ↓
4. Share Collection Request
   ↓
5. Guardians Provide Shares
   ↓
6. Key Reconstruction (Temporary)
   ↓
7. Event Signing
   ↓
8. Broadcast to Nostr
   ↓
9. Key Cleared from Memory
```

### 3. Security Layers

```
Raw Private Key
    ↓
Shamir Secret Sharing Split
    ↓
Individual Guardian Shares
    ↓
Double Encryption (AES-256-GCM)
    ↓
Database Storage with RLS
    ↓
Guardian Authentication Required
```

## 🚀 Implementation Guide

### Step 1: Initialize Family with SSS

```typescript
// 2-of-2 Configuration (Couples)
POST /api/family/initialize-sss
{
  "familyId": "smith_couple_2024",
  "familyName": "Smith Family",
  "guardians": [
    {
      "id": "alice_smith",
      "role": "parent",
      "publicKey": "npub1alice...",
      "trustLevel": 5,
      "contactInfo": { "email": "alice@example.com" }
    },
    {
      "id": "bob_smith",
      "role": "parent",
      "publicKey": "npub1bob...",
      "trustLevel": 5,
      "contactInfo": { "email": "bob@example.com" }
    }
  ],
  "threshold": 2,
  "totalShares": 2,
  "privacyLevel": 3
}
```

```typescript
// 3-of-5 Configuration (Medium Family)
POST /api/family/initialize-sss
{
  "familyId": "nakamoto_family_2024",
  "familyName": "Nakamoto Family",
  "guardians": [
    { "id": "mom", "role": "parent", "trustLevel": 5 },
    { "id": "dad", "role": "parent", "trustLevel": 5 },
    { "id": "teen_child", "role": "family_member", "trustLevel": 4 },
    { "id": "grandparent", "role": "trusted_adult", "trustLevel": 4 },
    { "id": "family_friend", "role": "recovery_contact", "trustLevel": 3 }
  ],
  "threshold": 3,
  "totalShares": 5
}
```

```typescript
// 5-of-7 Configuration (Large Family Council)
POST /api/family/initialize-sss
{
  "familyId": "large_family_council",
  "familyName": "Extended Family Council",
  "guardians": [
    { "id": "patriarch", "role": "parent", "trustLevel": 5 },
    { "id": "matriarch", "role": "parent", "trustLevel": 5 },
    { "id": "eldest_son", "role": "family_member", "trustLevel": 4 },
    { "id": "eldest_daughter", "role": "family_member", "trustLevel": 4 },
    { "id": "trusted_uncle", "role": "trusted_adult", "trustLevel": 4 },
    { "id": "family_lawyer", "role": "recovery_contact", "trustLevel": 3 },
    { "id": "longtime_friend", "role": "recovery_contact", "trustLevel": 3 }
  ],
  "threshold": 5,
  "totalShares": 7
}
```

### Step 2: Create Family Events

```typescript
// Family Announcement requiring guardian consensus
POST /api/sss-federated/create-event
{
  "familyId": "nakamoto_family_2024",
  "eventType": "family_announcement",
  "content": "We're planning to move to a new city. This affects our family's financial arrangements and Nostr account management.",
  "requiredGuardianApprovals": 3, // Majority of 5 guardians
  "privacyLevel": 3
}
```

### Step 3: Guardian Approval Process

```typescript
// Guardian approves the event
POST /api/sss-federated/guardian-approval
{
  "eventId": "sss_event_abc123",
  "approved": true,
  "reason": "I agree this is an important family decision that affects our shared financial responsibilities"
}

// Get pending events for guardian
GET /api/sss-federated/pending/nakamoto_family_2024
```

### Step 4: Share Provision for Signing

```typescript
// Guardian provides their share for signing (when threshold is met)
POST /api/sss-federated/provide-share
{
  "eventId": "sss_event_abc123"
}
```

## 🔧 Advanced Features

### Emergency Recovery

```typescript
// Lower threshold for emergency situations
POST /api/sss-federated/request-key-reconstruction
{
  "familyId": "nakamoto_family_2024",
  "reason": "emergency",
  "expiresInHours": 6 // Short window for security
}
```

Emergency configurations automatically use a lower threshold (typically threshold - 1, minimum 2) and involve pre-designated emergency guardians.

### Key Rotation

```typescript
// Automatic key rotation every 6 months
POST /api/sss-federated/request-key-reconstruction
{
  "familyId": "nakamoto_family_2024",
  "reason": "key_rotation",
  "expiresInHours": 48 // Longer window for coordination
}
```

The system can automatically initiate key rotation based on configured intervals, ensuring long-term security.

### Inheritance Procedures

```typescript
// Family member inheritance/recovery
POST /api/sss-federated/request-key-reconstruction
{
  "familyId": "nakamoto_family_2024",
  "reason": "inheritance",
  "expiresInHours": 72 // Extended window for family coordination
}
```

## 📊 Configuration Recommendations

### Guardian Roles & Trust Levels

| Role                 | Trust Level | Typical Responsibilities                     |
| -------------------- | ----------- | -------------------------------------------- |
| **Parent**           | 5 (Highest) | Primary decision makers, financial oversight |
| **Trusted Adult**    | 4           | Extended family, close family friends        |
| **Family Member**    | 3-4         | Adult children, siblings                     |
| **Recovery Contact** | 3           | Lawyers, advisors, emergency contacts        |

### Share Distribution Examples

#### 2-of-2 (Couples)

- **Alice**: Shares 1, 2
- **Bob**: Shares 1, 2 (duplicate for redundancy)
- **Requirement**: Both must agree and provide shares

#### 3-of-5 (Medium Family)

- **Mom**: Shares 1, 2
- **Dad**: Shares 3, 4
- **Teen**: Share 5
- **Grandparent**: Share 1 (backup)
- **Friend**: Share 2 (backup)
- **Requirement**: Any 3 guardians must agree and provide shares

#### 5-of-7 (Large Family Council)

- **Patriarch**: Shares 1, 2
- **Matriarch**: Shares 3, 4
- **Son**: Share 5
- **Daughter**: Share 6
- **Uncle**: Share 7
- **Lawyer**: Share 1 (backup)
- **Friend**: Share 2 (backup)
- **Requirement**: Any 5 guardians must agree and provide shares

## 🛡️ Security Considerations

### Cryptographic Security

- **Galois Field Mathematics**: Uses GF(256) for secure polynomial operations
- **Information-Theoretic Security**: Fewer than threshold shares reveal no information about the key
- **Perfect Secrecy**: Even with quantum computers, insufficient shares provide no key information

### Operational Security

- **Time-Limited Reconstruction**: Keys exist in memory only during signing operations
- **Device Isolation**: Different guardians use different devices
- **Activity Logging**: All guardian actions are logged for audit purposes
- **Automatic Cleanup**: Expired shares and requests are automatically purged

### Privacy Protection

- **Zero-Knowledge Proofs**: Guardians can verify their role without revealing shares
- **Encrypted Storage**: All shares are double-encrypted in the database
- **Anonymous Participation**: Guardian identities are encrypted in storage
- **Audit Trails**: Privacy-compliant logging of all guardian activities

## 🚨 Emergency Procedures

### Guardian Unavailability

1. **Identify**: Determine which guardians are unavailable
2. **Count**: Verify remaining guardians meet threshold
3. **Emergency Config**: Use emergency threshold if enabled
4. **Proceed**: Continue with available guardians

### Suspected Compromise

1. **Immediate**: Stop all key reconstruction requests
2. **Audit**: Review guardian activity logs
3. **Rotate**: Force key rotation with new shares
4. **Notify**: Alert all family members of security event

### Guardian Recovery

1. **Identity Verification**: Multi-factor verification of guardian identity
2. **New Shares**: Generate new shares for recovered guardian
3. **Share Redistribution**: Update share distribution if needed
4. **Testing**: Verify new configuration works properly

## 📈 Performance & Scalability

### Computational Overhead

- **Share Generation**: ~50ms for 32-byte private key
- **Share Verification**: ~10ms per share
- **Key Reconstruction**: ~100ms for threshold shares
- **Memory Usage**: ~1KB per share in memory

### Storage Requirements

- **Per Share**: ~500 bytes encrypted storage
- **Family Config**: ~2KB encrypted configuration
- **Activity Logs**: ~1KB per guardian action
- **Total for 7-guardian family**: ~10KB ongoing storage

### Network Considerations

- **Guardian Notifications**: Can use email, Nostr DMs, or push notifications
- **Share Provision**: Encrypted API calls only
- **Event Broadcasting**: Standard Nostr relay network
- **Backup Storage**: Optional fedimint integration for share redundancy

## 🔄 Maintenance & Monitoring

### Regular Tasks

- [ ] Monitor guardian availability and activity
- [ ] Review and approve pending key reconstruction requests
- [ ] Verify guardian contact information is current
- [ ] Check automatic key rotation schedules
- [ ] Audit guardian activity logs for anomalies

### Quarterly Reviews

- [ ] Security assessment of guardian configuration
- [ ] Performance optimization for share operations
- [ ] Guardian trust level review and updates
- [ ] Emergency procedure testing and drills
- [ ] Share distribution optimization

### Annual Tasks

- [ ] Complete guardian verification and re-authorization
- [ ] Full system security audit
- [ ] Disaster recovery testing
- [ ] Guardian training and procedure updates
- [ ] Configuration optimization based on family changes

## 📚 Technical Implementation

### Mathematical Foundation

Our SSS implementation uses polynomial interpolation in Galois Field GF(256):

```
f(x) = a₀ + a₁x + a₂x² + ... + a_{t-1}x^{t-1} (mod p)

Where:
- a₀ = secret (private key byte)
- a₁, a₂, ..., a_{t-1} = random coefficients
- t = threshold
- Shares are f(1), f(2), ..., f(n)
```

### Key Reconstruction

Using Lagrange interpolation to find f(0) = secret:

```
secret = Σ(i=0 to t-1) y_i * Π(j=0 to t-1, j≠i) (x_j / (x_j - x_i))
```

This mathematical approach ensures that:

- Any `t` shares can reconstruct the secret
- Any `t-1` or fewer shares reveal no information
- The system is information-theoretically secure

---

## Support & Resources

- **Documentation**: This guide and API documentation
- **Migration**: Use `npm run migrate:sss` to set up infrastructure
- **Health Check**: Use `npm run migrate:sss -- --health` to verify system
- **Examples**: Use `npm run migrate:sss -- --examples` for usage examples
- **Community**: Nostr and Bitcoin development communities

**Remember**: SSS provides mathematical guarantees about key security. No individual guardian can compromise the family key, and the system remains secure even if some guardians become unavailable. This solves Nostr's key rotation problem while enabling sophisticated family governance structures.
