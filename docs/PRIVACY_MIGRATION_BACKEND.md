# Privacy System Backend Migration Guide

## Overview

This document outlines the comprehensive backend migration plan for standardizing privacy levels across the Satnam.pub platform. The migration addresses inconsistent privacy implementations and establishes a unified privacy system supporting Bitcoin-only family banking.

## Migration Phases

### Phase 1: Database Schema Updates ✅

**Duration: Week 1**

#### 1.1 Privacy Level Standardization

- **Created**: `privacy_level` enum type (`giftwrapped`, `encrypted`, `minimal`)
- **Migrated**: Old privacy levels (`standard`→`minimal`, `enhanced`→`encrypted`, `maximum`→`giftwrapped`)
- **Added**: Privacy columns to all transaction tables

#### 1.2 New Tables Created

```sql
-- Privacy audit logging
CREATE TABLE privacy_audit_log (
  id UUID PRIMARY KEY,
  user_hash TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  privacy_level privacy_level NOT NULL,
  metadata_protection INTEGER NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  operation_details JSONB DEFAULT '{}'
);

-- Guardian privacy approvals
CREATE TABLE guardian_privacy_approvals (
  id UUID PRIMARY KEY,
  family_id TEXT NOT NULL,
  member_hash TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  requested_privacy_level privacy_level NOT NULL,
  guardian_signatures JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  expires_at TIMESTAMP WITH TIME ZONE
);
```

#### 1.3 Enhanced Existing Tables

- **transactions**: Added `privacy_level`, `privacy_routing_used`, `metadata_protection_level`
- **family_members**: Added `default_privacy_level`, `guardian_approval_required`, `privacy_preferences`
- **individual_wallets**: Added `privacy_settings` JSONB column
- **lightning_payments**: Added `privacy_level`, `routing_privacy`, `lnproxy_used`
- **fedimint_operations**: Added `privacy_level`, `guardian_privacy_approval`

### Phase 2: API Endpoint Updates ✅

**Duration: Week 2**

#### 2.1 New Privacy-Enhanced Endpoints

**Family API**:

- `POST /api/family/privacy-enhanced-payments` - Privacy-aware payment processing
- `GET /api/family/members?includePrivacy=true` - Family members with privacy settings
- `POST /api/family/guardian-approvals` - Guardian approval workflow

**Individual API**:

- `GET /api/individual/privacy-wallet` - Wallet with privacy settings
- `POST /api/individual/privacy-wallet` - Update privacy preferences
- `GET /api/individual/privacy-metrics` - Privacy usage analytics

#### 2.2 Enhanced Request/Response Types

```typescript
interface PaymentRequest extends PrivacyAwareRequest {
  amount: number;
  recipient: string;
  privacyLevel: PrivacyLevel;
  routingPreference?: "lightning" | "lnproxy" | "cashu" | "fedimint" | "auto";
}

interface PaymentResponse {
  success: boolean;
  privacyLevel: PrivacyLevel;
  routingUsed: "lightning" | "lnproxy" | "cashu" | "fedimint";
  privacyMetrics: {
    metadataProtection: number;
    anonymityScore: number;
    routingPrivacy: number;
  };
}
```

### Phase 3: Service Layer Updates ✅

**Duration: Week 3**

#### 3.1 Privacy-Enhanced API Service

- **Created**: `PrivacyEnhancedApiService` class
- **Features**: Centralized privacy-aware API calls, legacy compatibility, error handling
- **Integration**: Backward-compatible with existing service calls

#### 3.2 Service Capabilities

- Privacy level validation and recommendations
- Automatic routing based on privacy requirements
- Guardian approval workflow integration
- Privacy audit logging
- Legacy privacy level conversion

### Phase 4: Testing & Validation ✅

**Duration: Week 4**

#### 4.1 Comprehensive Test Suite

- Database schema validation
- API endpoint functionality
- Privacy level standardization
- Guardian approval workflow
- Legacy compatibility
- Performance testing

#### 4.2 Migration Orchestration

- Automated migration execution
- Rollback capabilities
- Status monitoring
- Integration testing

## Privacy Level Routing Logic

### GIFTWRAPPED (Maximum Privacy)

- **Small amounts** (<50k sats): Cashu tokens
- **Large amounts** (>50k sats): LNProxy routing
- **Metadata protection**: 100%
- **Anonymity score**: 95%

### ENCRYPTED (Balanced Privacy)

