# Netlify Functions Security Hardening Plan

**Date:** 2025-10-26  
**Status:** 📋 READY FOR IMPLEMENTATION  
**Priority:** 🚨 CRITICAL  
**Estimated Duration:** 4-6 weeks (phased approach)

---

## Executive Summary

This document outlines a **strategic, phased approach** to harden all 50+ Netlify Functions based on the comprehensive security audit findings. The plan prioritizes **CRITICAL vulnerabilities** first, followed by HIGH and MEDIUM-priority issues.

**Key Objectives:**

1. ✅ Eliminate all CRITICAL vulnerabilities (15 issues)
2. ✅ Fix all HIGH-priority security gaps (32 issues)
3. ✅ Address MEDIUM-priority issues (28 issues)
4. ✅ Establish security best practices for future development
5. ✅ Achieve **90%+ security score** across all functions

---

## Implementation Strategy

### Approach: **Centralized Utilities + Phased Rollout**

**Why This Approach?**

- ✅ **Consistency** - All functions use same security patterns
- ✅ **Maintainability** - Single source of truth for security logic
- ✅ **Testability** - Centralized utilities are easier to test
- ✅ **Efficiency** - Faster implementation (create once, apply everywhere)
- ✅ **Scalability** - Easy to add new security features

**Implementation Phases:**

1. **Phase 1 (Week 1):** Create centralized security utilities
2. **Phase 2 (Week 2-3):** Apply to CRITICAL functions (authentication, payments, admin)
3. **Phase 3 (Week 4-5):** Apply to HIGH-priority functions (messaging, identity, wallets)
4. **Phase 4 (Week 6):** Apply to remaining functions + testing + documentation

---

## Phase 1: Create Centralized Security Utilities (Week 1)

**Duration:** 5 days  
**Priority:** 🚨 CRITICAL  
**Effort:** 40 hours

### Task 1.1: Security Headers Utility (Day 1 - 8 hours)

**File:** `netlify/functions_active/utils/security-headers.ts`

**Features:**

- Centralized security headers function
- CORS origin validation with whitelist
- Environment-aware configuration (dev vs prod)
- Support for custom headers per function

**Implementation:**

```typescript
/**
 * Centralized Security Headers Utility
 * Provides enterprise-grade security headers for all Netlify Functions
 */

export interface SecurityHeadersOptions {
  origin?: string;
  allowCredentials?: boolean;
  additionalMethods?: string[];
  customCSP?: string;
}

const ALLOWED_ORIGINS = [
  "https://www.satnam.pub",
  "https://satnam.pub",
  "https://app.satnam.pub",
];

const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8888",
  "http://127.0.0.1:5173",
];

export function validateOrigin(origin: string | undefined): string {
  const isDev = process.env.NODE_ENV !== "production";
  const allowedOrigins = isDev
    ? [...ALLOWED_ORIGINS, ...DEV_ORIGINS]
    : ALLOWED_ORIGINS;

  if (!origin || !allowedOrigins.includes(origin)) {
    return ALLOWED_ORIGINS[0]; // Default to primary origin
  }

  return origin;
}

export function getSecurityHeaders(
  options: SecurityHeadersOptions = {}
): Record<string, string> {
  const {
    origin,
    allowCredentials = false,
    additionalMethods = [],
    customCSP,
  } = options;

  const validatedOrigin = validateOrigin(origin);
  const methods = [
    "GET",
    "POST",
    "PUT",
    "DELETE",
    "OPTIONS",
    ...additionalMethods,
  ].join(", ");

  return {
    // CORS Headers
    "Access-Control-Allow-Origin": validatedOrigin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
    "Access-Control-Allow-Credentials": allowCredentials ? "true" : "false",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",

    // Security Headers
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    // NOTE: Using 'self' instead of 'none' to allow browser-based clients to fetch responses
    // For API-only endpoints that don't serve HTML/JS, consider using customCSP: "default-src 'none'"
    "Content-Security-Policy": customCSP || "default-src 'self'",
    "Referrer-Policy": "strict-origin-when-cross-origin",

    // Standard Headers
    "Content-Type": "application/json",
  };
}

export function getCorsPreflightHeaders(
  origin?: string
): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": validateOrigin(origin),
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
```

