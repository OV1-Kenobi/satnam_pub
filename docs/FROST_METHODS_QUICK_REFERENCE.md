# FROST Methods - Quick Reference Guide

## Import

```typescript
import { FrostSessionManager } from "lib/frost/frost-session-manager";
```

---

## Method 1: Verify Aggregated Signature

### Signature
```typescript
static async verifyAggregatedSignature(
  sessionId: string,
  messageHash: string
): Promise<{ success: boolean; valid?: boolean; error?: string }>
```

### Usage
```typescript
const result = await FrostSessionManager.verifyAggregatedSignature(
  "session-123",
  "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890"
);

if (result.success && result.valid) {
  console.log("Signature is valid!");
} else {
  console.error("Verification failed:", result.error);
}
```

### Parameters
- `sessionId` (string): FROST session ID
- `messageHash` (string): Original message hash (64 hex chars, SHA-256)

### Returns
- `success` (boolean): Operation succeeded
- `valid` (boolean): Signature is cryptographically valid
- `error` (string): Error message if operation failed

---

## Method 2: Publish Signed Event

### Signature
```typescript
static async publishSignedEvent(
  sessionId: string
): Promise<{ success: boolean; eventId?: string; error?: string }>
```

### Usage
```typescript
const result = await FrostSessionManager.publishSignedEvent("session-123");

if (result.success) {
  console.log("Event published:", result.eventId);
} else {
  console.error("Publishing failed:", result.error);
}
```

### Parameters
- `sessionId` (string): FROST session ID with completed signature

### Returns
- `success` (boolean): Event published successfully
- `eventId` (string): Published event ID
- `error` (string): Error message if operation failed

### Side Effects
- Publishes event to Nostr relays via CEPS
- Sends NIP-17 DM notifications to all guardians/stewards
- Updates session with final_event_id

---

## Method 3: Send Signing Request

### Signature
```typescript
static async sendFrostSigningRequest(
  sessionId: string
): Promise<{ success: boolean; notificationsSent?: number; error?: string }>
```

### Usage
```typescript
const result = await FrostSessionManager.sendFrostSigningRequest("session-123");

if (result.success) {
  console.log(`Sent ${result.notificationsSent} signing requests`);
} else {
  console.error("Failed to send requests:", result.error);
}
```

### Parameters
- `sessionId` (string): FROST session ID

### Returns
- `success` (boolean): Operation succeeded
- `notificationsSent` (number): Count of DMs sent
- `error` (string): Error message if operation failed

### Side Effects
- Sends individual NIP-17 DMs to all guardians/stewards
- Includes message preview and session ID in each DM

---

## Method 4: Send Completion Notification

### Signature
```typescript
static async sendFrostCompletionNotification(
  sessionId: string,
  eventId: string,
  success: boolean
): Promise<{ success: boolean; notificationsSent?: number; error?: string }>
```

### Usage
```typescript
const result = await FrostSessionManager.sendFrostCompletionNotification(
  "session-123",
  "event-id-abc123",
  true
);

if (result.success) {
  console.log(`Sent ${result.notificationsSent} completion notifications`);
} else {
  console.error("Failed to send notifications:", result.error);
}
```

### Parameters
- `sessionId` (string): FROST session ID
- `eventId` (string): Published event ID
- `success` (boolean): Whether signing was successful

### Returns
- `success` (boolean): Operation succeeded
- `notificationsSent` (number): Count of DMs sent
- `error` (string): Error message if operation failed

### Side Effects
- Sends individual NIP-17 DMs to all guardians/stewards
- Includes success status and event ID in each DM

---

## Error Handling

All methods return `{ success: false, error: "..." }` on failure. Common errors:

- "Session not found" - Session ID doesn't exist
- "Session not in completed status" - Session not ready
- "Family not found" - Family federation missing
- "Invalid signature format" - Signature components invalid
- "CEPS publish failed" - Nostr publishing failed
- "Failed to retrieve family members" - Database query failed

---

## Security Notes

✅ **Zero-Knowledge Architecture**
- Public keys retrieved from database only
- No nsec exposure in any code path
- Signature verification without key reconstruction

✅ **Database Security**
- All queries use Supabase RLS policies
- Optimistic locking for concurrent updates

✅ **Cryptographic Security**
- secp256k1 verification from @noble/curves
- Proper signature format validation
- NIP-19 decoding for npub format

---

## Integration with UnifiedFederatedSigningService

These methods can also be called through the higher-level wrapper:

```typescript
import { UnifiedFederatedSigningService } from "lib/federated-signing/unified-service";

const service = new UnifiedFederatedSigningService();
const result = await service.publishSignedEvent("session-123", "frost");
```

The unified service handles both FROST and SSS methods automatically.

