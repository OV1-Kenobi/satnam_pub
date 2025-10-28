# CRITICAL Netlify Functions Security Hardening Plan
**Date:** 2025-10-28  
**Status:** 📋 READY FOR APPROVAL  
**Priority:** 🚨 CRITICAL  
**Total Effort:** 80 hours (Week 2-3)  
**Functions:** 15 CRITICAL functions

---

## Executive Summary

This plan details the security hardening of 15 CRITICAL Netlify Functions identified in the security audit. These functions handle authentication, payments, admin operations, and key management—the most sensitive operations in the system.

**Key Objectives:**
1. ✅ Apply centralized security utilities to all 15 functions
2. ✅ Eliminate all CRITICAL vulnerabilities in these functions
3. ✅ Achieve 90%+ security score for each function
4. ✅ Maintain backward compatibility
5. ✅ Comprehensive testing and validation

---

## 1. COMPLETE FUNCTION INVENTORY

### Category A: Authentication Endpoints (5 Functions)

| # | File Path | Function | Purpose | Current Issues |
|---|-----------|----------|---------|-----------------|
| 1 | `netlify/functions_active/auth-unified.js` | Unified Auth Handler | Routes all auth operations (signin, logout, refresh, session) | Missing security headers, weak CORS, no input validation, weak JWT validation |
| 2 | `netlify/functions_active/register-identity.ts` | Identity Registration | Registers new users with Nostr keys | Missing security headers, weak CORS, incomplete input validation, no rate limiting |
| 3 | `netlify/functions_active/auth-refresh.js` | Token Refresh | Refreshes access/refresh tokens | Missing security headers, weak JWT validation (no expiry buffer), no rate limiting |
| 4 | `netlify/functions_active/auth-session-user.js` | Session User Info | Returns authenticated user info | Missing security headers, weak JWT validation, no rate limiting |
| 5 | `netlify/functions_active/signin-handler.js` | Sign-In Handler | Handles NIP-05/password signin | Missing security headers, weak CORS, no input validation, no rate limiting |

**Shared Issues:**
- ❌ Missing security headers (X-Content-Type-Options, X-Frame-Options, HSTS, CSP, etc.)
- ❌ Weak CORS configuration (some use wildcard "*")
- ❌ Incomplete input validation (username, password, tokens)
- ❌ Weak JWT validation (no signature verification, no expiry buffer)
- ❌ No rate limiting (brute force risk)
- ❌ Information disclosure in error messages
- ❌ Sensitive data potentially logged

---

### Category B: Payment Processing (5 Functions)

| # | File Path | Function | Purpose | Current Issues |
|---|-----------|----------|---------|-----------------|
| 6 | `netlify/functions_active/lnbits-proxy.ts` | LNbits Proxy | Routes payment operations to LNbits | Missing security headers, weak CORS, no input validation, no rate limiting |
| 7 | `netlify/functions_active/individual-wallet-unified.js` | Individual Wallet | Handles individual wallet operations | Missing security headers, weak CORS, no input validation, no rate limiting |
| 8 | `netlify/functions_active/family-wallet-unified.js` | Family Wallet | Handles family wallet operations | Missing security headers, weak CORS, no input validation, no rate limiting |
| 9 | `netlify/functions_active/nostr-wallet-connect.js` | NWC Operations | Nostr Wallet Connect (NIP-47) | Missing security headers, weak CORS, no input validation, no rate limiting |
| 10 | `netlify/functions_active/phoenixd-status.js` | Phoenixd Status | Payment node status | Missing security headers, weak CORS, no authentication, no rate limiting |

**Shared Issues:**
- ❌ Missing security headers
- ❌ Weak CORS configuration
- ❌ No input validation on payment amounts, invoices, wallet IDs
- ❌ No rate limiting (DoS risk)
- ❌ Missing authentication on some endpoints
- ❌ Sensitive payment data potentially logged

---

### Category C: Admin Operations (3 Functions)

| # | File Path | Function | Purpose | Current Issues |
|---|-----------|----------|---------|-----------------|
| 11 | `netlify/functions_active/admin-dashboard.ts` | Admin Dashboard | Admin dashboard operations | Missing security headers, weak CORS, no input validation, weak rate limiting |
| 12 | `netlify/functions_active/webauthn-register.ts` | WebAuthn Register | MFA registration | Missing security headers, wildcard CORS, no input validation, weak rate limiting |
| 13 | `netlify/functions_active/webauthn-authenticate.ts` | WebAuthn Auth | MFA authentication | Missing security headers, wildcard CORS, no input validation, weak rate limiting |

