# Blossom Protocol Integration - Implementation Documentation

**Status:** ✅ **PRODUCTION READY**
**Version:** 1.0
**Date:** 2025-12-10
**Last Updated:** 2025-12-10

---

## Executive Summary

Blossom protocol integration enables Satnam users to attach **files, audio recordings, and video** to their Nostr direct messages. All attachments are encrypted client-side using AES-256-GCM before upload, ensuring that neither the Blossom storage server nor any intermediary can access the plaintext content.

### Key Features

- **End-to-end encrypted file sharing** in NIP-17/NIP-59 gift-wrapped messages
- **BUD-01/BUD-02 compliant** authorization events with expiration tags
- **Cross-client compatibility** via `imeta` and `fallback` tags for Bitchat interoperability
- **Privacy-first architecture** - attachments stored in encrypted message content, no database migration needed
- **100MB file size limit** with client-side validation
- **Multi-server failover** for upload and delete operations

---

## Architecture

### Privacy-First Design

Attachments are stored **inside the encrypted NIP-17 message content**, not in a separate database table. This preserves the zero-knowledge architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                        LAYER 1: File Encryption                 │
│  Plaintext File ──► AES-256-GCM (random key+IV) ──► Ciphertext │
│  Ciphertext uploaded to Blossom; key/IV kept in memory         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     LAYER 2: Message Encryption                 │
│  Inner DM (kind 14) with text + attachment metadata + keys     │
│  ──► NIP-44 encryption (sender→recipient shared secret)        │
│  ──► Embedded in NIP-59 gift-wrap envelope                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LAYER 3: Gift-Wrap Envelope                │
│  NIP-59 outer event (kind 1059) with ephemeral sender key      │
│  ──► Published to recipient's inbox relays via CEPS            │
└─────────────────────────────────────────────────────────────────┘
```

### Database Migration Analysis

**Conclusion: No migration needed.** Attachment metadata (URL, encryption key, IV, hash) is stored within the encrypted `content` field of NIP-17 messages. This approach:

- Preserves zero-knowledge architecture
- Requires no schema changes
- Maintains backward compatibility
- Keeps decryption keys inside encrypted envelopes

---

## Implementation Details

### Core Files

| File                                              | Purpose                                    | Key Changes                                            |
| ------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| `src/lib/api/blossom-client.ts`                   | Blossom client with upload/download/delete | BUD-02 expiration tags, failover, file size validation |
| `src/lib/messaging/client-message-service.ts`     | Gift-wrapped messaging                     | extraTags support, content validation                  |
| `src/components/messaging/AttachmentRenderer.tsx` | Attachment display/download                | Memory leak fix, path traversal prevention             |
| `vitest.config.ts`                                | Test configuration                         | Boolean double-stringification fix                     |

---

### BUD-02 Compliance (Authorization Events)

Added required `expiration` tags to upload and delete authorization events per BUD-02 specification:

**Location:** `src/lib/api/blossom-client.ts` (lines 300-355)

```typescript
const AUTH_EXPIRATION_SECONDS = 300; // 5 minutes

// Upload authorization event
const expiration = Math.floor(Date.now() / 1000) + AUTH_EXPIRATION_SECONDS;
const authEvent = {
  kind: 24242,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ["t", "upload"],
    ["x", sha256Hex],
    ["expiration", expiration.toString()],
  ],
  content: `Upload ${file.name}`,
};

// Delete authorization event
const authEvent = {
  kind: 24242,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ["t", "delete"],
    ["x", sha256Hex],
    ["expiration", expiration.toString()],
  ],
  content: `Delete ${sha256Hex}`,
};
```

---

### File Size Validation

Added 100MB limit to prevent memory issues during client-side encryption:

**Location:** `src/lib/api/blossom-client.ts` (lines 737-745)

```typescript
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
if (file.size > MAX_FILE_SIZE) {
  return {
    success: false,
    error: `File too large. Maximum size: 100 MB`,
  };
}
```

---

### Multi-Server Failover

Delete operations now try all configured Blossom servers instead of just the primary:

**Location:** `src/lib/api/blossom-client.ts` (lines 875-957)

```typescript
for (const server of BLOSSOM_SERVERS) {
  try {
    const response = await fetch(`${server}/${sha256Hex}`, {
      method: "DELETE",
      headers: { Authorization: `Nostr ${base64AuthEvent}` },
    });
    if (response.ok) return { success: true };
    if (response.status === 404) continue; // Try next server
  } catch (err) {
    continue; // Try next server
  }
}
return { success: false, error: "Delete failed on all servers" };
```

---

### Cross-Client Compatibility (extraTags)

Fixed critical issue where `imeta` and `fallback` tags were computed but never added to inner events:

**Location:** `src/lib/messaging/client-message-service.ts`

1. Added `extraTags?: string[][]` to `MessageData` interface (line 35-43)
2. Updated NIP-59 fallback path to append extraTags (lines 257-274)
3. Updated main NIP-59 flow to append extraTags (lines 363-381)
4. Updated `sendGiftWrappedMessageWithAttachments` to pass extraTags (lines 786-798)

---

### Content Validation

Added proper type validation in `parseNIP17Content` to prevent malformed/malicious JSON:

**Location:** `src/lib/messaging/client-message-service.ts` (lines 810-847)

```typescript
// Validate text field is a string
if (typeof parsed.text !== "string") {
  parsed.text = "";
}

