# Phase 2 Days 9-10: auth-refresh.js Implementation Plan

**Function:** `netlify/functions_active/auth-refresh.js` (165 lines)  
**Effort:** 4 hours (Days 9-10)  
**Status:** READY FOR IMPLEMENTATION

---

## 📋 Current State Analysis

### Current Implementation Issues
- ❌ No centralized security headers (custom buildCors function)
- ❌ Weak CORS validation (allows wildcard "*" in dev)
- ❌ No security headers (CSP, HSTS, X-Frame-Options, etc.)
- ❌ No request ID tracking
- ❌ No client IP extraction
- ❌ In-memory rate limiting (60s check only)
- ❌ Generic error responses (no standardization)
- ❌ Unsafe error logging (logs error messages)
- ❌ No structured error handling

### Current Strengths
- ✅ JWT verification with proper algorithm check
- ✅ Token type validation (refresh vs access)
- ✅ HttpOnly cookie handling
- ✅ Proper token expiry calculation
- ✅ Session ID generation

---

## 🎯 9-Step Implementation Plan

### Step 1: Add Security Utility Imports
**Location:** Lines 1-4 (after header comment)

**Add imports:**
```javascript
import {
  getSecurityHeaders,
  validateOrigin,
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
  createErrorResponse,
  createValidationErrorResponse,
  createRateLimitErrorResponse,
  logError,
} from "./utils/error-handler.js";
```

**Impact:** +20 lines

---

### Step 2: Replace buildCors Function
**Location:** Lines 123-136

**Remove:** 14 lines of custom buildCors function

**Replace with:**
```javascript
function buildSecurityHeaders(origin) {
  return getSecurityHeaders(origin, {
    cspPolicy: "default-src 'none'; frame-ancestors 'none'",
  });
}
```

**Impact:** -14 lines, +5 lines = -9 lines net

---

### Step 3: Update CORS Headers Initialization
**Location:** Line 6

**Before:**
```javascript
const cors = buildCors(event);
```

**After:**
```javascript
const requestOrigin = event.headers?.origin || event.headers?.Origin;
const cors = buildSecurityHeaders(requestOrigin);
```

**Impact:** +1 line

---

### Step 4: Update Preflight Handler
**Location:** Lines 9-10

**Before:**
```javascript
if (method === 'OPTIONS') {
  return { statusCode: 204, headers: cors, body: '' };
}
```

**After:**
```javascript
if (method === 'OPTIONS') {
  return preflightResponse(requestOrigin);
}
```

**Impact:** -2 lines, +2 lines = same

---

### Step 5: Add Request ID & Client IP
**Location:** Line 5 (after handler start)

**Add:**
```javascript
const requestId = generateRequestId();
const clientIP = getClientIP(event.headers);

console.log("🚀 Token refresh handler started:", {
  requestId,
  method: event.httpMethod,
  path: event.path,
  timestamp: new Date().toISOString(),
});
```

**Impact:** +6 lines

---

### Step 6: Replace Rate Limiting
**Location:** Lines 47-51

**Before:**
```javascript
// Basic refresh rate-limit (per token): require at least 60s since iat
const nowSec = Math.floor(Date.now() / 1000);
if (payload.iat && nowSec - payload.iat < 60) {
  return { statusCode: 429, headers: cors, body: JSON.stringify({ success:false, error:'Too frequent refresh' }) };
}
```

**After:**
```javascript
// Database-backed rate limiting
const rateLimitKey = createRateLimitIdentifier(payload.userId, clientIP);
const rateLimitAllowed = await checkRateLimit(
  rateLimitKey,
  RATE_LIMITS.AUTH_REFRESH
);

if (!rateLimitAllowed) {
  logError(new Error("Rate limit exceeded"), {
    requestId,
    endpoint: "auth-refresh",
    method: event.httpMethod,
  });
  return createRateLimitErrorResponse(requestId, requestOrigin);
}
```

**Impact:** -5 lines, +12 lines = +7 lines

---

### Step 7: Update Error Responses
**Location:** Lines 12-13, 19-25, 40-44, 50, 56

**Update all error responses to use standardized handlers:**
- Method validation → `errorResponse(405, "Method not allowed", requestId, requestOrigin)`
- Missing token → `errorResponse(401, "No refresh token", requestId, requestOrigin)`
- Invalid token → `errorResponse(401, "Invalid refresh token", requestId, requestOrigin)`
- Config error → `errorResponse(500, "Server configuration error", requestId, requestOrigin)`

**Impact:** Standardized error handling

---

### Step 8: Update Success Response
**Location:** Line 103

**Before:**
```javascript
return { statusCode: 200, headers: { ...cors, 'Set-Cookie': cookie }, body: JSON.stringify(body) };
```

**After:**
```javascript
const response = jsonResponse(200, body, requestOrigin);
response.headers['Set-Cookie'] = cookie;
return response;
```

**Impact:** +2 lines

---

### Step 9: Update Final Error Handler
**Location:** Lines 104-111

**Before:**
```javascript
} catch (error) {
  console.error('auth-refresh error:', error && error.message ? error.message : String(error));
  return {
    statusCode: 500,
    headers: { ...buildCors(event), 'Set-Cookie': clearRefreshCookie() },
    body: JSON.stringify({ success:false, error:'Token refresh failed' })
  };
}
```

**After:**
```javascript
} catch (error) {
  logError(error, {
    requestId,
    endpoint: "auth-refresh",
    method: event.httpMethod,
  });
  const response = errorResponse(500, "Token refresh failed", requestId, requestOrigin);
  response.headers['Set-Cookie'] = clearRefreshCookie();
  return response;
}
```

**Impact:** +3 lines

---

## 📊 Implementation Summary

| Step | Change | Impact |
|------|--------|--------|
| 1 | Add imports | +20 lines |
| 2 | Replace buildCors | -9 lines |
| 3 | Update CORS init | +1 line |
| 4 | Update preflight | 0 lines |
| 5 | Add request ID/IP | +6 lines |
| 6 | Replace rate limiting | +7 lines |
| 7 | Update error responses | Standardized |
| 8 | Update success response | +2 lines |
| 9 | Update error handler | +3 lines |
| **TOTAL** | **Net change** | **+20 lines** |

---

## ✅ Validation Checklist

- [ ] All 5 security utilities imported
- [ ] buildCors replaced with buildSecurityHeaders
- [ ] CORS headers use centralized utility
- [ ] Preflight handler uses preflightResponse()
- [ ] Request ID and client IP added
- [ ] Rate limiting uses database-backed checkRateLimit()
- [ ] All error responses standardized
- [ ] Success response uses jsonResponse()
- [ ] Error handler uses logError() and errorResponse()
- [ ] npm run build passes
- [ ] TypeScript compiles without errors
- [ ] No regressions in functionality
- [ ] Backward compatible

---

## 🔒 Security Improvements

| Feature | Before | After | Status |
|---------|--------|-------|--------|
| Security Headers | 0 | 7 | ✅ |
| CORS Validation | Weak | Strict | ✅ |
| Rate Limiting | In-memory | Database-backed | ✅ |
| Error Handling | Generic | Standardized | ✅ |
| Request Tracking | None | Request ID | ✅ |
| Error Logging | Unsafe | Safe | ✅ |

---

## 🚀 Ready for Implementation

All 9 steps are clearly defined and ready to implement. No blocking issues identified.

**Proceed with implementation?** ✅

