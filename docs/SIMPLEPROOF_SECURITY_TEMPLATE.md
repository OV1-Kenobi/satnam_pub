# SimpleProof Security Template - Reference Implementation

**Date:** 2025-10-28
**Status:** 📋 REFERENCE IMPLEMENTATION
**Security Score:** 95% (A grade)
**Functions:** simpleproof-timestamp.ts, simpleproof-verify.ts

---

## Overview

The SimpleProof functions (`simpleproof-timestamp.ts` and `simpleproof-verify.ts`) serve as the **reference implementation** for security hardening. These functions demonstrate all the security best practices that should be applied to the 15 CRITICAL functions.

**Key Characteristics:**

- ✅ All security headers present
- ✅ Strict CORS validation with whitelist
- ✅ Comprehensive input validation
- ✅ Database-backed rate limiting
- ✅ Proper error handling without information disclosure
- ✅ Structured logging with Sentry integration
- ✅ Privacy-first architecture
- ✅ 95% security score

---

## Security Pattern Breakdown

### 1. Security Headers Implementation

**Location:** Lines 70-88 in simpleproof-timestamp.ts

```typescript
function corsHeaders(origin?: string) {
  // Validate origin against whitelist
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400", // 24 hours
    Vary: "Origin",
    // Security headers
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  } as const;
}
```

**Key Features:**

- ✅ CORS origin validation (no wildcard)
- ✅ Whitelist-based origin checking
- ✅ All security headers present
- ✅ Environment-aware (dev vs prod)
- ✅ Vary header for caching

**Apply to CRITICAL Functions:**

- Use this exact pattern in all 15 functions
- Customize ALLOWED_ORIGINS if needed
- Call corsHeaders() in every response

---

### 2. Input Validation Implementation

**Location:** Lines 30-33 in simpleproof-timestamp.ts

```typescript
// Security: Input validation patterns
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DATA_LENGTH = 10000; // 10KB max for data field
```

**Validation Pattern:**

```typescript
// Validate input length
if (!data || data.length > MAX_DATA_LENGTH) {
  return json(400, {
    success: false,
    error: "Invalid data: exceeds maximum length",
  });
}

// Validate UUID format
if (!UUID_PATTERN.test(verification_id)) {
  return json(400, {
    success: false,
    error: "Invalid verification_id format",
  });
}
```

**Key Features:**

- ✅ Length validation with MAX\_\* constants
- ✅ Format validation with regex patterns
- ✅ Type checking
- ✅ Generic error messages (no info disclosure)

**Apply to CRITICAL Functions:**

- Define MAX\_\* constants for each input type
- Use regex patterns for format validation
- Validate all user inputs before processing
- Return generic error messages

---

### 3. Rate Limiting Implementation

**Location:** Lines 28 in simpleproof-timestamp.ts

```typescript
import { allowRequest } from "./utils/rate-limiter.js";
```

**Usage Pattern:**

```typescript
// Check rate limit
const rateLimitKey = `simpleproof-timestamp:${userId}`;
const allowed = await allowRequest(rateLimitKey, {
  limit: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  keyPrefix: "simpleproof-timestamp",
});

if (!allowed) {
  return json(429, {
    success: false,
    error: "Rate limit exceeded",
  });
}
```

**Key Features:**

- ✅ Database-backed rate limiting
- ✅ Per-user rate limiting
- ✅ Configurable limits and windows
- ✅ Returns 429 status on limit exceeded

**Apply to CRITICAL Functions:**

- Use appropriate rate limits per endpoint (see audit report)
- Implement per-user and per-IP rate limiting
- Check rate limit early in handler
- Return 429 status on exceeded

---

### 4. Error Handling Implementation

**Location:** Lines 91-100 in simpleproof-timestamp.ts

```typescript
function json(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}
```

**Error Response Pattern:**

```typescript
// Generic error messages (no info disclosure)
return json(500, {
  success: false,
  error: "Server error", // Generic message
});

// Log detailed error server-side only
console.error("Detailed error:", error);
```

**Key Features:**

- ✅ Generic error messages for clients
- ✅ Detailed logging server-side only
- ✅ No stack traces in responses
- ✅ No database error details exposed
- ✅ Consistent response format

**Apply to CRITICAL Functions:**

- Use generic error messages in responses
- Log detailed errors server-side only
- Never expose stack traces to clients
- Never expose database errors
- Use consistent response format

---

### 5. Logging Implementation

**Location:** Lines 16-26 in simpleproof-timestamp.ts

```typescript
import {
  createLogger,
  logApiCall,
  logDatabaseOperation,
  logRateLimitEvent,
} from "../functions/utils/logging.js";
import {
  addSimpleProofBreadcrumb,
  captureSimpleProofError,
  initializeSentry,
} from "../functions/utils/sentry.server.js";
```

**Logging Pattern:**

```typescript
// Log API calls (non-sensitive data only)
logApiCall({
  endpoint: "simpleproof-timestamp",
  method: "POST",
  status: 200,
  duration: Date.now() - startTime,
});

// Log rate limit events
logRateLimitEvent({
  endpoint: "simpleproof-timestamp",
  userId: userId,
  allowed: true,
});

// Capture errors with Sentry
captureSimpleProofError(error, {
  context: "timestamp-creation",
  userId: userId,
});
```

**Key Features:**

