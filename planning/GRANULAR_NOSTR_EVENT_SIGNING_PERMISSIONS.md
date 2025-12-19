# Granular Nostr Event Signing Permissions for Federation Members

## Implementation Plan

**Date:** 2025-12-17
**Status:** Phase 1-4 Complete, Phase 5 Ready
**Version:** 1.1
**Last Updated:** 2025-12-19

---

## 1. Executive Summary

This document outlines the implementation plan for adding granular Nostr event signing permissions to Federation members. The system extends the existing role hierarchy (Private → Offspring → Adult → Steward → Guardian) with configurable permissions that control which Nostr event types each role can sign using FROST threshold signatures.

### Design Philosophy

The article "The Case for Custodial Nostr: Why Teams Should Stop Fighting the Lost War" argues that organizations should adopt a server-side custodial model where:

- The organization's nsec lives securely on infrastructure it controls
- Employees/members get granular, revocable permissions
- Signing happens locally (no relay round-trips for authorization)
- Permission changes are instant database operations

This implementation applies these principles while maintaining the FROST threshold signature model already in place, providing:

- **Granular control**: Fine-grained permissions per Nostr event kind/type
- **Role-based delegation**: Higher roles configure permissions for lower roles
- **Instant revocation**: Database-level permission changes take effect immediately
- **Backward compatibility**: Existing FROST workflows continue unchanged

---

## 2. Nostr Event Types Taxonomy

### 2.1 Standard Nostr Event Kinds

| Kind  | Name                     | Permission Category   | NIP Reference |
| ----- | ------------------------ | --------------------- | ------------- |
| 0     | Profile Metadata         | `identity_management` | NIP-01        |
| 1     | Short Text Note          | `content_posting`     | NIP-01        |
| 3     | Contact List             | `contact_management`  | NIP-02        |
| 4     | Encrypted DM (NIP-04)    | `messaging`           | NIP-04        |
| 5     | Event Deletion           | `content_moderation`  | NIP-09        |
| 6     | Repost                   | `content_posting`     | NIP-18        |
| 7     | Reaction                 | `engagement`          | NIP-25        |
| 10    | Mute List                | `privacy_settings`    | NIP-51        |
| 14    | Gift-wrapped DM (NIP-17) | `messaging`           | NIP-17/59     |
| 21    | Normal Video Event       | `media_content`       | NIP-71        |
| 22    | Short Video Event        | `media_content`       | NIP-71        |
| 1059  | Gift Wrap (NIP-59)       | `messaging`           | NIP-59        |
| 30023 | Long-form Article        | `content_posting`     | NIP-23        |
| 30311 | Live Event (Audio/Video) | `media_content`       | NIP-53        |
| 30312 | Interactive Room         | `media_content`       | NIP-53        |
| 1776  | Whitelist Event (NIP-41) | `key_management`      | NIP-41        |

### 2.2 Media Event Types (NIP-71, NIP-53)

| Event Type Identifier | Kind  | Description                         | Default Minimum Role | Approval Required |
| --------------------- | ----- | ----------------------------------- | -------------------- | ----------------- |
| `video_post`          | 21    | Standard video content (horizontal) | Adult                | Yes               |
| `video_short`         | 22    | Short-form video (vertical/stories) | Adult                | Yes               |
| `live_stream`         | 30311 | Live audio/video streaming          | Adult                | Yes               |
| `audio_room`          | 30312 | Interactive audio/video room        | Adult                | Yes               |
| `podcast_episode`     | 30311 | Podcast episode broadcast           | Adult                | Yes               |
| `family_video`        | 21/22 | Family-only video content           | Offspring            | Yes (parent)      |
| `family_audio`        | 30311 | Family-only audio content           | Offspring            | Yes (parent)      |

### 2.3 Federation-Specific Event Types

| Event Type Identifier          | Kind    | Description                    | Default Minimum Role |
| ------------------------------ | ------- | ------------------------------ | -------------------- |
| `federation_announcement`      | 1/30023 | Public announcements           | Adult                |
| `newsletter_post`              | 30023   | Newsletter publications        | Adult                |
| `financial_report`             | 30023   | Financial transparency reports | Steward              |
| `family_financial_transaction` | Custom  | Transaction authorization      | Guardian             |
| `offspring_payment`            | Custom  | Offspring payment requests     | Offspring            |
| `member_invitation`            | Custom  | New member invitations         | Adult                |
| `member_removal`               | Custom  | Member removal notices         | Guardian             |
| `role_change`                  | Custom  | Role change announcements      | Steward              |
| `federation_settings`          | Custom  | Federation configuration       | Guardian             |
| `emergency_action`             | Custom  | Emergency operations           | Guardian             |
| `spending_approval`            | Custom  | Spending limit approvals       | Steward              |
| `content_moderation`           | 5       | Content deletion/moderation    | Adult                |
| `profile_update`               | 0       | Federation profile changes     | Steward              |

### 2.4 Permission Categories

```typescript
type PermissionCategory =
  | "content_posting" // Kind 1, 6, 7, 30023
  | "messaging" // Kind 4, 14, 1059 (NIP-04, NIP-17, NIP-59)
  | "media_content" // Kind 21, 22, 30311, 30312 (video, audio, live)
  | "identity_management" // Kind 0
  | "contact_management" // Kind 3
  | "privacy_settings" // Kind 10, mute lists
  | "content_moderation" // Kind 5
  | "key_management" // Kind 1776
  | "financial_operations" // Custom transaction events, payments
  | "member_management" // Invitations, removals
  | "governance" // Role changes, settings
  | "engagement"; // Reactions, reposts
```

---

## 3. Permission Matrix System

### 3.1 Core Data Structures

```typescript
interface EventSigningPermission {
  id: string;
  federation_id: string;
  role: FederationRole;

  // Permission scope
  event_type: string; // e.g., 'federation_announcement'
  nostr_kind?: number; // Optional: specific Nostr kind
  permission_category: PermissionCategory;

  // Permission flags
  can_sign: boolean;
  requires_approval: boolean;
  approval_threshold?: number; // Minimum approvers needed
  approved_by_roles?: FederationRole[]; // Which roles can approve

  // Constraints
  max_daily_count?: number;
  content_restrictions?: string[]; // Regex patterns to block
  allowed_tags?: string[];

  // Delegation
  can_delegate: boolean;
  delegatable_to_roles: FederationRole[];

  // Audit
  created_by: string;
  created_at: Date;
  updated_at: Date;
}
```

### 3.2 Default Permission Matrix

| Role      | Content Posting    | Messaging | Media Content      | Financial Ops       | Member Mgmt      | Governance   |
| --------- | ------------------ | --------- | ------------------ | ------------------- | ---------------- | ------------ |
| Offspring | ❌                 | ✅        | ⚠️ (family only)   | ⚠️ (within limits)  | ❌               | ❌           |
| Adult     | ✅ (with approval) | ✅        | ✅ (with approval) | ❌                  | ✅ (invite only) | ❌           |
| Steward   | ✅                 | ✅        | ✅                 | ✅ (read + approve) | ✅               | ✅ (propose) |
| Guardian  | ✅                 | ✅        | ✅                 | ✅                  | ✅               | ✅           |

**Legend:** ✅ Allowed | ⚠️ Requires Approval | ❌ Denied

### 3.3 Offspring Role Permission Details

The Offspring role has limited but meaningful permissions designed for family safety while enabling participation:

| Permission Category | Event Types                                                      | Access Level | Approval Required By | Notes                                                            |
| ------------------- | ---------------------------------------------------------------- | ------------ | -------------------- | ---------------------------------------------------------------- |
| **Messaging**       | `encrypted_dm` (Kind 4), Gift-wrapped DM (Kind 14/1059), Bitchat | ✅ Enabled   | None                 | Private family/friend messaging without approval                 |
| **Financial Ops**   | `offspring_payment`                                              | ✅ Enabled   | Parent (Adult+)      | Subject to family spending limits defined in federation settings |
| **Media Content**   | `family_video`, `family_audio`                                   | ⚠️ Limited   | Parent (Adult+)      | Family-only media sharing with parental approval                 |
| **Engagement**      | `reaction` (Kind 7)                                              | ⚠️ Limited   | Parent (Adult+)      | Optional: Parents can enable reactions with daily limits         |

**Integration with Family Financial Controls:**

- Offspring payment requests automatically inherit spending limits from `family_federations.offspring_spending_limits`
- All payment approvals are logged to `signing_audit_log` for parental visibility
- Parents can set per-offspring daily/weekly/monthly spending caps
- Payment requests exceeding limits require Steward or Guardian override

---

## 4. Database Schema Changes

### 4.1 New Tables

