# Federation API Validation

## Overview

The Federation API now includes comprehensive input validation using Zod schemas to prevent deep errors in the FederationManager and provide clear, actionable error messages to clients.

## Changes Made

### 1. Added Validation Schemas

- **`createFederationSchema`**: Validates federation creation requests
- **`joinFederationSchema`**: Validates federation join requests
- **`connectFederationSchema`**: Validates federation connection requests
- **`getFederationQuerySchema`**: Validates GET request query parameters

### 2. Request Validation

All API endpoints now validate input before processing:

- **POST `/api/fedimint/federation`**: Validates request body against action-specific schemas
- **GET `/api/fedimint/federation`**: Validates query parameters

### 3. Improved Error Responses

Invalid requests now return `400 Bad Request` with detailed field-level errors instead of generic `500 Internal Server Error`.

## API Usage Examples

### Valid Create Federation Request

```json
POST /api/fedimint/federation
{
  "action": "create",
  "name": "My Federation",
  "description": "A test federation",
  "guardianUrls": [
    "https://guardian1.example.com",
    "https://guardian2.example.com",
    "https://guardian3.example.com"
  ],
  "threshold": 2
}
```

**Success Response (200):**

```json
{
  "success": true,
  "federationId": "fed_1234567890_abcdef123"
}
```

### Invalid Request Example

```json
POST /api/fedimint/federation
{
  "action": "create",
  "name": "",
  "guardianUrls": ["not-a-url"],
  "threshold": 5
}
```

**Error Response (400):**

```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "name": ["Federation name is required"],
    "guardianUrls.0": ["Invalid guardian URL format"],
    "threshold": ["Threshold cannot exceed the number of guardians"]
  }
}
```

## Validation Rules

### Create Federation

- **name**: Required, 1-100 characters
- **description**: Optional, max 500 characters
- **guardianUrls**: Array of 1-10 valid URLs
- **threshold**: Integer ≥ 1 and ≤ number of guardians

### Join Federation

- **inviteCode**: Required, non-empty string

### Connect Federation

- **federationId**: Required, non-empty string

### GET Federation

- **id** (query param): Optional, non-empty string if provided

## Error Handling

The API now handles different error types appropriately:

1. **Validation Errors (400)**: Invalid input data with field-level details
2. **JSON Parse Errors (400)**: Malformed JSON with clear message
3. **Not Found Errors (404)**: Federation not found
4. **Server Errors (500)**: Unexpected errors from FederationManager

## Benefits

1. **Better User Experience**: Clear, actionable error messages
2. **Reduced Server Load**: Invalid requests caught early
3. **Type Safety**: Discriminated unions ensure proper action handling
4. **Maintainability**: Centralized validation schemas
5. **Documentation**: Self-documenting API through schemas