**Testing:**

- Unit tests for origin validation
- Integration tests with different origins
- CORS preflight tests
- Production vs development mode tests

**Success Criteria:**

- ✅ All security headers present
- ✅ CORS validation working
- ✅ 100% test coverage
- ✅ Zero regressions

---

### Task 1.2: Input Validation Utility (Day 2 - 8 hours)

**File:** `netlify/functions_active/utils/input-validation.ts`

**Features:**

- Length validation with configurable limits
- Format validation (UUID, email, URL, etc.)
- Type checking and sanitization
- DoS prevention (max payload size)

**Implementation:**

```typescript
/**
 * Centralized Input Validation Utility
 * Prevents injection attacks, XSS, and DoS
 */

// Length Limits
export const MAX_USERNAME_LENGTH = 20;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_MESSAGE_LENGTH = 10000; // 10KB
export const MAX_JSON_PAYLOAD = 100000; // 100KB
export const MAX_OTS_PROOF_LENGTH = 100000; // 100KB
export const MAX_DATA_LENGTH = 10000; // 10KB

// Validation Patterns
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const NPUB_PATTERN = /^npub1[a-z0-9]{58}$/;
export const HEX_PUBKEY_PATTERN = /^[a-fA-F0-9]{64}$/;

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  sanitized?: string;
}

export function validateUUID(uuid: unknown): ValidationResult {
  if (typeof uuid !== "string") {
    return { isValid: false, error: "UUID must be a string" };
  }

  if (!UUID_PATTERN.test(uuid)) {
    return { isValid: false, error: "Invalid UUID format" };
  }

  return { isValid: true, sanitized: uuid.toLowerCase() };
}

export function validateLength(
  data: unknown,
  maxLength: number,
  fieldName: string = "Data"
): ValidationResult {
  if (typeof data !== "string") {
    return { isValid: false, error: `${fieldName} must be a string` };
  }

  if (data.length > maxLength) {
    return {
      isValid: false,
      error: `${fieldName} exceeds maximum length of ${maxLength} characters`,
    };
  }

  return { isValid: true, sanitized: data };
}

export function validateUsername(username: unknown): ValidationResult {
  if (typeof username !== "string") {
    return { isValid: false, error: "Username must be a string" };
  }

  const trimmed = username.trim().toLowerCase();

  if (trimmed.length < 3 || trimmed.length > MAX_USERNAME_LENGTH) {
    return {
      isValid: false,
      error: `Username must be between 3 and ${MAX_USERNAME_LENGTH} characters`,
    };
  }

  if (!USERNAME_PATTERN.test(trimmed)) {
    return {
      isValid: false,
      error:
        "Username can only contain letters, numbers, underscores, and hyphens",
    };
  }

  return { isValid: true, sanitized: trimmed };
}

export function validateEmail(email: unknown): ValidationResult {
  if (typeof email !== "string") {
    return { isValid: false, error: "Email must be a string" };
  }

  const trimmed = email.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(trimmed)) {
    return { isValid: false, error: "Invalid email format" };
  }

  return { isValid: true, sanitized: trimmed };
}

export function validateNostrPubkey(pubkey: unknown): ValidationResult {
  if (typeof pubkey !== "string") {
    return { isValid: false, error: "Public key must be a string" };
  }

  const trimmed = pubkey.trim();

  if (NPUB_PATTERN.test(trimmed)) {
    return { isValid: true, sanitized: trimmed };
  }

  if (HEX_PUBKEY_PATTERN.test(trimmed)) {
    return { isValid: true, sanitized: trimmed.toLowerCase() };
  }

  return {
    isValid: false,
    error: "Invalid Nostr public key format (must be npub or hex)",
  };
}

/**
 * Sanitize user input for safe display/storage
 * NOTE: This is a basic sanitization for simple text fields.
 * For HTML contexts, use DOMPurify or sanitize-html library.
 * For database queries, use parameterized queries (Supabase handles this).
 *
 * @param input - Raw user input string
 * @param options - Sanitization options
 * @returns Sanitized string safe for storage/display
 */
export function sanitizeInput(
  input: string,
  options: { allowWhitespace?: boolean; maxLength?: number } = {}
): string {
  const { allowWhitespace = true, maxLength = 1000 } = options;

  // Truncate to max length
  let sanitized = input.substring(0, maxLength);

  // Remove dangerous characters (XSS prevention)
  // This is a blacklist approach - for HTML contexts, use whitelist/DOMPurify instead
  sanitized = sanitized.replace(/[<>'"&`]/g, "");

  // Optionally remove all whitespace
  if (!allowWhitespace) {
    sanitized = sanitized.replace(/\s/g, "");
  }

  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, "");

  return sanitized.trim();
}