// Validate attachments field is an array
if (parsed.attachments !== undefined && !Array.isArray(parsed.attachments)) {
  console.warn(
    "parseNIP17Content: attachments field is not an array, ignoring"
  );
  delete parsed.attachments;
}
```

---

### AttachmentRenderer Security Fixes

**Location:** `src/components/messaging/AttachmentRenderer.tsx`

1. **Removed unused `showPreviews` prop** - Prop was defined but never referenced (lines 63-66)

2. **Added `sanitizeFileName()` helper** - Prevents path traversal attacks (lines 50-54):

   ```typescript
   function sanitizeFileName(fileName: string): string {
     const basename =
       fileName.split("/").pop()?.split("\\").pop() || "download";
     return basename.replace(/^\.+/, "_");
   }
   ```

3. **Fixed memory leak from setTimeout** - Added cleanup on unmount (lines 70-77):

   ```typescript
   const timeoutRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>(
     {}
   );

   useEffect(() => {
     return () => {
       Object.values(timeoutRefs.current).forEach(clearTimeout);
     };
   }, []);
   ```

---

### ArrayBuffer View Fix

Fixed `importKeyFromBase64()` to properly handle ArrayBuffer views:

**Location:** `src/lib/api/blossom-client.ts` (lines 179-203)

```typescript
// Before (incorrect - passed Uint8Array view)
return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, [
  "decrypt",
]);

// After (correct - extract underlying ArrayBuffer with proper range)
const buffer = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength
) as ArrayBuffer;
return crypto.subtle.importKey("raw", buffer, { name: "AES-GCM" }, false, [
  "decrypt",
]);
```

---

### Type Signature Corrections

Changed `createAuthEvent` signature from `any` to `unknown` for type safety:

**Location:** `src/lib/api/blossom-client.ts` (lines 313-355)

```typescript
// Before
createAuthEvent?: (event: any) => Promise<any>;

// After
createAuthEvent?: (event: unknown) => Promise<unknown>;
```

---

### Vitest Configuration Fix

Fixed double-stringification of boolean default values:

**Location:** `vitest.config.ts` (lines 64-78)

```typescript
// Before (double-stringified)
"process.env.VITE_LNBITS_INTEGRATION_ENABLED": JSON.stringify(
  process.env.VITE_LNBITS_INTEGRATION_ENABLED || "false"
),

// After (correct boolean evaluation)
"process.env.VITE_LNBITS_INTEGRATION_ENABLED": JSON.stringify(
  process.env.VITE_LNBITS_INTEGRATION_ENABLED === "true"
),
"process.env.VITE_BLOSSOM_UPLOAD_ENABLED": JSON.stringify(
  process.env.VITE_BLOSSOM_UPLOAD_ENABLED !== "false"
),
```

---

## Verification Results

| Check                  | Status                |
| ---------------------- | --------------------- |
| Blossom unit tests     | ✅ 20/20 passing      |
| Production build       | ✅ Built successfully |
| TypeScript diagnostics | ✅ No errors          |

---

## Configuration

### Environment Variables

| Variable                      | Default                | Description                          |
| ----------------------------- | ---------------------- | ------------------------------------ |
| `VITE_BLOSSOM_UPLOAD_ENABLED` | `true`                 | Enable/disable Blossom file uploads  |
| `VITE_BLOSSOM_PRIMARY_URL`    | `https://blossom.band` | Primary Blossom server URL           |
| `VITE_BLOSSOM_FALLBACK_URLS`  | (none)                 | Comma-separated fallback server URLs |

### Feature Flag

Enable Blossom uploads in your `.env`:

```bash
VITE_BLOSSOM_UPLOAD_ENABLED=true
```

---

## Future Enhancements

1. **PNS Note2Self Attachment Support** - Extend Private Note Storage to support file attachments
2. **Image Preview Rendering** - Inline image previews in message threads
3. **Audio/Video Players** - Native HTML5 media players for audio/video attachments
4. **Progress Indicators** - Upload/download progress bars
5. **Retry Logic** - Automatic retry with exponential backoff for failed uploads

---

## Related Documentation

- [Blossom Protocol Specification](https://github.com/hzrd149/blossom)
- [BUD-01: Server Protocol](https://github.com/hzrd149/blossom/blob/master/buds/01.md)
- [BUD-02: Authorization](https://github.com/hzrd149/blossom/blob/master/buds/02.md)
- [NIP-17: Private Direct Messages](https://github.com/nostr-protocol/nips/blob/master/17.md)
- [NIP-59: Gift Wrap](https://github.com/nostr-protocol/nips/blob/master/59.md)
- [NIP-94: File Metadata](https://github.com/nostr-protocol/nips/blob/master/94.md)
