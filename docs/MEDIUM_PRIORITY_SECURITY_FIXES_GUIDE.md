# Medium-Priority Security Fixes Implementation Guide
**Date:** 2025-10-28  
**Total Effort:** 24-33 hours  
**Priority:** ⚠️ MEDIUM (Address after CRITICAL functions hardening)

---

## Overview

This guide details the 5 medium-priority security issues identified during the security review. These issues should be addressed after completing the CRITICAL Netlify Functions hardening (Phase 2).

---

## Issue 1: Mock SecureSessionManager in API Files

### Problem
Multiple API files use mock implementations of SecureSessionManager instead of the real implementation:
- `api/individual/lightning/zap.js`
- `api/rewards.js`
- `api/bridge/swap-status.js`
- `api/bridge/atomic-swap.js`

### Current Code Pattern
```javascript
// TODO: Convert session-manager.ts to JavaScript for proper imports
// import { SecureSessionManager } from "../../../netlify/functions/security/session-manager.js";

// Mock SecureSessionManager for Master Context compliance testing
const SecureSessionManager = {
  validateSessionFromHeader: async (authHeader) => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { isAuthenticated: false };
    }
    return {
      isAuthenticated: true,
      sessionToken: authHeader.replace('Bearer ', ''),
      federationRole: 'adult', // Default to adult for sovereignty testing
      memberId: 'test-member-id'
    };
  }
};
```

### Risk
- Mock always returns authenticated state (security bypass)
- No actual session validation
- Default role assignment without verification
- Test-only implementation in production code

### Solution
1. Create ESM wrapper for session-manager.ts
2. Export proper SecureSessionManager from wrapper
3. Replace mock implementations with real imports
4. Add proper error handling for missing sessions

### Effort: 4-6 hours

---

## Issue 2: Incomplete CSRF Protection Module

### Problem
`lib/security/csrf-protection.ts` exists but lacks complete implementation:
- Token generation not fully implemented
- Validation logic incomplete
- No integration with request handlers

### Current Status
- File exists but is a skeleton
- Missing token storage mechanism
- No middleware integration

### Solution
1. Implement CSRF token generation using Web Crypto API
2. Add token validation with constant-time comparison
3. Create middleware for automatic token injection
4. Add integration tests

### Implementation Pattern
```typescript
// Generate CSRF token
export async function generateCSRFToken(): Promise<string> {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Validate CSRF token
export function validateCSRFToken(token: string, sessionToken: string): boolean {
  // Constant-time comparison
  return constantTimeEqual(token, sessionToken);
}
```

### Effort: 8-10 hours

---

## Issue 3: Lightning Node Security Validation

### Problem
`lib/lightning-node-manager.ts` has incomplete production validation:
- Demo keys not rejected in all scenarios
- Demo URLs (demo.lnbits.com) may slip through
- Macaroon length validation insufficient

### Current Code
```typescript
validateNodeSecurity(nodeType: LightningNodeType): boolean {
  const node = this.nodes.get(nodeType);
  if (!node) return false;

  const environment = getEnvVar("NODE_ENV") || "development";

  if (environment === "production") {
    // All nodes must use HTTPS in production
    if (!node.isSecure) return false;

    // Validate credentials exist and meet minimum requirements
    if (node.macaroon && node.macaroon.length < 16) return false;
    if (node.macaroon === "demo-key") return false;
    if (node.url.includes("demo.lnbits.com")) return false;
  }

  return true;
}
```

### Issues
- Only checks for exact "demo-key" string
- URL check is substring-based (could miss variations)
- No validation of macaroon format/structure
- No check for localhost in production

### Solution
1. Add comprehensive demo key detection (regex patterns)
2. Strengthen URL validation (domain parsing)
3. Add macaroon format validation
4. Reject localhost/127.0.0.1 in production
5. Add unit tests for all validation scenarios

### Effort: 2-3 hours

---

## Issue 4: Sensitive Data in Logs