**Shared Issues:**
- ❌ Missing security headers
- ❌ Weak CORS (some use wildcard "*")
- ❌ No input validation on action parameters, credentials
- ❌ Weak rate limiting (30 req/min too permissive for admin)
- ❌ Weak JWT validation
- ❌ No role-based access control validation

---

### Category D: Key Management (2 Functions)

| # | File Path | Function | Purpose | Current Issues |
|---|-----------|----------|---------|-----------------|
| 14 | `netlify/functions_active/key-rotation-unified.ts` | Key Rotation | Handles Nostr key rotation | Missing security headers, weak CORS, no input validation, no rate limiting |
| 15 | `netlify/functions_active/nfc-enable-signing.ts` | NFC Signing | NFC-based signing operations | Missing security headers, weak CORS, no input validation, no rate limiting |

**Shared Issues:**
- ❌ Missing security headers
- ❌ Weak CORS configuration
- ❌ No input validation on key data, signatures
- ❌ No rate limiting
- ❌ Sensitive key data potentially logged

---

## 2. SECURITY HARDENING CHECKLIST

### For Each Function, Apply:

#### ✅ Security Headers
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY
- [ ] X-XSS-Protection: 1; mode=block
- [ ] Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
- [ ] Content-Security-Policy: default-src 'self'
- [ ] Referrer-Policy: strict-origin-when-cross-origin
- [ ] Vary: Origin

#### ✅ CORS Validation
- [ ] Remove wildcard "*" CORS
- [ ] Implement strict origin whitelist
- [ ] Use environment variables for allowed origins
- [ ] Validate origin on every request
- [ ] Add proper credentials handling

#### ✅ Input Validation
- [ ] Validate all user inputs (usernames, passwords, tokens, amounts)
- [ ] Check length limits (MAX_USERNAME_LENGTH, MAX_MESSAGE_LENGTH, etc.)
- [ ] Validate format (UUID, email, Nostr pubkey, etc.)
- [ ] Sanitize inputs to prevent XSS
- [ ] Validate JSON payloads

#### ✅ Rate Limiting
- [ ] Apply database-backed rate limiting
- [ ] Use appropriate limits per endpoint (see audit report)
- [ ] Implement per-IP and per-user rate limiting
- [ ] Add bypass prevention (check proxy headers)
- [ ] Return 429 status on rate limit exceeded

#### ✅ JWT Validation
- [ ] Validate JWT structure (3-part check)
- [ ] Verify signature with correct secret
- [ ] Check expiry with buffer time (5-minute grace period)
- [ ] Validate issuer and audience
- [ ] Use correct JWT_SECRET (not DUID_SERVER_SECRET)

#### ✅ Error Handling
- [ ] Use generic error messages in production
- [ ] Log detailed errors server-side only
- [ ] Remove stack traces from client responses
- [ ] Don't expose database errors
- [ ] Don't expose environment variable names

#### ✅ Sensitive Data Protection
- [ ] Don't log nsec, passwords, salts, hashes
- [ ] Don't log JWT tokens
- [ ] Don't log payment amounts or invoice details
- [ ] Don't log private keys or credentials
- [ ] Redact sensitive data from logs

---

## 3. IMPLEMENTATION APPROACH

### Phase 1: Create Centralized Utilities (Week 1 - 40 hours)
**Prerequisite for Phase 2**

Create these utilities first (already documented in NETLIFY_FUNCTIONS_SECURITY_HARDENING_PLAN.md):
1. `netlify/functions_active/utils/security-headers.ts` - Security headers utility
2. `netlify/functions_active/utils/input-validation.ts` - Input validation utility
3. `netlify/functions_active/utils/enhanced-rate-limiter.ts` - Rate limiting utility
4. `netlify/functions_active/utils/jwt-validation.ts` - JWT validation utility
5. `netlify/functions_active/utils/error-handler.ts` - Error handling utility

### Phase 2: Apply to CRITICAL Functions (Week 2-3 - 80 hours)

**Implementation Order (by dependency and risk):**

