# Centralized Error Handling System

## Overview

The centralized error handling system provides privacy-first, production-safe error responses across all API endpoints. It automatically sanitizes error details in production while maintaining detailed logging for debugging.

## Key Features

✅ **Privacy-First**: Never exposes sensitive data in error responses  
✅ **Production-Safe**: Automatically sanitizes error details in production  
✅ **Comprehensive**: Handles all error types with proper categorization  
✅ **Consistent**: Standardized error format across all endpoints  
✅ **Trackable**: Request IDs for error tracking and debugging  
✅ **Secure**: Proper security headers and safe logging

## Usage

### 1. Import the Error Handler

```javascript
import { ApiErrorHandler } from "../../lib/error-handler.js";
```

### 2. Handle API Errors

Use `ApiErrorHandler.handleApiError()` for comprehensive error handling:

```javascript
export default async function handler(req, res) {
  try {
    // Your API logic here
    const result = await someOperation();
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    // Centralized error handling
    ApiErrorHandler.handleApiError(
      error, // The error object
      res, // Response object
      "operation description", // Context for logging
      requestId, // Optional: custom request ID
      userId // Optional: user ID for logging
    );
  }
}
```

### 3. Handle Simple Errors

Use `ApiErrorHandler.handleError()` for simple validation or quick errors:

```javascript
// Validation example
if (!username || !pubkey) {
  return ApiErrorHandler.handleError(
    new Error("Username and pubkey required"),
    res,
    "validate request",
    400 // HTTP status code
  );
}
```

## Error Response Format

### Production Response (Safe)

```json
{
  "success": false,
  "error": "Authentication failed",
  "timestamp": "2024-12-28T10:30:00.000Z",
  "requestId": "req_1735380600000_xyz123"
}
```

### Development Response (Detailed)

```json
{
  "success": false,
  "error": "Authentication failed",
  "timestamp": "2024-12-28T10:30:00.000Z",
  "requestId": "req_1735380600000_xyz123",
  "details": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "context": "authenticate user",
    "message": "Invalid signature provided"
  }
}
```

## Error Types & HTTP Status Codes

The system automatically maps error types to appropriate HTTP status codes:

| Error Type                       | HTTP Status | Description             |
| -------------------------------- | ----------- | ----------------------- |
| `AUTH_*`                         | 401         | Authentication errors   |
| `VALIDATION_*`                   | 400         | Input validation errors |
| `*_NOT_FOUND`                    | 404         | Resource not found      |
| `*_PERMISSION_DENIED`            | 403         | Authorization errors    |
| `*_DUPLICATE_ENTRY`              | 409         | Conflict errors         |
| `NETWORK_RATE_LIMITED`           | 429         | Rate limiting           |
| `*_UNAVAILABLE`                  | 503         | Service unavailable     |
| `LIGHTNING_INSUFFICIENT_BALANCE` | 402         | Payment required        |
| `NETWORK_CONNECTION_TIMEOUT`     | 408         | Request timeout         |
| Others                           | 500         | Internal server error   |

## Privacy & Security Features

### 🔒 No Sensitive Data Exposure

- User IDs are hashed before logging
- No private keys, pubkeys, or credentials in responses
- Internal error details hidden in production

### 🛡️ Security Headers

Automatically sets security headers:

- `X-Request-ID`: For request tracking
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`

### 📊 Safe Logging

```javascript
// Logged server-side (safe):
{
  "timestamp": "2024-12-28T10:30:00.000Z",
  "requestId": "req_1735380600000_xyz123",
  "context": "authenticate user",
  "errorCode": "AUTH_INVALID_CREDENTIALS",
  "userIdHash": "user_a1b2c3d4" // Hashed, not actual ID
}
```

## Migration from Old Error Handling

### ❌ Old Pattern (Unsafe)

```javascript
catch (error) {
  console.error('Error:', error);
  res.status(500).json({
    error: 'Failed to process',
    details: error.message  // 🚨 Exposes internal details!
  });
}
```

### ✅ New Pattern (Safe)

```javascript
catch (error) {
  ApiErrorHandler.handleApiError(
    error,
    res,
    'process request'
  );
}
```

## Migration Script

Run the migration analysis script to identify files that need updating:

```bash
node scripts/migrate-error-handling.js
```

This will:

- Scan all API files for error handling patterns
- Identify files needing migration
- Provide specific migration instructions
- Show examples of properly migrated files

## Best Practices

### 1. Use Descriptive Context

```javascript
// ✅ Good - specific context
ApiErrorHandler.handleApiError(error, res, "create family invitation");

// ❌ Bad - vague context
ApiErrorHandler.handleApiError(error, res, "error");
```

### 2. Include User Context When Available

```javascript
// When user is authenticated
ApiErrorHandler.handleApiError(
  error,
  res,
  "process payment",
  undefined, // auto-generate request ID
  userId // include user context
);
```

### 3. Use Appropriate Error Types

```javascript
// For validation errors
if (!email || !isValidEmail(email)) {
  throw new AppError(
    ErrorCode.VALIDATION_INVALID_EMAIL,
    "Invalid email format provided",
    "Please enter a valid email address"
  );
}
```

### 4. Handle Async Operations Properly

```javascript
export default async function handler(req, res) {
  try {
    // Multiple async operations
    const user = await authenticateUser(req);
    const payment = await processPayment(amount);
    const result = await updateDatabase(payment);

    res.json({ success: true, data: result });
  } catch (error) {
    // Single error handler for all operations
    ApiErrorHandler.handleApiError(error, res, "process payment request");
  }
}
```

## Error Code Reference

Common error codes and their meanings:

### Authentication Errors

- `AUTH_INVALID_CREDENTIALS`: Wrong username/password
- `AUTH_TOKEN_EXPIRED`: Session expired
- `AUTH_TOKEN_INVALID`: Invalid session token
- `AUTH_OTP_INVALID`: Wrong verification code

### Database Errors

- `DB_CONNECTION_FAILED`: Cannot connect to database
- `DB_RECORD_NOT_FOUND`: Requested data not found
- `DB_DUPLICATE_ENTRY`: Trying to create duplicate record

### Lightning Errors

- `LIGHTNING_INSUFFICIENT_BALANCE`: Not enough sats
- `LIGHTNING_PAYMENT_FAILED`: Payment could not be processed
- `LIGHTNING_NODE_OFFLINE`: Lightning node unavailable

### Validation Errors

- `VALIDATION_REQUIRED_FIELD_MISSING`: Required field empty
- `VALIDATION_INVALID_FORMAT`: Wrong format (email, npub, etc.)
- `VALIDATION_VALUE_OUT_OF_RANGE`: Number too high/low

## Testing Error Responses

### Development Testing

```javascript
// Test error response in development
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"","pubkey":""}'
```

### Production Testing

Error responses in production will be sanitized automatically. Monitor logs for detailed error information.

## Monitoring & Debugging

### Request Tracking

All errors include a unique request ID:

```json
{
  "requestId": "req_1735380600000_xyz123"
}
```

Use this ID to track errors in logs and correlate with user reports.

### Error Analytics

Server-side logs include structured data for monitoring:

- Error frequency by type
- Error patterns by endpoint
- Performance impact analysis
- User experience metrics

---

## Implementation Checklist

- [ ] Import `ApiErrorHandler` in API endpoint
- [ ] Replace try/catch error responses with `handleApiError()`
- [ ] Replace validation errors with `handleError()`
- [ ] Test error responses in development
- [ ] Verify production responses are sanitized
- [ ] Check logs include proper context
- [ ] Confirm no sensitive data in responses
- [ ] Add appropriate error types for specific operations

**Remember**: The goal is consistent, privacy-safe error handling across all API endpoints while maintaining excellent developer experience and user security.
