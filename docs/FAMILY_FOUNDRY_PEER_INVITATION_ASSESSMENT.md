# Family Foundry Peer Invitation System - Assessment Report

**Date**: December 2, 2025  
**Status**: ASSESSMENT COMPLETE - Ready for Implementation Planning  
**Scope**: Automated peer invitation system for Family Foundry Wizard

---

## EXECUTIVE SUMMARY

The codebase has **partial invitation infrastructure** but lacks a **Family Foundry-specific invitation system**. Current systems are designed for educational invitations and peer networking, not family federation role-based invitations. A new system is needed to:

1. Generate federation-specific invitations with role parameters
2. Integrate with NIP-17 encrypted messaging for Nostr DM delivery
3. Support QR code generation (browser-compatible infrastructure exists)
4. Track invitation status and redemption
5. Integrate with Family Foundry Wizard Step 3 (Invite Peers)

---

## PART 1: CURRENT STATE ANALYSIS

### 1.1 Family Foundry Wizard Components ✅

**Location**: `src/components/FamilyFoundry*.tsx`

**Current Flow**:
- **Step 1**: Charter Definition (FamilyFoundryStep1Charter.tsx)
- **Step 2**: RBAC Setup (FamilyFoundryStep2RBAC.tsx) - Configures FROST threshold
- **Step 3**: Invite Peers (FamilyFoundryStep3Invite.tsx) - **NEEDS ENHANCEMENT**
- **Step 4**: Review & Submit (FamilyFederationCreationModal.tsx)

**Step 3 Current State**:
- Collects trusted peers: name, npub, role, relationship
- Validates npubs
- Maps peers to user_duids
- **MISSING**: Invitation generation, QR codes, NIP-17 messaging, sharing UI

### 1.2 Backend API Infrastructure ✅

**Location**: `api/family/foundry.js`

**Current Endpoints**:
- `POST /api/family/foundry` - Creates charter + federation
- Creates family_federations record with FROST/NFC config
- Creates family_members records for each member
- **MISSING**: Invitation token generation, validation, redemption

**Related Endpoints**:
- `api/authenticated/generate-peer-invite.js` - Educational invitations (NOT family-specific)
- `api/authenticated/accept-peer-invite.js` - Invitation acceptance (NOT family-specific)
- `api/authenticated/create-invitation.js` - Generic invitation creation

### 1.3 Database Schema ✅

**Existing Tables**:
- `family_federations` - Federation metadata with federation_duid
- `family_members` - Member records with user_duid and family_role
- `family_charters` - Charter definitions with RBAC
- `frost_signing_sessions` - FROST session management
- `authenticated_peer_invitations` - Educational invitations (NOT family-specific)

**MISSING**: Dedicated `family_federation_invitations` table for:
- Tracking federation-specific invitations
- Storing invitation tokens, federation_duid, role, expiry
- Recording invitation status (pending, accepted, expired)
- Audit trail for invitation creation/redemption

### 1.4 NIP-17 Messaging Integration ✅

**Location**: `src/lib/messaging/client-message-service.ts`, `src/lib/noise/`

**Current Implementation**:
- NIP-17 (kind 14) encrypted messaging with Noise protocol
- Noise protocol for forward secrecy with configurable key rotation
- CEPS (Central Event Publishing Service) handles message encryption/signing
- Fallback to NIP-59 if NIP-17 not available
- **READY**: Can send federation invitations via NIP-17 DMs

### 1.5 QR Code Generation ✅

**Location**: `src/utils/qr-code-browser.ts`

**Current Implementation**:
- Browser-compatible QR generation using `qrcode-generator` library
- Functions: `generateQRCodeDataURL()`, `generateQRCodeSVG()`
- Used in: Lightning dashboard, profile sharing
- **READY**: Can generate QR codes for invitation links

### 1.6 Existing Invitation Components ⚠️

**Location**: `src/components/communications/`

**Components**:
- `PeerInvitationModal.tsx` - Generic peer invitations (NOT family-specific)
- `SecurePeerInvitationModal.tsx` - Secure peer invitations
- `FamilyFederationInvitationModal.tsx` - **Exists but incomplete**

**Status**: Generic components exist but lack family federation context

---

## PART 2: GAPS & REQUIREMENTS

### 2.1 Missing Components

| Component | Status | Purpose |
|-----------|--------|---------|
| FamilyFederationInvitationGenerator | ❌ | Generate federation-specific invitations |
| FamilyInvitationPreview | ❌ | Preview invitation before sending |
| FamilyInvitationQRCode | ❌ | Display QR code for invitation link |
| FamilyInvitationSharing | ❌ | Share via NIP-17, copy, email, SMS |
| FamilyInvitationStatus | ❌ | Track invitation status in Step 4 |

### 2.2 Missing API Endpoints

| Endpoint | Status | Purpose |
|----------|--------|---------|
| POST /api/family/invitations/generate | ❌ | Generate invitation token |
| GET /api/family/invitations/{token} | ❌ | Validate invitation |
| POST /api/family/invitations/{token}/accept | ❌ | Accept invitation |
| GET /api/family/invitations/status | ❌ | Get invitation status |
| POST /api/family/invitations/{token}/send-nip17 | ❌ | Send via NIP-17 DM |

