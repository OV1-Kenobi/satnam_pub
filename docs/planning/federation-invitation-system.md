# Family Federation Invitation System - Implementation Plan

**Date**: December 6, 2025  
**Status**: PENDING APPROVAL  
**Scope**: Complete invitation system for Family Foundry Wizard with multi-format sharing and dual-path acceptance

---

## EXECUTIVE SUMMARY

This plan addresses the architectural flaw in the Family Foundry Wizard where FROST threshold validation blocks single-founder federation creation. The solution implements a proper invitation-first architecture where:

1. **Founders can create federations alone** - FROST validation deferred to member joining
2. **Invitations are shareable in multiple formats** - Text, links, QR codes
3. **Both Nostr and non-Nostr users are supported** - Seamless onboarding flow
4. **Role-specific guides are integrated** - Educational content during acceptance

---

## CODEBASE ANALYSIS SUMMARY

### Existing Infrastructure ✅ (Ready to Use)

| Component             | Location                                       | Status                               |
| --------------------- | ---------------------------------------------- | ------------------------------------ |
| QR Code Generation    | `src/utils/qr-code-browser.ts`                 | ✅ Ready - `generateQRCodeDataURL()` |
| NIP-17/59 Messaging   | `src/lib/messaging/client-message-service.ts`  | ✅ Ready - Full gift-wrap support    |
| Invitation Token Gen  | `api/authenticated/generate-peer-invite.js`    | ✅ Reusable pattern                  |
| Invitation Validation | `src/lib/invitation-validator.ts`              | ✅ Reusable pattern                  |
| Invite Route Handler  | `src/App.tsx` lines 139-162                    | ✅ Handles `/invite/{token}`         |
| Sharing UI Patterns   | `src/components/SecurePeerInvitationModal.tsx` | ✅ Copy/Share/QR UI                  |

### Role-Specific Guides ✅ (Ready to Use)

| Role       | Guide Location                      | Status                        |
| ---------- | ----------------------------------- | ----------------------------- |
| Guardian   | `docs/guardian-onboarding-guide.md` | ✅ Comprehensive (270+ lines) |
| Steward    | `docs/steward-onboarding-guide.md`  | ✅ Comprehensive (200+ lines) |
| Adult      | Inline in components                | ⚠️ Needs extraction           |
| Offspring  | Inline in components                | ⚠️ Needs extraction           |
| Federation | N/A                                 | ❌ Needs creation             |

### Gaps Identified ❌ (Needs Implementation)

| Component                             | Status     | Notes                                        |
| ------------------------------------- | ---------- | -------------------------------------------- |
| `family_federation_invitations` table | ❌ Missing | Schema proposed in assessment doc            |
| Family-specific invitation API        | ❌ Missing | Different from peer invitations              |
| Step 3 invitation generation UI       | ❌ Missing | Currently only collects npubs                |
| Invitation acceptance for new users   | ⚠️ Partial | Goes to Identity Forge, needs family context |
| FROST deferred validation             | ❌ Missing | Currently validates at creation              |

### Existing Incomplete Components ⚠️

| Component                             | Location                                | Issue                                    |
| ------------------------------------- | --------------------------------------- | ---------------------------------------- |
| `FamilyFederationInvitationModal.tsx` | `src/components/communications/`        | Placeholder send functions (lines 47-63) |
| Step 3 validation                     | `FamilyFoundryStep3Invite.tsx` line 358 | Requires peers before proceeding         |

---

## PHASE 1: Allow Single-Founder Federation Creation

**Goal**: Unblock federation creation for solo founders  
**Effort**: 2 hours  
**Dependencies**: None

### 1.1 Files to Modify

#### `src/components/FamilyFoundryStep3Invite.tsx`

**Current Issue** (line 358):

```tsx
disabled={trustedPeers.length === 0 || !trustedPeers.every(peer => peer.npub.trim())}
```

**Changes**:

1. Remove requirement for peers before proceeding
2. Add "Skip for now" option with informational tooltip
3. Update UI to clarify invitations can be sent after federation creation

#### `src/components/FamilyFoundryWizard.tsx`

**Changes**:

1. Update `createFederationBackend()` to handle empty `trustedPeers` array
2. Remove member mapping when no peers provided (lines 270-272)

#### `api/family/foundry.js` (Already Partially Done)

**Verify**:

1. ✅ `validateFrostThreshold()` handles `participantCount === 1` (lines 144-192)
2. ✅ `participantCount = memberCount + 1` includes founder (line 1193)

### 1.2 UI/UX Changes

```
Step 3: Invite Family Members (Optional)
┌─────────────────────────────────────────────────┐
│ 👨‍👩‍👧‍👦 Add Trusted Family Members                 │
│                                                  │
│ You can invite family members now, or skip      │
│ and send invitations after your federation      │
│ is created.                                      │
│                                                  │
│ [Add Family Member]                              │
│                                                  │
│ ─────────────────────────────────────────────── │
│                                                  │
│ [← Back]              [Skip & Create Federation]│
│                       [Next with {n} Members →] │
└─────────────────────────────────────────────────┘
```

---

## PHASE 2: Invitation Generation System

**Goal**: Enable shareable invitations in multiple formats  
**Effort**: 16 hours  
**Dependencies**: Phase 1 complete

### 2.1 Database Schema

#### New Migration: `database/migrations/052_family_federation_invitations.sql`

```sql
CREATE TABLE family_federation_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id UUID NOT NULL REFERENCES family_federations(id) ON DELETE CASCADE,
  federation_duid TEXT NOT NULL,
  invitation_token TEXT UNIQUE NOT NULL,
  inviter_user_duid TEXT NOT NULL,

  -- Invitation details
  invited_role TEXT NOT NULL CHECK (invited_role IN ('guardian', 'steward', 'adult', 'offspring')),
  personal_message TEXT,

  -- Optional: pre-targeted invitee (for NIP-17 DMs)
  invitee_npub TEXT,
  invitee_nip05 TEXT,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'viewed', 'accepted', 'expired', 'revoked')),
  view_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  accepted_by_user_duid TEXT,

  -- Metadata (for invitation display)
  metadata JSONB DEFAULT '{}'::jsonb
);

-- RLS Policies
ALTER TABLE family_federation_invitations ENABLE ROW LEVEL SECURITY;

-- Founders can manage their federation's invitations
CREATE POLICY "Federation founders can manage invitations"
  ON family_federation_invitations FOR ALL
  USING (inviter_user_duid = auth.uid()::text);

-- Public can validate invitations (for acceptance flow)
CREATE POLICY "Anyone can view pending invitations"
  ON family_federation_invitations FOR SELECT
  USING (status = 'pending' AND expires_at > NOW());
```

### 2.2 API Endpoints

#### New: `api/family/invitations/generate.js`

**Purpose**: Generate invitation tokens for federation members
**Auth**: Required (JWT via SecureSessionManager)

```javascript
// POST /api/family/invitations/generate
// Request:
{
  "federation_duid": "fed_abc123",
  "invited_role": "guardian" | "steward" | "adult" | "offspring",
  "personal_message": "Welcome to our family federation!",
  "invitee_npub": "npub1..." // Optional: for targeted NIP-17 DM
}

// Response:
{
  "success": true,
  "invitation": {
    "token": "inv_xyz789",
    "url": "https://satnam.pub/invite/inv_xyz789",
    "qr_data": "data:image/png;base64,...",
    "expires_at": "2025-12-13T00:00:00Z",
    "role": "guardian",
    "federation_name": "Smith Family"
  }
}
```

#### New: `api/family/invitations/validate.js`

**Purpose**: Validate invitation token and return details
**Auth**: None (public endpoint for invitation preview)

```javascript
// GET /api/family/invitations/validate?token=inv_xyz789
// Response:
{
  "valid": true,
  "invitation": {
    "federation_name": "Smith Family",
    "invited_role": "guardian",
    "inviter_name": "John Smith",
    "personal_message": "Welcome!",
    "expires_at": "2025-12-13T00:00:00Z",
    "role_guide_url": "/docs/guardian-onboarding-guide"
  }
}
```

#### New: `api/family/invitations/accept.js`

**Purpose**: Accept invitation and join federation
**Auth**: Required (JWT via SecureSessionManager)

```javascript
// POST /api/family/invitations/accept
// Request:
{
  "token": "inv_xyz789"
}

// Response:
{
  "success": true,
  "federation": {
    "id": "fed_abc123",
    "name": "Smith Family",
    "role": "guardian"
  },
  "next_steps": [
    "Complete FROST key ceremony",
    "Set up NFC MFA card (if guardian/steward)"
  ]
}
```

### 2.3 Frontend Components