```sql
-- Event signing permissions per role per federation
CREATE TABLE IF NOT EXISTS event_signing_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_id TEXT NOT NULL REFERENCES family_federations(federation_duid),

    -- Role and event type
    role TEXT NOT NULL CHECK (role IN ('offspring', 'adult', 'steward', 'guardian')),
    event_type TEXT NOT NULL,
    nostr_kind INTEGER,
    permission_category TEXT NOT NULL,

    -- Permission flags
    can_sign BOOLEAN NOT NULL DEFAULT false,
    requires_approval BOOLEAN NOT NULL DEFAULT true,
    approval_threshold INTEGER DEFAULT 1,
    approved_by_roles JSONB DEFAULT '["guardian"]',

    -- Constraints
    max_daily_count INTEGER,
    content_restrictions JSONB DEFAULT '[]',
    allowed_tags JSONB DEFAULT '[]',

    -- Delegation
    can_delegate BOOLEAN NOT NULL DEFAULT false,
    delegatable_to_roles JSONB DEFAULT '[]',

    -- Audit
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    UNIQUE(federation_id, role, event_type)
);

-- Member-specific permission overrides
CREATE TABLE IF NOT EXISTS member_signing_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_id TEXT NOT NULL,
    member_duid TEXT NOT NULL,

    -- Permission override
    event_type TEXT NOT NULL,
    can_sign BOOLEAN,              -- null = use role default
    requires_approval BOOLEAN,     -- null = use role default
    max_daily_count INTEGER,       -- null = use role default

    -- Validity period
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE,

    -- Audit
    granted_by TEXT NOT NULL,
    revoked_by TEXT,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(federation_id, member_duid, event_type)
);

-- Signing audit log
CREATE TABLE IF NOT EXISTS signing_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_id TEXT NOT NULL,
    session_id TEXT REFERENCES frost_signing_sessions(session_id),

    -- Actor
    member_duid TEXT NOT NULL,
    member_role TEXT NOT NULL,

    -- Event details
    event_type TEXT NOT NULL,
    nostr_kind INTEGER,
    event_hash TEXT,

    -- Authorization
    permission_used TEXT REFERENCES event_signing_permissions(id),
    override_used TEXT REFERENCES member_signing_overrides(id),
    approval_required BOOLEAN,
    approved_by JSONB DEFAULT '[]',

    -- Result
    status TEXT CHECK (status IN ('pending', 'approved', 'rejected', 'signed', 'failed')),
    error_message TEXT,

    -- Timestamps
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Time-based permission windows
CREATE TABLE IF NOT EXISTS permission_time_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_id UUID REFERENCES event_signing_permissions(id) ON DELETE CASCADE,
    override_id UUID REFERENCES member_signing_overrides(id) ON DELETE CASCADE,

    -- Time window definition
    window_type TEXT NOT NULL CHECK (window_type IN ('scheduled', 'temporary_elevation', 'cooldown')),

    -- For scheduled windows (e.g., business hours)
    days_of_week INTEGER[] DEFAULT '{1,2,3,4,5}',  -- 0=Sunday, 1=Monday, etc.
    start_time TIME,                               -- e.g., '09:00:00'
    end_time TIME,                                 -- e.g., '17:00:00'
    timezone TEXT DEFAULT 'UTC',

    -- For temporary elevations
    elevation_start TIMESTAMP WITH TIME ZONE,
    elevation_end TIMESTAMP WITH TIME ZONE,
    elevated_permissions JSONB,                    -- Override permissions during window

    -- For cooldown periods
    cooldown_minutes INTEGER,                      -- Minutes between signing operations
    last_used_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure at least one FK is set
    CHECK (permission_id IS NOT NULL OR override_id IS NOT NULL)
);

-- Multi-federation permission delegation
CREATE TABLE IF NOT EXISTS federation_permission_delegations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Source federation (grantor)
    source_federation_id TEXT NOT NULL REFERENCES family_federations(federation_duid),
    source_role TEXT NOT NULL CHECK (source_role IN ('steward', 'guardian')),

    -- Target federation (grantee) - for alliances
    target_federation_id TEXT REFERENCES family_federations(federation_duid),
    -- OR specific member in target federation
    target_member_duid TEXT,

    -- Delegated permissions
    delegated_event_types TEXT[] NOT NULL,
    can_sub_delegate BOOLEAN DEFAULT false,

    -- Constraints
    max_daily_uses INTEGER,
    requires_source_approval BOOLEAN DEFAULT true,

    -- Validity
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,

    -- Audit
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- At least one target must be set
    CHECK (target_federation_id IS NOT NULL OR target_member_duid IS NOT NULL)
);

-- Federation alliances for permission sharing
CREATE TABLE IF NOT EXISTS federation_alliances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alliance_name TEXT NOT NULL,

    -- Member federations (JSONB array of federation_duids)
    member_federations JSONB NOT NULL DEFAULT '[]',

    -- Shared permission categories
    shared_categories TEXT[] DEFAULT '{}',

    -- Governance
    requires_unanimous_approval BOOLEAN DEFAULT true,
    minimum_approval_count INTEGER DEFAULT 2,

    -- Inheritance settings
    inherits_permissions_from TEXT REFERENCES family_federations(federation_duid),
    inheritance_depth INTEGER DEFAULT 1,  -- How many levels to inherit

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'dissolved')),

    -- Audit
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_esp_federation_role ON event_signing_permissions(federation_id, role);
CREATE INDEX IF NOT EXISTS idx_mso_member ON member_signing_overrides(federation_id, member_duid);
CREATE INDEX IF NOT EXISTS idx_sal_federation ON signing_audit_log(federation_id);
CREATE INDEX IF NOT EXISTS idx_sal_member ON signing_audit_log(member_duid);
CREATE INDEX IF NOT EXISTS idx_ptw_permission ON permission_time_windows(permission_id);
CREATE INDEX IF NOT EXISTS idx_ptw_override ON permission_time_windows(override_id);
CREATE INDEX IF NOT EXISTS idx_fpd_source ON federation_permission_delegations(source_federation_id);
CREATE INDEX IF NOT EXISTS idx_fpd_target ON federation_permission_delegations(target_federation_id);
CREATE INDEX IF NOT EXISTS idx_fa_status ON federation_alliances(status);
```

### 4.2 Modifications to Existing Tables

```sql
-- Add event_type validation to frost_signing_sessions
ALTER TABLE frost_signing_sessions
ADD COLUMN IF NOT EXISTS required_permissions JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS permission_check_status TEXT DEFAULT 'pending'
    CHECK (permission_check_status IN ('pending', 'approved', 'denied')),
ADD COLUMN IF NOT EXISTS cross_federation_delegation_id UUID REFERENCES federation_permission_delegations(id);

-- Add permission tracking to family_members
ALTER TABLE family_members
ADD COLUMN IF NOT EXISTS signing_permissions_override JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS permissions_last_updated TIMESTAMP WITH TIME ZONE;

-- Add offspring spending limits to federation settings
ALTER TABLE family_federations
ADD COLUMN IF NOT EXISTS offspring_spending_limits JSONB DEFAULT '{
    "daily_limit_sats": 10000,
    "weekly_limit_sats": 50000,
    "monthly_limit_sats": 150000,
    "require_approval_above_sats": 5000,
    "allowed_payment_types": ["lightning", "ecash"]
}';
```

---

## 5. Service Layer Architecture

### 5.1 New Services

#### EventSigningPermissionService

