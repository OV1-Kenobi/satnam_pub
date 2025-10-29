# Phase 2 Days 7-8: register-identity.ts Implementation Plan
**Date:** 2025-10-28  
**Function:** `netlify/functions_active/register-identity.ts`  
**Effort:** 8 hours (Days 7-8)  
**Status:** 📋 READY FOR REVIEW

---

## 📋 Overview

This document outlines the security hardening plan for `register-identity.ts`, the second CRITICAL authentication function. This function handles user identity registration with encrypted nsec storage and is a high-value target for security attacks.

---

## 🔍 Current State Analysis

### File Characteristics
- **Type:** TypeScript (.ts)
- **Size:** 1,386 lines
- **Handler:** Lines 830-1385
- **Current Security:** Partial (basic CORS, rate limiting, validation)

### Current CORS Implementation (Lines 851-872)
```typescript
function getAllowedOrigin(origin: string | undefined): string {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) return "https://satnam.pub";
  if (!origin) return "*";
  // ... localhost check
  return "*";
}
const corsHeaders = {
  "Access-Control-Allow-Origin": getAllowedOrigin(requestOrigin),
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
```

**Issues:**
- ❌ Uses wildcard "*" in development
- ❌ Missing 7 security headers
- ❌ No strict CSP
- ❌ No HSTS
- ❌ No X-Frame-Options

### Current Rate Limiting (Lines 926-950)
```typescript
const isDevelopment = process.env.NODE_ENV !== "production";
const windowSec = isDevelopment ? 300 : 60;
const maxAttempts = isDevelopment ? 50 : 5;
// Uses in-memory rate limiting
```

**Issues:**
- ❌ In-memory rate limiting (not persistent)
- ❌ Not database-backed
- ❌ No per-user tracking
- ❌ No IP-based tracking

### Current Error Handling
- ❌ Generic error messages
- ❌ No request ID tracking
- ❌ No structured logging
- ❌ Sensitive data potentially logged

### Current Input Validation (Lines 381-507)
- ✅ Partial validation present
- ❌ Not using centralized validation utility
- ❌ No sanitization
- ❌ No XSS prevention

---

## ✅ Implementation Plan

### Step 1: Add Security Utility Imports (Lines 1-23)

**Add after existing imports:**
```typescript
import {
  getSecurityHeaders,
  validateOrigin,
  preflightResponse,
  errorResponse,
  jsonResponse,
} from "./utils/security-headers.js";
import {
  validateEmail,
  validatePassword,
  validateUsername,
  validateNIP05,
  sanitizeInput,
  MAX_LENGTHS,
} from "./utils/input-validation.js";
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

**Status:** ✅ Ready to implement

---

### Step 2: Replace getAllowedOrigin Function (Lines 851-865)

**Remove:**
```typescript
function getAllowedOrigin(origin: string | undefined): string {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) return "https://satnam.pub";
  if (!origin) return "*";
  try {
    const u = new URL(origin);
    if (
      (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
      u.protocol === "http:"
    ) {
      return origin;
    }
  } catch {}
  return "*";
}
```

**Replace with:**
```typescript
// Use centralized security headers utility
function buildSecurityHeaders(origin: string | undefined) {
  return getSecurityHeaders(origin, {
    cspPolicy: "default-src 'none'; frame-ancestors 'none'",
  });
}
```

**Status:** ✅ Ready to implement

---

### Step 3: Update CORS Headers (Lines 866-872)

**Remove:**
```typescript
const requestOrigin = event.headers?.origin || event.headers?.Origin;
const corsHeaders = {
  "Access-Control-Allow-Origin": getAllowedOrigin(requestOrigin),
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
```

**Replace with:**
```typescript
const requestOrigin = event.headers?.origin || event.headers?.Origin;
const corsHeaders = buildSecurityHeaders(requestOrigin);
corsHeaders["Content-Type"] = "application/json";
```

**Status:** ✅ Ready to implement

---

### Step 4: Update Preflight Handler (Lines 874-881)

**Remove:**
```typescript
if (event.httpMethod === "OPTIONS") {
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: "",
  };
}
```

**Replace with:**
```typescript
if (event.httpMethod === "OPTIONS") {
  return preflightResponse(requestOrigin);
}
```

**Status:** ✅ Ready to implement

---

### Step 5: Add Request ID & Client IP (Lines 830-850)

**Add at start of handler:**
```typescript
const requestId = generateRequestId();
const clientIP = getClientIP(event.headers);

console.log("🚀 Registration handler started:", {
  requestId,
  method: event.httpMethod,
  path: event.path,
  timestamp: new Date().toISOString(),
});
```

**Status:** ✅ Ready to implement

---

### Step 6: Replace Rate Limiting (Lines 926-1000)

**Remove:**
```typescript
const isDevelopment = process.env.NODE_ENV !== "production";
const windowSec = isDevelopment ? 300 : 60;
const maxAttempts = isDevelopment ? 50 : 5;
// ... in-memory rate limiting logic
```

**Replace with:**
```typescript
// Use centralized database-backed rate limiting
const rateLimitKey = createRateLimitIdentifier(undefined, clientIP);
const rateLimitAllowed = await checkRateLimit(
  rateLimitKey,
  RATE_LIMITS.AUTH_REGISTER
);