/**
 * HTML entity encode for safe display in HTML contexts
 * Use this when displaying user input in HTML
 */
export function htmlEncode(input: string): string {
  const entityMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "/": "&#x2F;",
  };

  return input.replace(/[&<>"'\/]/g, (char) => entityMap[char] || char);
}

export function validateJSONPayload(
  payload: unknown,
  maxSize: number = MAX_JSON_PAYLOAD
): ValidationResult {
  if (typeof payload !== "string") {
    return { isValid: false, error: "Payload must be a string" };
  }

  if (payload.length > maxSize) {
    return {
      isValid: false,
      error: `Payload exceeds maximum size of ${maxSize} bytes`,
    };
  }

  try {
    JSON.parse(payload);
    return { isValid: true, sanitized: payload };
  } catch (error) {
    return { isValid: false, error: "Invalid JSON format" };
  }
}
```

**Testing:**

- Unit tests for each validation function
- Edge case testing (empty strings, null, undefined, etc.)
- Performance testing (large payloads)
- Sanitization tests

**Success Criteria:**

- ✅ All validation functions working
- ✅ 100% test coverage
- ✅ Zero false positives/negatives
- ✅ Performance < 1ms per validation

---

### Task 1.3: Enhanced Rate Limiting Utility (Day 3 - 8 hours)

**File:** `netlify/functions_active/utils/enhanced-rate-limiter.ts`

**Features:**

- Database-backed rate limiting (not just in-memory)
- Per-user and per-IP rate limiting
- Configurable limits per endpoint
- Bypass prevention (check proxy headers)
- Distributed rate limiting support

**Implementation:**

```typescript
/**
 * Enhanced Rate Limiting Utility
 * Database-backed rate limiting with bypass prevention
 */

import { getRequestClient } from "../supabase.js";

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
  keyPrefix: string;
}

export const RATE_LIMITS = {
  // Authentication
  AUTH_SIGNIN: {
    limit: 10,
    windowMs: 15 * 60 * 1000,
    keyPrefix: "auth-signin",
  },
  AUTH_REGISTER: {
    limit: 3,
    windowMs: 24 * 60 * 60 * 1000,
    keyPrefix: "auth-register",
  },
  AUTH_REFRESH: {
    limit: 60,
    windowMs: 60 * 60 * 1000,
    keyPrefix: "auth-refresh",
  },

  // Admin
  ADMIN_DASHBOARD: {
    limit: 10,
    windowMs: 60 * 1000,
    keyPrefix: "admin-dashboard",
  },
  ADMIN_ACTIONS: { limit: 5, windowMs: 60 * 1000, keyPrefix: "admin-actions" },

  // Payments
  PAYMENT_CREATE: {
    limit: 10,
    windowMs: 60 * 60 * 1000,
    keyPrefix: "payment-create",
  },
  PAYMENT_VERIFY: {
    limit: 100,
    windowMs: 60 * 60 * 1000,
    keyPrefix: "payment-verify",
  },

  // Messaging
  MESSAGE_SEND: {
    limit: 30,
    windowMs: 60 * 60 * 1000,
    keyPrefix: "message-send",
  },
  MESSAGE_READ: {
    limit: 100,
    windowMs: 60 * 60 * 1000,
    keyPrefix: "message-read",
  },

  // Identity
  IDENTITY_PUBLISH: {
    limit: 10,
    windowMs: 60 * 60 * 1000,
    keyPrefix: "identity-publish",
  },
  IDENTITY_RESOLVE: {
    limit: 100,
    windowMs: 60 * 60 * 1000,
    keyPrefix: "identity-resolve",
  },

  // Default
  DEFAULT: { limit: 60, windowMs: 60 * 1000, keyPrefix: "default" },
} as const;

