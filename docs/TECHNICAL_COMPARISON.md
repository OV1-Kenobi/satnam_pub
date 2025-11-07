# Technical Comparison: NIP-57 vs Blinded Auth

## Architecture Alignment

### NIP-57 Lightning Zaps

```
┌─────────────────────────────────────────────────────────────┐
│                    NIP-57 Zap Flow                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User                CEPS              LNURL Server         │
│   │                  │                    │                 │
│   ├─ Create kind:9734 ─────────────────────>                │
│   │  (zap request)   │                    │                 │
│   │                  │                    ├─ Validate sig   │
│   │                  │                    ├─ Create invoice │
│   │                  │                    │                 │
│   │<─ Invoice ───────────────────────────┤                 │
│   │                  │                    │                 │
│   ├─ Pay invoice ────────────────────────>                 │
│   │  (via NWC/LNbits)│                    │                 │
│   │                  │                    ├─ Create kind:9735│
│   │                  │                    │  (receipt)      │
│   │                  │                    │                 │
│   │<─ Receipt ───────────────────────────┤                 │
│   │  (published)     │                    │                 │
│   │                  │                    │                 │
└─────────────────────────────────────────────────────────────┘

Key: No identity linkage, instant settlement, transparent attribution
```

### Blinded Authentication

```
┌─────────────────────────────────────────────────────────────┐
│              Blinded Auth Token Flow                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User                Blind Auth Server    Service Server    │
│   │                      │                    │             │
│   ├─ Generate secret ─────>                   │             │
│   │  (random)            │                    │             │
│   │                      ├─ Sign (blinded)    │             │
│   │<─ Blind token ───────┤                    │             │
│   │                      │                    │             │
│   ├─ Store encrypted ─────>                   │             │
│   │  (IndexedDB)         │                    │             │
│   │                      │                    │             │
│   ├─ Use token ──────────────────────────────>│             │
│   │  (no identity)       │                    │             │
│   │                      │                    ├─ Verify     │
│   │                      │                    ├─ Mark spent │
│   │<─ Access granted ─────────────────────────┤             │
│   │                      │                    │             │
└─────────────────────────────────────────────────────────────┘

Key: No identity linkage, one-time use, deterministic regeneration
```

---

## Feature Comparison

### Payment & Monetization

| Feature | NIP-57 | Blinded Auth |
|---------|--------|--------------|
| **Micropayments** | ✅ Yes | ❌ No |
| **Instant Settlement** | ✅ Yes | N/A |
| **Payment Attribution** | ✅ Yes (pubkey) | ❌ No |
| **Zap Receipts** | ✅ Yes | ❌ No |
| **Payment Splits** | ✅ Yes (NIP-57 Appendix G) | ❌ No |
| **Invoice Validation** | ✅ Yes | ❌ No |

### Privacy & Authentication

| Feature | NIP-57 | Blinded Auth |
|---------|--------|--------------|
| **Identity Linkage** | ⚠️ Optional (pubkey visible) | ✅ None |
| **One-Time Use** | ❌ No | ✅ Yes |
| **Token Expiration** | ❌ No | ✅ Yes |
| **Revocation** | ❌ No | ✅ Yes |
| **Deterministic Regen** | ❌ No | ✅ Yes |
| **E2EE Backup** | ❌ No | ✅ Yes |

### Integration Points

| Component | NIP-57 | Blinded Auth |
|-----------|--------|--------------|
| **CEPS** | ✅ Event signing/publishing | ⚠️ Optional |
| **LNbits/Phoenixd** | ✅ Invoice creation | ❌ No |
| **NWC** | ✅ Payment execution | ❌ No |
| **ClientSessionVault** | ❌ No | ✅ Token storage |
| **Supabase** | ⚠️ Receipt metadata | ✅ Token backup |
| **Netlify Functions** | ✅ Validation/publishing | ✅ Token verification |

---

## Use Case Matrix

### NIP-57 Use Cases

