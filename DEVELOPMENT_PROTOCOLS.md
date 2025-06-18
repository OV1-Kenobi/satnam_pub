# DEVELOPMENT PROTOCOLS & STANDARDS

**MANDATORY REFERENCE**: AI assistants MUST follow these protocols in every conversation.

## 🔒 PRIVACY-FIRST & ENCRYPTION SECURITY PROTOCOLS

### Critical Security Rules

- **NO PLAINTEXT SECRETS**: All sensitive data MUST be encrypted at rest and in transit
- **ZERO-KNOWLEDGE ARCHITECTURE**: System must not have access to user private keys
- **END-TO-END ENCRYPTION**: All family communications must be E2E encrypted
- **CONSTANT-TIME OPERATIONS**: All cryptographic operations must be timing-attack resistant
- **SECURE KEY DERIVATION**: Use proper PBKDF2/Argon2 with sufficient iterations

### Required Security Patterns

```typescript
// ✅ CORRECT - Encrypted storage
const encryptedData = await encrypt(sensitiveData, userKey);
await secureStorage.store(encryptedData);

// ❌ WRONG - Plaintext storage
await storage.store(sensitiveData);
```

### Encryption Standards

- **AES-256-GCM** for symmetric encryption
- **RSA-4096** or **Ed25519** for asymmetric encryption
- **Argon2id** for password hashing (see ARGON2_CONFIG.md)
- **HMAC-SHA256** for message authentication
- **Proper IV/nonce generation** for each encryption operation

## 🔧 TYPESCRIPT STRICT ENFORCEMENT

### NO 'any' TYPE POLICY

- **ZERO TOLERANCE** for `any` types in production code
- **300+ 'any' fields MUST be eliminated**
- All function parameters MUST have explicit types
- All return types MUST be explicitly defined
- Use proper union types instead of `any`

### Required Type Patterns

```typescript
// ✅ CORRECT - Explicit typing
interface PaymentRequest {
  fromMember: string;
  toMember: string;
  amountSat: number;
  description?: string;
}

function processPayment(request: PaymentRequest): Promise<PaymentResponse> {
  // Implementation
}

// ❌ WRONG - Using 'any'
function processPayment(request: any): any {
  // Implementation
}
```

### Type Safety Requirements

- Use `strict: true` in tsconfig.json
- Enable `noImplicitAny: true`
- Enable `strictNullChecks: true`
- Use proper type assertions with type guards
- Define interfaces for all API responses
- Use discriminated unions for complex types

## 🛡️ ERROR HANDLING & VALIDATION

### Input Validation Rules

- **VALIDATE ALL INPUTS** at API boundaries
- **SANITIZE ALL USER DATA** before processing
- **TYPE VALIDATION** for all numeric inputs
- **RANGE VALIDATION** for amounts and limits
- **FORMAT VALIDATION** for addresses and keys

### Error Response Standards

```typescript
// ✅ CORRECT - Consistent error format
function jsonError(message: string, status: number = 400): Response {
  return new Response(
    JSON.stringify({
      success: false,
      errorMessage: message,
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

// ❌ WRONG - Inconsistent error handling
throw new Error("Something went wrong");
```

## 🏗️ ARCHITECTURAL STANDARDS

### Lightning System Architecture

#### Individual Lightning Operations

- **Personal PhoenixD nodes** for individual account management
- **Independent liquidity management** with automated balancing per user
- **Private key control** remains with individual user
- **Direct Lightning payments** without family coordination
- **Personal emergency routing** and channel management

#### Family Lightning System

- **Family PhoenixD integration** for coordinated Lightning payments
- **Family member validation** required for federated operations
- **Shared liquidity management** with automated balancing across family
- **Emergency payment routing** when primary family channels fail
- **Coordinated channel management** and liquidity sharing

#### PhoenixD Liquidity Management (BOTH Individual & Family)

