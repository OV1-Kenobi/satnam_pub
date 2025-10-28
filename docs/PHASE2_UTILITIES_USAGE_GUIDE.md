# Phase 2 - Utilities Usage Guide
**Date:** 2025-10-28  
**Status:** 📋 READY FOR PHASE 2 IMPLEMENTATION  
**Purpose:** Quick reference for using centralized utilities in Phase 2

---

## Quick Start - Using the 5 Utilities

### 1. Security Headers Utility

**Import:**
```typescript
import {
  getSecurityHeaders,
  validateOrigin,
  jsonResponse,
  errorResponse,
  successResponse,
  preflightResponse,
} from "./utils/security-headers.js";
```

**Usage Examples:**

```typescript
// Handle CORS preflight
if (event.httpMethod === "OPTIONS") {
  return preflightResponse(event.headers.origin);
}

// Return success response with security headers
return successResponse(
  { data: "example" },
  event.headers.origin
);

// Return error response with security headers
return errorResponse(
  400,
  "Invalid request",
  event.headers.origin
);

// Get security headers for custom response
const headers = getSecurityHeaders(event.headers.origin);
```

---

### 2. Input Validation Utility

**Import:**
```typescript
import {
  MAX_LENGTHS,
  VALIDATION_PATTERNS,
  validateUUID,
  validateEmail,
  validateUsername,
  validatePassword,
  validateNostrPubkey,
  validateNIP05,
  sanitizeInput,
  htmlEncode,
  validateRequired,
} from "./utils/input-validation.js";
```

**Usage Examples:**

```typescript
// Validate UUID
if (!validateUUID(userId)) {
  return errorResponse(400, "Invalid user ID", origin);
}

// Validate email
if (!validateEmail(email)) {
  return errorResponse(400, "Invalid email", origin);
}

// Validate password strength
if (!validatePassword(password)) {
  return errorResponse(400, "Password too weak", origin);
}

// Validate Nostr pubkey
if (!validateNostrPubkey(npub)) {
  return errorResponse(400, "Invalid Nostr pubkey", origin);
}

// Validate length
if (message.length > MAX_LENGTHS.MESSAGE) {
  return errorResponse(400, "Message too long", origin);
}

// Sanitize user input
const cleanInput = sanitizeInput(userInput);

// HTML encode for safe output
const safeOutput = htmlEncode(userInput);
```

---

### 3. Enhanced Rate Limiter Utility

**Import:**
```typescript
import {
  RATE_LIMITS,
  getClientIP,
  checkRateLimit,
  createRateLimitIdentifier,
  checkRateLimitStatus,
} from "./utils/enhanced-rate-limiter.js";
```

**Usage Examples:**

```typescript
// Get client IP
const clientIP = getClientIP(event.headers);

// Create rate limit identifier
const identifier = createRateLimitIdentifier(userId, clientIP);

// Check rate limit
const allowed = await checkRateLimit(
  identifier,
  RATE_LIMITS.AUTH_SIGNIN
);

if (!allowed) {
  return errorResponse(429, "Too many requests", origin);
}

// Check rate limit status
const status = await checkRateLimitStatus(
  identifier,
  RATE_LIMITS.PAYMENT_CREATE
);

if (!status.allowed) {
  return errorResponse(429, "Rate limit exceeded", origin);
}
```

---

### 4. JWT Validation Utility

**Import:**
```typescript
import {
  validateJWT,
  validateJWTFromHeader,
  validateJWTWithEnvSecret,
  validateJWTFromHeaderWithEnvSecret,
  extractTokenFromHeader,
  getJWTSecret,
} from "./utils/jwt-validation.js";
```

**Usage Examples:**