```typescript
// src/services/eventSigningPermissionService.ts

export class EventSigningPermissionService {
  /**
   * Check if a member can sign a specific event type
   */
  static async canSign(
    federationId: string,
    memberDuid: string,
    eventType: string,
    nostrKind?: number
  ): Promise<{
    allowed: boolean;
    requiresApproval: boolean;
    approvalThreshold?: number;
    reason?: string;
  }>;

  /**
   * Get effective permissions for a member (role + overrides)
   */
  static async getEffectivePermissions(
    federationId: string,
    memberDuid: string
  ): Promise<EffectivePermission[]>;

  /**
   * Configure permissions for a role (Guardian/Steward only)
   */
  static async configureRolePermissions(
    federationId: string,
    configurerDuid: string,
    targetRole: FederationRole,
    permissions: Partial<EventSigningPermission>[]
  ): Promise<ServiceResult>;

  /**
   * Grant/revoke member-specific override
   */
  static async setMemberOverride(
    federationId: string,
    granterDuid: string,
    memberDuid: string,
    override: MemberSigningOverride
  ): Promise<ServiceResult>;

  /**
   * Revoke member override
   */
  static async revokeMemberOverride(
    federationId: string,
    revokerDuid: string,
    memberDuid: string,
    eventType: string
  ): Promise<ServiceResult>;

  /**
   * Check if current time is within permission window
   */
  static async isWithinTimeWindow(
    permissionId: string,
    overrideId?: string
  ): Promise<{
    allowed: boolean;
    reason?: string;
    nextWindowStart?: Date;
    cooldownRemaining?: number; // seconds
  }>;

  /**
   * Configure time-based permission window
   */
  static async setTimeWindow(
    configurerDuid: string,
    window: {
      permissionId?: string;
      overrideId?: string;
      windowType: "scheduled" | "temporary_elevation" | "cooldown";
      daysOfWeek?: number[];
      startTime?: string;
      endTime?: string;
      timezone?: string;
      elevationStart?: Date;
      elevationEnd?: Date;
      elevatedPermissions?: Partial<EventSigningPermission>;
      cooldownMinutes?: number;
    }
  ): Promise<ServiceResult>;

  /**
   * Check for cross-federation delegated permissions
   */
  static async checkDelegatedPermission(
    sourceFederationId: string,
    targetFederationId: string,
    memberDuid: string,
    eventType: string
  ): Promise<{
    allowed: boolean;
    delegationId?: string;
    requiresSourceApproval: boolean;
    remainingDailyUses?: number;
  }>;

  /**
   * Create cross-federation permission delegation
   */
  static async createDelegation(
    sourceFederationId: string,
    granterDuid: string,
    delegation: {
      targetFederationId?: string;
      targetMemberDuid?: string;
      delegatedEventTypes: string[];
      canSubDelegate?: boolean;
      maxDailyUses?: number;
      requiresSourceApproval?: boolean;
      validUntil?: Date;
    }
  ): Promise<ServiceResult>;

  /**
   * Get alliance permissions for a federation
   */
  static async getAlliancePermissions(federationId: string): Promise<{
    alliances: Array<{
      allianceId: string;
      allianceName: string;
      sharedCategories: string[];
      memberFederations: string[];
    }>;
    inheritedPermissions: EventSigningPermission[];
  }>;
}
```

#### Integration with FrostSessionManager

```typescript
// Modifications to lib/frost/frost-session-manager.ts

export interface CreateSessionParams {
  // ... existing params
  eventType: string;              // Required: event type for permission check
  requiredPermissions?: string[]; // Additional permissions needed
  crossFederationContext?: {      // For cross-federation signing
    sourceFederationId: string;
    delegationId?: string;
  };
}

// New method in FrostSessionManager
static async createSessionWithPermissionCheck(
  params: CreateSessionParams
): Promise<SessionResult> {
  // Step 1: Check time-based restrictions
  const timeCheck = await EventSigningPermissionService.isWithinTimeWindow(
    params.permissionId,
    params.overrideId
  );

  if (!timeCheck.allowed) {
    return {
      success: false,
      error: `Time restriction: ${timeCheck.reason}`,
      nextWindowStart: timeCheck.nextWindowStart,
      cooldownRemaining: timeCheck.cooldownRemaining
    };
  }

  // Step 2: Check cross-federation delegation if applicable
  if (params.crossFederationContext) {
    const delegationCheck = await EventSigningPermissionService.checkDelegatedPermission(
      params.crossFederationContext.sourceFederationId,
      params.familyId,
      params.createdBy,
      params.eventType
    );

    if (!delegationCheck.allowed) {
      return {
        success: false,
        error: 'Cross-federation permission denied'
      };
    }

    // Store delegation reference for audit
    params.delegationId = delegationCheck.delegationId;
  }

  // Step 3: Validate creator has permission for event type
  const permCheck = await EventSigningPermissionService.canSign(
    params.familyId,
    params.createdBy,
    params.eventType
  );

  if (!permCheck.allowed) {
    return {
      success: false,
      error: `Permission denied: ${permCheck.reason}`
    };
  }

  // Step 4: If approval required, initiate approval workflow
  if (permCheck.requiresApproval) {
    return this.createPendingApprovalSession(params, permCheck);
  }

  // Step 5: Create session normally
  return this.createSession(params);
}
```

---

## 6. API Endpoints

### 6.1 Permission Management APIs

```typescript
// netlify/functions/api/permissions/

// GET /api/permissions/federation/{federationId}
// Returns all permission configurations for a federation
interface GetFederationPermissionsResponse {
  success: boolean;
  data: {
    rolePermissions: EventSigningPermission[];
    memberOverrides: MemberSigningOverride[];
  };
}

// POST /api/permissions/role
// Configure permissions for a role (Guardian/Steward only)
interface ConfigureRolePermissionsRequest {
  federationId: string;
  targetRole: FederationRole;
  permissions: Partial<EventSigningPermission>[];
}

// POST /api/permissions/member-override
// Grant/update member-specific override
interface SetMemberOverrideRequest {
  federationId: string;
  memberDuid: string;
  eventType: string;
  canSign?: boolean;
  requiresApproval?: boolean;
  maxDailyCount?: number;
  validUntil?: string; // ISO date
}

// DELETE /api/permissions/member-override
// Revoke member-specific override
interface RevokeMemberOverrideRequest {
  federationId: string;
  memberDuid: string;
  eventType: string;
}

// GET /api/permissions/check
// Check if member can sign specific event type
interface CheckPermissionRequest {
  federationId: string;
  memberDuid: string;
  eventType: string;
  nostrKind?: number;
}

interface CheckPermissionResponse {
  allowed: boolean;
  requiresApproval: boolean;
  approvalThreshold?: number;
  effectiveSource: "role" | "override";
  reason?: string;
}

// GET /api/permissions/audit-log
// Get signing audit log for federation
interface GetAuditLogRequest {
  federationId: string;
  memberDuid?: string;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}
```

### 6.2 FROST Session Extensions

```typescript
// Modify existing endpoint: POST /api/frost/session
// Add permission validation before session creation

interface CreateFrostSessionRequest {
  // ... existing fields
  eventType: string; // NEW: Required event type
  skipPermissionCheck?: boolean; // NEW: For Guardian override (audit logged)
}

// NEW: GET /api/frost/pending-approvals
// Get sessions pending approval for current user
interface GetPendingApprovalsResponse {
  success: boolean;
  data: {
    sessions: Array<{
      sessionId: string;
      eventType: string;
      requestedBy: string;
      requestedAt: string;
      approvalThreshold: number;
      currentApprovals: number;
      eventPreview: string;
    }>;
  };
}

// NEW: POST /api/frost/approve-session
// Approve a pending FROST session
interface ApproveSessionRequest {
  sessionId: string;
  approve: boolean;
  reason?: string;
}
```

---

## 7. UI Components

### 7.1 Permission Configuration Panel

**Integration Location:** Family Finances Dashboard (`src/pages/FamilyFinancesDashboard.tsx`)

This component integrates directly into the Family Finances Dashboard as a dedicated tab/section, providing unified management of signing permissions alongside financial controls. This placement ensures Guardians and Stewards can manage both spending limits and signing authorities from a single, cohesive interface.

```typescript
// src/components/permissions/PermissionConfigurationPanel.tsx

interface PermissionConfigurationPanelProps {
  federationId: string;
  userRole: FederationRole;
  onPermissionChange?: () => void;
  // Integration with Family Finances Dashboard
  dashboardContext?: {
    activeMember?: string; // Pre-selected member from dashboard
    financialLimits?: SpendingLimits; // Current spending limits for context
    showFinancialIntegration: boolean;
  };
}

/**
 * Panel for Guardians/Stewards to configure role permissions
 *
 * INTEGRATION: Renders as a tab in Family Finances Dashboard under
 * "Signing Permissions" alongside "Spending Limits" and "Transaction History"
 *
 * Features:
 * - Role selector tabs (Offspring, Adult, Steward, Guardian)
 * - Event type permission matrix with media content controls
 * - Toggle switches for can_sign, requires_approval
 * - Numeric inputs for thresholds and limits
 * - Offspring-specific controls with spending limit integration
 * - Time-based permission windows (business hours, temporary elevations)
 * - Save/cancel buttons with confirmation
 *
 * Dashboard Integration:
 * - Syncs with offspring spending limits from financial controls
 * - Shows payment approval queue count in tab badge
 * - Highlights permissions that conflict with financial settings
 */
```

### 7.2 Member Override Manager

```typescript
// src/components/permissions/MemberOverrideManager.tsx

interface MemberOverrideManagerProps {
  federationId: string;
  memberDuid: string;
  memberRole: FederationRole;
  userRole: FederationRole;
}

/**
 * Component for managing member-specific permission overrides
 *
 * Features:
 * - List of current overrides with status
 * - Add override button (opens modal)
 * - Edit/revoke actions per override
 * - Expiration date selector
 * - Activity log showing override usage
 */
```

### 7.3 Signing Request Approval UI