### Problem
Authentication and registration flows may log sensitive data:
- nsec (private keys)
- Salts used in hashing
- Password hashes
- OTP codes
- JWT tokens

### Locations to Audit
- `lib/auth.ts` - Authentication logic
- `netlify/functions_active/register-identity.ts` - Registration
- `src/lib/auth/user-identities-auth.ts` - User auth
- `src/lib/auth/secure-token-manager.ts` - Token management
- `netlify/functions_active/auth-unified.js` - Unified auth

### Solution
1. Audit all console.log/error statements
2. Remove or redact sensitive data from logs
3. Use structured logging with sanitization
4. Add log redaction utility function
5. Document what can/cannot be logged

### Log Redaction Pattern
```typescript
function redactSensitiveData(data: any): any {
  const sensitiveKeys = ['nsec', 'password', 'salt', 'hash', 'otp', 'token'];
  
  if (typeof data !== 'object') return data;
  
  const redacted = { ...data };
  for (const key of sensitiveKeys) {
    if (key in redacted) {
      redacted[key] = '[REDACTED]';
    }
  }
  return redacted;
}
```

### Effort: 6-8 hours

---

## Issue 5: JWT Token Expiry Validation

### Problem
JWT expiry validation is inconsistent across modules:
- Some use direct comparison: `expiresAt > now`
- Others don't include buffer time
- No standardized approach

### Current Issues
- No grace period for clock skew
- Inconsistent validation logic
- Potential for edge case failures

### Solution
1. Create standardized JWT validation utility
2. Use consistent pattern: `expiresAt > now - bufferTime`
3. Define buffer time constant (e.g., 30 seconds)
4. Apply to all JWT validation locations
5. Add comprehensive tests

### Implementation Pattern
```typescript
const JWT_EXPIRY_BUFFER_MS = 30 * 1000; // 30 second buffer

export function isJWTValid(token: DecodedJWT): boolean {
  const now = Date.now();
  const expiryTime = token.expiresAt * 1000; // Convert to ms
  
  // Token is valid if expiry is in the future (with buffer)
  return expiryTime > now - JWT_EXPIRY_BUFFER_MS;
}
```

### Locations to Update
- `lib/auth.ts`
- `netlify/functions_active/auth-refresh.js`
- `netlify/functions_active/auth-session-user.js`
- `src/lib/auth/secure-token-manager.ts`

### Effort: 4-6 hours

---

## Implementation Timeline

### Week 2 (After CRITICAL functions hardening):

**Day 1-2: Issue 1 & 3** (6-9 hours)
- Fix mock SecureSessionManager
- Strengthen lightning node validation

**Day 3-4: Issue 4** (6-8 hours)
- Audit and redact sensitive data from logs
- Add log redaction utility

**Day 5: Issue 2 & 5** (12-16 hours)
- Complete CSRF protection implementation
- Standardize JWT expiry validation
- Add comprehensive tests

---

## Testing Requirements

### Unit Tests
- CSRF token generation and validation
- Lightning node security validation
- JWT expiry validation with buffer time
- Log redaction utility

### Integration Tests
- SecureSessionManager integration with API files
- CSRF protection middleware with request handlers
- JWT validation in authentication flows

### Security Tests
- Timing attack resistance for CSRF validation
- Constant-time comparison for token validation
- No sensitive data in logs

---

## Success Criteria

✅ All mock SecureSessionManager implementations replaced  
✅ CSRF protection module fully implemented and tested  
✅ Lightning node validation strengthened  
✅ No sensitive data in logs  
✅ JWT expiry validation standardized  
✅ All tests passing (100% coverage)  
✅ No security warnings in code review  

---

## Approval Checklist

- [ ] Review this guide
- [ ] Approve implementation approach
- [ ] Approve effort estimates
- [ ] Ready to proceed after CRITICAL functions hardening

**Next Step:** Begin Phase 2 CRITICAL functions hardening, then return to these medium-priority fixes.

