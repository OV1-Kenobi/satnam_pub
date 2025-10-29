# Phase 2 Days 15-20: lnbits-proxy.ts Implementation Plan

**Date:** 2025-10-28  
**Function:** `netlify/functions/lnbits-proxy.ts`  
**File Size:** 1,972 lines  
**Estimated Effort:** 6 hours (Days 15-20)  
**Status:** PLANNING

---

## 📋 Overview

The `lnbits-proxy.ts` file is the unified LNbits operations endpoint handling:
- Wallet operations (create, list, get)
- Payment operations (pay invoice, create address, create Boltcard)
- LNURL operations (well-known, direct, platform)
- Boltcard operations (sync, PIN management)
- NWC (Nostr Wallet Connect) operations

**Current Security Issues:**
- ❌ No centralized security headers (only basic Content-Type)
- ❌ In-memory rate limiting (not persistent)
- ❌ No request ID tracking
- ❌ No standardized error handling
- ❌ No CORS validation
- ❌ Generic error messages expose implementation details

---

## 🎯 9-Step Implementation Plan

### Step 1: Add Security Utility Imports
**Location:** Lines 11-34 (imports section)

**Add imports:**
```typescript
import {
  getSecurityHeaders,
  preflightResponse,
  errorResponse,
  jsonResponse,
} from "./utils/security-headers.ts";
import {
  RATE_LIMITS,
  getClientIP,
  checkRateLimit,
  createRateLimitIdentifier,
} from "./utils/enhanced-rate-limiter.ts";
import {
  generateRequestId,
  createValidationErrorResponse,
  createAuthErrorResponse,
  createRateLimitErrorResponse,
  logError,
} from "./utils/error-handler.ts";
```

**Effort:** 15 minutes

---

### Step 2: Replace CORS Headers
**Location:** Lines 36-47 (json/lnurlJson helpers)

**Current:** Basic Content-Type only
**New:** Use centralized getSecurityHeaders()

**Effort:** 30 minutes

---

### Step 3: Update Handler Start (Lines 283-302)
**Add:**
- Request ID generation
- Client IP extraction
- Request logging

**Effort:** 15 minutes

---

### Step 4: Update Preflight Handler
**Location:** Add OPTIONS handling

**Current:** None (no preflight support)
**New:** Add preflightResponse() support

**Effort:** 10 minutes

---

### Step 5: Update Rate Limiting (Lines 285-295)
**Current:** In-memory allowRequest(ip, 10, 60_000)
**New:** Database-backed checkRateLimit() with RATE_LIMITS.WALLET_OPERATIONS

**Effort:** 20 minutes

---

### Step 6: Update Error Responses
**Locations:** Multiple throughout file
- Line 295: Rate limit error
- Line 298-301: Feature disabled error
- Line 328: Method not allowed
- Line 332: Invalid action
- Line 1963: Unsupported action
- Line 1966-1969: Catch block

**New:** Use standardized error handlers

**Effort:** 1.5 hours

---

### Step 7: Update Success Responses
**Locations:** Multiple throughout file
- All `json(200, ...)` calls
- All `lnurlJson(200, ...)` calls

**New:** Use jsonResponse() for consistency

**Effort:** 1.5 hours

---

### Step 8: Update Final Error Handler (Lines 1964-1970)
**Current:** Generic error logging
**New:** Use logError() and errorResponse()

**Effort:** 15 minutes

---

### Step 9: Verification & Testing
**Tasks:**
- npm run build
- Check for TypeScript errors
- Verify no regressions
- Create completion report

**Effort:** 30 minutes

---

## 📊 Complexity Analysis

| Aspect | Complexity | Notes |
|--------|-----------|-------|
| File Size | HIGH | 1,972 lines - largest payment function |
| Error Responses | HIGH | ~50+ error response locations |
| Success Responses | HIGH | ~30+ success response locations |
| Rate Limiting | MEDIUM | Single location, straightforward replacement |
| CORS Headers | MEDIUM | Need to update json() and lnurlJson() helpers |
| Request Tracking | LOW | Single location at handler start |

---

## ⚠️ Special Considerations

### 1. LNURL Responses
- LNURL endpoints use `lnurlJson()` helper (raw JSON, no envelope)
- Must preserve LNURL response format (no { success, data } wrapper)
- Security headers still apply

### 2. Multiple Response Helpers
- `json()` - Standard API responses with { success, data } envelope
- `lnurlJson()` - LNURL responses (raw JSON)
- Both need security headers

### 3. Action-Based Routing
- Handler uses action-based routing (action in query params or body)
- Each action has its own error handling
- Need to standardize all error responses

### 4. Payment-Specific Validations
- Amount limits for offspring role (50,000 sats daily, 25,000 sats for approval)
- Invoice verification
- Wallet availability checks
- These should use createValidationErrorResponse() or createAuthErrorResponse()

---

## 🔄 Implementation Strategy

**Phase 1: Imports & Helpers (30 min)**
1. Add all security utility imports
2. Update json() and lnurlJson() helpers to include security headers

**Phase 2: Handler Start (15 min)**
1. Add request ID generation
2. Add client IP extraction
3. Add request logging

**Phase 3: Rate Limiting (20 min)**
1. Replace in-memory allowRequest() with checkRateLimit()
2. Use RATE_LIMITS.WALLET_OPERATIONS

**Phase 4: Error Responses (1.5 hours)**
1. Identify all error response locations
2. Replace with standardized error handlers
3. Preserve error semantics (status codes, messages)

**Phase 5: Success Responses (1.5 hours)**
1. Identify all success response locations
2. Replace with jsonResponse()
3. Verify response structure preserved

**Phase 6: Final Error Handler (15 min)**
1. Update catch block to use logError() and errorResponse()

**Phase 7: Verification (30 min)**
1. npm run build
2. Check diagnostics
3. Create completion report

---

## 📈 Expected Outcomes

✅ All 7 security headers applied
✅ Database-backed rate limiting enabled
✅ Request ID tracking enabled
✅ Standardized error handling
✅ CORS validation working
✅ No regressions in functionality
✅ Build passing with no errors

---

## 🚀 Next Steps

1. Start with Step 1: Add security utility imports
2. Update json() and lnurlJson() helpers
3. Update handler start with request ID and client IP
4. Replace rate limiting
5. Systematically update all error responses
6. Update all success responses
7. Update final error handler
8. Verify build and create completion report