#### New: `src/components/family-invitations/InvitationGenerator.tsx`

**Purpose**: Generate and display invitation in multiple formats

```tsx
interface InvitationGeneratorProps {
  federationDuid: string;
  federationName: string;
  onInvitationGenerated: (invitation: GeneratedInvitation) => void;
}

// Features:
// - Role selector (guardian/steward/adult/offspring)
// - Personal message input
// - Generate button
// - Display: URL, QR code, copy button, share button
// - NIP-17 DM option (if npub provided)
```

#### New: `src/components/family-invitations/InvitationDisplay.tsx`

**Purpose**: Display generated invitation with sharing options

```tsx
interface InvitationDisplayProps {
  invitation: GeneratedInvitation;
  onSendNip17?: (npub: string) => void;
}

// Features:
// - QR code display (using generateQRCodeDataURL)
// - Copy link button
// - Share via Web Share API
// - Send via NIP-17 DM (optional)
// - Expiration countdown
```

#### Modify: `src/components/FamilyFoundryStep3Invite.tsx`

**Changes**:

1. Add "Generate Invitation" button for each role
2. Integrate `InvitationGenerator` component
3. Show pending invitations list
4. Allow proceeding without peers

### 2.4 Integration with Existing Components

#### Reuse from `SecurePeerInvitationModal.tsx`:

- Copy link functionality
- QR code display pattern
- Share button implementation

#### Reuse from `client-message-service.ts`:

- `sendMessage()` for NIP-17 DM delivery
- Gift-wrap encryption for privacy

---

## PHASE 3: Invitation Acceptance Flow

**Goal**: Handle both new and existing users accepting invitations
**Effort**: 12 hours
**Dependencies**: Phase 2 complete

### 3.1 Route Structure

#### Existing: `/invite/{token}` (in `src/App.tsx`)

**Current Behavior** (lines 139-162):

1. Extracts token from URL
2. Validates via `validateInvitation()`
3. Redirects to Identity Forge if valid

**Required Changes**:

1. Detect if invitation is family-specific vs educational
2. Pass federation context to Identity Forge
3. Handle authenticated users differently (skip onboarding)

### 3.2 User Flows

#### Flow A: New User (Unauthenticated)

```
1. User clicks invitation link or scans QR
   ↓
2. /invite/{token} route detected
   ↓
3. Validate invitation via /api/family/invitations/validate
   ↓
4. Display invitation preview:
   - Federation name
   - Invited role
   - Personal message
   - Role-specific guide link
   ↓
5. User clicks "Accept & Create Account"
   ↓
6. Redirect to Identity Forge with:
   - invitationToken
   - federationDuid
   - invitedRole
   ↓
7. User completes Identity Forge
   ↓
8. Auto-accept invitation via /api/family/invitations/accept
   ↓
9. Redirect to federation dashboard
```

#### Flow B: Existing User (Authenticated)

```
1. User clicks invitation link
   ↓
2. /invite/{token} route detected
   ↓
3. Validate invitation
   ↓
4. Display invitation preview with "Accept" button
   ↓
5. User clicks "Accept Invitation"
   ↓
6. Call /api/family/invitations/accept
   ↓
7. Redirect to federation dashboard
```

### 3.3 New Components

#### New: `src/components/FamilyInvitationAcceptance.tsx`

**Purpose**: Display invitation details and handle acceptance

```tsx
interface FamilyInvitationAcceptanceProps {
  token: string;
  isAuthenticated: boolean;
  onAccept: () => void;
  onCreateAccount: () => void;
}

// Features:
// - Federation details display
// - Role description with guide link
// - Accept button (authenticated users)
// - Create Account button (new users)
// - Decline/Cancel option
```

#### New: `src/components/RoleOnboardingGuide.tsx`

**Purpose**: Display role-specific onboarding information

```tsx
interface RoleOnboardingGuideProps {
  role: "guardian" | "steward" | "adult" | "offspring";
  federationName: string;
}

// Content sources:
// - Guardian: docs/guardian-onboarding-guide.md
// - Steward: docs/steward-onboarding-guide.md
// - Adult: Inline content (to be extracted)
// - Offspring: Inline content (to be extracted)
```

### 3.4 Modifications to Existing Components

#### `src/App.tsx`

**Changes**:

1. Add family invitation detection in URL handler
2. Route to `FamilyInvitationAcceptance` for family invitations
3. Pass federation context to Identity Forge