- **Family context**: Fedimint when available
- **Medium amounts**: LNProxy for enhanced privacy
- **Large amounts**: Direct Lightning with privacy considerations
- **Metadata protection**: 60%
- **Anonymity score**: 70%

### MINIMAL (Efficiency Focus)

- **Default**: Direct Lightning routing
- **Public transactions**: Standard Lightning addresses
- **Business use**: Immediate settlement priority
- **Metadata protection**: 10%
- **Anonymity score**: 30%

## Guardian Approval Integration

### Automatic Triggers

- **GIFTWRAPPED** payments >100k sats
- Privacy level changes for family members
- New external recipient additions

### Approval Workflow

1. Create approval request with privacy context
2. Notify guardians with privacy impact analysis
3. Collect required signatures
4. Execute operation with approved privacy level
5. Audit log all privacy decisions

## Migration Execution

### Prerequisites

```bash
# Ensure environment is ready
npm install
npm run build

# Verify database connection
npm run test:db-connection
```

### Execute Migration

```bash
# Run complete migration
npm run privacy-migration execute

# Check status
npm run privacy-migration status

# Run tests only
npm run test:privacy-migration
```

### Rollback (if needed)

```bash
# Emergency rollback
npm run privacy-migration rollback

# Partial rollback to specific step
npm run privacy-migration rollback --to=database_schema
```

## Validation Checklist

### Database Schema ✅

- [ ] `privacy_level` enum created
- [ ] All tables have privacy columns
- [ ] Privacy audit logging functional
- [ ] Guardian approval tables created
- [ ] Old privacy levels migrated

### API Endpoints ✅

- [ ] Privacy-enhanced endpoints responsive
- [ ] Request/response validation working
- [ ] Error handling includes privacy context
- [ ] Legacy endpoints remain functional

### Service Layer ✅

- [ ] `PrivacyEnhancedApiService` operational
- [ ] Privacy level validation working
- [ ] Routing logic implemented
- [ ] Legacy compatibility maintained

### Integration ✅

- [ ] End-to-end payment flows working
- [ ] Guardian approval workflow functional
- [ ] Privacy audit logging active
- [ ] Performance benchmarks met

## Post-Migration Tasks

### Immediate (Week 5)

1. Monitor error rates and performance
2. Validate privacy audit logs
3. Test guardian approval workflows
4. Verify legacy component compatibility

### Short-term (Weeks 6-8)

1. Update frontend components to use new API
2. Implement privacy metrics dashboard
3. Add privacy level recommendations
4. Enhance guardian approval UX

### Long-term (Weeks 9-12)

1. Privacy analytics and insights
2. Advanced routing optimizations
3. Cross-mint privacy token integration
4. Privacy-preserving analytics

## Troubleshooting

### Common Issues

**Migration fails at database schema**:

```bash
# Check database permissions
npm run test:db-permissions

# Verify enum creation
npm run test:enum-validation
```

**API endpoints not responding**:

```bash
# Verify endpoint deployment
npm run test:api-endpoints

# Check service registration
npm run test:service-registry
```

**Privacy level validation errors**:

```bash
# Test privacy level enum
npm run test:privacy-enum

# Validate type conversion
npm run test:privacy-conversion
```

### Support Contacts

- **Database Issues**: DB Team
- **API Issues**: Backend Team
- **Privacy Implementation**: Privacy Team
- **Integration Issues**: Full-stack Team

## Success Metrics

### Technical Metrics

- **Database**: All privacy columns populated
- **API**: <100ms response time for privacy operations
- **Service**: 100% backward compatibility maintained
- **Testing**: All integration tests passing

### Business Metrics

- **Privacy**: Default privacy level usage >80%
- **Routing**: Optimal privacy routing success >95%
- **Guardian**: Approval workflow completion <24hr
- **User**: No disruption to existing workflows

## Next Steps

Once backend migration is complete:

1. **Frontend Component Migration** (Weeks 5-6)

   - Update payment modals with privacy controls
   - Integrate dashboard privacy indicators
   - Enhance user privacy preferences

2. **Advanced Privacy Features** (Weeks 7-8)

   - Privacy metrics dashboard
   - Advanced routing optimizations
   - Cross-mint privacy integration

3. **User Experience Enhancement** (Weeks 9-10)
   - Privacy education and onboarding
   - Guardian approval mobile notifications
   - Privacy-preserving analytics

The backend migration establishes the foundation for a comprehensive privacy-first Bitcoin banking experience while maintaining full backward compatibility with existing systems.