#### Day 6-8: Authentication Functions (24 hours)
1. `auth-unified.js` (8 hours)
   - Apply security headers
   - Implement CORS validation
   - Add input validation for all auth operations
   - Add rate limiting (AUTH_SIGNIN: 10 req/15min, AUTH_REFRESH: 60 req/hr)
   - Enhance JWT validation with expiry buffer
   - Implement error handling without information disclosure

2. `register-identity.ts` (8 hours)
   - Apply security headers
   - Implement CORS validation
   - Add comprehensive input validation (username, password, npub, nsec)
   - Add rate limiting (AUTH_REGISTER: 3 req/24hr)
   - Sanitize all inputs
   - Redact sensitive data from logs

3. `auth-refresh.js` (4 hours)
   - Apply security headers
   - Implement CORS validation
   - Add rate limiting (AUTH_REFRESH: 60 req/hr)
   - Fix JWT validation (add expiry buffer, use correct secret)
   - Add error handling

4. `auth-session-user.js` (2 hours)
   - Apply security headers
   - Implement CORS validation
   - Add rate limiting
   - Add error handling

5. `signin-handler.js` (2 hours)
   - Apply security headers
   - Implement CORS validation
   - Add input validation
   - Add rate limiting

#### Day 9-10: Payment Functions (20 hours)
6. `lnbits-proxy.ts` (6 hours)
   - Apply security headers
   - Implement CORS validation
   - Add input validation (payment amounts, invoice data, wallet IDs)
   - Add rate limiting (PAYMENT_CREATE: 10 req/hr, PAYMENT_VERIFY: 100 req/hr)
   - Validate all payment parameters

7. `individual-wallet-unified.js` (4 hours)
   - Apply security headers
   - Implement CORS validation
   - Add input validation
   - Add rate limiting

8. `family-wallet-unified.js` (4 hours)
   - Apply security headers
   - Implement CORS validation
   - Add input validation
   - Add rate limiting

9. `nostr-wallet-connect.js` (4 hours)
   - Apply security headers
   - Implement CORS validation
   - Add input validation
   - Add rate limiting

10. `phoenixd-status.js` (2 hours)
    - Apply security headers
    - Implement CORS validation
    - Add authentication check
    - Add rate limiting

#### Day 11-12: Admin Functions (16 hours)
11. `admin-dashboard.ts` (6 hours)
    - Apply security headers
    - Implement CORS validation
    - Add input validation on action parameter
    - Add stricter rate limiting (ADMIN_DASHBOARD: 10 req/min per user)
    - Validate role-based access control
    - Add error handling

12. `webauthn-register.ts` (5 hours)
    - Apply security headers
    - Remove wildcard CORS, implement strict whitelist
    - Add input validation
    - Add stricter rate limiting (ADMIN_ACTIONS: 5 req/min)
    - Fix JWT validation

13. `webauthn-authenticate.ts` (5 hours)
    - Apply security headers
    - Remove wildcard CORS, implement strict whitelist
    - Add input validation
    - Add stricter rate limiting
    - Fix JWT validation

#### Day 13-14: Key Management Functions (12 hours)
14. `key-rotation-unified.ts` (6 hours)
    - Apply security headers
    - Implement CORS validation
    - Add input validation (key data, signatures)
    - Add rate limiting (IDENTITY_PUBLISH: 10 req/hr)
    - Redact sensitive key data from logs

15. `nfc-enable-signing.ts` (6 hours)
    - Apply security headers
    - Implement CORS validation
    - Add input validation
    - Add rate limiting
    - Redact sensitive data from logs

#### Day 15: Testing & Validation (8 hours)
- Run full test suite
- Manual security testing
- Regression testing
- Performance testing

---

## 4. EFFORT ESTIMATES

### Per Function Estimates:

| Function | Complexity | Effort | Notes |
|----------|-----------|--------|-------|
| auth-unified.js | HIGH | 8 hours | Complex routing, multiple endpoints |
| register-identity.ts | HIGH | 8 hours | Complex validation, sensitive data |
| auth-refresh.js | MEDIUM | 4 hours | Straightforward JWT handling |
| auth-session-user.js | LOW | 2 hours | Simple session lookup |
| signin-handler.js | LOW | 2 hours | Basic signin logic |
| lnbits-proxy.ts | HIGH | 6 hours | Complex payment routing |
| individual-wallet-unified.js | MEDIUM | 4 hours | Wallet operations |
| family-wallet-unified.js | MEDIUM | 4 hours | Family wallet operations |
| nostr-wallet-connect.js | MEDIUM | 4 hours | NWC protocol |
| phoenixd-status.js | LOW | 2 hours | Simple status endpoint |
| admin-dashboard.ts | HIGH | 6 hours | Complex admin operations |
| webauthn-register.ts | MEDIUM | 5 hours | MFA registration |
| webauthn-authenticate.ts | MEDIUM | 5 hours | MFA authentication |
| key-rotation-unified.ts | MEDIUM | 6 hours | Key rotation logic |
| nfc-enable-signing.ts | MEDIUM | 6 hours | NFC signing |
| **Testing & Validation** | - | **8 hours** | Full test suite |
| **TOTAL** | - | **80 hours** | 2 weeks (40 hours/week) |

---

## 5. TESTING STRATEGY

### Unit Tests (Per Function)
- [ ] Security headers present and correct
- [ ] CORS validation working (whitelist, no wildcard)
- [ ] Input validation (valid/invalid inputs)
- [ ] Rate limiting (allowed/blocked requests)
- [ ] JWT validation (valid/invalid/expired tokens)
- [ ] Error handling (generic messages, no info disclosure)

### Integration Tests
- [ ] End-to-end authentication flow
- [ ] Payment processing flow
- [ ] Admin operations flow
- [ ] Key rotation flow
- [ ] NFC operations flow

### Security Tests
- [ ] CORS bypass attempts
- [ ] Rate limit bypass attempts
- [ ] JWT tampering attempts
- [ ] Input injection attempts (SQL, XSS)
- [ ] Information disclosure attempts

### Performance Tests
- [ ] Security header injection < 1ms
- [ ] Input validation < 5ms
- [ ] Rate limit check < 50ms
- [ ] JWT validation < 10ms
- [ ] Overall function latency < 500ms

---

## 6. RISK ASSESSMENT

### Potential Breaking Changes

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Stricter CORS may break clients | MEDIUM | Thorough testing, gradual rollout, monitoring |
| Rate limiting may block legitimate users | MEDIUM | Careful limit tuning, monitoring, admin bypass |
| Input validation may reject valid data | LOW | Comprehensive testing, edge case handling |
| JWT validation changes may break sessions | MEDIUM | Backward compatibility, grace period |
| Performance impact from validation | LOW | Caching, optimization, performance testing |

### Compatibility Issues

- ✅ Backward compatible with existing clients (no API changes)
- ✅ No database schema changes required
- ✅ No breaking changes to function signatures
- ⚠️ May require client-side CORS header adjustments
- ⚠️ May require rate limit tuning based on usage patterns

---

## 7. SUCCESS CRITERIA

### Per Function:
- ✅ All security headers present
- ✅ CORS validation working (no wildcard)
- ✅ Input validation comprehensive
- ✅ Rate limiting enforced
- ✅ JWT validation secure
- ✅ Error handling safe
- ✅ No sensitive data in logs
- ✅ 100% test coverage for security features
- ✅ Zero regressions in functionality

### Overall:
- ✅ 15 CRITICAL functions hardened
- ✅ 0 CRITICAL vulnerabilities remaining
- ✅ 90%+ security score for each function
- ✅ All tests passing (100% pass rate)
- ✅ No performance degradation
- ✅ Zero production incidents

---

## 8. APPROVAL CHECKLIST

Please review and confirm:

- [ ] Agree with 15 CRITICAL functions inventory
- [ ] Agree with security hardening checklist
- [ ] Agree with implementation approach (Phase 1 prerequisite, then Phase 2)
- [ ] Agree with effort estimates (80 hours total)
- [ ] Agree with testing strategy
- [ ] Agree with risk assessment and mitigation
- [ ] Approve proceeding with Phase 1 (centralized utilities) first
- [ ] Ready to begin Phase 2 (apply to CRITICAL functions) after Phase 1 completion

---

## Next Steps

1. **Approve this plan** - Confirm all details are acceptable
2. **Begin Phase 1** - Create centralized security utilities (40 hours, Week 1)
3. **Begin Phase 2** - Apply to CRITICAL functions (80 hours, Week 2-3)
4. **Testing & Validation** - Full test suite and security testing (8 hours, Day 15)
5. **Deployment** - Roll out hardened functions to production

**Ready to proceed?** ✅

