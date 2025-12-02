# FROST ↔ Steward Approval Integration - Sequence Diagram

## Complete Multiparty Signing Flow

```
User                NFC Auth         Steward Approval    FROST Manager      Stewards
 │                    │                    │                  │               │
 │ Tap NFC Card       │                    │                  │               │
 ├───────────────────→│                    │                  │               │
 │                    │ Check Policy       │                  │               │
 │                    ├───────────────────→│                  │               │
 │                    │ stewardThreshold=2 │                  │               │
 │                    │←───────────────────┤                  │               │
 │                    │                    │                  │               │
 │                    │ publishRequests()  │                  │               │
 │                    ├───────────────────→│                  │               │
 │                    │                    │ Send NIP-17 DMs  │               │
 │                    │                    ├──────────────────────────────────→│
 │                    │                    │                  │               │
 │                    │ awaitApprovals()   │                  │               │
 │                    ├───────────────────→│                  │               │
 │                    │                    │ Listen for responses              │
 │                    │                    │←──────────────────────────────────┤
 │                    │                    │ Approval 1 received               │
 │                    │                    │←──────────────────────────────────┤
 │                    │                    │ Approval 2 received (threshold!)  │
 │                    │ status: approved   │                  │               │
 │                    │←───────────────────┤                  │               │
 │                    │                    │                  │               │
 │                    │ *** NEW: FROST INTEGRATION ***         │               │
 │                    │                    │                  │               │
 │                    │ createSession()    │                  │               │
 │                    ├──────────────────────────────────────→│               │
 │                    │                    │                  │ sessionId     │
 │                    │                    │                  │←──────────────┤
 │                    │                    │                  │               │
 │                    │ sendSigningRequest()                  │               │
 │                    ├──────────────────────────────────────→│               │
 │                    │                    │                  │ Send DMs      │
 │                    │                    │                  ├───────────────→│
 │                    │                    │                  │               │
 │                    │ awaitSignatures()  │                  │               │
 │                    ├──────────────────────────────────────→│               │
 │                    │                    │                  │ Listen...     │
 │                    │                    │                  │               │
 │                    │                    │                  │ Nonce 1       │
 │                    │                    │                  │←───────────────┤
 │                    │                    │                  │ Nonce 2       │
 │                    │                    │                  │←───────────────┤
 │                    │                    │                  │               │
 │                    │                    │                  │ Partial Sig 1 │
 │                    │                    │                  │←───────────────┤
 │                    │                    │                  │ Partial Sig 2 │
 │                    │                    │                  │←───────────────┤
 │                    │                    │                  │               │
 │                    │ aggregateSignatures()                 │               │
 │                    ├──────────────────────────────────────→│               │
 │                    │                    │                  │ (R, s)        │
 │                    │                    │                  │←──────────────┤
 │                    │                    │                  │               │
 │                    │ verifySignature()  │                  │               │
 │                    ├──────────────────────────────────────→│               │
 │                    │                    │                  │ valid: true   │
 │                    │                    │                  │←──────────────┤
 │                    │                    │                  │               │
 │                    │ publishSignedEvent()                  │               │
 │                    ├──────────────────────────────────────→│               │
 │                    │                    │                  │ Publish       │
 │                    │                    │                  │ to relays     │
 │                    │                    │                  │               │
 │                    │ *** END FROST INTEGRATION ***          │               │
 │                    │                    │                  │               │
 │                    │ Execute Operation  │                  │               │
 │                    │ (with FROST sig)   │                  │               │
 │                    │ ✅ Success         │                  │               │
 │←───────────────────┤                    │                  │               │
 │                    │                    │                  │               │
```

---

## Error Handling Paths

### Path 1: Steward Approval Rejected
```
User → NFC Auth → Steward Approval
                      ↓
                  Rejection received
                      ↓
                  status: rejected
                      ↓
                  ABORT (no FROST)
                      ↓
                  Return error to user
```

### Path 2: Steward Approval Timeout
```
User → NFC Auth → Steward Approval
                      ↓
                  Timeout (30s)
                      ↓
                  status: expired
                      ↓
                  ABORT (no FROST)
                      ↓
                  Return error to user
```

### Path 3: FROST Signature Timeout
```
User → NFC Auth → Steward Approval (approved)
                      ↓
                  FROST Session Created
                      ↓
                  Waiting for signatures...
                      ↓
                  Timeout (10 min)
                      ↓
                  FROST session expires
                      ↓
                  ABORT operation
                      ↓
                  Return error to user
```

### Path 4: FROST Signature Verification Failed
```
User → NFC Auth → Steward Approval (approved)
                      ↓
                  FROST Session Created
                      ↓
                  Signatures collected
                      ↓
                  Aggregation successful
                      ↓
                  Verification FAILED
                      ↓
                  ABORT operation
                      ↓
                  Return error to user
```

---

## Data Structures

### Steward Approval Request
```json
{
  "operationHash": "a1b2c3d4...",
  "operationKind": "ntag424_spend",
  "uidHint": "0123456...",
  "stewardThreshold": 2,
  "federationDuid": "fed_123...",
  "expiresAt": 1733000000,
  "recipients": [
    { "pubkeyHex": "abc123..." },
    { "pubkeyHex": "def456..." }
  ]
}
```

### FROST Session Creation
```json
{
  "familyId": "family_123",
  "messageHash": "a1b2c3d4...",
  "participants": ["steward1_duid", "steward2_duid"],
  "threshold": 2,
  "createdBy": "user_duid",
  "eventTemplate": "{...}",
  "eventType": "nostr_event"
}
```

### FROST Signature Response
```json
{
  "sessionId": "frost_session_123",
  "participantId": "steward1_duid",
  "nonceCommitment": "02abc123...",
  "partialSignature": "def456..."
}
```

### Final FROST Signature
```json
{
  "R": "02abc123...",
  "s": "def456..."
}
```

---

## Integration Points Summary

| Component | File | Method | Line | Purpose |
|-----------|------|--------|------|---------|
| Steward Approval | `src/lib/steward/approval-client.ts` | `publishApprovalRequests()` | 67 | Publish approval requests |
| Steward Approval | `src/lib/steward/approval-client.ts` | `awaitApprovals()` | 171 | Wait for threshold approvals |
| NFC Auth | `src/lib/nfc-auth.ts` | `tapToSpend()` | 754 | Trigger FROST after approval |
| NFC Auth | `src/lib/nfc-auth.ts` | `tapToSign()` | 893 | Trigger FROST after approval |
| FROST Manager | `lib/frost/frost-session-manager.ts` | `createSession()` | 1 | Create FROST session |
| FROST Manager | `lib/frost/frost-session-manager.ts` | `aggregateSignatures()` | 656 | Aggregate signatures |
| FROST Manager | `lib/frost/frost-session-manager.ts` | `verifyAggregatedSignature()` | 986 | Verify signature |
| FROST Manager | `lib/frost/frost-session-manager.ts` | `publishSignedEvent()` | 1153 | Publish to Nostr |


