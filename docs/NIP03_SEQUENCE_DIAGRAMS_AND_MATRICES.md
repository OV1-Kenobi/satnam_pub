# NIP-03 Identity Creation - Sequence Diagrams & Decision Matrices

---

## SEQUENCE DIAGRAM: RECOMMENDED FLOW (OPTION B)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ IDENTITY CREATION FLOW WITH NIP-03 ATTESTATION (OPTION B - RECOMMENDED)    │
└─────────────────────────────────────────────────────────────────────────────┘

User                IdentityForge.tsx        register-identity.ts    CEPS
 │                        │                          │                │
 │ 1. Enter profile       │                          │                │
 ├───────────────────────>│                          │                │
 │                        │                          │                │
 │ 2. Click "Forge ID"    │                          │                │
 ├───────────────────────>│                          │                │
 │                        │ 3. Generate keys        │                │
 │                        │ (client-side)           │                │
 │                        │ ephemeralNsec, npub     │                │
 │                        │                          │                │
 │ 4. Confirm keys       │                          │                │
 ├───────────────────────>│                          │                │
 │                        │ 5. Publish Kind:0       │                │
 │                        │ (profile metadata)      │                │
 │                        ├─────────────────────────────────────────>│
 │                        │                          │                │
 │                        │                          │ 6. Sign event  │
 │                        │                          │ with CEPS      │
 │                        │                          │<────────────────
 │                        │                          │                │
 │                        │                          │ 7. Publish to  │
 │                        │                          │ relays         │
 │                        │                          │ Get event_id   │
 │                        │<─────────────────────────────────────────│
 │                        │ event_id                 │                │
 │                        │                          │                │
 │ 8. Show progress       │                          │                │
 │ "Publishing profile"   │                          │                │
 ├───────────────────────>│                          │                │
 │                        │ 9. Call register-identity endpoint       │
 │                        ├─────────────────────────>│                │
 │                        │                          │                │
 │ 10. Show progress      │                          │                │
 │ "Creating attestation" │                          │                │
 ├───────────────────────>│                          │                │
 │                        │                          │ 11. Create     │
 │                        │                          │ SimpleProof    │
 │                        │                          │ timestamp      │
 │                        │                          │ (event_id)     │
 │                        │                          │ ots_proof,     │
 │                        │                          │ bitcoin_block  │
 │                        │                          │                │
 │                        │                          │ 12. Create     │
 │                        │                          │ NIP-03 Kind:   │
 │                        │                          │ 1040 event     │
 │                        │                          │ (includes OTS  │
 │                        │                          │ proof + PKARR  │
 │                        │                          │ address in     │
 │                        │                          │ metadata)      │
 │                        │                          │                │
 │                        │                          │ 13. Publish    │
 │                        │                          │ NIP-03 event   │
 │                        │                          │ to relays      │
 │                        │                          │ Get nip03_     │
 │                        │                          │ event_id       │
 │                        │                          │                │
 │                        │                          │ 14. Store in   │
 │                        │                          │ nip03_         │
 │                        │                          │ attestations   │
 │                        │                          │ table          │
 │                        │                          │                │
 │                        │                          │ 15. Create     │
 │                        │                          │ PKARR record   │
 │                        │                          │ (async, non-   │
 │                        │                          │ blocking)      │
 │                        │                          │                │
 │                        │                          │ 16. Return     │
 │                        │                          │ success        │
 │                        │<─────────────────────────│                │
 │                        │ registration_result      │                │
 │                        │                          │                │
 │ 17. Show completion    │                          │                │
 │ "Attestation complete" │                          │                │
 ├───────────────────────>│                          │                │
 │                        │                          │                │
 │ 18. Show next actions  │                          │                │
 │ (invite peers, etc.)   │                          │                │
 ├───────────────────────>│                          │                │
 │                        │                          │                │
```

---

## TIMING ANALYSIS

```
┌─────────────────────────────────────────────────────────────────┐
│ OPERATION TIMING (Estimated)                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 1. Key Generation (client-side)           ~100ms               │
│ 2. Kind:0 Publishing (CEPS)               ~500ms               │
│ 3. SimpleProof Timestamp Creation         ~2000ms (API call)   │
│ 4. NIP-03 Kind:1040 Creation              ~100ms               │
│ 5. NIP-03 Publishing (CEPS)               ~500ms               │
│ 6. NIP-03 Storage (database)              ~50ms                │
│ 7. PKARR Record Creation (async)          ~1000ms (non-blocking)
│                                                                 │
│ TOTAL BLOCKING TIME:                      ~3150ms (~3 seconds) │
│ TOTAL WITH PKARR (async):                 ~4150ms (~4 seconds) │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## DECISION MATRIX: PKARR TIMING OPTIONS

### Option A: PKARR Before SimpleProof