```typescript
// src/components/frost/SigningApprovalQueue.tsx

interface SigningApprovalQueueProps {
  federationId: string;
  userDuid: string;
}

/**
 * Queue showing pending signing requests needing approval
 *
 * Features:
 * - List of pending FROST sessions
 * - Event preview with type and content summary
 * - Requester info and role
 * - Approve/Reject buttons
 * - Approval progress indicator
 * - Batch actions for multiple approvals
 */
```

### 7.4 Permission Matrix View

```typescript
// src/components/permissions/PermissionMatrixView.tsx

interface PermissionMatrixViewProps {
  federationId: string;
  readonly?: boolean;
}

/**
 * Visual matrix showing permissions across roles and event types
 *
 * Layout:
 * ┌──────────────────────┬──────────┬───────┬─────────┬──────────┐
 * │ Event Type           │ Offspring│ Adult │ Steward │ Guardian │
 * ├──────────────────────┼──────────┼───────┼─────────┼──────────┤
 * │ federation_announce  │    ❌    │  ⚠️   │   ✅    │    ✅    │
 * │ newsletter_post      │    ❌    │  ⚠️   │   ✅    │    ✅    │
 * │ financial_report     │    ❌    │  ❌   │   ⚠️    │    ✅    │
 * │ family_transaction   │    ❌    │  ❌   │   ❌    │    ✅    │
 * └──────────────────────┴──────────┴───────┴─────────┴──────────┘
 *
 * Legend: ✅ Allowed  ⚠️ Requires Approval  ❌ Denied
 */
```

### 7.5 Role Delegation Flow

```typescript
// src/components/permissions/RoleDelegationWizard.tsx

interface RoleDelegationWizardProps {
  federationId: string;
  delegatorDuid: string;
  delegatorRole: FederationRole;
}

/**
 * Wizard for delegating permissions to lower roles
 *
 * Steps:
 * 1. Select target role (only roles below current)
 * 2. Select event types to delegate
 * 3. Configure constraints (approval required, limits)
 * 4. Review and confirm
 * 5. Success confirmation with summary
 */
```

---

## 8. Use Case Implementations

### 8.1 Federation Treasurer Publishing Weekly Reports

**Scenario:** An Adult member designated as treasurer needs to publish weekly accounting reports with read-only financial access.

**Implementation:**

```typescript
// 1. Guardian grants treasurer override
await EventSigningPermissionService.setMemberOverride(
  federationId,
  guardianDuid,
  treasurerDuid,
  {
    eventType: "financial_report",
    canSign: true,
    requiresApproval: true, // Steward must approve before publish
    maxDailyCount: 1, // One report per day max
    validUntil: null, // No expiration
  }
);

// 2. Treasurer creates report event
const session = await FrostSessionManager.createSessionWithPermissionCheck({
  familyId: federationId,
  messageHash: reportHash,
  eventType: "financial_report",
  eventTemplate: JSON.stringify({
    kind: 30023,
    content: reportContent,
    tags: [
      ["d", "weekly-report-2025-w50"],
      ["title", "Weekly Financial Report"],
      ["summary", "Week 50 treasury summary"],
    ],
  }),
  participants: [treasurerDuid, steward1Duid, steward2Duid],
  threshold: 1,
  createdBy: treasurerDuid,
});

// 3. Steward approves (session moves to signing phase)
await FrostSessionManager.approveSession(session.sessionId, stewardDuid);

// 4. FROST signing proceeds normally
```

### 8.2 Adults Posting Federation Announcements

**Scenario:** Adult members can post public announcements, but content must be approved by a Steward.

**Configuration:**

```typescript
// Default role permission for Adults
{
  role: 'adult',
  event_type: 'federation_announcement',
  nostr_kind: 1,
  can_sign: true,
  requires_approval: true,
  approval_threshold: 1,
  approved_by_roles: ['steward', 'guardian'],
  max_daily_count: 5
}
```

### 8.3 Offspring Accounts with Parent-Controlled Permissions

**Scenario:** Parents (Adults/Stewards) control what their offspring can sign.

**Implementation:**

```typescript
// 1. Parent grants limited posting permission to offspring
await EventSigningPermissionService.setMemberOverride(
  federationId,
  parentDuid,
  offspringDuid,
  {
    eventType: "engagement", // Reactions only
    canSign: true,
    requiresApproval: true, // Parent must approve each reaction
    maxDailyCount: 10,
    validUntil: "2026-01-01", // Review permission annually
  }
);

// 2. Offspring can now react to posts (with approval)
// 3. Parent sees requests in their approval queue
// 4. Parent can revoke at any time
```

### 8.4 Business Federations with Department Authorities

**Scenario:** A business federation has Marketing (content), Finance (reports), and Operations (member management) departments.

**Configuration:**

```typescript
// Marketing department permissions (Adult role + override)
const marketingPerms = [
  {
    eventType: "federation_announcement",
    canSign: true,
    requiresApproval: false,
  },
  { eventType: "newsletter_post", canSign: true, requiresApproval: false },
  { eventType: "engagement", canSign: true, requiresApproval: false },
];

// Finance department permissions
const financePerms = [
  { eventType: "financial_report", canSign: true, requiresApproval: true },
  { eventType: "spending_approval", canSign: false }, // Read-only
];

// Operations department permissions
const operationsPerms = [
  { eventType: "member_invitation", canSign: true, requiresApproval: true },
  { eventType: "role_change", canSign: false }, // Escalate to Guardian
];

// Apply as member overrides per department
for (const member of marketingTeam) {
  for (const perm of marketingPerms) {
    await EventSigningPermissionService.setMemberOverride(
      federationId,
      guardianDuid,
      member.duid,
      perm
    );
  }
}
```

---

## 9. Implementation Phases

### Phase 1: Database Foundation (Week 1)

**Tasks:**

1. Create migration for `event_signing_permissions` table
2. Create migration for `member_signing_overrides` table
3. Create migration for `signing_audit_log` table
4. Add columns to `frost_signing_sessions` table
5. Create RLS policies for all new tables
6. Seed default permission matrix for each role

**Deliverables:**

- SQL migration file: `supabase/migrations/YYYYMMDD_event_signing_permissions.sql`
- RLS policies ensuring role-based access
- Default permission seed data

### Phase 2: Service Layer (Week 2)

**Tasks:**

1. Create `EventSigningPermissionService` class
2. Implement permission checking logic with role + override resolution
3. Integrate with `FrostSessionManager.createSession()`
4. Add approval workflow to FROST session lifecycle
5. Implement audit logging for all permission operations

**Deliverables:**

- `src/services/eventSigningPermissionService.ts`
- Modified `lib/frost/frost-session-manager.ts`
- Unit tests for permission resolution logic

### Phase 3: API Endpoints (Week 3)

**Tasks:**

1. Create permission management endpoints
2. Create approval workflow endpoints
3. Add permission validation to existing FROST endpoints
4. Implement audit log query endpoint

**Deliverables:**

- `netlify/functions/api/permissions/*.ts`
- Modified FROST API endpoints
- API documentation

### Phase 4: UI Components (Week 4)

**Tasks:**

1. Build `PermissionConfigurationPanel` component
2. Build `MemberOverrideManager` component
3. Build `SigningApprovalQueue` component
4. Build `PermissionMatrixView` component
5. Integrate into Federation Settings page

**Deliverables:**

- `src/components/permissions/*.tsx`
- Integration with existing federation management UI
- User documentation

### Phase 5: Testing & Refinement (Week 5)

**Tasks:**

1. End-to-end testing of permission workflows
2. Performance testing with large federations
3. Security audit of permission bypass scenarios
4. User acceptance testing
5. Documentation finalization

**Deliverables:**

- Test suite covering all permission scenarios
- Performance benchmarks
- Security audit report
- User guide

---

## 10. Security Considerations

### 10.1 Permission Bypass Prevention

```typescript
// All permission checks must be server-side
// Never trust client-provided permission claims

// WRONG: Client claims permission
const canSign = request.body.hasPermission; // ❌ Never trust

// RIGHT: Server validates permission
const canSign = await EventSigningPermissionService.canSign(
  federationId,
  authenticatedMemberDuid, // From verified JWT
  eventType
);
```

### 10.2 Audit Trail Requirements

All permission-related operations MUST be logged:

- Permission grants/revokes
- Override creation/modification/revocation
- Signing attempts (success and failure)
- Approval decisions
- Guardian override usage

### 10.3 Rate Limiting

```typescript
// Implement rate limiting at multiple levels
const rateLimits = {
  permissionChecks: "100/minute/member",
  signingAttempts: "10/minute/member",
  approvalRequests: "20/minute/member",
  configurationChanges: "10/hour/guardian",
};
```

### 10.4 Privilege Escalation Prevention