```
┌──────────────────────────────────────────────────────────┐
│ Use Case              │ Priority │ Timeline │ Complexity │
├──────────────────────────────────────────────────────────┤
│ Post Zapping         │ HIGH     │ 1 week   │ Low        │
│ User Profile Zapping │ HIGH     │ 1 week   │ Low        │
│ Zap Splits           │ MEDIUM   │ 1 week   │ Medium     │
│ Payment Automation   │ MEDIUM   │ 2 weeks  │ Medium     │
│ Receipt Validation   │ HIGH     │ 3 days   │ Low        │
│ Analytics Dashboard  │ LOW      │ 1 week   │ Medium     │
└──────────────────────────────────────────────────────────┘
```

### Blinded Auth Use Cases

```
┌──────────────────────────────────────────────────────────┐
│ Use Case              │ Priority │ Timeline │ Complexity │
├──────────────────────────────────────────────────────────┤
│ Family Admin Access  │ HIGH     │ 1 week   │ Medium     │
│ Support Tickets      │ MEDIUM   │ 1 week   │ Medium     │
│ Feature Gating       │ MEDIUM   │ 1 week   │ Low        │
│ Token Backup/Restore │ MEDIUM   │ 1 week   │ Medium     │
│ Audit Logging        │ LOW      │ 1 week   │ Low        │
│ Compliance Reporting │ LOW      │ 1 week   │ Medium     │
└──────────────────────────────────────────────────────────┘
```

---

## Data Flow Comparison

### NIP-57: Payment Flow

```
User Input
    ↓
Create kind:9734 (CEPS)
    ↓
Sign with active session
    ↓
Send to LNURL callback
    ↓
Validate on server
    ↓
Create invoice (LNbits/Phoenixd)
    ↓
Return to user
    ↓
Pay invoice (NWC)
    ↓
Server publishes kind:9735
    ↓
Client validates receipt
    ↓
Display zap confirmation
```

### Blinded Auth: Access Flow

```
User Authenticates
    ↓
Issue blind token (server)
    ↓
Encrypt with user salt (Noble V2)
    ↓
Store in IndexedDB
    ↓
Backup to Supabase (encrypted)
    ↓
User requests access
    ↓
Retrieve token from vault
    ↓
Send to service (no identity)
    ↓
Verify token signature
    ↓
Check if already spent
    ↓
Mark as spent
    ↓
Grant access
```

---

## Security Model Comparison

### NIP-57 Security

```
Threat Model:
├─ Signature Forgery
│  └─ Mitigation: Schnorr signature verification
├─ Invoice Tampering
│  └─ Mitigation: Description hash commitment
├─ Relay Censorship
│  └─ Mitigation: Multiple relay publishing
├─ LNURL Server Compromise
│  └─ Mitigation: Validate receipts client-side
└─ Payment Interception
   └─ Mitigation: BOLT11 encryption + routing

Privacy Guarantees:
├─ Sender anonymity: Optional (pubkey visible)
├─ Recipient privacy: Good (no payment details)
├─ Payment amount: Visible in receipt
└─ Message content: Optional encryption (NIP-59)
```

### Blinded Auth Security

```
Threat Model:
├─ Token Forgery
│  └─ Mitigation: Blind signature verification
├─ Token Replay
│  └─ Mitigation: One-time use + spent list
├─ Token Theft
│  └─ Mitigation: Encryption at rest + E2EE backup
├─ Identity Linkage
│  └─ Mitigation: No identity in token
└─ Token Expiration Bypass
   └─ Mitigation: Strict expiration checks

Privacy Guarantees:
├─ User anonymity: Excellent (no identity)
├─ Service privacy: Good (no user data)
├─ Token linkage: None (one-time use)
└─ Audit trail: Yes (hashed tokens only)
```

---

## Integration Complexity

### NIP-57 Integration Points

```
CEPS
├─ signEventWithActiveSession() ✅
├─ publishEvent() ✅
├─ subscribeMany() ✅
└─ npubToHex() ✅

LNbits/Phoenixd
├─ createInvoice() ✅
├─ validateInvoice() ✅
└─ getPaymentStatus() ✅

NWC
├─ payInvoice() ✅
└─ getBalance() ✅

Relay Infrastructure
├─ NIP-10050 (inbox discovery) ✅
├─ NIP-42 (AUTH) ✅
└─ Multi-relay publishing ✅
```

