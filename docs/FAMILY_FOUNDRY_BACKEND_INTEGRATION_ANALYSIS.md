# Family Foundry ↔ Backend Infrastructure Integration Analysis

**Date**: December 1, 2025  
**Status**: ANALYSIS COMPLETE - Ready for Implementation Planning  
**Scope**: Integration of Family Foundry wizard with backend federation, FROST, and NFC MFA systems

---

## 1. CURRENT STATE SUMMARY

### Frontend Components (Existing)
- **FamilyFoundryWizard.tsx** - Main orchestrator (623 lines)
- **FamilyFoundryStep1Charter.tsx** - Charter definition (180 lines)
- **FamilyFoundryStep2RBAC.tsx** - Role-based access control (269 lines)
- **FamilyFoundryStep3Invite.tsx** - Member invitation (308 lines)
- **FamilyFederationCreationModal.tsx** - Federation creation modal

### Backend Infrastructure (Implemented)
1. **Database Tables**:
   - `family_federations` - Federation metadata with `federation_duid`
   - `family_members` - Member records with `user_duid` and `family_role`
   - `family_charters` - Charter definitions with RBAC configuration
   - `frost_signing_sessions` - FROST session management
   - `nfc_mfa_audit_log` - NFC MFA verification audit trail

2. **API Endpoints**:
   - `POST /api/family/foundry` - Create charter + federation
   - `POST /family-federations` - Create federation
   - `GET /family-federations/{duid}` - Get federation details
   - `GET /family-federations/{duid}/members` - List members
   - `POST /api/family/role-management/change-role` - Update member role

3. **Services**:
   - `FamilyFoundryService` - Charter/federation creation
   - `FrostSessionManager` - FROST signing orchestration
   - `FrostNfcMfa` - NFC MFA signature collection/verification
   - `StewardApprovalClient` - Guardian approval workflows

---

## 2. GAP ANALYSIS

### Critical Gaps
1. **No federation_duid generation** in wizard
2. **No user_duid mapping** during member invitation
3. **No FROST threshold configuration** in RBAC setup
4. **No NFC MFA policy configuration** during charter creation
5. **No steward approval workflow** integration
6. **No role validation** against Master Context hierarchy
7. **No federation creation API call** from wizard

### Missing Integrations
- Charter → `family_federations` table mapping
- RBAC roles → `family_members.family_role` assignment
- Guardian threshold → FROST configuration
- NFC MFA policy → `nfc_mfa_audit_log` setup

---

## 3. IMPLEMENTATION REQUIREMENTS

### Phase 1: Federation Creation
- Generate `federation_duid` using privacy-first hashing
- Create `family_federations` record
- Initialize FROST configuration with guardian threshold
- Set up NFC MFA policy based on charter

### Phase 2: Role Assignment
- Map RBAC roles to Master Context hierarchy
- Create `family_members` records for founder
- Validate role hierarchy (guardian > steward > adult > offspring)
- Set voting power and spending limits per role

### Phase 3: Guardian Approval Integration
- Implement steward approval workflow for federation creation
- Collect NFC MFA signatures from guardians
- Verify FROST threshold met before finalizing

### Phase 4: Testing & Verification
- Unit tests for federation creation
- Integration tests for role assignment
- E2E tests for complete wizard flow

---

## 4. NEXT STEPS

1. **Create integration service** (`src/lib/family-foundry-integration.ts`)
2. **Update wizard components** to call backend APIs
3. **Implement federation_duid generation**
4. **Add role validation and assignment**
5. **Integrate FROST configuration**
6. **Add NFC MFA policy setup**
7. **Write comprehensive tests**

**Estimated Effort**: 3-4 days for full implementation and testing

