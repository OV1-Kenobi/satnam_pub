# Tapsigner Implementation - Quick Reference Guide

**Last Updated**: November 5, 2025  
**Status**: READY FOR DEVELOPMENT

---

## 🚀 Quick Start (5 minutes)

### For Project Managers
1. Read: **TAPSIGNER_IMPLEMENTATION_SUMMARY.md** (5 min)
2. Timeline: 3-4 weeks (80-120 hours)
3. Cost: $11,500-18,000 (one-time) + $2,000-3,000/year
4. Decision: PROCEED WITH TAPSIGNER ✅

### For Developers
1. Read: **TAPSIGNER_IMPLEMENTATION_PLAN.md** (15 min)
2. Review: **TAPSIGNER_CODE_SCAFFOLDING.md** (30 min)
3. Study: **TAPSIGNER_LNBITS_INTEGRATION.md** (20 min)
4. Execute: **database/migrations/036_tapsigner_setup.sql**
5. Start: Phase 1, Task 1.1

### For Architects
1. Read: **TAPSIGNER_TECHNICAL_APPENDIX.md** (25 min)
2. Review: **TAPSIGNER_LNBITS_INTEGRATION.md** (20 min)
3. Validate: Architecture diagrams and security model
4. Approve: Implementation approach

---

## 📋 Implementation Checklist

### Phase 1: Foundation (Week 1)
- [ ] Task 1.1: Database schema (4-6h)
- [ ] Task 1.2: Feature flags (2-3h)
- [ ] Task 1.3: Type definitions (3-4h)
- [ ] Task 1.4: LNbits evaluation (5-7h)
- [ ] Task 1.5: UI scaffolding (6-10h)

### Phase 2: Backend (Week 2)
- [ ] Task 2.1: TapsignerProtocol (10-15h)
- [ ] Task 2.2: ECDSA verification (6-8h)
- [ ] Task 2.3: Netlify functions (8-10h)
- [ ] Task 2.4: LNbits endpoints (6-7h)

### Phase 3: Frontend (Week 3)
- [ ] Task 3.1: useTapsignerAuth hook (8-12h)
- [ ] Task 3.2: React components (6-8h)
- [ ] Task 3.3: CEPS adapter (4-6h)
- [ ] Task 3.4: IdentityForge integration (2-4h)

### Phase 4: Testing (Week 4)
- [ ] Task 4.1: Unit tests (4-6h)
- [ ] Task 4.2: Integration tests (3-5h)
- [ ] Task 4.3: E2E tests (2-4h)
- [ ] Task 4.4: Security audit (1-5h)

---

## 🔑 Key Files

### Database
```
database/migrations/036_tapsigner_setup.sql
  ├── tapsigner_registrations (card storage)
  ├── tapsigner_operations_log (audit trail)
  └── tapsigner_lnbits_links (wallet mapping)
```

### Backend
```
netlify/functions_active/tapsigner-unified.ts
  ├── POST /register (card registration)
  ├── POST /verify (authentication)
  ├── POST /sign (data signing)
  └── POST /lnbits-link (wallet linking)

netlify/functions_active/lnbits-proxy.ts
  ├── tapsignerRegisterCard
  ├── tapsignerAuthorizePayment
  └── tapsignerGetStatus
```

### Frontend
```
src/lib/tapsigner-protocol.ts (~300 lines)
  ├── readCard() - Web NFC API
  ├── signData() - ECDSA signing
  └── verifySignature() - Signature verification

src/hooks/useTapsignerAuth.ts (~400 lines)
  ├── detectCard()
  ├── authenticate()
  ├── registerCard()
  ├── linkToLnbits()
  └── signEvent()

src/lib/signers/tapsigner-adapter.ts (~250 lines)
  └── Implements SignerAdapter interface for CEPS

src/components/TapsignerAuthModal.tsx (~350 lines)
  └── Main UI component
```

### Types
```
src/types/index.ts
  ├── TapsignerCard
  ├── ECDSASignature
  ├── TapsignerAuthResponse
  └── TapsignerLnbitsLink
```

---

## 🔗 LNbits Integration

### Database Design
```sql
-- Extend existing lnbits_boltcards table
ALTER TABLE lnbits_boltcards ADD COLUMN card_type TEXT DEFAULT 'boltcard';
ALTER TABLE lnbits_boltcards ADD COLUMN public_key_hex TEXT;
ALTER TABLE lnbits_boltcards ADD COLUMN xpub TEXT;
```

### API Endpoints
```
POST /api/lnbits-proxy
  action: "tapsignerRegisterCard"
  action: "tapsignerAuthorizePayment"
  action: "tapsignerGetStatus"
```

### Payment Flow
```
User taps card
  ↓
Web NFC API reads card
  ↓
Sign payment request (requires PIN on card)
  ↓
Server verifies ECDSA signature
  ↓
LNbits processes payment
  ↓
Payment authorized
```

---

## 🔐 Security Checklist

- [ ] ECDSA signature verification uses constant-time comparison
- [ ] No private key material in logs, database, or transmission
- [ ] PIN never transmitted to server
- [ ] RLS policies prevent cross-user data access
- [ ] Rate limiting on authentication attempts
- [ ] Input validation on all card data
- [ ] LNbits API keys properly secured
- [ ] No timing attacks on signature verification
- [ ] Proper error handling (no information leakage)
- [ ] HTTPS-only enforcement

---

## 🎯 Feature Flags