### Blinded Auth Integration Points

```
Encryption
├─ Noble V2 (encrypt/decrypt) ✅
├─ PBKDF2 (key derivation) ✅
└─ SHA-256 (hashing) ✅

Storage
├─ IndexedDB (client-side) ✅
├─ Supabase (backup) ✅
└─ ClientSessionVault (vault) ✅

Verification
├─ Blind signature verification ⚠️
├─ Token expiration checks ✅
└─ Revocation list lookup ✅

Audit
├─ Token hash logging ✅
├─ Action tracking ✅
└─ Compliance reporting ✅
```

---

## Performance Characteristics

### NIP-57 Performance

```
Operation              │ Latency  │ Throughput │ Scalability
───────────────────────┼──────────┼────────────┼─────────────
Create zap request     │ <100ms   │ N/A        │ Excellent
Validate signature     │ <50ms    │ 1000/sec   │ Excellent
Create invoice         │ 100-500ms│ 100/sec    │ Good
Publish receipt        │ 100-200ms│ 500/sec    │ Excellent
Validate receipt       │ <100ms   │ 1000/sec   │ Excellent
```

### Blinded Auth Performance

```
Operation              │ Latency  │ Throughput │ Scalability
───────────────────────┼──────────┼────────────┼─────────────
Issue blind token      │ <100ms   │ 1000/sec   │ Excellent
Verify token           │ <50ms    │ 5000/sec   │ Excellent
Mark as spent          │ <100ms   │ 1000/sec   │ Excellent
Encrypt token          │ <50ms    │ 2000/sec   │ Excellent
Decrypt token          │ <50ms    │ 2000/sec   │ Excellent
```

---

## Deployment Considerations

### NIP-57 Deployment

```
Frontend Changes:
├─ ZapButton component
├─ ZapReceipt display
├─ ZapHistory view
└─ LNURL integration

Backend Changes:
├─ /api/payments/zap-request-validate
├─ /api/payments/zap-receipt-publish
├─ /api/payments/zap-receipts
└─ lnbits-proxy extension

Database Changes:
├─ zap_requests table (optional)
├─ zap_receipts table (optional)
└─ zap_analytics table (optional)

Feature Flags:
├─ VITE_NIP57_ZAPS_ENABLED
├─ VITE_NIP57_ZAPS_MIN_AMOUNT
└─ VITE_NIP57_ZAPS_ENABLE_SPLITS
```

### Blinded Auth Deployment

```
Frontend Changes:
├─ Token storage UI
├─ Token backup UI
├─ Feature gating UI
└─ Admin access UI

Backend Changes:
├─ /api/auth/blind-token-issue
├─ /api/auth/blind-token-verify
├─ /api/auth/blind-token-revoke
└─ /api/auth/blind-token-audit

Database Changes:
├─ blind_tokens table
├─ blind_token_spent_list table
├─ blind_token_revocation_list table
└─ blind_token_audit_log table

Feature Flags:
├─ VITE_BLIND_AUTH_ENABLED
├─ VITE_BLIND_AUTH_TOKEN_EXPIRY_DAYS
└─ VITE_BLIND_AUTH_AUDIT_LOGGING_ENABLED
```

---

## Recommendation Summary

| Aspect | NIP-57 | Blinded Auth |
|--------|--------|--------------|
| **Priority** | HIGH ⭐⭐⭐⭐⭐ | HIGH ⭐⭐⭐⭐ |
| **Implement First** | ✅ Yes | ⏭️ After NIP-57 |
| **Timeline** | 2-3 weeks | 2-3 weeks |
| **Risk Level** | Low | Low |
| **User Impact** | High | High |
| **Enterprise Value** | High | Very High |
| **Privacy Impact** | Positive | Excellent |

**Suggested Approach:** Implement sequentially (NIP-57 MVP → Blinded Auth MVP → Integration) to manage complexity and risk.

---

**For detailed analysis, see:** `docs/EXTERNAL_RESOURCES_ANALYSIS.md`

