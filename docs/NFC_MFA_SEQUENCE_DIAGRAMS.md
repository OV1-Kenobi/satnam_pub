# NFC Physical MFA Sequence Diagrams for FROST

**Status**: DESIGN DOCUMENTATION  
**Purpose**: Visual representation of NFC MFA integration with FROST flows

---

## Scenario 1: FROST with Required NFC MFA (Happy Path)

```
Steward                NFC Card         FROST Manager        Database
  │                      │                    │                  │
  │ 1. Receive FROST     │                    │                  │
  │    signing request   │                    │                  │
  ├─────────────────────→│                    │                  │
  │                      │                    │                  │
  │ 2. Check NFC policy  │                    │                  │
  ├────────────────────────────────────────→  │                  │
  │                      │                    │ 3. Query policy  │
  │                      │                    ├─────────────────→│
  │                      │                    │ nfc_mfa_policy   │
  │                      │                    │ = "required"     │
  │                      │                    │←─────────────────┤
  │                      │                    │                  │
  │ 4. Tap card + PIN    │                    │                  │
  ├─────────────────────→│                    │                  │
  │                      │ 5. Sign operation  │                  │
  │                      │    hash (P-256)    │                  │
  │                      │ NTAG424 operation  │                  │
  │                      │                    │                  │
  │ 6. NFC signature     │                    │                  │
  │    envelope          │                    │                  │
  │←─────────────────────┤                    │                  │
  │                      │                    │                  │
  │ 7. Submit nonce      │                    │                  │
  │    commitment +      │                    │                  │
  │    NFC signature     │                    │                  │
  ├────────────────────────────────────────→  │                  │
  │                      │                    │ 8. Store nonce   │
  │                      │                    │    Store NFC sig │
  │                      │                    ├─────────────────→│
  │                      │                    │ frost_sessions   │
  │                      │                    │ frost_sig_shares │
  │                      │                    │←─────────────────┤
  │                      │                    │                  │
  │ 9. Submit partial    │                    │                  │
  │    signature +       │                    │                  │
  │    NFC signature     │                    │                  │
  ├────────────────────────────────────────→  │                  │
  │                      │                    │ 10. Store partial│
  │                      │                    │     Store NFC sig│
  │                      │                    ├─────────────────→│
  │                      │                    │ frost_sig_shares │
  │                      │                    │←─────────────────┤
  │                      │                    │                  │
  │ [All stewards submitted]                  │                  │
  │                      │                    │                  │
  │                      │ 11. Aggregate FROST│                  │
  │                      │     signatures     │                  │
  │                      │←────────────────────┤                  │
  │                      │                    │                  │
  │                      │ 12. Verify FROST   │                  │
  │                      │     signature      │                  │
  │                      │ ✅ Valid           │                  │
  │                      │                    │                  │
  │                      │ 13. Verify NFC     │                  │
  │                      │     signatures     │                  │
  │                      │ (all stewards)     │                  │
  │                      │ ✅ All valid       │                  │
  │                      │                    │                  │
  │                      │ 14. Execute        │                  │
  │                      │     operation      │                  │
  │                      │ ✅ Success         │                  │
  │                      │                    │                  │
  │ 15. Completion       │                    │                  │
  │     notification     │                    │                  │
  │←────────────────────────────────────────┤                    │
  │                      │                    │                  │
```

---

## Scenario 2: FROST with Optional NFC MFA (Steward Without Card)

