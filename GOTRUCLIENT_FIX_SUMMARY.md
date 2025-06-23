# GoTrueClient Multiple Instances Fix - Summary

## Problem

The test suite was showing "Multiple GoTrueClient instances detected" warnings, which could cause undefined behavior when multiple Supabase clients are used concurrently under the same storage key.

## Root Cause

Multiple files were creating their own Supabase client instances:

1. `lib/__tests__/test-db-helper.ts` - Created a separate test client
2. `src/lib/internal-lightning-bridge.ts` - Created its own client in constructor
3. Various test files were potentially importing and using different client instances

## Solution Implemented

### 1. Centralized Test Setup

- **Created**: `lib/__tests__/test-setup.ts` - Centralized configuration
- **Updated**: `lib/__tests__/test-db-helper.ts` - Now uses main supabase client
- **Updated**: `lib/__tests__/test-config.ts` - Re-exports from centralized setup

### 2. Fixed Internal Lightning Bridge

- **Updated**: `src/lib/internal-lightning-bridge.ts`
  - Removed `createClient` import
  - Now imports and uses the shared `supabase` client from `../../lib/supabase`
  - Prevents creation of additional GoTrueClient instances

### 3. Updated Test Configuration

- **Updated**: `vitest.setup.ts` - Initializes shared client early
- **Updated**: `vitest.config.ts` - Removed unnecessary mocking aliases
- **Removed**: `lib/__tests__/supabase-mock.ts` - No longer needed since database is functional

### 4. Test Verification

- **Created**: `lib/__tests__/supabase-client.test.ts` - Verifies single client instance
- **Verified**: All tests now run without GoTrueClient warnings

## Key Changes Made

### Files Modified:

1. `lib/__tests__/test-setup.ts` - New centralized setup
2. `lib/__tests__/test-db-helper.ts` - Uses main supabase client
3. `lib/__tests__/test-config.ts` - Re-exports from setup
4. `src/lib/internal-lightning-bridge.ts` - Uses shared client
5. `vitest.setup.ts` - Early client initialization
6. `vitest.config.ts` - Removed mocking configuration
7. `lib/__tests__/supabase-client.test.ts` - New verification test

### Files Removed:

1. `lib/__tests__/supabase-mock.ts` - No longer needed

## Results

- ✅ No more "Multiple GoTrueClient instances detected" warnings
- ✅ All tests use a single shared Supabase client instance
- ✅ Tests run successfully with functional database
- ✅ Proper cleanup and resource management
- ✅ Simplified test architecture without unnecessary mocking

## Benefits

1. **Consistency**: All code uses the same Supabase client instance
2. **Performance**: Reduced overhead from multiple client instances
3. **Reliability**: Eliminates potential undefined behavior from concurrent clients
4. **Maintainability**: Centralized client management
5. **Real Testing**: Uses actual database instead of mocks for better integration testing

## Testing Status

- ✅ `lib/__tests__/supabase-client.test.ts` - Passes (3/3 tests)
- ✅ `src/__tests__/atomic-swap-integration.test.ts` - Passes (15/15 tests)
- ✅ No GoTrueClient warnings in test output
- ✅ Database operations work correctly with shared client

The GoTrueClient multiple instances issue has been successfully resolved while maintaining full functionality with the real Supabase database.