```typescript
// Validate JWT from Authorization header
const result = validateJWTFromHeaderWithEnvSecret(
  event.headers.authorization,
  {
    issuer: "satnam.pub",
    audience: "satnam.pub-users",
    clockTolerance: 300, // 5 minutes
  }
);

if (!result.valid) {
  return errorResponse(401, "Unauthorized", origin);
}

// Access validated payload
const userId = result.payload?.userId;
const nip05 = result.payload?.nip05;

// Manual JWT validation
const secret = getJWTSecret();
const validationResult = validateJWT(token, secret, {
  issuer: "satnam.pub",
  audience: "satnam.pub-users",
});

if (!validationResult.valid) {
  return errorResponse(401, "Invalid token", origin);
}
```

---

### 5. Error Handler Utility

**Import:**
```typescript
import {
  generateRequestId,
  createErrorResponse,
  createValidationErrorResponse,
  createAuthErrorResponse,
  createRateLimitErrorResponse,
  createServerErrorResponse,
  logError,
  captureError,
  handleError,
  validateRequiredFields,
  validateFieldType,
} from "./utils/error-handler.js";
```

**Usage Examples:**

```typescript
// Generate request ID
const requestId = generateRequestId();

// Validate required fields
const requiredError = validateRequiredFields(
  body,
  ["username", "password"],
  requestId,
  origin
);
if (requiredError) {
  return requiredError;
}

// Validate field type
const typeError = validateFieldType(
  body,
  "amount",
  "number",
  requestId,
  origin
);
if (typeError) {
  return typeError;
}

// Create specific error responses
if (isRateLimited) {
  return createRateLimitErrorResponse(requestId, origin);
}

if (!isAuthenticated) {
  return createAuthErrorResponse("Invalid credentials", requestId, origin);
}

// Log error
logError(error, {
  requestId,
  userId,
  endpoint: "auth-signin",
  method: "POST",
});

// Capture error with Sentry
await captureError(error, {
  requestId,
  userId,
  endpoint: "auth-signin",
});

// Comprehensive error handling
try {
  // ... function logic
} catch (error) {
  return await handleError(error, 500, {
    requestId,
    userId,
    endpoint: "auth-signin",
  }, origin);
}
```

---

## Complete Function Template

Here's a complete example using all 5 utilities:

```typescript
import type { Handler } from "@netlify/functions";
import {
  successResponse,
  errorResponse,
  preflightResponse,
} from "./utils/security-headers.js";
import {
  validateEmail,
  validatePassword,
  MAX_LENGTHS,
} from "./utils/input-validation.js";
import {
  RATE_LIMITS,
  getClientIP,
  checkRateLimit,
  createRateLimitIdentifier,
} from "./utils/enhanced-rate-limiter.js";
import {
  validateJWTFromHeaderWithEnvSecret,
} from "./utils/jwt-validation.js";
import {
  generateRequestId,
  validateRequiredFields,
  logError,
} from "./utils/error-handler.js";

const handler: Handler = async (event) => {
  const origin = event.headers.origin;
  const requestId = generateRequestId();

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(origin);
  }

  try {
    // Validate JWT
    const jwtResult = validateJWTFromHeaderWithEnvSecret(
      event.headers.authorization,
      { issuer: "satnam.pub", audience: "satnam.pub-users" }
    );
    if (!jwtResult.valid) {
      return errorResponse(401, "Unauthorized", requestId, origin);
    }

    // Parse request body
    const body = JSON.parse(event.body || "{}");

    // Validate required fields
    const fieldError = validateRequiredFields(
      body,
      ["email", "password"],
      requestId,
      origin
    );
    if (fieldError) return fieldError;

    // Validate input formats
    if (!validateEmail(body.email)) {
      return errorResponse(400, "Invalid email", requestId, origin);
    }
    if (!validatePassword(body.password)) {
      return errorResponse(400, "Password too weak", requestId, origin);
    }

    // Check rate limit
    const clientIP = getClientIP(event.headers);
    const userId = jwtResult.payload?.userId;
    const identifier = createRateLimitIdentifier(userId, clientIP);
    const allowed = await checkRateLimit(
      identifier,
      RATE_LIMITS.AUTH_SIGNIN
    );
    if (!allowed) {
      return errorResponse(429, "Too many requests", requestId, origin);
    }

    // Process request
    const result = { success: true, data: "processed" };

    return successResponse(result, origin);
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "example-function",
      method: event.httpMethod,
    });
    return errorResponse(500, "Server error", requestId, origin);
  }
};

export { handler };
```

