# Phase 2 Days 11-12: auth-session-user.js Implementation Plan

**Function:** `netlify/functions_active/auth-session-user.js` (140 lines)  
**Effort:** 2 hours (Days 11-12)  
**Status:** READY FOR IMPLEMENTATION

---

## 📋 Current State Analysis

### Current Implementation Issues
- ❌ No centralized security headers (custom corsHeaders function)
- ❌ Weak CORS validation (allows wildcard "*")
- ❌ No security headers (CSP, HSTS, X-Frame-Options, etc.)
- ❌ No request ID tracking
- ❌ In-memory rate limiting (allowRequest function)
- ❌ Generic error responses (no standardization)
- ❌ Unsafe error logging (logs error messages)
- ❌ No structured error handling

### Current Strengths
- ✅ JWT verification with proper algorithm check
- ✅ Token type validation (refresh vs access)
- ✅ Fallback authentication (Bearer token → refresh cookie)
- ✅ DUID-based user lookup
- ✅ Privacy-first schema integration

---

## 🎯 9-Step Implementation Plan

### Step 1: Add Security Utility Imports
**Location:** Lines 1-12 (after header comment)

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

### Step 2: Replace corsHeaders Function
**Location:** Lines 23-35

**Remove:** 12 lines of custom corsHeaders function

**Replace with:**
```javascript
function buildSecurityHeaders(origin) {
  return getSecurityHeaders(origin, {
    cspPolicy: "default-src 'none'; frame-ancestors 'none'",
  });
}
```

**Impact:** -12 lines, +5 lines = -7 lines net

---

### Step 3: Update CORS Headers Initialization
**Location:** Line 38-39

**Before:**
```javascript
const origin = event.headers?.origin || event.headers?.Origin || "*";
const headers = corsHeaders(origin);
```

**After:**
```javascript
const requestOrigin = event.headers?.origin || event.headers?.Origin;
const headers = buildSecurityHeaders(requestOrigin);
```

**Impact:** Same

---

### Step 4: Update Preflight Handler
**Location:** Lines 49

**Before:**
```javascript
if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
```

**After:**
```javascript
if (event.httpMethod === "OPTIONS") {
  return preflightResponse(requestOrigin);
}
```

**Impact:** +1 line

---

### Step 5: Add Request ID & Client IP
**Location:** Line 37 (after handler start)

**Add:**
```javascript
const requestId = generateRequestId();
const clientIP = getClientIP(event.headers);

console.log("🚀 Session user handler started:", {
  requestId,
  method: event.httpMethod,
  path: event.path,
  timestamp: new Date().toISOString(),
});
```

**Impact:** +6 lines

---

### Step 6: Replace Rate Limiting
**Location:** Lines 41-47

**Before:**
```javascript
const clientIP = String(
  event.headers?.["x-forwarded-for"] || event.headers?.["x-real-ip"] || "unknown"
);
if (!allowRequest(clientIP, 30, 60_000)) {
  return { statusCode: 429, headers, body: JSON.stringify({ success: false, error: "Too many attempts" }) };
}
```

**After:**
```javascript
const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
const rateLimitAllowed = await checkRateLimit(
  rateLimitKey,
  RATE_LIMITS.AUTH_SESSION
);

if (!rateLimitAllowed) {
  logError(new Error("Rate limit exceeded"), {
    requestId,
    endpoint: "auth-session-user",
    method: event.httpMethod,
  });
  return createRateLimitErrorResponse(requestId, requestOrigin);
}
```

**Impact:** -6 lines, +12 lines = +6 lines

---

### Step 7: Update Error Responses
**Location:** Lines 50-51, 70, 80, 84, 89, 114, 136

**Update all error responses to use standardized handlers:**
- Method validation → `errorResponse(405, "Method not allowed", requestId, requestOrigin)`
- Missing token → `errorResponse(401, "Unauthorized", requestId, requestOrigin)`
- Invalid token → `errorResponse(401, "Invalid token", requestId, requestOrigin)`
- User not found → `errorResponse(404, "User not found", requestId, requestOrigin)`
- Server error → `errorResponse(500, "Internal server error", requestId, requestOrigin)`

**Impact:** Standardized error handling

---

### Step 8: Update Success Response
**Location:** Line 133

**Before:**
```javascript
return { statusCode: 200, headers: { ...headers, 'X-Auth-Handler': 'auth-session-user-fn', 'X-Has-Encrypted': userPayload.encrypted_nsec ? '1' : '0', 'X-Has-Salt': userPayload.user_salt ? '1' : '0', 'X-Has-Encrypted-IV': userPayload.encrypted_nsec_iv ? '1' : '0' }, body: JSON.stringify({ success: true, data: { user: userPayload } }) };
```

**After:**
```javascript
const response = jsonResponse(200, { success: true, data: { user: userPayload } }, requestOrigin);
response.headers['X-Auth-Handler'] = 'auth-session-user-fn';
response.headers['X-Has-Encrypted'] = userPayload.encrypted_nsec ? '1' : '0';
response.headers['X-Has-Salt'] = userPayload.user_salt ? '1' : '0';
response.headers['X-Has-Encrypted-IV'] = userPayload.encrypted_nsec_iv ? '1' : '0';
return response;
```

**Impact:** +4 lines

---

### Step 9: Update Final Error Handler
**Location:** Lines 134-137

**Before:**
```javascript
} catch (error) {
  console.error("auth-session-user error:", error);
  return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "Internal server error" }) };
}
```

**After:**
```javascript
} catch (error) {
  logError(error, {
    requestId,
    endpoint: "auth-session-user",
    method: event.httpMethod,
  });
  return errorResponse(500, "Internal server error", requestId, requestOrigin);
}
```

**Impact:** +3 lines

---

## 📊 Implementation Summary

| Step | Change | Impact |
|------|--------|--------|
| 1 | Add imports | +20 lines |
| 2 | Replace corsHeaders | -7 lines |
| 3 | Update CORS init | 0 lines |
| 4 | Update preflight | +1 line |
| 5 | Add request ID/IP | +6 lines |
| 6 | Replace rate limiting | +6 lines |
| 7 | Update error responses | Standardized |
| 8 | Update success response | +4 lines |
| 9 | Update error handler | +3 lines |
| **TOTAL** | **Net change** | **+33 lines** |

---

## ✅ Validation Checklist

- [ ] All 5 security utilities imported
- [ ] corsHeaders replaced with buildSecurityHeaders
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