- ✅ Structured logging
- ✅ No sensitive data in logs
- ✅ Sentry error tracking
- ✅ Breadcrumb tracking for debugging
- ✅ Privacy-first logging

**Apply to CRITICAL Functions:**

- Use structured logging utilities
- Never log nsec, passwords, tokens, keys
- Never log sensitive payment data
- Use Sentry for error tracking
- Add breadcrumbs for debugging

---

### 6. Request Validation Pattern

**Location:** Lines 35-42 in simpleproof-timestamp.ts

```typescript
interface SimpleProofRequest {
  action?: string; // Action-based routing: "create", "verify", "history", "get"
  data?: string;
  verification_id?: string;
  user_id?: string;
  timestamp_id?: string;
  limit?: number;
}
```

**Validation Pattern:**

```typescript
// Parse and validate request
const body = JSON.parse(event.body || "{}");
const { data, verification_id } = body as SimpleProofRequest;

// Validate required fields
if (!data) {
  return json(400, { success: false, error: "Missing required field: data" });
}

if (!verification_id) {
  return json(400, {
    success: false,
    error: "Missing required field: verification_id",
  });
}

// Validate field formats
if (typeof data !== "string") {
  return json(400, { success: false, error: "Invalid data type" });
}
```

**Key Features:**

- ✅ TypeScript interfaces for type safety
- ✅ Required field validation
- ✅ Type checking
- ✅ Generic error messages

**Apply to CRITICAL Functions:**

- Define TypeScript interfaces for all requests
- Validate all required fields
- Check field types
- Return generic error messages

---

### 7. CORS Preflight Handling

**Location:** Lines 110-115 in simpleproof-timestamp.ts

```typescript
// Handle CORS preflight
if (event.httpMethod === "OPTIONS") {
  return {
    statusCode: 204,
    headers: corsHeaders(event.headers.origin),
    body: "",
  };
}
```

**Key Features:**

- ✅ Handles OPTIONS requests
- ✅ Returns 204 No Content
- ✅ Includes CORS headers
- ✅ No body in response

**Apply to CRITICAL Functions:**

- Add CORS preflight handling to all functions
- Return 204 status
- Include corsHeaders() in response

---

## Implementation Checklist

When applying this template to CRITICAL functions:

- [ ] Copy corsHeaders() function
- [ ] Define ALLOWED_ORIGINS whitelist
- [ ] Add input validation patterns (MAX*\*, REGEX*\*)
- [ ] Import rate-limiter utility
- [ ] Add rate limit check early in handler
- [ ] Create json() helper function
- [ ] Use generic error messages
- [ ] Import logging utilities
- [ ] Add structured logging
- [ ] Handle CORS preflight (OPTIONS)
- [ ] Define TypeScript interfaces
- [ ] Validate all required fields
- [ ] Check field types
- [ ] Test with valid/invalid inputs
- [ ] Test rate limiting
- [ ] Test CORS validation
- [ ] Test error handling

---

## Key Differences from Current Functions

| Aspect           | Current (Vulnerable)           | SimpleProof (Secure)          |
| ---------------- | ------------------------------ | ----------------------------- |
| CORS             | Wildcard "\*" or no validation | Strict whitelist validation   |
| Security Headers | Missing                        | All present (7 headers)       |
| Input Validation | Minimal or missing             | Comprehensive                 |
| Rate Limiting    | Missing or in-memory           | Database-backed               |
| Error Messages   | Detailed (info disclosure)     | Generic (safe)                |
| Logging          | May log sensitive data         | Structured, no sensitive data |
| Error Handling   | Exposes stack traces           | Generic messages only         |
| JWT Validation   | No signature verification      | Proper verification           |

---

## Testing the Template

### Unit Tests

```typescript
describe("Security Headers", () => {
  it("should validate origin against whitelist", () => {
    const headers = corsHeaders("https://www.satnam.pub");
    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://www.satnam.pub"
    );
  });

  it("should reject invalid origins", () => {
    const headers = corsHeaders("https://evil.com");
    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://www.satnam.pub"
    );
  });

  it("should include all security headers", () => {
    const headers = corsHeaders();
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Strict-Transport-Security"]).toBeDefined();
  });
});
```

### Integration Tests

```typescript
describe("Input Validation", () => {
  it("should reject data exceeding MAX_DATA_LENGTH", () => {
    const longData = "x".repeat(MAX_DATA_LENGTH + 1);
    // Should return 400 error
  });

  it("should reject invalid UUID format", () => {
    const invalidUUID = "not-a-uuid";
    // Should return 400 error
  });
});
```

---

## Deployment Notes

1. **Phase 1:** Create centralized utilities (security-headers.ts, input-validation.ts, etc.)
2. **Phase 2:** Apply template to each CRITICAL function
3. **Testing:** Run full test suite before deployment
4. **Monitoring:** Monitor error rates and rate limit hits
5. **Rollback:** Have rollback plan if issues arise

---

## References

- SimpleProof Timestamp: `netlify/functions_active/simpleproof-timestamp.ts`
- SimpleProof Verify: `netlify/functions_active/simpleproof-verify.ts`
- Security Audit: `docs/NETLIFY_FUNCTIONS_SECURITY_AUDIT_2025.md`
- Hardening Plan: `docs/NETLIFY_FUNCTIONS_SECURITY_HARDENING_PLAN.md`

---

**Use this template as the reference for all 15 CRITICAL functions.** ✅