#### `src/components/IdentityForge.tsx`

**Changes**:

1. Accept `federationContext` prop
2. Display federation info during onboarding
3. Auto-accept invitation after account creation

---

## DEPENDENCIES & TIMELINE

```
Phase 1 (2 hours)
    │
    ├── No external dependencies
    │
    ▼
Phase 2 (16 hours)
    │
    ├── Depends on: Phase 1 complete
    ├── Database migration must run first
    ├── API endpoints before frontend
    │
    ▼
Phase 3 (12 hours)
    │
    ├── Depends on: Phase 2 complete
    ├── Invitation validation API required
    └── Acceptance API required
```

**Total Estimated Effort**: 30 hours

---

## ARCHITECTURAL DECISIONS REQUIRING APPROVAL

### Decision 1: FROST Validation Timing

**Options**:

- **A) Defer to member joining** (Recommended): Validate FROST threshold when members accept invitations
- **B) Validate at creation with minimum**: Require at least 2 participants at creation

**Recommendation**: Option A - Allows solo founders, validates when members actually join

### Decision 2: Invitation Expiration

**Options**:

- **A) 7 days** (Recommended): Standard expiration for security
- **B) 30 days**: Longer window for family coordination
- **C) Configurable**: Let founder choose

**Recommendation**: Option A with option to regenerate

### Decision 3: NIP-17 DM Integration

**Options**:

- **A) Optional** (Recommended): Generate link/QR always, NIP-17 DM if npub provided
- **B) Required**: Force NIP-17 for all invitations
- **C) Separate flow**: Different UI for Nostr vs non-Nostr invitees

**Recommendation**: Option A - Maximum flexibility

### Decision 4: Role Guide Delivery

**Options**:

- **A) Link to docs** (Recommended): Include guide URL in invitation
- **B) Inline in acceptance**: Show full guide during acceptance flow
- **C) Post-acceptance**: Show guide after joining federation

**Recommendation**: Option A with Option B for key points

### Decision 5: Database Table Location

**Options**:

- **A) New migration file** (Recommended): `052_family_federation_invitations.sql`
- **B) Extend existing**: Add to `048_foundational_federation_schema.sql`

**Recommendation**: Option A - Clean separation, easier rollback

---

## FILES SUMMARY

### New Files to Create

| File                                                        | Type  | Phase |
| ----------------------------------------------------------- | ----- | ----- |
| `database/migrations/052_family_federation_invitations.sql` | SQL   | 2     |
| `api/family/invitations/generate.js`                        | API   | 2     |
| `api/family/invitations/validate.js`                        | API   | 2     |
| `api/family/invitations/accept.js`                          | API   | 2     |
| `src/components/family-invitations/InvitationGenerator.tsx` | React | 2     |
| `src/components/family-invitations/InvitationDisplay.tsx`   | React | 2     |
| `src/components/FamilyInvitationAcceptance.tsx`             | React | 3     |
| `src/components/RoleOnboardingGuide.tsx`                    | React | 3     |

### Existing Files to Modify

| File                                                                | Changes                                | Phase |
| ------------------------------------------------------------------- | -------------------------------------- | ----- |
| `src/components/FamilyFoundryStep3Invite.tsx`                       | Make peers optional, add invitation UI | 1, 2  |
| `src/components/FamilyFoundryWizard.tsx`                            | Handle empty peers array               | 1     |
| `src/App.tsx`                                                       | Family invitation routing              | 3     |
| `src/components/IdentityForge.tsx`                                  | Accept federation context              | 3     |
| `src/components/communications/FamilyFederationInvitationModal.tsx` | Implement actual send functions        | 2     |

### Files to Review (No Changes Expected)

| File                                          | Purpose                                      |
| --------------------------------------------- | -------------------------------------------- |
| `api/family/foundry.js`                       | Verify FROST validation handles solo founder |
| `src/utils/qr-code-browser.ts`                | Reuse QR generation                          |
| `src/lib/messaging/client-message-service.ts` | Reuse NIP-17 sending                         |
| `docs/guardian-onboarding-guide.md`           | Content for role guide                       |
| `docs/steward-onboarding-guide.md`            | Content for role guide                       |

---

## NEXT STEPS

1. **Review this plan** and provide feedback on architectural decisions
2. **Approve or modify** the proposed approach
3. **Authorize Phase 1** implementation (or all phases if preferred)

---

**Awaiting your approval to proceed with implementation.**