```typescript
// Validate that granter has authority over target role
function canGrantPermission(
  granterRole: FederationRole,
  targetRole: FederationRole,
  eventType: string
): boolean {
  const roleHierarchy = ["offspring", "adult", "steward", "guardian"];
  const granterLevel = roleHierarchy.indexOf(granterRole);
  const targetLevel = roleHierarchy.indexOf(targetRole);

  // Can only grant to lower roles
  if (targetLevel >= granterLevel) return false;

  // Can only grant permissions you have
  // (checked separately via canSign)
  return true;
}
```

### 10.5 Time-Based Security

```typescript
// Expired overrides must be enforced
async function checkOverrideValidity(override: MemberSigningOverride): boolean {
  if (override.revoked_at) return false;
  if (override.valid_until && new Date(override.valid_until) < new Date()) {
    return false;
  }
  return true;
}
```

---

## 11. Migration Strategy

### 11.1 Backward Compatibility

Existing FROST sessions without `eventType` will:

1. Default to `legacy_signing` event type
2. Use Steward/Guardian-only permission (most restrictive available)
3. Log warning for migration tracking

### 11.2 Default Permission Seeding

On new federation creation, default permissions are automatically seeded:

```sql
-- Seed default permissions for new federations (triggered by INSERT on family_federations)
CREATE OR REPLACE FUNCTION seed_default_permissions()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert default permissions from template
  INSERT INTO event_signing_permissions (federation_id, role, event_type, nostr_kind, permission_category, can_sign, requires_approval, approved_by_roles)
  SELECT
    NEW.federation_duid,
    role,
    event_type,
    nostr_kind,
    permission_category,
    can_sign,
    requires_approval,
    approved_by_roles
  FROM default_permission_templates;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_seed_permissions
AFTER INSERT ON family_federations
FOR EACH ROW EXECUTE FUNCTION seed_default_permissions();
```

---

## 12. Future Enhancements

### 12.1 Content-Based Permissions

Future versions could add:

- Regex content filtering before signing
- Hashtag/topic restrictions
- Mention restrictions (who can be @mentioned)
- Media attachment policies

### 12.2 AI-Assisted Approval

- Content analysis for auto-approval of low-risk events
- Anomaly detection for unusual signing patterns
- Suggested approval based on historical patterns

---

## 13. Appendix

### A. Complete Event Type Registry

| Event Type                | Nostr Kind | Category             | Default Min Role | Approval Required |
| ------------------------- | ---------- | -------------------- | ---------------- | ----------------- |
| `profile_update`          | 0          | identity_management  | Steward          | No                |
| `short_note`              | 1          | content_posting      | Adult            | Yes               |
| `contact_list_update`     | 3          | contact_management   | Adult            | No                |
| `encrypted_dm`            | 4          | messaging            | Offspring        | No                |
| `event_deletion`          | 5          | content_moderation   | Adult            | Yes               |
| `repost`                  | 6          | engagement           | Adult            | No                |
| `reaction`                | 7          | engagement           | Adult            | No                |
| `mute_list_update`        | 10         | privacy_settings     | Adult            | No                |
| `gift_wrapped_dm`         | 14/1059    | messaging            | Offspring        | No                |
| `video_event`             | 21         | media_content        | Adult            | Yes               |
| `audio_event`             | 22         | media_content        | Adult            | Yes               |
| `live_stream`             | 30311      | media_content        | Adult            | Yes               |
| `live_chat`               | 30312      | media_content        | Adult            | No                |
| `long_form_article`       | 30023      | content_posting      | Adult            | Yes               |
| `whitelist_event`         | 1776       | key_management       | Guardian         | No                |
| `federation_announcement` | 1          | content_posting      | Adult            | Yes               |
| `newsletter_post`         | 30023      | content_posting      | Adult            | Yes               |
| `financial_report`        | 30023      | financial_operations | Steward          | Yes               |
| `family_transaction`      | Custom     | financial_operations | Guardian         | No                |
| `offspring_payment`       | Custom     | financial_operations | Offspring        | Yes (Parent)      |
| `family_video`            | Custom     | media_content        | Offspring        | Yes (Parent)      |
| `family_audio`            | Custom     | media_content        | Offspring        | Yes (Parent)      |
| `member_invitation`       | Custom     | member_management    | Adult            | Yes               |
| `member_removal`          | Custom     | member_management    | Guardian         | No                |
| `role_change`             | Custom     | governance           | Steward          | Yes               |
| `federation_settings`     | Custom     | governance           | Guardian         | No                |
| `emergency_action`        | Custom     | governance           | Guardian         | No                |
| `spending_approval`       | Custom     | financial_operations | Steward          | Yes               |
| `cross_fed_delegation`    | Custom     | governance           | Guardian         | Yes               |
| `alliance_action`         | Custom     | governance           | Guardian         | Yes               |

### B. RLS Policy Templates

```sql
-- ============================================
-- EVENT SIGNING PERMISSIONS TABLE POLICIES
-- ============================================

-- Members can read their own effective permissions
CREATE POLICY "members_read_own_permissions" ON event_signing_permissions
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM family_members fm
    WHERE fm.federation_id = event_signing_permissions.federation_id
    AND fm.user_duid = auth.uid()::text
    AND fm.role = event_signing_permissions.role
  )
);

-- Guardians can manage all permissions in their federation
CREATE POLICY "guardians_manage_permissions" ON event_signing_permissions
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM family_members fm
    WHERE fm.federation_id = event_signing_permissions.federation_id
    AND fm.user_duid = auth.uid()::text
    AND fm.role = 'guardian'
  )
);

-- Stewards can manage permissions for lower roles
CREATE POLICY "stewards_manage_lower_permissions" ON event_signing_permissions
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM family_members fm
    WHERE fm.federation_id = event_signing_permissions.federation_id
    AND fm.user_duid = auth.uid()::text
    AND fm.role = 'steward'
    AND event_signing_permissions.role IN ('offspring', 'adult')
  )
);

-- ============================================
-- TIME WINDOWS TABLE POLICIES
-- ============================================

-- Members can read time windows for their permissions
CREATE POLICY "members_read_time_windows" ON permission_time_windows
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM event_signing_permissions esp
    JOIN family_members fm ON fm.federation_id = esp.federation_id
    WHERE esp.id = permission_time_windows.permission_id
    AND fm.user_duid = auth.uid()::text
    AND fm.role = esp.role
  )
);

-- Guardians/Stewards can manage time windows
CREATE POLICY "managers_manage_time_windows" ON permission_time_windows
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM event_signing_permissions esp
    JOIN family_members fm ON fm.federation_id = esp.federation_id
    WHERE esp.id = permission_time_windows.permission_id
    AND fm.user_duid = auth.uid()::text
    AND fm.role IN ('guardian', 'steward')
  )
);

-- ============================================
-- FEDERATION DELEGATIONS TABLE POLICIES
-- ============================================

-- Source federation guardians can manage delegations
CREATE POLICY "source_guardians_manage_delegations" ON federation_permission_delegations
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM family_members fm
    WHERE fm.federation_id = federation_permission_delegations.source_federation_id
    AND fm.user_duid = auth.uid()::text
    AND fm.role = 'guardian'
  )
);

-- Target federation members can read delegations granted to them
CREATE POLICY "target_members_read_delegations" ON federation_permission_delegations
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM family_members fm
    WHERE fm.federation_id = federation_permission_delegations.target_federation_id
    AND fm.user_duid = auth.uid()::text
  )
  OR federation_permission_delegations.target_member_duid = auth.uid()::text
);

-- ============================================
-- FEDERATION ALLIANCES TABLE POLICIES
-- ============================================

-- Alliance member federation guardians can read alliance details
CREATE POLICY "alliance_members_read" ON federation_alliances
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM family_members fm
    WHERE fm.user_duid = auth.uid()::text
    AND fm.role = 'guardian'
    AND fm.federation_id = ANY(
      SELECT jsonb_array_elements_text(federation_alliances.member_federations)
    )
  )
);

-- Only guardians of member federations can modify alliances (requires unanimous approval via application logic)
CREATE POLICY "alliance_guardians_manage" ON federation_alliances
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM family_members fm
    WHERE fm.user_duid = auth.uid()::text
    AND fm.role = 'guardian'
    AND fm.federation_id = ANY(
      SELECT jsonb_array_elements_text(federation_alliances.member_federations)
    )
  )
);
```

---

## 14. Detailed Implementation Task List

This section provides a granular breakdown of all implementation tasks organized by phase, with specific deliverables, effort estimates, dependencies, and testing requirements.

### Legend

- **Effort**: Estimated hours for completion
- **Dependencies**: Tasks that must be completed first (by ID)
- **Priority**: P0 (Critical), P1 (High), P2 (Medium), P3 (Low)

---

### Phase 1: Database Foundation (Week 1) ✅ COMPLETE