```
Steward A              Steward B         FROST Manager        Database
(with card)            (without card)         │                  │
  │                      │                    │                  │
  │ 1. Receive FROST req │ 1. Receive FROST req                 │
  ├─────────────────────→│←────────────────────────────────────→│
  │                      │                    │                  │
  │ 2. Check NFC policy  │ 2. Check NFC policy                  │
  ├────────────────────────────────────────→  │                  │
  │                      │                    │ 3. Query policy  │
  │                      │                    │ nfc_mfa_policy   │
  │                      │                    │ = "optional"     │
  │                      │                    │←─────────────────┤
  │                      │                    │                  │
  │ 4. Tap card + PIN    │ 4. Skip NFC        │                  │
  ├─────────────────────→│ (no card)          │                  │
  │                      │                    │                  │
  │ 5. NFC signature     │ 5. Submit nonce    │                  │
  │    envelope          │    commitment      │                  │
  │                      │    (no NFC sig)    │                  │
  │                      ├────────────────────────────────────→  │
  │                      │                    │ 6. Store nonce   │
  │                      │                    │ (NFC sig = null) │
  │                      │                    ├─────────────────→│
  │                      │                    │                  │
  │ 6. Submit nonce +    │                    │                  │
  │    NFC signature     │                    │                  │
  ├────────────────────────────────────────→  │                  │
  │                      │                    │ 7. Store nonce   │
  │                      │                    │    Store NFC sig │
  │                      │                    ├─────────────────→│
  │                      │                    │                  │
  │ 8. Submit partial +  │ 8. Submit partial  │                  │
  │    NFC signature     │    (no NFC sig)    │                  │
  ├────────────────────────────────────────→  │                  │
  │                      ├────────────────────────────────────→  │
  │                      │                    │ 9. Store partial │
  │                      │                    │ (mixed NFC sigs) │
  │                      │                    ├─────────────────→│
  │                      │                    │                  │
  │ [All stewards submitted]                  │                  │
  │                      │                    │                  │
  │                      │ 10. Aggregate FROST│                  │
  │                      │     signatures     │                  │
  │                      │←────────────────────┤                  │
  │                      │                    │                  │
  │                      │ 11. Verify FROST   │                  │
  │                      │     signature      │                  │
  │                      │ ✅ Valid           │                  │
  │                      │                    │                  │
  │                      │ 12. Verify NFC     │                  │
  │                      │     signatures     │                  │
  │                      │ (only Steward A)   │                  │
  │                      │ ✅ Valid           │                  │
  │                      │ (Steward B: null)  │                  │
  │                      │ ✅ Allowed         │                  │
  │                      │                    │                  │
  │                      │ 13. Execute        │                  │
  │                      │     operation      │                  │
  │                      │ ✅ Success         │                  │
  │                      │                    │                  │
```

---

## Scenario 3: NFC MFA Failure (Required Policy)

```
Steward                NFC Card         FROST Manager        Database
  │                      │                    │                  │
  │ 1. Receive FROST req │                    │                  │
  ├─────────────────────→│                    │                  │
  │                      │                    │                  │
  │ 2. Check NFC policy  │                    │                  │
  ├────────────────────────────────────────→  │                  │
  │                      │                    │ 3. Query policy  │
  │                      │                    │ nfc_mfa_policy   │
  │                      │                    │ = "required"     │
  │                      │                    │←─────────────────┤
  │                      │                    │                  │
  │ 4. Tap card + PIN    │                    │                  │
  ├─────────────────────→│                    │                  │
  │                      │ ❌ Card not found  │                  │
  │                      │ (timeout)          │                  │
  │                      │                    │                  │
  │ 5. Error: NFC card   │                    │                  │
  │    not detected      │                    │                  │
  │←─────────────────────┤                    │                  │
  │                      │                    │                  │
  │ 6. Abort FROST       │                    │                  │
  │    participation     │                    │                  │
  ├────────────────────────────────────────→  │                  │
  │                      │                    │ 7. Log error     │
  │                      │                    │ nfc_verification │
  │                      │                    │ _error = "Card   │
  │                      │                    │ not detected"    │
  │                      │                    ├─────────────────→│
  │                      │                    │                  │
  │ 8. Notification:     │                    │                  │
  │    FROST session     │                    │                  │
  │    failed (missing   │                    │                  │
  │    required NFC MFA) │                    │                  │
  │←────────────────────────────────────────┤                    │
  │                      │                    │                  │
```

---

## Scenario 4: High-Value Operation with NFC MFA

