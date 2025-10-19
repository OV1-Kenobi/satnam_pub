# DID:SCID Implementation Plan
## Phase 1 Metadata Enhancement - Detailed Execution Plan

**Status**: READY FOR IMPLEMENTATION  
**Date**: 2025-10-18  
**Timeline**: 4-6 weeks  
**Risk Level**: LOW (fully backward compatible)

---

## Current Implementation Status

### ✅ COMPLETED
1. **DID:SCID Utilities** (`src/lib/vc/jwk-did.ts`)
   - `didScidFromJwkAndNip05()` - Generate DID:SCID from JWK + NIP-05
   - `didScidUrlWithSrc()` - Create DID:SCID URL with source
   - `buildDidDocumentWithScid()` - Build DID Document with SCID
   - Tests: `tests/jwk-did.test.ts` ✅

2. **Database Schema** (`supabase/migrations/20250923b_did_scid_extensions.sql`)
   - Added SCID columns to `issuer_registry` table
   - `scid_format`, `scid_version`, `src_urls` fields

3. **Documentation**
   - DID_SCID_INTEGRATION_ANALYSIS.md - Comprehensive analysis
   - DID_SCID_IMPLEMENTATION_PROPOSAL.md - Technical specification
   - DID_SCID_UDNA_ANALYSIS_FINAL_REPORT.md - Executive summary (UPDATED)

### ⚠️ PARTIALLY IMPLEMENTED
1. **Multi-Method Verification** (`src/lib/nip05-verification.ts`)
   - Trust scoring implemented (0-100 scale)
   - Multi-method verification working (kind:0, PKARR, DNS)
   - **MISSING**: DID:SCID as 4th verification method

2. **NIP05PasswordAuth Component** (`src/components/auth/NIP05PasswordAuth.tsx`)
   - Verification method selector UI added
   - **FIXED**: Now connected to verification logic

### ❌ NOT IMPLEMENTED
1. **DID:SCID Generation Utilities** (`src/lib/crypto/did-scid-utils.ts`)
   - KERI-based SCID generation from Ed25519 keys
   - Derivation verification
   - Proof creation

2. **kind:0 Publishing Enhancement** (`lib/central_event_publishing_service.ts`)
   - Add optional DID:SCID fields to `publishProfile()`
   - Generate SCID if feature flag enabled

3. **PKARR Record Enhancement** (`lib/pubky-enhanced-client.ts`)
   - Include DID:SCID in PKARR record publishing
   - Parse DID:SCID from records

4. **DNS Parsing Enhancement** (`src/lib/nip05-verification.ts`)
   - Extract DID:SCID from DNS TXT records
   - Validate DID:SCID format

5. **Database Migration** (`database/migrations/032_did_scid_integration.sql`)
   - Create `did_scid_identities` table
   - Add columns to `multi_method_verification_results`
   - Set up RLS policies

6. **Feature Flags** (`src/config/env.client.ts`)
   - `VITE_DID_SCID_ENABLED`
   - `VITE_DID_SCID_VERIFICATION_ENABLED`
   - `VITE_DID_SCID_REQUIRE_PROOF`

---

## Implementation Roadmap

### Week 1: Core Utilities & Database
**Tasks**:
1. Create `src/lib/crypto/did-scid-utils.ts`
   - `generateDIDSCID(inceptionKeyHex)` - KERI-based generation
   - `verifyDIDSCIDDerivation(did, inceptionKeyHex)` - Verification
   - `createDIDSCIDProof(inceptionKeyHex)` - Proof creation
   - `extractSCIDFromDID(did)` - Parse SCID from DID

2. Create database migration `database/migrations/032_did_scid_integration.sql`
   - `did_scid_identities` table
   - Columns: `user_duid`, `did_scid`, `inception_key`, `derivation_code`, `verified_at`
   - Add columns to `multi_method_verification_results`
   - RLS policies for user data isolation

3. Add feature flags to `src/config/env.client.ts`
   - `VITE_DID_SCID_ENABLED` (default: false)
   - `VITE_DID_SCID_VERIFICATION_ENABLED` (default: false)
   - `VITE_DID_SCID_REQUIRE_PROOF` (default: false)

### Week 2: Integration Points
**Tasks**:
1. Update `lib/central_event_publishing_service.ts`
   - Modify `publishProfile()` to include optional DID:SCID
   - Generate SCID if feature flag enabled
   - Maintain backward compatibility

2. Update `lib/pubky-enhanced-client.ts`
   - Include DID:SCID in PKARR record publishing
   - Parse DID:SCID from records
   - Handle missing fields gracefully

3. Update `src/lib/nip05-verification.ts`
   - Add `tryDIDSCIDResolution()` method
   - Extract DID:SCID from DNS TXT records
   - Validate DID:SCID format

### Week 3: Verification & Trust Scoring
**Tasks**:
1. Integrate DID:SCID into `HybridNIP05Verifier`
   - Add DID:SCID as 4th verification method
   - Update trust score calculation (100 = all 4 methods agree)
   - Update `calculateTrustScore()` logic

2. Update `VerificationStatusDisplay` component
   - Display DID:SCID verification status
   - Show KERI proof details

3. Write comprehensive tests
   - Unit tests for SCID generation/verification
   - Integration tests for multi-method verification
   - E2E tests for authentication flow

### Week 4: Testing & Rollout
**Tasks**:
1. Security audit
   - Review KERI implementation
   - Verify cryptographic correctness
   - Check RLS policies

2. Performance testing
   - Measure verification latency
   - Optimize caching strategies

3. Beta rollout
   - Enable feature flags for beta users
   - Monitor adoption and issues
   - Gather feedback

---

## Success Criteria

- ✅ Zero breaking changes
- ✅ All tests passing
- ✅ DID:SCID adoption > 50% within 3 months
- ✅ No performance degradation
- ✅ User satisfaction > 80%

---

## Next Steps

1. **Approval**: Stakeholder review of this plan
2. **Sprint Planning**: Break down into 2-week sprints
3. **Development**: Start Week 1 tasks
4. **Testing**: Continuous integration throughout
5. **Rollout**: Gradual feature flag enablement

