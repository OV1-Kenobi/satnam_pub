# Integration Test Conversion Plan

## Overview
This document outlines the plan to convert mocked unit tests to real integration tests that interact with actual Supabase database, real API endpoints, and real services.

## Completed Work

### 1. Test Infrastructure ✅
- Created `tests/setup/integration-test-setup.ts` with:
  - Real Supabase client configuration
  - Test data factories for generating realistic test data
  - Database cleanup utilities
  - Database seeding utilities
  - Test lifecycle hooks (beforeAll, beforeEach, afterEach, afterAll)

### 2. Converted Tests ✅
- `tests/pkarr-publishing.integration.test.ts` - Real PKARR publishing tests
- `tests/pkarr-verification.integration.test.ts` - Real PKARR verification tests

## Remaining Work

### Phase 1: Fix TypeScript Errors (IMMEDIATE)
**Files:**
- `tests/pkarr-publishing.test.ts` - Lines 328, 366 (Cannot invoke undefined)
- `tests/pkarr-analytics.test.ts` - Review for similar issues

**Actions:**
1. Replace MockSupabaseClient with real Supabase client
2. Remove all `vi.fn()` mocks that cause type issues
3. Use real database queries instead of in-memory Maps

### Phase 2: Convert PKARR Tests (HIGH PRIORITY)
**Files to Convert:**
1. `tests/pkarr-analytics.test.ts`
   - Remove MockSupabaseAnalyticsClient
   - Use real RPC functions (`get_pkarr_stats`)
   - Test real database views (`pkarr_relay_health`)
   - Seed real test data for analytics queries

2. `tests/pkarr-publishing.test.ts` (Replace with .integration.test.ts)
   - Already created new version
   - Need to deprecate old mocked version

3. `tests/pkarr-verification.test.ts` (Replace with .integration.test.ts)
   - Already created new version
   - Need to deprecate old mocked version

### Phase 3: Convert Iroh Integration Tests (HIGH PRIORITY)
**Files to Convert:**
1. `tests/integration/iroh-admin-dashboard.test.tsx`
   - Remove all component mocks
   - Render real `AdminDashboard` component
   - Use real `useAuth` hook with test user session
   - Test real verification method cards
   - Verify real database updates

2. `tests/integration/iroh-identity-forge.test.tsx`
   - Remove all mocks
   - Render real `IdentityForge` component
   - Test real registration flow
   - Verify real database inserts
   - Test real Iroh node ID storage

3. `tests/integration/iroh-settings.test.tsx`
   - Remove all mocks
   - Render real `Settings` component
   - Test real Iroh settings updates
   - Verify real database updates

### Phase 4: Update Test Configuration
**Files to Update:**
1. `vitest.config.ts`
   - Ensure integration tests are included
   - Set appropriate timeouts (60s+)
   - Configure test environment variables

2. `.env.test` (Create if doesn't exist)
   - Add test database credentials
   - Add test API endpoints
   - Add feature flags for testing

3. `package.json`
   - Add test scripts for integration tests
   - Separate unit tests from integration tests

## Test Data Strategy

### Database Seeding
- Use unique identifiers (timestamps, random strings) to avoid conflicts
- Seed minimal required data for each test
- Clean up after each test to maintain isolation

### Test User Management
- Create test users with predictable credentials
- Use test-specific username prefixes (`testuser_`)
- Clean up test users after test suite completes

### Feature Flags
- Enable all relevant features for integration tests
- Use environment variables to control feature flags
- Document required feature flags in test files

## Database Schema Requirements

### Required Tables
1. `pkarr_records` - PKARR DNS records
2. `pkarr_publish_history` - Publishing history
3. `user_identities` - User identity records
4. `encrypted_contacts` - Contact verification data
5. `iroh_nodes` - Iroh DHT node data
6. `nip05_records` - NIP-05 verification records

### Required Views
1. `pkarr_relay_health` - Relay health metrics
2. `pkarr_verification_stats` - Verification statistics

### Required RPC Functions
1. `get_pkarr_stats(start_time, end_time)` - Analytics statistics
2. `auto_update_verification_level()` - Trigger for verification escalation

## Environment Variables

### Required for Integration Tests
```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Feature Flags
VITE_PKARR_ENABLED=true
VITE_IROH_ENABLED=true
VITE_HYBRID_IDENTITY_ENABLED=true

# Test Configuration
NODE_ENV=test
TEST_DATABASE_URL=postgresql://...
```

## Migration Path

### Step 1: Create New Integration Tests
- Keep old mocked tests as `.test.ts`
- Create new real tests as `.integration.test.ts`
- Run both in parallel during transition

### Step 2: Verify Integration Tests Pass
- Ensure all new integration tests pass
- Fix any database schema mismatches
- Add missing test data factories

### Step 3: Deprecate Mocked Tests
- Mark old tests as deprecated
- Update documentation to prefer integration tests
- Eventually remove mocked tests

### Step 4: Update CI/CD
- Add integration test step to CI pipeline
- Use test database for CI runs
- Ensure proper cleanup between test runs

## Success Criteria

### For Each Converted Test File
- ✅ No mocked Supabase clients
- ✅ No mocked React components (for UI tests)
- ✅ No mocked API endpoints
- ✅ Uses real database connections
- ✅ Proper test data seeding
- ✅ Proper cleanup after tests
- ✅ All tests pass consistently
- ✅ Tests are idempotent (can run in any order)
- ✅ Tests are isolated (don't affect each other)

### Overall Success
- ✅ All TypeScript errors resolved
- ✅ All integration tests passing
- ✅ Test coverage maintained or improved
- ✅ Documentation updated
- ✅ CI/CD pipeline updated

## Timeline Estimate

- **Phase 1 (Fix TypeScript Errors)**: 1-2 hours
- **Phase 2 (Convert PKARR Tests)**: 3-4 hours
- **Phase 3 (Convert Iroh Tests)**: 4-6 hours
- **Phase 4 (Update Configuration)**: 1-2 hours

**Total Estimated Time**: 9-14 hours

## Next Steps

1. ✅ Create test infrastructure (COMPLETED)
2. ✅ Create example integration tests (COMPLETED)
3. ⏳ Fix immediate TypeScript errors (IN PROGRESS)
4. ⏳ Convert remaining PKARR tests
5. ⏳ Convert Iroh integration tests
6. ⏳ Update test configuration
7. ⏳ Run full test suite and fix failures
8. ⏳ Update documentation

