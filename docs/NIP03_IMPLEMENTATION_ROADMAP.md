# NIP-03 Implementation Roadmap

**Total Effort:** 105 hours | **Timeline:** 6 weeks | **Status:** READY FOR APPROVAL

---

## PHASE 1: NIP-03 FOR KEY ROTATION (Weeks 1-2)

### Week 1: Foundation & Services (40 hours)

#### Day 1-2: Database & Migrations (16 hours)
- [ ] Create migration `041_nip03_attestations.sql` (130 lines)
  - Create `nip03_attestations` table
  - Add RLS policies (3 policies)
  - Create helper functions (2 functions)
  - Add indexes (4 indexes)
- [ ] Create migration `042_nip03_pkarr_integration.sql` (40 lines)
  - Add `nip03_attestation_id` column to `pkarr_records`
  - Add foreign key constraint
  - Add index

**Deliverables:**
- ✅ Database schema ready
- ✅ RLS policies enforced
- ✅ Helper functions available

#### Day 3-4: Service Implementation (16 hours)
- [ ] Create `src/lib/nip03-attestation-service.ts` (200 lines)
  - `createAttestation()` - Build Kind:1040 event
  - `publishAttestation()` - Publish via CEPS
  - `storeAttestation()` - Save to database
  - `getAttestation()` - Retrieve by ID
  - `listAttestations()` - List user attestations
  - Error handling & logging

**Deliverables:**
- ✅ Service fully functional
- ✅ All methods tested
- ✅ Logging integrated

#### Day 5: Integration with Key Rotation (8 hours)
- [ ] Update `src/lib/auth/nostr-key-recovery.ts` (100 lines)
  - Replace placeholder comments (lines 663-668)
  - Add NIP-03 calls for Kind:1776 events
  - Add NIP-03 calls for Kind:1777 events
  - Add error handling

**Deliverables:**
- ✅ Key rotation creates attestations
- ✅ Attestations published to relays
- ✅ Attestations stored in database

### Week 2: Testing & Refinement (40 hours)

#### Day 1-2: Unit Tests (16 hours)
- [ ] Create `src/lib/__tests__/nip03-attestation.test.ts` (150 lines)
  - Test Kind:1040 event structure
  - Test event signing
  - Test database storage
  - Test error handling

**Deliverables:**
- ✅ 20+ unit tests
- ✅ >90% code coverage
- ✅ All tests passing

#### Day 3-4: Integration Tests (16 hours)
- [ ] Create `src/lib/__tests__/nip03-key-rotation.integration.test.ts` (200 lines)
  - Test full key rotation flow
  - Test SimpleProof + NIP-03 integration
  - Test CEPS publishing
  - Test database queries

**Deliverables:**
- ✅ 15+ integration tests
- ✅ Full flow tested
- ✅ All tests passing

#### Day 5: E2E Tests & Documentation (8 hours)
- [ ] Create E2E test scenarios
- [ ] Update README with NIP-03 info
- [ ] Create user-facing documentation

**Deliverables:**
- ✅ E2E tests passing
- ✅ Documentation complete
- ✅ Ready for Phase 2

---

## PHASE 2: NIP-03 FOR IDENTITY CREATION (Weeks 3-4)

### Week 3: UI & Integration (35 hours)

#### Day 1-2: Attestation Manager Updates (12 hours)
- [ ] Update `src/lib/attestation-manager.ts` (100 lines)
  - Add `includeNip03` parameter
  - Integrate with `nip03-attestation-service.ts`
  - Add NIP-03 to `Attestation` interface
  - Update `createAttestation()` function

**Deliverables:**
- ✅ Attestation manager supports NIP-03
- ✅ Backward compatible
- ✅ Tests updated

#### Day 3-4: IdentityForge UI Updates (16 hours)
- [ ] Update `src/components/IdentityForge.tsx` (80 lines)
  - Add NIP-03 attestation step (after Kind:0 creation)
  - Show blockchain confirmation UI
  - Display Bitcoin block/tx details
  - Add success/error messaging

**Deliverables:**
- ✅ UI shows attestation progress
- ✅ User sees blockchain confirmation
- ✅ Clear error messages