### 2.3 Missing Database Table

```sql
CREATE TABLE family_federation_invitations (
  id UUID PRIMARY KEY,
  federation_duid TEXT NOT NULL,
  invitation_token TEXT UNIQUE NOT NULL,
  inviter_user_duid TEXT NOT NULL,
  invitee_npub TEXT,
  role TEXT NOT NULL ('guardian'|'steward'|'adult'|'offspring'),
  status TEXT NOT NULL ('pending'|'accepted'|'expired'|'revoked'),
  created_at TIMESTAMP,
  expires_at TIMESTAMP,
  accepted_at TIMESTAMP,
  accepted_by_user_duid TEXT,
  metadata JSONB (federation_name, charter_details, role_description)
);
```

### 2.4 Missing Integration Points

1. **Step 3 Enhancement**: Add invitation generation UI
2. **Step 4 Enhancement**: Show invitation status
3. **Backend**: Create invitation tokens and store in database
4. **NIP-17 Integration**: Send invitations via encrypted DMs
5. **Redemption Flow**: Accept invitation and join federation

---

## PART 3: IMPLEMENTATION SCOPE

### 3.1 Frontend Components (TypeScript/React)

**New Files**:
- `src/components/FamilyFoundryStep3InviteEnhanced.tsx` - Enhanced Step 3 with invitation generation
- `src/components/family-invitations/FederationInvitationGenerator.tsx` - Invitation generation UI
- `src/components/family-invitations/InvitationPreview.tsx` - Preview before sending
- `src/components/family-invitations/InvitationQRCode.tsx` - QR code display
- `src/components/family-invitations/InvitationSharing.tsx` - Sharing options
- `src/components/family-invitations/InvitationStatusTracker.tsx` - Status tracking

**Modifications**:
- `src/components/FamilyFoundryWizard.tsx` - Add invitation state management
- `src/components/FamilyFederationCreationModal.tsx` - Show invitation status in Step 4

### 3.2 Backend API Endpoints (Netlify Functions, JavaScript ESM)

**New Files**:
- `netlify/functions_active/family-invitations-generate.js` - Generate invitation tokens
- `netlify/functions_active/family-invitations-validate.js` - Validate invitations
- `netlify/functions_active/family-invitations-accept.js` - Accept invitations
- `netlify/functions_active/family-invitations-send-nip17.js` - Send via NIP-17

### 3.3 Database Migration

**New File**:
- `database/migrations/051_family_federation_invitations.sql` - Create invitations table with RLS

### 3.4 Integration Points

1. **Step 3 Workflow**:
   - User selects role to invite
   - System generates unique invitation token
   - Display invitation link, QR code, and role-specific message
   - User can customize message
   - User sends via NIP-17 DM or copies link

2. **Step 4 Workflow**:
   - Show pending invitations
   - Display invitation status (pending, accepted, expired)
   - Allow resending or revoking invitations

3. **Invitee Workflow**:
   - Receive NIP-17 DM with invitation link
   - Click link or scan QR code
   - Redirected to registration with pre-filled federation_duid and role
   - Accept invitation and join federation

---

## PART 4: TECHNICAL CONSTRAINTS

✅ **Privacy-First**: Use NIP-17 with Noise protocol for encrypted messaging  
✅ **Zero-Knowledge**: Don't expose federation details to unauthorized parties  
✅ **Browser-Only**: No Node.js dependencies in frontend  
✅ **Master Context**: Respect role hierarchy (private/offspring/adult/steward/guardian)  
✅ **Bi-FROST**: Ensure invited Guardians/Stewards can participate in threshold signing  
✅ **NFC MFA**: Inform invitees about NFC card requirements  
✅ **Idempotent**: Handle duplicate invitations gracefully  
✅ **Expiration**: 7-day default expiry for invitations  

---

## PART 5: ESTIMATED EFFORT

| Phase | Task | Effort | Dependencies |
|-------|------|--------|--------------|
| 1 | Database migration | 2 hours | None |
| 2 | Backend API endpoints | 6 hours | Database |
| 3 | Frontend components | 8 hours | Backend |
| 4 | NIP-17 integration | 4 hours | Frontend |
| 5 | Testing & integration | 4 hours | All |
| **TOTAL** | | **24 hours** | Sequential |

---

## NEXT STEPS

1. ✅ **Assessment Complete** - This document
2. ⏳ **Await User Approval** - Review assessment and approve implementation plan
3. 📋 **Implementation Plan** - Detailed breakdown of files and changes
4. 🔨 **Phase 1**: Database migration
5. 🔨 **Phase 2**: Backend API endpoints
6. 🔨 **Phase 3**: Frontend components
7. 🔨 **Phase 4**: NIP-17 integration
8. 🧪 **Phase 5**: Testing & deployment

---

## RECOMMENDATION

**Proceed with implementation** - The codebase has sufficient infrastructure (NIP-17, QR codes, database) to support a family federation invitation system. The main work is integrating these existing components with new family-specific logic.