```
┌──────────────────────────────────────────────────────────────────┐
│ OPTION A: PKARR BEFORE SIMPLEPROOF                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Sequence:                                                        │
│ 1. Kind:0 event created                                         │
│ 2. PKARR record created (non-blocking)                          │
│ 3. SimpleProof timestamp created                                │
│ 4. NIP-03 Kind:1040 event created                               │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ PROS                                                             │
├──────────────────────────────────────────────────────────────────┤
│ ✅ PKARR address available immediately                          │
│ ✅ Minimal changes to current flow                              │
│ ✅ PKARR independent of blockchain confirmation                │
│ ✅ Faster user experience (PKARR created first)                │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ CONS                                                             │
├──────────────────────────────────────────────────────────────────┤
│ ❌ PKARR address NOT included in NIP-03 event                   │
│ ❌ No blockchain proof of PKARR address                         │
│ ❌ Separate attestation chains (Kind:0 → PKARR vs Kind:0 → NIP-03)
│ ❌ PKARR address exposed before NIP-03 published                │
│ ❌ Harder to verify PKARR authenticity                          │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ DATA DEPENDENCIES                                                │
├──────────────────────────────────────────────────────────────────┤
│ Kind:0 event_id                                                  │
│   ├─ PKARR record (uses event_id to derive address)            │
│   └─ SimpleProof timestamp (uses event_id)                      │
│        └─ NIP-03 event (uses ots_proof, but NOT pkarr_address) │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ PRIVACY IMPLICATIONS                                             │
├──────────────────────────────────────────────────────────────────┤
│ ⚠️ PKARR address exposed to DHT before NIP-03 published         │
│ ⚠️ Potential timing attack (PKARR address reveals registration) │
│ ⚠️ PKARR address not linked to blockchain proof                 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Option B: PKARR After NIP-03 (RECOMMENDED)

```
┌──────────────────────────────────────────────────────────────────┐
│ OPTION B: PKARR AFTER NIP-03 (RECOMMENDED)                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Sequence:                                                        │
│ 1. Kind:0 event created                                         │
│ 2. SimpleProof timestamp created                                │
│ 3. NIP-03 Kind:1040 event created (includes PKARR address)     │
│ 4. PKARR record created (non-blocking)                          │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ PROS                                                             │
├──────────────────────────────────────────────────────────────────┤
│ ✅ PKARR address included in NIP-03 event metadata              │
│ ✅ Unified attestation chain (Kind:0 → SP → NIP-03 → PKARR)   │
│ ✅ PKARR address has blockchain proof                           │
│ ✅ Better privacy (PKARR address not exposed until NIP-03)     │
│ ✅ Cleaner data dependencies                                    │
│ ✅ Easier to verify PKARR authenticity                          │
│ ✅ Single source of truth (NIP-03 event)                        │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ CONS                                                             │
├──────────────────────────────────────────────────────────────────┤
│ ⚠️ PKARR address created after NIP-03 (minor timing issue)      │
│ ⚠️ Requires NIP-03 event to include PKARR address in metadata   │
│ ⚠️ Slightly longer registration time (~500ms more)              │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ DATA DEPENDENCIES                                                │
├──────────────────────────────────────────────────────────────────┤
│ Kind:0 event_id                                                  │
│   └─ SimpleProof timestamp (uses event_id)                      │
│        └─ NIP-03 event (uses ots_proof + pkarr_address)        │
│             └─ PKARR record (uses pkarr_address from NIP-03)   │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ PRIVACY IMPLICATIONS                                             │
├──────────────────────────────────────────────────────────────────┤
│ ✅ PKARR address NOT exposed until NIP-03 published             │
│ ✅ No timing attack (PKARR address linked to blockchain proof) │
│ ✅ PKARR address linked to blockchain proof                     │
│ ✅ Single immutable record (NIP-03 event)                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## COMPARISON TABLE

| Aspect | Option A | Option B |
|--------|----------|----------|
| **PKARR Timing** | Before SimpleProof | After NIP-03 |
| **PKARR in NIP-03** | ❌ No | ✅ Yes |
| **Blockchain Proof** | ❌ No | ✅ Yes |
| **Unified Chain** | ❌ No | ✅ Yes |
| **Privacy** | ⚠️ Medium | ✅ High |
| **Verification** | ⚠️ Complex | ✅ Simple |
| **Registration Time** | ~3.5s | ~4s |
| **Data Dependencies** | ⚠️ Complex | ✅ Simple |
| **User Experience** | ✅ Faster | ⚠️ Slightly slower |
| **Attestation Quality** | ⚠️ Partial | ✅ Complete |

---

## RECOMMENDATION SUMMARY

### **OPTION B IS RECOMMENDED**

**Key Reasons:**

1. **Unified Attestation Chain** - Single immutable record linking Kind:0 → SimpleProof → NIP-03 → PKARR
2. **Blockchain Proof** - PKARR address has cryptographic proof of existence
3. **Privacy** - PKARR address not exposed until NIP-03 published
4. **Verification** - Anyone can verify PKARR authenticity by checking NIP-03 event
5. **Data Integrity** - PKARR address stored in NIP-03 event (immutable)
6. **Compliance** - Aligns with privacy-first architecture principles

**Trade-off:** ~500ms longer registration time is acceptable for improved security and privacy.

---

## IMPLEMENTATION IMPACT

### Code Changes Required

**Option A:**
- Minimal changes to register-identity.ts
- PKARR creation unchanged
- SimpleProof/NIP-03 added after PKARR

**Option B (Recommended):**
- Reorder operations in register-identity.ts
- Add PKARR address to NIP-03 event metadata
- Add PKARR address to nip03_attestations table
- Update PKARR record creation to reference NIP-03 attestation

### Database Changes Required

**Option A:**
- No changes to nip03_attestations table

**Option B (Recommended):**
- Add `pkarr_address` column to nip03_attestations
- Add `nip03_attestation_id` column to pkarr_records
- Add indexes for efficient queries

---

## NEXT STEPS

1. **Approve Option B** as the recommended approach
2. **Proceed with implementation** using the sequence diagram
3. **Update register-identity.ts** to follow Option B sequence
4. **Update database schema** with new columns and indexes
5. **Test end-to-end flow** with real Nostr relays and SimpleProof API