#### Day 5: Registration Integration (7 hours)
- [ ] Update `netlify/functions_active/register-identity.ts` (60 lines)
  - Call NIP-03 attestation after registration
  - Non-blocking (don't fail registration)
  - Store attestation reference
  - Log for monitoring

**Deliverables:**
- ✅ Registration creates attestations
- ✅ Non-blocking implementation
- ✅ Monitoring in place

### Week 4: Testing & Deployment (35 hours)

#### Day 1-2: Unit & Integration Tests (16 hours)
- [ ] Create `src/lib/__tests__/nip03-identity.test.ts` (150 lines)
- [ ] Create `src/lib/__tests__/nip03-identity.integration.test.ts` (200 lines)

**Deliverables:**
- ✅ 25+ tests
- ✅ >85% coverage
- ✅ All passing

#### Day 3-4: E2E Tests (12 hours)
- [ ] Test full registration flow with attestation
- [ ] Test UI interactions
- [ ] Test error scenarios

**Deliverables:**
- ✅ E2E tests passing
- ✅ UI tested
- ✅ Ready for production

#### Day 5: Documentation & Staging (7 hours)
- [ ] Update documentation
- [ ] Deploy to staging
- [ ] Verify in staging environment

**Deliverables:**
- ✅ Documentation complete
- ✅ Staging deployment successful
- ✅ Ready for Phase 3

---

## PHASE 3: NIP-03 FOR ROLE CHANGES (Weeks 5-6)

### Week 5: Role Change Attestations (30 hours)

#### Day 1-2: Role Change Service (12 hours)
- [ ] Create `src/lib/family/role-change-attestation.ts` (120 lines)
  - Detect role changes
  - Create attestation events
  - Publish via CEPS
  - Store in database

**Deliverables:**
- ✅ Service functional
- ✅ Tests passing
- ✅ Logging integrated

#### Day 3-4: Family Member Integration (12 hours)
- [ ] Update family member management (80 lines)
  - Trigger attestation on role change
  - Store attestation reference
  - Emit events for UI

**Deliverables:**
- ✅ Role changes create attestations
- ✅ UI updated
- ✅ Tests passing

#### Day 5: Database & Migrations (6 hours)
- [ ] Create migration for role change tracking
- [ ] Add indexes
- [ ] Update RLS policies

**Deliverables:**
- ✅ Database ready
- ✅ RLS policies updated
- ✅ Indexes created

### Week 6: Testing & Production (30 hours)

#### Day 1-2: Comprehensive Testing (12 hours)
- [ ] Unit tests (100 lines)
- [ ] Integration tests (150 lines)
- [ ] E2E tests (100 lines)

**Deliverables:**
- ✅ 30+ tests
- ✅ >85% coverage
- ✅ All passing

#### Day 3-4: Production Deployment (12 hours)
- [ ] Enable feature flags
- [ ] Monitor Sentry
- [ ] Verify blockchain confirmations
- [ ] Check relay publishing

**Deliverables:**
- ✅ Production deployment successful
- ✅ Monitoring active
- ✅ No errors in Sentry

#### Day 5: Documentation & Handoff (6 hours)
- [ ] Final documentation
- [ ] User guides
- [ ] Admin guides
- [ ] Troubleshooting guide

**Deliverables:**
- ✅ Complete documentation
- ✅ User guides ready
- ✅ Support team trained

---

## FEATURE FLAGS TIMELINE

### Week 1-2 (Phase 1)
```
VITE_NIP03_ENABLED=false              (default)
VITE_NIP03_KEY_ROTATION=false         (default)
```

### Week 3-4 (Phase 2)
```
VITE_NIP03_ENABLED=true               (enable)
VITE_NIP03_KEY_ROTATION=true          (enable)
VITE_NIP03_IDENTITY_CREATION=false    (default)
```

### Week 5-6 (Phase 3)
```
VITE_NIP03_ENABLED=true               (enabled)
VITE_NIP03_KEY_ROTATION=true          (enabled)
VITE_NIP03_IDENTITY_CREATION=true     (enable)
VITE_NIP03_ROLE_CHANGES=false         (default)
```

### Production
```
VITE_NIP03_ENABLED=true               (all enabled)
VITE_NIP03_KEY_ROTATION=true
VITE_NIP03_IDENTITY_CREATION=true
VITE_NIP03_ROLE_CHANGES=true
```

---

## TESTING COVERAGE TARGETS

| Phase | Unit | Integration | E2E | Total |
|-------|------|-------------|-----|-------|
| Phase 1 | 20 | 15 | 10 | 45 |
| Phase 2 | 25 | 20 | 15 | 60 |
| Phase 3 | 30 | 25 | 20 | 75 |
| **Total** | **75** | **60** | **45** | **180** |

**Target Coverage:** >85% across all phases

---

## DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] All tests passing (>85% coverage)
- [ ] Code review completed
- [ ] Security audit passed
- [ ] Documentation complete
- [ ] Staging deployment successful
- [ ] Monitoring configured
- [ ] Rollback plan documented

### Deployment
- [ ] Enable feature flags
- [ ] Monitor Sentry (first 24 hours)
- [ ] Verify blockchain confirmations
- [ ] Check relay publishing
- [ ] Monitor database performance

### Post-Deployment
- [ ] User feedback collected
- [ ] Performance metrics reviewed
- [ ] Security logs reviewed
- [ ] Documentation updated
- [ ] Team trained

---

## SUCCESS METRICS

### Phase 1
- ✅ 100% of key rotation events have NIP-03 attestations
- ✅ 0 failed attestations (graceful degradation)
- ✅ <100ms attestation creation time

### Phase 2
- ✅ 100% of identity creation events have NIP-03 attestations
- ✅ 0 registration failures due to attestation
- ✅ <500ms total registration time

### Phase 3
- ✅ 100% of role changes have NIP-03 attestations
- ✅ 0 governance failures due to attestation
- ✅ <200ms attestation creation time

---

## APPROVAL REQUIRED

Please review and approve:

1. **Architecture Design** (`docs/NIP03_ATTESTATION_ARCHITECTURE_DESIGN.md`)
2. **Technical Specifications** (`docs/NIP03_TECHNICAL_SPECIFICATIONS.md`)
3. **Implementation Roadmap** (this document)
4. **Timeline:** 6 weeks, 105 hours
5. **Feature Flags:** As specified above
6. **Testing Strategy:** 180+ tests, >85% coverage

**Next Step:** Upon approval, implementation begins immediately.