---

## Rate Limit Configuration Reference

```typescript
// Use these predefined rate limits in Phase 2:
RATE_LIMITS.AUTH_SIGNIN           // 10 req/15min
RATE_LIMITS.AUTH_REGISTER         // 3 req/24hr
RATE_LIMITS.AUTH_REFRESH          // 60 req/hr
RATE_LIMITS.AUTH_SESSION          // 100 req/hr
RATE_LIMITS.PAYMENT_CREATE        // 10 req/hr
RATE_LIMITS.PAYMENT_VERIFY        // 100 req/hr
RATE_LIMITS.PAYMENT_HISTORY       // 50 req/hr
RATE_LIMITS.ADMIN_ACTIONS         // 5 req/min
RATE_LIMITS.ADMIN_DASHBOARD       // 10 req/min
RATE_LIMITS.IDENTITY_PUBLISH      // 10 req/hr
RATE_LIMITS.IDENTITY_VERIFY       // 50 req/hr
RATE_LIMITS.NFC_OPERATIONS        // 20 req/hr
RATE_LIMITS.WALLET_OPERATIONS     // 30 req/hr
RATE_LIMITS.DEFAULT               // 30 req/min
```

---

## Validation Constants Reference

```typescript
// Use these constants for input validation:
MAX_LENGTHS.USERNAME              // 64
MAX_LENGTHS.PASSWORD              // 256
MAX_LENGTHS.EMAIL                 // 254
MAX_LENGTHS.MESSAGE               // 10000
MAX_LENGTHS.DATA                  // 10000
MAX_LENGTHS.NPUB                  // 63
MAX_LENGTHS.NSEC                  // 63
MAX_LENGTHS.NIP05                 // 254
MAX_LENGTHS.INVOICE               // 1000
MAX_LENGTHS.PAYMENT_AMOUNT        // 21000000
MAX_LENGTHS.WALLET_ID             // 256
MAX_LENGTHS.SIGNATURE             // 256
MAX_LENGTHS.HASH                  // 256
MAX_LENGTHS.UUID                  // 36
MAX_LENGTHS.URL                   // 2048
MAX_LENGTHS.DESCRIPTION           // 5000
MAX_LENGTHS.METADATA              // 50000
```

---

## Common Patterns for Phase 2

### Pattern 1: Authenticate and Validate
```typescript
// 1. Validate JWT
// 2. Validate required fields
// 3. Validate input formats
// 4. Check rate limit
// 5. Process request
// 6. Return response with security headers
```

### Pattern 2: Admin Operations
```typescript
// 1. Validate JWT
// 2. Check admin role
// 3. Validate required fields
// 4. Use stricter rate limit (ADMIN_ACTIONS)
// 5. Log operation
// 6. Return response
```

### Pattern 3: Payment Operations
```typescript
// 1. Validate JWT
// 2. Validate payment amount
// 3. Validate invoice format
// 4. Check rate limit (PAYMENT_CREATE or PAYMENT_VERIFY)
// 5. Process payment
// 6. Return response
```

---

## Phase 2 Implementation Checklist

For each of the 15 CRITICAL functions:

- [ ] Import all 5 utilities
- [ ] Add CORS preflight handling
- [ ] Add security headers to all responses
- [ ] Add input validation for all parameters
- [ ] Add rate limiting check
- [ ] Add JWT validation
- [ ] Add error handling with request ID
- [ ] Test with valid/invalid inputs
- [ ] Test rate limiting
- [ ] Test CORS validation
- [ ] Test error responses

---

## Ready for Phase 2 ✅

All utilities are ready to be integrated into the 15 CRITICAL functions.

**Next:** Begin Phase 2 implementation starting with Authentication Functions.