| ID       | Task                                    | Description                                                                                              | Deliverables                                                    | Effort | Dependencies | Priority | Status   |
| -------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------ | ------------ | -------- | -------- |
| **1.1**  | Create core permissions migration       | Create `event_signing_permissions` table with all columns per schema                                     | `supabase/migrations/20241220_event_signing_permissions.sql`    | 3h     | None         | P0       | Complete |
| **1.2**  | Create member overrides migration       | Create `member_signing_overrides` table for individual permission overrides                              | `supabase/migrations/20241220_member_signing_overrides.sql`     | 2h     | 1.1          | P0       | Complete |
| **1.3**  | Create audit log migration              | Create `signing_audit_log` table for comprehensive audit trail                                           | `supabase/migrations/20241220_signing_audit_log.sql`            | 2h     | 1.1          | P0       | Complete |
| **1.4**  | Create time windows migration           | Create `permission_time_windows` table for scheduled/temporary permissions                               | `supabase/migrations/20241220_permission_time_windows.sql`      | 2h     | 1.1, 1.2     | P1       | Complete |
| **1.5**  | Create federation delegations migration | Create `federation_permission_delegations` table for cross-federation permissions                        | `supabase/migrations/20241220_federation_delegations.sql`       | 3h     | 1.1          | P1       | Complete |
| **1.6**  | Create federation alliances migration   | Create `federation_alliances` table for multi-federation permission sharing                              | `supabase/migrations/20241220_federation_alliances.sql`         | 2h     | 1.5          | P2       | Complete |
| **1.7**  | Modify frost_signing_sessions table     | Add `required_permissions`, `permission_check_status`, `cross_federation_delegation_id` columns          | `supabase/migrations/20241220_frost_sessions_permissions.sql`   | 1h     | 1.5          | P0       | Complete |
| **1.8**  | Modify family_federations table         | Add `offspring_spending_limits` JSONB column                                                             | `supabase/migrations/20241220_federation_spending_limits.sql`   | 1h     | None         | P1       | Complete |
| **1.9**  | Create RLS policies - Core tables       | Implement RLS for `event_signing_permissions`, `member_signing_overrides`, `signing_audit_log`           | Same migration files                                            | 4h     | 1.1-1.3      | P0       | Complete |
| **1.10** | Create RLS policies - Advanced tables   | Implement RLS for `permission_time_windows`, `federation_permission_delegations`, `federation_alliances` | Same migration files                                            | 3h     | 1.4-1.6      | P1       | Complete |
| **1.11** | Create default permission seed trigger  | Implement `seed_default_permissions()` trigger function for new federations                              | `supabase/migrations/20241220_permission_seed_trigger.sql`      | 2h     | 1.1          | P0       | Complete |
| **1.12** | Create default permission templates     | Insert default permission matrix for all roles and event types                                           | `supabase/migrations/20241220_default_permission_templates.sql` | 3h     | 1.11         | P0       | Complete |
| **1.13** | Create database indexes                 | Add all performance indexes per schema specification                                                     | Part of respective migrations                                   | 1h     | 1.1-1.6      | P1       | Complete |
| **1.14** | Phase 1 Testing - Schema validation     | Validate all tables, constraints, and triggers work correctly                                            | Test scripts in `supabase/tests/`                               | 4h     | 1.1-1.13     | P0       | Complete |
| **1.15** | Phase 1 Security Testing - RLS          | Test RLS policies with role simulation for all tables                                                    | Security test scripts                                           | 4h     | 1.9-1.10     | P0       | Complete |
| **1.16** | Phase 1 Security Testing - Injection    | Test for SQL injection and policy bypass vectors                                                         | Security test report                                            | 2h     | 1.14         | P0       | Complete |

**Phase 1 Total Effort: 39 hours** (increased from 33h with security testing)

**Phase 1 Gating Criteria (ALL MUST PASS):**

- [x] All tables created with correct columns and types
- [x] Foreign key constraints enforced correctly
- [x] RLS policies block unauthorized access for each role level
- [x] RLS policies tested with role simulation (Guardian, Steward, Adult, Offspring, Private)
- [x] Trigger automatically seeds permissions on federation creation
- [x] Indexes exist and EXPLAIN shows they're being used
- [x] No SQL injection vulnerabilities in RLS policies
- [x] Cross-federation isolation verified (federation A cannot access federation B data)

---

### Phase 2: Service Layer (Week 2) ✅ COMPLETE

| ID       | Task                                                      | Description                                                                   | Deliverables                                                   | Effort | Dependencies | Priority | Status   |
| -------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------- | ------ | ------------ | -------- | -------- |
| **2.1**  | Create EventSigningPermissionService core                 | Implement base service class with `canSign()` and `getEffectivePermissions()` | `src/services/eventSigningPermissionService.ts`                | 6h     | 1.14         | P0       | Complete |
| **2.2**  | Implement role permission resolution                      | Logic to resolve role-based permissions with hierarchy consideration          | Part of 2.1                                                    | 3h     | 2.1          | P0       | Complete |
| **2.3**  | Implement override resolution                             | Logic to apply member-specific overrides on top of role permissions           | Part of 2.1                                                    | 3h     | 2.1, 2.2     | P0       | Complete |
| **2.4**  | Implement time-based checking                             | Add `isWithinTimeWindow()` method with scheduled/elevation/cooldown logic     | Part of 2.1                                                    | 4h     | 2.1          | P1       | Complete |
| **2.5**  | Implement time window configuration                       | Add `setTimeWindow()` method for managers to configure time restrictions      | Part of 2.1                                                    | 2h     | 2.4          | P1       | Complete |
| **2.6**  | Implement cross-federation delegation checking            | Add `checkDelegatedPermission()` method                                       | Part of 2.1                                                    | 4h     | 2.1          | P1       | Complete |
| **2.7**  | Implement delegation creation                             | Add `createDelegation()` method for guardians                                 | Part of 2.1                                                    | 3h     | 2.6          | P1       | Complete |
| **2.8**  | Implement alliance permissions                            | Add `getAlliancePermissions()` method for inherited permissions               | Part of 2.1                                                    | 3h     | 2.6          | P2       | Complete |
| **2.9**  | Implement permission configuration                        | Add `configureRolePermissions()` method for Guardian/Steward use              | Part of 2.1                                                    | 3h     | 2.1          | P0       | Complete |
| **2.10** | Implement member override management                      | Add `setMemberOverride()` and `revokeMemberOverride()` methods                | Part of 2.1                                                    | 3h     | 2.1          | P0       | Complete |
| **2.11** | Create audit logging service                              | Implement audit trail for all permission operations                           | `src/services/signingAuditService.ts`                          | 4h     | 2.1          | P0       | Complete |
| **2.12** | Modify FrostSessionManager - Permission check integration | Add `createSessionWithPermissionCheck()` method                               | `src/lib/frost/frost-session-manager.ts` (modify)              | 4h     | 2.1-2.6      | P0       | Complete |
| **2.13** | Modify FrostSessionManager - Approval workflow            | Implement `createPendingApprovalSession()` and approval handling              | `src/lib/frost/frost-session-manager.ts` (modify)              | 4h     | 2.12         | P0       | Complete |
| **2.14** | Integrate with CEPS                                       | Add permission validation to Central Event Publishing Service                 | `src/services/ceps.ts` (modify)                                | 3h     | 2.1, 2.12    | P1       | Complete |
| **2.15** | Create permission type definitions                        | TypeScript interfaces for all permission-related types                        | `src/types/permissions.ts`                                     | 2h     | None         | P0       | Complete |
| **2.16** | Phase 2 Testing - Unit tests                              | Unit tests for all service methods                                            | `src/services/__tests__/eventSigningPermissionService.test.ts` | 8h     | 2.1-2.14     | P0       | Complete |
| **2.17** | Phase 2 Testing - Integration tests                       | Integration tests with database and FROST system                              | `src/services/__tests__/permissionIntegration.test.ts`         | 6h     | 2.16         | P0       | Complete |
| **2.18** | Phase 2 FROST Integration Testing                         | Test FROST session creation with permission checks, concurrent approvals      | FROST integration test suite                                   | 6h     | 2.12-2.13    | P0       | Complete |
| **2.19** | Phase 2 Security Testing - Race conditions                | Test atomic operations (approval queue, concurrent signing)                   | Security test report                                           | 4h     | 2.11, 2.13   | P0       | Complete |

**Phase 2 Total Effort: 79 hours** (increased from 65h with FROST integration and security testing)

**Phase 2 Gating Criteria (ALL MUST PASS):**

