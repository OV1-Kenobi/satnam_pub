# Phase 2 Days 13-14: signin-handler.js Implementation Plan
**Date:** 2025-10-28  
**Status:** PLANNING  
**Function:** `netlify/functions_active/signin-handler.js`  
**Effort:** 2 hours (Days 13-14)  
**Type:** Fifth CRITICAL authentication function

---

## 📋 Current State Analysis

### File Overview
- **Lines:** 254
- **Current Security:** Weak CORS (wildcard "*"), in-memory rate limiting, generic error handling
- **Architecture:** ESM-only, Node.js crypto (needs Web Crypto API migration)

### Current Issues
1. **CORS:** Wildcard "*" on line 87
2. **Rate Limiting:** None implemented
3. **Security Headers:** Missing all 7 headers
4. **Error Handling:** Generic, no request ID tracking
5. **Node.js Crypto:** Uses `node:crypto` and `node:util` (should use Web Crypto API)

---

## 🎯 9-Step Implementation Plan

### Step 1: Add Security Utility Imports
**Location:** Lines 1-10 (after existing imports)

**Add:**
```javascript
import {
  getSecurityHeaders,
  preflightResponse,
  errorResponse,
  jsonResponse,
} from "./utils/security-headers.js";
import {
  RATE_LIMITS,
  getClientIP,
  checkRateLimit,
  createRateLimitIdentifier,
} from "./utils/enhanced-rate-limiter.js";
import {
  generateRequestId,
  createValidationErrorResponse,
  createAuthErrorResponse,
  createRateLimitErrorResponse,
  logError,
} from "./utils/error-handler.js";
```

---

### Step 2: Replace CORS Headers
**Location:** Lines 86-91

**Before:**
```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
```

**After:**
```javascript
function buildSecurityHeaders(origin) {
  return getSecurityHeaders(origin, {
    cspPolicy: "default-src 'none'; frame-ancestors 'none'",
  });
}
```

---

### Step 3: Update Handler Start
**Location:** Lines 85-100

**Add at handler start:**
```javascript
const requestId = generateRequestId();
const clientIP = getClientIP(event.headers);
const requestOrigin = event.headers?.origin || event.headers?.Origin;

console.log("🚀 Sign-in handler started:", {
  requestId,
  method: event.httpMethod,
  path: event.path,
  timestamp: new Date().toISOString(),
});
```

---

### Step 4: Update Preflight Handler
**Location:** Lines 94-100

**Before:**
```javascript
if (event.httpMethod === 'OPTIONS') {
  return {
    statusCode: 204,
    headers: corsHeaders,
    body: ''
  };
}
```

**After:**
```javascript
if (event.httpMethod === 'OPTIONS') {
  return preflightResponse(requestOrigin);
}
```

---

### Step 5: Add Rate Limiting
**Location:** After preflight check

**Add:**
```javascript
const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
const rateLimitAllowed = await checkRateLimit(
  rateLimitKey,
  RATE_LIMITS.AUTH_SIGNIN
);

if (!rateLimitAllowed) {
  logError(new Error("Rate limit exceeded"), {
    requestId,
    endpoint: "signin-handler",
    method: event.httpMethod,
  });
  return createRateLimitErrorResponse(requestId, requestOrigin);
}
```

---

### Step 6: Update Method Validation
**Location:** Lines 102-108

**Before:**
```javascript
if (event.httpMethod !== 'POST') {
  return {
    statusCode: 405,
    headers: corsHeaders,
    body: JSON.stringify({ success: false, error: 'Method not allowed' })
  };
}
```

**After:**
```javascript
if (event.httpMethod !== 'POST') {
  return errorResponse(405, 'Method not allowed', requestId, requestOrigin);
}
```

---

### Step 7: Update Input Validation Error
**Location:** Lines 117-126

**Before:**
```javascript
if (!nip05 || !password) {
  return {
    statusCode: 400,
    headers: corsHeaders,
    body: JSON.stringify({
      success: false,
      error: 'NIP-05 and password are required'
    })
  };
}
```

**After:**
```javascript
if (!nip05 || !password) {
  return createValidationErrorResponse(
    requestId,
    'NIP-05 and password are required',
    requestOrigin
  );
}
```

---

### Step 8: Update Error Responses
**Locations:** Lines 160-168, 180-187

**User not found (Line 160):**
```javascript
return errorResponse(404, 'User not found', requestId, requestOrigin);
```

**Invalid credentials (Line 180):**
```javascript
return createAuthErrorResponse(
  requestId,
  'Invalid credentials',
  requestOrigin
);
```

---

### Step 9: Update Success Response & Error Handler
**Location:** Lines 215-247

**Success Response (Line 215):**
```javascript
const response = jsonResponse(200, {
  success: true,
  message: 'Authentication successful',
  user: {
    id: user.id,
    username: user.username,
    nip05: user.nip05,
    role: user.role
  },
  session: {
    token,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }
}, requestOrigin);
return response;
```

**Error Handler (Line 234):**
```javascript
} catch (error) {
  logError(error, {
    requestId,
    endpoint: "signin-handler",
    method: event.httpMethod,
  });
  return errorResponse(500, 'Authentication service temporarily unavailable', requestId, requestOrigin);
}
```

---

## 📊 Expected Changes

| Aspect | Before | After | Impact |
|--------|--------|-------|--------|
| Security Headers | 0 | 7 | ✅ Enhanced |
| CORS Validation | Weak | Strict | ✅ Hardened |
| Rate Limiting | None | Database-backed | ✅ Added |
| Error Handling | Generic | Standardized | ✅ Improved |
| Request Tracking | None | Request ID | ✅ Added |
| Error Responses | 5 | 5 (standardized) | ✅ Improved |

---

## ✅ Verification Checklist

- [ ] All 5 security utilities imported
- [ ] CORS headers replaced with centralized utility
- [ ] Preflight handler uses preflightResponse()
- [ ] Request ID and client IP added
- [ ] Rate limiting integrated (database-backed)
- [ ] All error responses standardized
- [ ] Success response uses jsonResponse()
- [ ] Final error handler uses logError()
- [ ] npm run build passes
- [ ] No TypeScript errors
- [ ] No regressions in functionality

---

## 🚀 Next Steps

1. Implement all 9 steps
2. Verify compilation: `npm run build`
3. Check for TypeScript errors
4. Present modified code for review
5. Create completion report
6. Wait for user approval before commit/push