- **Automated channel opening** for both individual and family accounts
- **Just-in-time liquidity** provisioning based on usage patterns
- **Intelligent fee management** and routing optimization
- **Emergency liquidity protocols** for urgent payment needs
- **Cross-account liquidity sharing** (family mode) or **isolated management** (individual mode)

### Nostr System Architecture

#### Individual Nostr Operations

- **Personal key management** for individual identity
- **Independent relay connections** and event publishing
- **Private profile management** without family oversight
- **Direct peer-to-peer** communications and interactions

#### Family Nostr Federation

- **Coordinated identity management** across family members
- **Shared relay strategies** for improved reliability
- **Family event coordination** and cross-signing when needed
- **Federated authentication** for family-wide services

### API Design Standards

- **RESTful endpoints** with proper HTTP methods
- **DUAL OPERATION SUPPORT**: All endpoints must handle both individual and family contexts
- **Context parameter**: Clear API parameters to specify individual vs family operations
- **Consistent response formats** across all endpoints
- **Proper status codes** (200, 400, 401, 403, 404, 500)
- **Request/Response interfaces** defined in TypeScript
- **Comprehensive error messages** with actionable information

## 📋 MANDATORY CODE REVIEW CHECKLIST

Before ANY code changes:

- [ ] All `any` types removed and replaced with proper types
- [ ] All sensitive data properly encrypted
- [ ] Input validation implemented for all user inputs
- [ ] Error handling covers all failure cases
- [ ] TypeScript strict mode compliance
- [ ] No hardcoded secrets or keys
- [ ] Constant-time comparison for sensitive operations
- [ ] Proper async/await error handling
- [ ] Rate limiting implemented for API endpoints
- [ ] CSRF protection where applicable
- [ ] **DUAL OPERATION SUPPORT**: Code supports both individual and family operations
- [ ] **PHOENIXD COMPATIBILITY**: PhoenixD liquidity management works for both individual and family accounts
- [ ] **CONTEXT VALIDATION**: Proper validation of individual vs family operation context
- [ ] **FALLBACK MECHANISMS**: Individual operations work even if family features are unavailable

## 🚫 COMMON MISTAKES TO AVOID

### TypeScript Errors

- Using `any` instead of proper types
- Missing type definitions for function parameters
- Implicit return types
- Not handling null/undefined cases
- Using type assertions without type guards

### Security Errors

- Storing secrets in plaintext
- Using weak encryption algorithms
- Missing input validation
- Timing attack vulnerabilities
- Exposing sensitive information in error messages
- Not implementing rate limiting

### API Design Errors

- Inconsistent error response formats
- Missing required field validation
- Not handling edge cases
- Poor error messages
- Missing authentication checks

## 🔄 DEVELOPMENT WORKFLOW

### Before Making Changes

1. **READ THIS DOCUMENT** - Reference these protocols
2. **ANALYZE EXISTING CODE** - Understand current patterns
3. **ASK CLARIFYING QUESTIONS** - Don't assume requirements
4. **PLAN THE APPROACH** - Consider security implications
5. **GET EXPLICIT APPROVAL** - Before implementing changes

### Implementation Standards

- Follow existing code patterns and naming conventions
- Maintain backward compatibility unless breaking changes are approved
- Write comprehensive tests for new functionality
- Update documentation for API changes
- Run security checks before committing

## 📚 REFERENCE DOCUMENTS

Key project documentation to review:

- `GOLD_STANDARD_SECURITY.md` - Security implementation standards
- `PRIVACY_FIRST_ARCHITECTURE.md` - Privacy requirements
- `SECURITY_GUIDELINES.md` - Security best practices
- `ARGON2_CONFIG.md` - Password hashing configuration
- `PHOENIXD_INTEGRATION.md` - Lightning payment integration

---

**🚨 CRITICAL REMINDER**: These protocols exist because similar mistakes keep recurring. Every AI assistant interaction MUST reference and follow these standards to prevent repeating the same issues across 300+ files in this codebase.