```bash
# Master toggle
VITE_TAPSIGNER_ENABLED=true

# LNbits integration
VITE_TAPSIGNER_LNBITS_ENABLED=true

# Tap-to-spend payments
VITE_TAPSIGNER_TAP_TO_SPEND_ENABLED=true

# Debug logging
VITE_TAPSIGNER_DEBUG=false
```

---

## 📊 Effort Estimates

| Phase | Tasks | Hours | Weeks |
|-------|-------|-------|-------|
| 1: Foundation | 5 | 20-30 | 1 |
| 2: Backend | 4 | 30-40 | 1 |
| 3: Frontend | 4 | 20-30 | 1 |
| 4: Testing | 4 | 10-20 | 1 |
| **TOTAL** | **17** | **80-120** | **3-4** |

---

## 💰 Cost Breakdown

| Item | Cost |
|------|------|
| Development (80-120 hours @ $150/hr) | $12,000-18,000 |
| Security audit | $2,000-3,000 |
| Testing infrastructure | $500-1,000 |
| **One-time Total** | **$14,500-22,000** |
| **Annual Maintenance** | **$2,000-3,000** |

---

## ✅ Success Criteria

### Phase 1
- [ ] Database schema created
- [ ] Feature flags working
- [ ] Types defined
- [ ] LNbits approach documented

### Phase 2
- [ ] TapsignerProtocol working
- [ ] ECDSA verification tested
- [ ] Netlify functions deployed
- [ ] LNbits endpoints functional

### Phase 3
- [ ] useTapsignerAuth hook working
- [ ] React components functional
- [ ] CEPS adapter registered
- [ ] IdentityForge integration complete

### Phase 4
- [ ] 80%+ test coverage
- [ ] Security audit passed
- [ ] All tests passing
- [ ] Ready for production

---

## 🚨 Critical Decisions

### 1. LNbits Integration
**Decision**: Extend `lnbits_boltcards` with `card_type` discriminator  
**Rationale**: Unified wallet management, minimal schema changes  
**Status**: ✅ APPROVED

### 2. Signature Verification
**Decision**: Web Crypto API with ECDSA secp256k1  
**Rationale**: Browser-native, hardware-accelerated, constant-time  
**Status**: ✅ APPROVED

### 3. Payment Authorization
**Decision**: ECDSA signature-based (not LNURL-withdraw)  
**Rationale**: Tapsigner hardware supports ECDSA, more flexible  
**Status**: ✅ APPROVED

### 4. Database Privacy
**Decision**: Hashed card IDs with per-user salts, RLS policies  
**Rationale**: Zero-knowledge, privacy-first principles  
**Status**: ✅ APPROVED

---

## 🔄 Parallel Implementation Strategy

### Can Run in Parallel
- Task 1.2 (Feature flags) ↔ Task 1.3 (Type definitions)
- Task 2.1 (Protocol) ↔ Task 2.3 (Netlify functions)
- Task 3.1 (Hook) ↔ Task 3.2 (Components)

### Must Run Sequentially
- Task 1.1 → Task 1.4 (Database before LNbits design)
- Task 2.2 → Task 2.3 (Verification before functions)
- Task 3.1 → Task 3.3 (Hook before adapter)

---

## 📞 Common Questions

**Q: Will this break NTAG424?**  
A: No. Tapsigner is complementary. NTAG424 continues unchanged.

**Q: Can users use both?**  
A: Yes. Both can be registered and used for different operations.

**Q: What if Web NFC not available?**  
A: Graceful degradation with clear error message.

**Q: How are spend limits enforced?**  
A: Server-side rate limiting per card per day.

**Q: Is this compatible with existing LNbits?**  
A: Yes. Links to existing wallets.

---

## 🎓 Learning Resources

### Tapsigner Protocol
- https://dev.coinkite.cards/docs/protocol.html
- https://github.com/coinkite/coinkite-tap-proto

### Web NFC API
- https://developer.mozilla.org/en-US/docs/Web/API/Web_NFC_API
- https://w3c.github.io/web-nfc/

### ECDSA Verification
- https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/verify
- https://en.wikipedia.org/wiki/Elliptic_Curve_Digital_Signature_Algorithm

### LNbits Integration
- https://docs.lnbits.com/
- https://github.com/lnbits/lnbits

---

## 📈 Deployment Timeline

```
Week 1: Phase 1 (Foundation)
  Mon-Tue: Database + Feature flags
  Wed-Thu: Type definitions + LNbits evaluation
  Fri: UI scaffolding

Week 2: Phase 2 (Backend)
  Mon-Tue: TapsignerProtocol + ECDSA verification
  Wed-Thu: Netlify functions
  Fri: LNbits endpoints

Week 3: Phase 3 (Frontend)
  Mon-Tue: useTapsignerAuth hook
  Wed-Thu: React components + CEPS adapter
  Fri: IdentityForge integration

Week 4: Phase 4 (Testing)
  Mon-Tue: Unit + Integration tests
  Wed-Thu: E2E tests
  Fri: Security audit + Documentation
```

---

## 🎯 Next Steps

1. **Today**: Review this quick reference
2. **Tomorrow**: Read TAPSIGNER_IMPLEMENTATION_PLAN.md
3. **This Week**: Complete Phase 1 planning
4. **Next Week**: Begin Phase 1 implementation
5. **Week 2-4**: Continue phases 2-4

---

**Status**: ✅ READY FOR DEVELOPMENT  
**Recommendation**: PROCEED WITH TAPSIGNER  
**Timeline**: 3-4 weeks  
**Cost**: $11,500-18,000 (one-time)

