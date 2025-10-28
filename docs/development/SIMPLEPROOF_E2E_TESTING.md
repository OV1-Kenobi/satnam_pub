# SimpleProof End-to-End Testing Guide

**Phase 2B-2 Day 14: E2E Testing & Real API Integration**

---

## 📋 **Table of Contents**

1. [Overview](#overview)
2. [Test Infrastructure](#test-infrastructure)
3. [Environment Setup](#environment-setup)
4. [Running E2E Tests](#running-e2e-tests)
5. [Test Categories](#test-categories)
6. [Performance Benchmarks](#performance-benchmarks)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)

---

## 🎯 **Overview**

The SimpleProof E2E test suite verifies the complete SimpleProof integration with **REAL SimpleProof API calls** (not mocks). These tests ensure production readiness by testing:

- Real API integration with SimpleProof service
- Complete user flows (IdentityForge, KeyRotation, NFC, Family Federation)
- Performance benchmarks (response times, cache hit rates)
- Rate limiting behavior
- Error handling and recovery

**⚠️ IMPORTANT:**
- E2E tests make REAL API calls to SimpleProof
- Tests may incur Bitcoin transaction fees (~500-1000 sats per timestamp)
- Tests are rate-limited (10 timestamps/hour, 100 verifications/hour)
- Requires valid `VITE_SIMPLEPROOF_API_KEY_TEST` environment variable

---

## 🏗️ **Test Infrastructure**

### **Test File Location**
```
tests/e2e/simpleproof-e2e.test.ts
```

### **Test Configuration**
```typescript
const E2E_TEST_CONFIG = {
  // API Configuration
  apiKey: process.env.VITE_SIMPLEPROOF_API_KEY_TEST || "",
  apiUrl: process.env.VITE_SIMPLEPROOF_API_URL_TEST || "https://api.simpleproof.com",
  
  // Feature Flags
  enabled: process.env.VITE_SIMPLEPROOF_ENABLED === "true",
  
  // Test Timeouts
  timestampTimeout: 30000, // 30 seconds
  verificationTimeout: 10000, // 10 seconds
  loadTestTimeout: 120000, // 2 minutes
  
  // Performance Targets
  performanceTargets: {
    timestampCreation: 5000, // <5s
    verification: 2000, // <2s
    cacheHitRate: 0.8, // >80%
  },
  
  // Rate Limits
  rateLimits: {
    timestampCreation: 10, // 10 per hour
    verification: 100, // 100 per hour
  },
  
  // Data Limits
  maxDataSize: 10 * 1024, // 10KB
};
```

### **Test Skip Logic**
E2E tests are automatically skipped if:
- `VITE_SIMPLEPROOF_ENABLED` is not set to `"true"`
- `VITE_SIMPLEPROOF_API_KEY_TEST` is not set

This prevents accidental API calls during development.

---

## ⚙️ **Environment Setup**

### **Required Environment Variables**

Create a `.env.test` file in the project root:

```bash
# SimpleProof E2E Testing Configuration

# Enable SimpleProof integration
VITE_SIMPLEPROOF_ENABLED=true

# SimpleProof API credentials (TEST ACCOUNT)
VITE_SIMPLEPROOF_API_KEY_TEST=your_test_api_key_here
VITE_SIMPLEPROOF_API_URL_TEST=https://api.simpleproof.com

# Optional: Override default timeouts
VITE_SIMPLEPROOF_TIMESTAMP_TIMEOUT=30000
VITE_SIMPLEPROOF_VERIFICATION_TIMEOUT=10000
```

### **Getting a Test API Key**

1. **Sign up for SimpleProof test account:**
   - Visit: https://simpleproof.com/signup
   - Select "Test Account" option
   - Verify email address

2. **Generate API key:**
   - Log in to SimpleProof dashboard
   - Navigate to: Settings → API Keys
   - Click "Generate Test API Key"
   - Copy the key (starts with `sp_test_`)

3. **Configure rate limits:**
   - Test accounts have higher rate limits (50 timestamps/hour)
   - Production accounts: 10 timestamps/hour
   - Contact support for custom limits

### **Supabase Configuration**

E2E tests require Supabase connection for database operations:

```bash
# Supabase credentials (from your Supabase project)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

---

## 🚀 **Running E2E Tests**

### **Run All E2E Tests**
```bash
npm run test:e2e:simpleproof
```

### **Run Specific Test Category**
```bash
# Real API Integration Tests only
npm run test:e2e:simpleproof -- -t "Real API Integration Tests"

# User Flow E2E Tests only
npm run test:e2e:simpleproof -- -t "User Flow E2E Tests"

# Performance & Load Testing only
npm run test:e2e:simpleproof -- -t "Performance & Load Testing"
```

### **Run Single Test**
```bash
# Example: Run only timestamp creation test
npm run test:e2e:simpleproof -- -t "should create timestamp and verify OTS proof format"
```

### **Run with Verbose Output**
```bash
npm run test:e2e:simpleproof -- --reporter=verbose
```

### **Run with Coverage**
```bash
npm run test:e2e:simpleproof -- --coverage
```

---

## 📊 **Test Categories**

### **Category 1: Real API Integration Tests (8 tests)**

Tests real SimpleProof API integration:

1. **Test 1:** Create timestamp with real SimpleProof API
   - Verifies OTS proof format (hex-encoded)
   - Checks Bitcoin block/TX metadata
   - Validates timestamp creation success

2. **Test 2:** Verify timestamp with real Bitcoin blockchain data
   - Creates timestamp, then verifies it
   - Checks confidence levels (unconfirmed/confirmed/high)
   - Validates verification success

3. **Test 3:** Rate limiting behavior
   - Tests 10 timestamps/hour limit
   - Verifies rate limit error messages
   - Validates graceful degradation

4. **Test 4:** Error scenarios
   - Invalid data handling
   - Network timeout handling
   - API error handling

5. **Test 5:** Caching behavior
   - Tests 24-hour TTL cache
   - Verifies cache hit/miss logic
   - Measures cache performance improvement

6. **Test 6:** Concurrent requests
   - Tests 5 simultaneous timestamp creations
   - Verifies concurrent request handling
   - Validates no race conditions

7. **Test 7:** Large data payloads
   - Tests max data size (10KB)
   - Tests oversized data rejection (>10KB)
   - Validates size limit enforcement

8. **Test 8:** Verification confidence levels
   - Tests unconfirmed → confirmed → high progression
   - Verifies Bitcoin confirmation tracking
   - Validates confidence level accuracy

### **Category 2: User Flow E2E Tests (6 tests)**

Tests complete user flows with real timestamp creation:

1. **Test 1:** IdentityForge flow
   - Simulates account creation event
   - Creates timestamp with account metadata
   - Verifies successful attestation

2. **Test 2:** KeyRotation flow
   - Simulates key rotation event
   - Creates timestamp linking old/new keys
   - Verifies identity continuity

3. **Test 3:** NFC Registration flow
   - Simulates NFC Name Tag registration
   - Creates timestamp with Boltcard metadata
   - Verifies physical device attestation

4. **Test 4:** Family Federation flow
   - Simulates family federation creation
   - Creates timestamp with federation metadata
   - Verifies governance attestation

5. **Test 5:** Fee warning modal behavior
   - Simulates fee confirmation flow
   - Verifies user consent requirement
   - Validates cost transparency

6. **Test 6:** Toast notifications
   - Simulates success/error notifications
   - Verifies appropriate messaging
   - Validates user feedback

### **Category 3: Performance & Load Testing (6 tests)**

Tests performance and scalability:

1. **Test 1:** Stress test rate limiter
   - Tests 50 concurrent timestamp creations
   - Verifies rate limiting effectiveness
   - Validates graceful degradation

2. **Test 2:** Timestamp creation performance
   - Measures timestamp creation time
   - Target: <5 seconds
   - Validates performance SLA

3. **Test 3:** Verification performance
   - Measures verification time
   - Target: <2 seconds
   - Validates performance SLA

4. **Test 4:** Cache hit rate
   - Tests 10 repeated verifications
   - Target: >80% cache hit rate
   - Validates caching effectiveness

5. **Test 5:** Average response time tracking
   - Measures average response times
   - Tracks min/max/avg durations
   - Validates consistency

6. **Test 6:** Performance benchmarks summary
   - Documents all performance targets
   - Provides comprehensive metrics
   - Validates production readiness

---

## 📈 **Performance Benchmarks**

### **Target Metrics**

| Metric | Target | Measurement |
|--------|--------|-------------|
| Timestamp Creation | <5 seconds | Average response time |
| Verification | <2 seconds | Average response time |
| Cache Hit Rate | >80% | Repeated verifications |
| Rate Limit (Timestamp) | 10/hour | Production limit |
| Rate Limit (Verification) | 100/hour | Production limit |
| Max Data Size | 10KB | Payload size limit |

### **Expected Results**

**Successful Test Run:**
```
✅ Real API Integration Tests: 8/8 passing
✅ User Flow E2E Tests: 6/6 passing
✅ Performance & Load Testing: 6/6 passing
✅ Total: 20/20 tests passing (100% pass rate)
```

**Performance Benchmarks:**
```
📊 PERFORMANCE BENCHMARKS SUMMARY
==================================================
Timestamp Creation Target: <5000ms
Verification Target: <2000ms
Cache Hit Rate Target: >80%
Rate Limits: 10 timestamps/hour, 100 verifications/hour
Max Data Size: 10240 bytes (10KB)
==================================================
```

---

## 🔧 **Troubleshooting**

### **Issue: Tests are skipped**

**Symptom:**
```
⚠️  SimpleProof E2E tests SKIPPED:
   - VITE_SIMPLEPROOF_ENABLED must be 'true'
   - VITE_SIMPLEPROOF_API_KEY_TEST must be set
```

**Solution:**
1. Check `.env.test` file exists
2. Verify `VITE_SIMPLEPROOF_ENABLED=true`
3. Verify `VITE_SIMPLEPROOF_API_KEY_TEST` is set
4. Restart test runner

### **Issue: Rate limit errors**

**Symptom:**
```
❌ Timestamp creation failed: Rate limit exceeded (429)
```

**Solution:**
1. Wait 1 hour for rate limit reset
2. Use test API key with higher limits
3. Reduce number of concurrent tests
4. Contact SimpleProof support for custom limits

### **Issue: Network timeout**

**Symptom:**
```
❌ Timestamp creation failed: Network timeout
```

**Solution:**
1. Check internet connection
2. Verify SimpleProof API is accessible
3. Increase timeout in test config
4. Check firewall/proxy settings

### **Issue: Invalid API key**

**Symptom:**
```
❌ Timestamp creation failed: Invalid API key (401)
```

**Solution:**
1. Verify API key is correct
2. Check API key hasn't expired
3. Regenerate API key in SimpleProof dashboard
4. Update `.env.test` with new key

### **Issue: Bitcoin fees**

**Symptom:**
```
⚠️  E2E tests incurring Bitcoin transaction fees
```

**Solution:**
1. Use test API key (may have free tier)
2. Limit test runs to avoid excessive fees
3. Budget ~$5-10/month for E2E testing
4. Contact SimpleProof for test mode

---

## ✅ **Best Practices**

### **1. Run E2E Tests Sparingly**
- E2E tests make real API calls and incur costs
- Run before major releases, not on every commit
- Use unit/integration tests for frequent testing

### **2. Use Test API Keys**
- Never use production API keys for testing
- Test keys have higher rate limits
- Test keys may have free tier or reduced fees

### **3. Monitor Rate Limits**
- Track API usage in SimpleProof dashboard
- Avoid hitting rate limits during tests
- Space out test runs if needed

### **4. Review Test Results**
- Check performance benchmarks after each run
- Investigate any performance regressions
- Document any unexpected failures

### **5. Keep Documentation Updated**
- Update this guide when adding new tests
- Document any new environment variables
- Share learnings with the team

---

## 📝 **Summary**

SimpleProof E2E testing provides comprehensive validation of:

1. ✅ **Real API Integration:** Verifies SimpleProof API works as expected
2. ✅ **User Flows:** Tests complete user journeys with real timestamps
3. ✅ **Performance:** Validates response times and caching effectiveness
4. ✅ **Rate Limiting:** Ensures graceful degradation under load
5. ✅ **Error Handling:** Verifies robust error recovery

**Key Takeaway:** E2E tests are the final validation before production deployment. Run them before every major release to ensure SimpleProof integration is production-ready.

---

**Last Updated:** Phase 2B-2 Day 14  
**Status:** ✅ COMPLETE  
**Test Count:** 20+ E2E tests  
**Test Coverage:** Real API integration, user flows, performance benchmarks