export function getClientIP(
  headers: Record<string, string | string[] | undefined>
): string {
  // Check multiple headers to prevent bypass
  const xForwardedFor =
    headers["x-forwarded-for"] || headers["X-Forwarded-For"];
  const xRealIP = headers["x-real-ip"] || headers["X-Real-IP"];
  const cfConnectingIP = headers["cf-connecting-ip"];

  // Prefer CF-Connecting-IP (Cloudflare) or X-Real-IP
  if (cfConnectingIP && typeof cfConnectingIP === "string") {
    return cfConnectingIP.split(",")[0].trim();
  }

  if (xRealIP && typeof xRealIP === "string") {
    return xRealIP.split(",")[0].trim();
  }

  if (xForwardedFor) {
    const ip = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
    return ip.split(",")[0].trim();
  }

  return "unknown";
}

export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const supabase = getRequestClient();
  const now = Date.now();
  const windowStart = new Date(now - config.windowMs).toISOString();
  const clientKey = `${config.keyPrefix}:${identifier}`;

  try {
    // Get current count
    const { data, error } = await supabase
      .from("rate_limits")
      .select("count, reset_time")
      .eq("client_key", clientKey)
      .eq("endpoint", config.keyPrefix)
      .gte("reset_time", windowStart)
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // Database error - fail open but log
      console.error("Rate limit check error:", error);
      return {
        allowed: true,
        remaining: config.limit,
        resetAt: now + config.windowMs,
      };
    }

    // Defensive null-safety check: ensure data.reset_time exists and is valid before parsing
    if (
      !data ||
      !data.reset_time ||
      now > new Date(data.reset_time).getTime()
    ) {
      // Create new rate limit record
      const resetTime = new Date(now + config.windowMs).toISOString();

      await supabase.from("rate_limits").upsert(
        {
          client_key: clientKey,
          endpoint: config.keyPrefix,
          count: 1,
          reset_time: resetTime,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "client_key,endpoint",
        }
      );

      return {
        allowed: true,
        remaining: config.limit - 1,
        resetAt: now + config.windowMs,
      };
    }

    if (data.count >= config.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(data.reset_time).getTime(),
      };
    }

    // Increment count
    await supabase
      .from("rate_limits")
      .update({ count: data.count + 1, updated_at: new Date().toISOString() })
      .eq("client_key", clientKey)
      .eq("endpoint", config.keyPrefix);

    return {
      allowed: true,
      remaining: config.limit - data.count - 1,
      resetAt: new Date(data.reset_time).getTime(),
    };
  } catch (error) {
    console.error("Rate limit error:", error);
    // Fail open on error
    return {
      allowed: true,
      remaining: config.limit,
      resetAt: now + config.windowMs,
    };
  }
}
```

**Testing:**

- Unit tests for IP extraction
- Integration tests with database
- Concurrent request tests
- Bypass prevention tests

**Success Criteria:**

- ✅ Database-backed rate limiting working
- ✅ Bypass prevention effective
- ✅ 100% test coverage
- ✅ Performance < 50ms per check

---

### Task 1.4: JWT Validation Utility (Day 4 - 8 hours)

**File:** `netlify/functions_active/utils/jwt-validation.ts`

**Features:**

- Secure JWT validation with signature verification
- Expiry buffer for clock skew
- Token structure validation
- Role-based access control helpers

**Implementation:** (See audit report for example)

---

### Task 1.5: Error Handling Utility (Day 5 - 8 hours)

**File:** `netlify/functions_active/utils/error-handler.ts`

**Features:**

- Standardized error response format
- Production-safe error messages
- Request ID tracking
- Sentry integration

---

## Phase 2: Apply to CRITICAL Functions (Week 2-3)

**Duration:** 10 days  
**Priority:** 🚨 CRITICAL  
**Effort:** 80 hours

### Functions to Harden (Priority Order):

1. **Authentication Functions** (Day 6-8)

   - `auth-unified.js`
   - `signin-handler.js`
   - `register-identity.ts`
   - `auth-refresh.js`
   - `auth-session-user.js`

2. **Payment Functions** (Day 9-10)

   - `lnbits-proxy.ts`
   - `individual-wallet-unified.js`
   - `family-wallet-unified.js`
   - `nostr-wallet-connect.js`
   - `phoenixd-status.js`

3. **Admin Functions** (Day 11-12)

   - `admin-dashboard.ts`
   - `webauthn-register.ts`
   - `webauthn-authenticate.ts`

4. **Key Management Functions** (Day 13-14)

   - `key-rotation-unified.ts`
   - `nfc-enable-signing.ts`

5. **Testing & Validation** (Day 15)
   - Run full test suite
   - Manual security testing
   - Regression testing

---

## Phase 3: Apply to HIGH-Priority Functions (Week 4-5)

**Duration:** 10 days  
**Priority:** ⚠️ HIGH  
**Effort:** 60 hours

### Functions to Harden:

1. **Messaging Functions**

   - `unified-communications.js`
   - `communications/check-giftwrap-support.js`

2. **Identity Functions**

   - `pkarr-publish.ts`
   - `pkarr-resolve.ts`
   - `nip05-resolver.ts`
   - `did-json.ts`
   - `issuer-registry.ts`

3. **NFC Functions**

   - `nfc-unified.ts`
   - `nfc-resolver.ts`
   - `nfc-verify-contact.ts`

4. **Profile Functions**
   - `unified-profiles.ts`

---

## Phase 4: Remaining Functions + Documentation (Week 6)

**Duration:** 5 days  
**Priority:** ℹ️ MEDIUM  
**Effort:** 40 hours

### Tasks:

1. **Apply to Remaining Functions** (Day 26-28)

   - All trust-score functions
   - Verification functions
   - Utility functions

2. **Documentation** (Day 29)

   - Update security documentation
   - Create security best practices guide
   - Update API documentation

3. **Final Testing** (Day 30)
   - Full regression testing
   - Security penetration testing
   - Performance testing

---

## Success Criteria

### Overall Goals:

- ✅ **100% of functions** have security headers
- ✅ **100% of functions** have CORS validation
- ✅ **100% of functions** have input validation
- ✅ **100% of functions** have rate limiting
- ✅ **100% of authenticated endpoints** have JWT validation
- ✅ **Zero CRITICAL vulnerabilities** remaining
- ✅ **Zero HIGH-priority vulnerabilities** remaining
- ✅ **90%+ security score** across all functions
- ✅ **100% test coverage** for security utilities
- ✅ **Zero regressions** in functionality

### Metrics:

| Metric                          | Current  | Target    | Status |
| ------------------------------- | -------- | --------- | ------ |
| Functions with security headers | 2 (4%)   | 50 (100%) | ⚠️     |
| Functions with CORS validation  | 5 (10%)  | 50 (100%) | ⚠️     |
| Functions with input validation | 8 (16%)  | 50 (100%) | ⚠️     |
| Functions with rate limiting    | 22 (44%) | 50 (100%) | ⚠️     |
| Functions with JWT validation   | 38 (76%) | 42 (84%)  | ⚠️     |
| Average security score          | 58%      | 90%+      | ⚠️     |

---

## Risk Mitigation

### Potential Risks:

1. **Breaking Changes** - Security changes may break existing functionality

   - **Mitigation:** Comprehensive testing, phased rollout, feature flags

2. **Performance Impact** - Additional validation may slow down functions

   - **Mitigation:** Performance testing, caching, optimization

3. **CORS Issues** - Stricter CORS may break client applications

   - **Mitigation:** Thorough testing, gradual rollout, monitoring

4. **Rate Limiting False Positives** - Legitimate users may be rate limited
   - **Mitigation:** Careful limit tuning, monitoring, bypass mechanism for admins

---

## Next Steps

1. **Review and Approve Plan** - Get stakeholder approval
2. **Begin Phase 1** - Create centralized security utilities
3. **Monitor Progress** - Track implementation against timeline
4. **Adjust as Needed** - Adapt plan based on findings

---

**Ready to begin implementation? See implementation guide in next section.**
