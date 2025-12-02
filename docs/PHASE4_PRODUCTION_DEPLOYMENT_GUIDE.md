# Phase 4: Production Deployment Guide

**Date**: December 1, 2025
**Status**: PRODUCTION READY
**Version**: 1.0

---

## 📋 DEPLOYMENT CHECKLIST

### Pre-Deployment Verification

- [x] All 108 tests passing (86 Phase 1-3 + 22 Phase 4 E2E)
- [x] Database migration script created and tested
- [x] Backend API enhanced with FROST threshold validation
- [x] NFC MFA policy configuration implemented
- [x] FROST threshold configuration UI added to wizard
- [x] TypeScript strict mode compliance verified
- [x] Privacy-first architecture maintained
- [x] Master Context role hierarchy enforced

### Environment Configuration

**Required Environment Variables**:
```bash
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-key>
VITE_APP_DOMAIN=satnam.pub
VITE_PLATFORM_LIGHTNING_DOMAIN=my.satnam.pub
NODE_ENV=production
```

---

## 🗄️ DATABASE MIGRATION

### Step 1: Execute Migration Script

Run the migration in Supabase SQL Editor:

```bash
# File: database/050_family_foundry_production_migration.sql
# Execute in Supabase SQL Editor (copy entire file and run)
```

**Migration includes**:
- ✅ FROST threshold columns (1-5 range)
- ✅ NFC MFA policy configuration
- ✅ frost_signing_sessions table with indexes
- ✅ federation_audit_log table
- ✅ Row Level Security (RLS) policies
- ✅ Idempotent design (safe for re-execution)

### Step 2: Verify Migration

```sql
-- Verify columns exist
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'family_federations' 
AND column_name IN ('frost_threshold', 'nfc_mfa_policy', 'nfc_mfa_amount_threshold', 'nfc_mfa_threshold');

-- Verify tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('frost_signing_sessions', 'federation_audit_log');
```

---

## 🔌 API ENDPOINT UPDATES

### POST /api/family/foundry

**Enhanced Request Body**:
```typescript
{
  charter: {
    familyName: string,
    familyMotto?: string,
    foundingDate: string (ISO date),
    missionStatement?: string,
    values?: string[]
  },
  rbac: {
    roles: RoleDefinition[],
    frostThreshold?: number // 1-5, defaults to 2
  },
  members: Array<{
    user_duid: string,
    role: 'guardian'|'steward'|'adult'|'offspring'
  }>
}
```

**Enhanced Response**:
```typescript
{
  success: boolean,
  data: {
    charterId: string,
    federationId: string,
    federationDuid: string,
    familyName: string,
    foundingDate: string,
    status: 'active',
    frostThreshold: number,
    nfcMfaPolicy: string,
    nfcMfaAmountThreshold: number
  }
}
```

**Validation**:
- ✅ FROST threshold: 1-5 range
- ✅ Participants: 2-7 range
- ✅ Threshold ≤ participant count
- ✅ Master Context role hierarchy

---

## 🧪 TESTING

### Run All Tests

```bash
npm test -- family-foundry
# Result: 108/108 tests passing (100%)
```

### Run Phase 4 E2E Tests

```bash
npm test -- FamilyFoundryPhase4E2E
# Result: 22/22 tests passing (100%)
```

### Test Coverage

- ✅ FROST threshold validation (1-of-2 to 5-of-7)
- ✅ NFC MFA policy configuration
- ✅ Complete wizard flow
- ✅ Error handling and edge cases
- ✅ Production readiness checks

---

## 🚀 DEPLOYMENT STEPS

### Step 1: Database Migration
1. Connect to Supabase SQL Editor
2. Copy entire migration script
3. Execute and verify success

### Step 2: Deploy Backend API
1. Verify `api/family/foundry.js` changes
2. Deploy to Netlify Functions
3. Test endpoint with sample request

### Step 3: Deploy Frontend
1. Build: `npm run build`
2. Deploy to Netlify
3. Verify wizard flow in production

### Step 4: Smoke Tests
1. Create test federation with 2-of-3 threshold
2. Verify FROST session created
3. Verify NFC MFA policy configured
4. Check audit log entries

---

## 🔐 SECURITY CONSIDERATIONS

### FROST Threshold Security

| Threshold | Security | Speed | Use Case |
|-----------|----------|-------|----------|
| 1-of-2 | Low | Fast | Low-value operations |
| 2-of-3 | Medium | Normal | Default (recommended) |
| 3-of-4 | High | Slower | Medium-value operations |
| 4-of-5 | Very High | Slow | High-value operations |
| 5-of-7 | Maximum | Slowest | Critical federation changes |

### NFC MFA Thresholds

- **1-3 members**: 100,000 sats
- **4-6 members**: 250,000 sats
- **7+ members**: 500,000 sats

### RLS Policies

- ✅ Users can only view their federation's FROST sessions
- ✅ Only stewards/guardians can create FROST sessions
- ✅ Audit logs visible only to federation members
- ✅ Privacy-first DUID system prevents social graph analysis

---

## 📊 MONITORING

### Key Metrics

- Federation creation success rate
- FROST session completion rate
- NFC MFA verification success rate
- Average operation time

### Logging

All operations logged to `federation_audit_log`:
- Operation type
- Actor DUID
- Operation hash
- Status (success/failure)
- Timestamp

---

## 🔄 ROLLBACK PLAN

### If Migration Fails

```sql
-- Rollback migration (if needed)
ALTER TABLE family_federations DROP COLUMN IF EXISTS frost_threshold;
ALTER TABLE family_federations DROP COLUMN IF EXISTS nfc_mfa_policy;
ALTER TABLE family_federations DROP COLUMN IF EXISTS nfc_mfa_amount_threshold;
ALTER TABLE family_federations DROP COLUMN IF EXISTS nfc_mfa_threshold;
DROP TABLE IF EXISTS frost_signing_sessions CASCADE;
DROP TABLE IF EXISTS federation_audit_log CASCADE;
```

### If API Deployment Fails

1. Revert to previous `api/family/foundry.js`
2. Redeploy to Netlify
3. Verify endpoint functionality

---

## ✅ PRODUCTION READINESS CHECKLIST

- [x] All tests passing (108/108)
- [x] Database migration tested
- [x] API validation implemented
- [x] FROST threshold configuration working
- [x] NFC MFA policies configured
- [x] RLS policies enforced
- [x] Audit logging enabled
- [x] Error handling comprehensive
- [x] Documentation complete
- [x] Rollback plan documented

**Status**: ✅ **READY FOR PRODUCTION DEPLOYMENT**