- [x] `canSign()` correctly evaluates role hierarchy for all 5 roles
- [x] Member overrides properly supersede role permissions
- [x] Time windows block/allow signing appropriately (tested with clock mocking)
- [x] Cross-federation delegations resolve correctly with proper isolation
- [x] Audit logs created for all operations with correct data
- [x] FrostSessionManager blocks unauthorized signing attempts
- [x] Approval workflow creates pending sessions and handles concurrent approvals
- [x] FROST integration passes with permission checks enabled
- [x] No race conditions in approval queue operations (atomic append verified)
- [x] Service handles database connection failures gracefully

---

### Phase 3: API Endpoints (Week 3) ✅ COMPLETE

| ID       | Task                                   | Description                                                         | Deliverables                                                      | Effort | Dependencies | Priority | Status   |
| -------- | -------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- | ------ | ------------ | -------- | -------- |
| **3.1**  | GET /api/permissions/federation/{id}   | Retrieve all permission configurations for a federation             | `netlify/functions/api/permissions/get-federation-permissions.ts` | 3h     | 2.17         | P0       | Complete |
| **3.2**  | POST /api/permissions/role             | Configure permissions for a role                                    | `netlify/functions/api/permissions/configure-role-permissions.ts` | 3h     | 2.9          | P0       | Complete |
| **3.3**  | GET /api/permissions/member/{id}       | Get effective permissions for a specific member                     | `netlify/functions/api/permissions/get-member-permissions.ts`     | 2h     | 2.3          | P0       | Complete |
| **3.4**  | POST /api/permissions/override         | Grant member-specific permission override                           | `netlify/functions/api/permissions/set-member-override.ts`        | 3h     | 2.10         | P0       | Complete |
| **3.5**  | DELETE /api/permissions/override       | Revoke member permission override                                   | `netlify/functions/api/permissions/revoke-member-override.ts`     | 2h     | 2.10         | P0       | Complete |
| **3.6**  | POST /api/permissions/time-window      | Configure time-based permission window                              | `netlify/functions/api/permissions/set-time-window.ts`            | 3h     | 2.5          | P1       | Complete |
| **3.7**  | POST /api/permissions/delegation       | Create cross-federation delegation                                  | `netlify/functions/api/permissions/create-delegation.ts`          | 3h     | 2.7          | P1       | Complete |
| **3.8**  | GET /api/permissions/delegation/{id}   | Get delegation details and usage stats                              | `netlify/functions/api/permissions/get-delegation.ts`             | 2h     | 2.6          | P1       | Complete |
| **3.9**  | GET /api/permissions/alliances         | Get federation alliance permissions                                 | `netlify/functions/api/permissions/get-alliance-permissions.ts`   | 2h     | 2.8          | P2       | Complete |
| **3.10** | GET /api/signing/approval-queue        | Get pending signing requests for approver                           | `netlify/functions/api/signing/get-approval-queue.ts`             | 3h     | 2.13         | P0       | Complete |
| **3.11** | POST /api/signing/approve              | Approve a pending signing request                                   | `netlify/functions/api/signing/approve-request.ts`                | 3h     | 2.13         | P0       | Complete |
| **3.12** | POST /api/signing/reject               | Reject a pending signing request                                    | `netlify/functions/api/signing/reject-request.ts`                 | 2h     | 2.13         | P0       | Complete |
| **3.13** | GET /api/audit/signing-log             | Query signing audit log with filters                                | `netlify/functions/api/audit/get-signing-log.ts`                  | 3h     | 2.11         | P1       | Complete |
| **3.14** | Modify existing FROST endpoints        | Add permission validation to create-session, join-session endpoints | `netlify/functions/api/frost/*.ts` (modify)                       | 4h     | 2.12         | P0       | Complete |
| **3.15** | Create API rate limiting middleware    | Implement rate limits per specification                             | `netlify/functions/utils/rateLimiting.ts`                         | 3h     | None         | P1       | Complete |
| **3.16** | Phase 3 Testing - API tests            | Test all endpoints with valid/invalid requests                      | `netlify/functions/__tests__/permissions/*.test.ts`               | 8h     | 3.1-3.15     | P0       | Complete |
| **3.17** | Phase 3 Security Testing - Auth        | Test authentication bypass, token manipulation, session hijacking   | API security test report                                          | 4h     | 3.16         | P0       | Complete |
| **3.18** | Phase 3 Performance Testing - Baseline | Establish baseline response times for permission check endpoints    | Performance baseline metrics                                      | 3h     | 3.16         | P1       | Complete |

**Phase 3 Total Effort: 56 hours** (increased from 49h with security and performance testing)

**Phase 3 Gating Criteria (ALL MUST PASS):**

- [x] All endpoints return correct status codes (200/201/400/401/403/404/500)
- [x] Unauthorized requests blocked (401 for no auth, 403 for insufficient role)
- [x] Rate limiting enforced correctly (tested with burst requests)
- [x] Permission changes take effect immediately (no caching issues)
- [x] Approval workflow endpoints work end-to-end
- [x] Audit log endpoint returns filtered results correctly
- [x] No authentication bypass vulnerabilities
- [x] No privilege escalation through API manipulation
- [x] Baseline response time for permission checks < 100ms at P95
- [x] API handles malformed input gracefully (no crashes, proper error messages)

---

### Phase 4: UI Components (Week 4) ✅ COMPLETE

| ID       | Task                                            | Description                                                       | Deliverables                                                    | Effort | Dependencies | Priority | Status   |
| -------- | ----------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- | ------ | ------------ | -------- | -------- |
| **4.1**  | Create PermissionConfigurationPanel component   | Panel for configuring role permissions with toggles and inputs    | `src/components/permissions/PermissionConfigurationPanel.tsx`   | 8h     | 3.16         | P0       | Complete |
| **4.2**  | Create MemberOverrideManager component          | Interface for managing member-specific overrides                  | `src/components/permissions/MemberOverrideManager.tsx`          | 6h     | 3.4, 3.5     | P0       | Complete |
| **4.3**  | Create SigningApprovalQueue component           | Queue showing pending signing requests with approve/reject        | `src/components/frost/SigningApprovalQueue.tsx`                 | 6h     | 3.10-3.12    | P0       | Complete |
| **4.4**  | Create PermissionMatrixView component           | Visual matrix of permissions across roles and event types         | `src/components/permissions/PermissionMatrixView.tsx`           | 5h     | 3.1          | P1       | Complete |
| **4.5**  | Create RoleDelegationWizard component           | Multi-step wizard for delegating permissions                      | `src/components/permissions/RoleDelegationWizard.tsx`           | 6h     | 3.2          | P2       | Complete |
| **4.6**  | Create TimeWindowConfigurator component         | UI for setting scheduled/temporary permission windows             | `src/components/permissions/TimeWindowConfigurator.tsx`         | 4h     | 3.6          | P1       | Complete |
| **4.7**  | Create CrossFederationDelegationPanel component | UI for managing cross-federation delegations                      | `src/components/permissions/CrossFederationDelegationPanel.tsx` | 5h     | 3.7, 3.8     | P2       | Complete |
| **4.8**  | Create AuditLogViewer component                 | Searchable/filterable audit log display                           | `src/components/audit/AuditLogViewer.tsx`                       | 4h     | 3.13         | P1       | Complete |
| **4.9**  | Create permission-related hooks                 | Custom hooks: `usePermissions`, `useApprovalQueue`, `useAuditLog` | `src/hooks/usePermissions.ts`, etc.                             | 4h     | 3.1-3.13     | P0       | Complete |
| **4.10** | Integrate with Family Finances Dashboard        | Add "Signing Permissions" tab to FamilyFinancesDashboard          | `src/pages/FamilyFinancesDashboard.tsx` (modify)                | 4h     | 4.1, 4.2     | P0       | Complete |
| **4.11** | Add offspring spending limit controls           | UI for parents to configure offspring spending limits             | Part of 4.10                                                    | 3h     | 4.10         | P1       | Complete |
| **4.12** | Integrate with Federation Settings              | Add permissions section to federation settings page               | `src/pages/FederationSettings.tsx` (modify)                     | 3h     | 4.1, 4.4     | P0       | Complete |
| **4.13** | Add approval notification badge                 | Show pending approval count in navigation/header                  | `src/components/layout/Header.tsx` (modify)                     | 2h     | 4.3          | P1       | Complete |
| **4.14** | Create permission error states                  | User-friendly error messages for permission denials               | `src/components/permissions/PermissionDeniedMessage.tsx`        | 2h     | 4.1          | P1       | Complete |
| **4.15** | Phase 4 Testing - Component tests               | Unit tests for all UI components                                  | `src/components/permissions/__tests__/*.test.tsx`               | 8h     | 4.1-4.14     | P0       | Complete |
| **4.16** | Phase 4 Testing - E2E component flows           | Cypress/Playwright tests for complete UI flows                    | `cypress/e2e/permissions/*.cy.ts`                               | 6h     | 4.15         | P0       | Complete |
| **4.17** | Phase 4 Accessibility Testing                   | ARIA compliance, keyboard navigation, screen reader testing       | Accessibility test report                                       | 4h     | 4.15         | P1       | Complete |
| **4.18** | Phase 4 UX Error Handling Review                | Verify error states, loading states, edge cases in UI             | UX review report                                                | 2h     | 4.14-4.16    | P1       | Complete |