if (!rateLimitAllowed) {
  logError(new Error('Rate limit exceeded'), {
    requestId,
    endpoint: 'register-identity',
    method: event.httpMethod,
  });
  return createRateLimitErrorResponse(requestId, requestOrigin);
}
```

**Status:** ✅ Ready to implement

---

### Step 7: Update Error Responses (Lines 883-921)

**Replace generic error responses with:**
```typescript
if (event.httpMethod !== "POST") {
  return errorResponse(405, "Method not allowed", requestId, requestOrigin);
}

// Parse request body
let userData;
try {
  userData =
    typeof event.body === "string" ? JSON.parse(event.body) : event.body;
} catch (parseError) {
  logError(parseError, {
    requestId,
    endpoint: 'register-identity',
    method: event.httpMethod,
  });
  return createValidationErrorResponse(
    "Invalid JSON in request body",
    requestId,
    requestOrigin
  );
}
```

**Status:** ✅ Ready to implement

---

### Step 8: Update Final Error Handler (Lines 1356-1383)

**Replace:**
```typescript
} catch (error) {
  console.error("Registration error:", error);
  // ... cleanup logic
  return {
    statusCode: 500,
    headers: corsHeaders,
    body: JSON.stringify({
      success: false,
      error: "Registration failed",
      meta: {
        timestamp: new Date().toISOString(),
      },
    }),
  };
}
```

**Replace with:**
```typescript
} catch (error) {
  logError(error, {
    requestId,
    endpoint: 'register-identity',
    method: event.httpMethod,
  });
  
  // ... cleanup logic (unchanged)
  
  return errorResponse(
    500,
    "Registration failed",
    requestId,
    requestOrigin
  );
}
```

**Status:** ✅ Ready to implement

---

### Step 9: Update Success Response (Lines 1351-1355)

**Replace:**
```typescript
return {
  statusCode: 201,
  headers: corsHeaders,
  body: JSON.stringify(responseData),
};
```

**Replace with:**
```typescript
return jsonResponse(201, responseData, requestOrigin);
```

**Status:** ✅ Ready to implement

---

## 📊 Security Improvements Summary

| Security Feature | Before | After | Status |
|------------------|--------|-------|--------|
| Security Headers | 0 | 7 | ✅ Will Add |
| CORS Validation | Weak | Strict | ✅ Will Harden |
| Rate Limiting | In-memory | Database-backed | ✅ Will Enhance |
| Error Handling | Generic | Standardized | ✅ Will Improve |
| Request Tracking | None | Request ID | ✅ Will Add |
| Input Validation | Partial | Comprehensive | ✅ Ready |
| Error Logging | Unsafe | Safe | ✅ Will Improve |

---

## 🔍 Validation Checklist

After implementation, verify:
- ✅ All 7 security headers present
- ✅ CORS validation working (no wildcard)
- ✅ Rate limiting enforced (database-backed)
- ✅ Error handling safe (no info disclosure)
- ✅ Request ID tracking enabled
- ✅ No sensitive data in logs
- ✅ TypeScript compiles without errors
- ✅ No regressions in functionality

---

## 📝 Implementation Notes

### What Will Change
1. Add 5 security utility imports
2. Replace getAllowedOrigin with buildSecurityHeaders
3. Update CORS headers to use centralized utility
4. Update preflight handler to use preflightResponse()
5. Add request ID and client IP extraction
6. Replace in-memory rate limiting with database-backed
7. Update error responses to use standardized handlers
8. Update success response to use jsonResponse()

### What Will NOT Change
- Core registration logic
- User identity creation
- Password hashing
- JWT creation
- NIP-05 reservation
- Invitation processing
- All business logic remains intact

### Backward Compatibility
- ✅ All existing functionality preserved
- ✅ Same response structure (wrapped in jsonResponse)
- ✅ Same error handling (wrapped in errorResponse)
- ✅ Same CORS behavior (stricter, but compatible)
- ✅ No breaking changes expected

---

## 🚀 Implementation Order

1. Add imports at top of file
2. Replace getAllowedOrigin function
3. Update CORS headers initialization
4. Update preflight handler
5. Add request ID and client IP at handler start
6. Replace rate limiting logic
7. Update error responses
8. Update success response
9. Update final error handler
10. Test and verify compilation

---

## ✅ Quality Assurance

### Testing Strategy
- ✅ Build verification (npm run build)
- ✅ No compilation errors
- ✅ No runtime errors
- ✅ CORS headers verified
- ✅ Security headers verified
- ✅ Rate limiting verified
- ✅ Error responses verified

### Regression Testing
- ✅ Existing functionality preserved
- ✅ CORS preflight working
- ✅ Error responses working
- ✅ Rate limiting integrated
- ✅ Success responses working

---

## 📈 Effort Estimate

| Task | Effort | Status |
|------|--------|--------|
| Add imports | 0.5h | ⏳ Pending |
| Replace functions | 1h | ⏳ Pending |
| Update handlers | 2h | ⏳ Pending |
| Update error handling | 2h | ⏳ Pending |
| Test and verify | 2.5h | ⏳ Pending |
| **TOTAL** | **8h** | **⏳ Pending** |

---

## 🎯 Status: READY FOR REVIEW

This implementation plan is ready for your review and approval. Once approved, I will proceed with the changes without committing or pushing.

**Next Steps:**
1. Review this plan
2. Approve or request modifications
3. I will implement the changes
4. Present the modified code for your review
5. You decide whether to commit/push

---

## 📞 Questions for User

Before proceeding, please confirm:
1. ✅ Does this implementation plan align with your expectations?
2. ✅ Should I proceed with all 9 steps as outlined?
3. ✅ Any modifications or additional requirements?
4. ✅ Should I implement this now, or wait for further guidance?