```
Steward                NFC Card         FROST Manager        Database
  │                      │                    │                  │
  │ 1. Initiate high-    │                    │                  │
  │    value operation   │                    │                  │
  │    (amount > 1M)     │                    │                  │
  ├────────────────────────────────────────→  │                  │
  │                      │                    │ 2. Check amount  │
  │                      │                    │ 3. Query policy  │
  │                      │                    │ nfc_mfa_policy   │
  │                      │                    │ = "required_for_ │
  │                      │                    │ high_value"      │
  │                      │                    │ amount_threshold │
  │                      │                    │ = 1000000        │
  │                      │                    │←─────────────────┤
  │                      │                    │                  │
  │ 4. Amount > threshold│                    │                  │
  │    → NFC MFA required│                    │                  │
  │                      │                    │                  │
  │ 5. Tap card + PIN    │                    │                  │
  ├─────────────────────→│                    │                  │
  │                      │ 6. Sign operation  │                  │
  │                      │    hash (P-256)    │                  │
  │                      │                    │                  │
  │ 7. NFC signature     │                    │                  │
  │    envelope          │                    │                  │
  │←─────────────────────┤                    │                  │
  │                      │                    │                  │
  │ 8. Submit FROST      │                    │                  │
  │    signature +       │                    │                  │
  │    NFC signature     │                    │                  │
  ├────────────────────────────────────────→  │                  │
  │                      │                    │ 9. Store both    │
  │                      │                    │    signatures    │
  │                      │                    ├─────────────────→│
  │                      │                    │                  │
  │ [All stewards submitted]                  │                  │
  │                      │                    │                  │
  │                      │ 10. Aggregate FROST│                  │
  │                      │ 11. Verify FROST   │                  │
  │                      │ 12. Verify NFC     │                  │
  │                      │ 13. Execute high-  │                  │
  │                      │     value operation│                  │
  │                      │ ✅ Success         │                  │
  │                      │                    │                  │
```

---

## Data Flow: NFC Signature Storage

```
NFC Card Tap
    │
    ├─→ P-256 Signature
    │   (NTAG424 operation)
    │
    ├─→ Signature Envelope
    │   {
    │     curve: "P-256",
    │     publicKey: "04abc123...",
    │     signature: "def456...",
    │     timestamp: 1733000000000,
    │     cardUid: "0123456789ABCDEF"
    │   }
    │
    ├─→ Store in Database
    │   ├─ frost_signature_shares.nfc_signature
    │   ├─ frost_signature_shares.nfc_public_key
    │   ├─ frost_signature_shares.nfc_verified_at
    │   └─ frost_signature_shares.nfc_verification_error
    │
    ├─→ Verify P-256 Signature
    │   ├─ Web Crypto API verification
    │   ├─ Timestamp validation (±5 min)
    │   └─ Update nfc_verification_status
    │
    └─→ Audit Trail
        ├─ Card UID logged
        ├─ Timestamp recorded
        ├─ Steward DUID linked
        └─ Operation hash stored
```

---

## Error Handling Paths

### Path 1: NFC Card Not Detected
```
Tap card → Timeout (30s) → Error: "Card not detected"
  ├─ If required: Abort FROST participation
  └─ If optional: Continue without NFC MFA
```

### Path 2: PIN Entry Failed
```
PIN entry → Invalid PIN → Error: "PIN verification failed"
  ├─ Retry up to 3 times
  ├─ If required: Abort FROST participation
  └─ If optional: Continue without NFC MFA
```

### Path 3: Signature Verification Failed
```
Verify P-256 → Invalid signature → Error: "Signature verification failed"
  ├─ Log error with truncated signature
  ├─ If required: Fail FROST session
  └─ If optional: Continue without NFC verification
```

### Path 4: Timestamp Out of Range
```
Check timestamp → Timestamp > 5 min old → Error: "Signature expired"
  ├─ Reject NFC signature
  ├─ If required: Fail FROST session
  └─ If optional: Continue without NFC verification
```

---

## Integration Points Summary

| Component | File | Method | Line | Change |
|-----------|------|--------|------|--------|
| NFC MFA | `src/lib/steward/frost-nfc-mfa.ts` | `collectNfcMfaSignature()` | NEW | Create |
| NFC MFA | `src/lib/steward/frost-nfc-mfa.ts` | `verifyNfcMfaSignature()` | NEW | Create |
| NFC MFA | `src/lib/steward/frost-nfc-mfa.ts` | `storeNfcMfaSignature()` | NEW | Create |
| FROST Manager | `lib/frost/frost-session-manager.ts` | `getNfcMfaPolicy()` | NEW | Add |
| FROST Manager | `lib/frost/frost-session-manager.ts` | `verifyNfcMfaSignatures()` | NEW | Add |
| FROST Manager | `lib/frost/frost-session-manager.ts` | `aggregateSignatures()` | 656-873 | Modify |
| FROST Manager | `lib/frost/frost-session-manager.ts` | `FrostSession` interface | 49-70 | Extend |
| Steward Integration | `src/lib/steward/frost-approval-integration.ts` | `collectFrostSignaturesForApprovals()` | TBD | Modify |
| Database | `migrations/050_frost_nfc_mfa.sql` | Schema | NEW | Create |