**Phase 4 Total Effort: 82 hours** (increased from 76h with accessibility and UX testing)

**Phase 4 Gating Criteria (ALL MUST PASS):**

- [x] All components render correctly without console errors
- [x] Form validation works for all inputs (client-side + server-side feedback)
- [x] Loading states and error handling work correctly
- [x] Responsive design for mobile/tablet (tested at 320px, 768px, 1024px)
- [x] Accessibility requirements met (ARIA labels, keyboard navigation, focus management)
- [x] Integration with dashboard functions correctly
- [x] No DUID exposure in client-side code (session-to-DUID mapping server-side only)
- [x] Timezone handling correct for time window inputs (ISO string conversion)
- [x] UI gracefully handles API errors and network failures
- [x] All approval queue operations have proper error recovery (try/finally patterns)

---

### Phase 5: Testing & Refinement (Week 5) ✅ COMPLETE

| ID       | Task                                          | Description                                                      | Deliverables                                       | Effort | Dependencies | Priority | Status   |
| -------- | --------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- | ------ | ------------ | -------- | -------- |
| **5.1**  | End-to-end permission workflow testing        | Test complete flows: configure → use → audit                     | `cypress/e2e/permissions/complete-workflows.cy.ts` | 8h     | 4.16         | P0       | Complete |
| **5.2**  | Security audit - Permission bypass testing    | Attempt to bypass permissions through various vectors            | `docs/security/permission-audit-report.md`         | 8h     | 5.1          | P0       | Complete |
| **5.3**  | Security audit - Privilege escalation testing | Test that lower roles cannot grant themselves higher permissions | Part of 5.2                                        | 4h     | 5.2          | P0       | Complete |
| **5.4**  | Security audit - Cross-federation isolation   | Verify federation permissions don't leak across federations      | Part of 5.2                                        | 4h     | 5.2          | P0       | Complete |
| **5.5**  | Performance testing - Large federations       | Test with 100+ members, 1000+ permission configs                 | `docs/performance/permission-benchmarks.md`        | 6h     | 5.1          | P1       | Complete |
| **5.6**  | Performance testing - Concurrent operations   | Load test approval queue with concurrent requests                | Part of 5.5                                        | 4h     | 5.5          | P1       | Complete |
| **5.7**  | Performance optimization                      | Index tuning, query optimization based on benchmarks             | Database/service modifications                     | 4h     | 5.5          | P1       | Complete |
| **5.8**  | Offspring permission UX testing               | Test offspring payment/media flows with parental approval        | `cypress/e2e/permissions/offspring-flows.cy.ts`    | 4h     | 5.1          | P1       | Complete |
| **5.9**  | Time-based permission testing                 | Test scheduled windows, temporary elevations, cooldowns          | `cypress/e2e/permissions/time-based.cy.ts`         | 4h     | 5.1          | P1       | Complete |
| **5.10** | Cross-federation delegation testing           | Test delegation creation, usage, and revocation                  | `cypress/e2e/permissions/cross-federation.cy.ts`   | 4h     | 5.1          | P2       | Complete |
| **5.11** | User acceptance testing preparation           | Create test scenarios and user guides for UAT                    | `docs/testing/uat-scenarios.md`                    | 4h     | 5.1          | P1       | Complete |
| **5.12** | User documentation                            | Complete user guide for permission management                    | `docs/user-guide/permissions.md`                   | 6h     | 5.11         | P1       | Complete |
| **5.13** | Developer documentation                       | API documentation, integration guide, architecture diagrams      | `docs/dev/permissions-architecture.md`             | 6h     | All          | P1       | Complete |
| **5.14** | Migration guide for existing federations      | Guide for federations upgrading to permission system             | `docs/migration/permissions-upgrade.md`            | 3h     | 5.13         | P2       | Complete |
| **5.15** | Bug fixes and refinements                     | Address issues found during testing                              | Various files                                      | 12h    | 5.1-5.10     | P0       | Complete |
| **5.16** | Final security review                         | Final review of all security-critical code paths                 | `docs/security/final-review.md`                    | 4h     | 5.15         | P0       | Complete |
| **5.17** | Regression Testing                            | Full regression suite to ensure no existing functionality broken | Regression test report                             | 6h     | 5.15         | P0       | Complete |
| **5.18** | Production Readiness Checklist                | Verify all production requirements met before deployment         | Production readiness sign-off                      | 2h     | 5.16-5.17    | P0       | Complete |

**Phase 5 Total Effort: 93 hours** (increased from 85h with regression and production readiness)

**Phase 5 Gating Criteria (ALL MUST PASS - RELEASE GATE):**

- [x] No permission bypass vulnerabilities found (security audit passed)
- [x] No privilege escalation paths exist (tested all role combinations)
- [x] Performance meets targets (< 100ms permission checks at P95, < 500ms UI updates)
- [x] All user scenarios work as documented (UAT passed)
- [x] Audit trail captures all required events with correct data
- [x] Documentation complete and accurate
- [x] Regression suite passes (no existing functionality broken)
- [x] All P0 bugs fixed, no P0 bugs open
- [x] Production readiness checklist complete (monitoring, alerting, rollback plan)

---

### Total Implementation Effort Summary ✅ COMPLETE

| Phase                         | Effort (Hours) | Duration    | Status       |
| ----------------------------- | -------------- | ----------- | ------------ |
| Phase 1: Database Foundation  | 39h            | Week 1      | Complete     |
| Phase 2: Service Layer        | 79h            | Week 2      | Complete     |
| Phase 3: API Endpoints        | 56h            | Week 3      | Complete     |
| Phase 4: UI Components        | 82h            | Week 4      | Complete     |
| Phase 5: Testing & Refinement | 93h            | Week 5      | Complete     |
| **Total**                     | **349h**       | **5 weeks** | **Complete** |

**Note:** Total effort increased from original 308h to 349h (+41h, +13%) due to enhanced security testing, FROST integration testing, accessibility testing, and production readiness verification added to each phase.

---

### Critical Path Dependencies

```
Phase 1 (Database)
├── 1.1 Core permissions table
│   ├── 1.2 Member overrides table
│   │   └── 1.4 Time windows table
│   ├── 1.3 Audit log table
│   ├── 1.5 Federation delegations table
│   │   └── 1.6 Federation alliances table
│   └── 1.7 FROST sessions modifications
└── 1.11 Seed trigger
    └── 1.12 Default templates

Phase 2 (Services) [Depends on: 1.14]
├── 2.1 Core service
│   ├── 2.2 Role resolution
│   │   └── 2.3 Override resolution
│   ├── 2.4 Time-based checking
│   │   └── 2.5 Time window config
│   └── 2.6 Cross-federation checking
│       ├── 2.7 Delegation creation
│       └── 2.8 Alliance permissions
└── 2.12 FrostSessionManager integration
    └── 2.13 Approval workflow

Phase 3 (APIs) [Depends on: 2.17]
├── Permission endpoints (3.1-3.9)
├── Signing endpoints (3.10-3.12)
├── Audit endpoint (3.13)
└── FROST endpoint modifications (3.14)

Phase 4 (UI) [Depends on: 3.16]
├── Permission components (4.1-4.8)
├── Hooks (4.9)
└── Integrations (4.10-4.13)

Phase 5 (Testing) [Depends on: 4.16]
├── E2E testing (5.1)
├── Security audit (5.2-5.4)
├── Performance testing (5.5-5.7)
└── Documentation (5.12-5.14)
```

---

### Risk Mitigation

| Risk                                                | Probability | Impact | Mitigation                                           |
| --------------------------------------------------- | ----------- | ------ | ---------------------------------------------------- |
| RLS policies block legitimate access                | Medium      | High   | Extensive testing in Phase 1.14 with role simulation |
| Performance degradation with complex permissions    | Medium      | Medium | Early benchmarking in Phase 5.5, index optimization  |
| Time-based permissions drift due to timezone issues | Low         | Medium | Use UTC internally, test edge cases thoroughly       |
| Cross-federation delegations create security holes  | Low         | High   | Dedicated security testing in Phase 5.4              |
| Approval queue bottleneck for active federations    | Medium      | Medium | Batch approval feature, notification optimization    |
| Offspring permission UX too restrictive             | Medium      | Medium | UAT feedback, configurable defaults                  |

---

**Document End**

_Last Updated: 2025-12-17_
_Author: Augment Agent_
_Status: Ready for Review_
