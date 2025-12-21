# Administrative Account Control System - Comprehensive Implementation Plan

**Version:** 1.0  
**Status:** Draft - Pending Review  
**Created:** 2025-12-19  
**Last Updated:** 2025-12-19  
**Authors:** Platform Engineering Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Admin Hierarchy Design](#3-admin-hierarchy-design)
4. [Account Types & Removal Scenarios](#4-account-types--removal-scenarios)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Admin Control Panel UI Design](#6-admin-control-panel-ui-design)
7. [Request Submission Workflows](#7-request-submission-workflows)
8. [Database Layer Specifications](#8-database-layer-specifications)
9. [Backend Services Layer](#9-backend-services-layer)
10. [API Layer Specifications](#10-api-layer-specifications)
11. [Frontend Components](#11-frontend-components)
12. [Security Considerations](#12-security-considerations)
13. [Testing Strategy](#13-testing-strategy)
14. [Implementation Phases](#14-implementation-phases)
15. [Deployment Strategy](#15-deployment-strategy)
16. [Operational Procedures](#16-operational-procedures)
17. [Implementation Task List](#17-implementation-task-list)

---

## 1. Executive Summary

### 1.1 Purpose

The Administrative Account Control System provides platform operators and federation administrators with secure, audited capabilities to manage user accounts across the Satnam.pub platform. This system addresses:

- **Platform Operators**: Need to remove any account type (including orphaned registrations, abusive users, and federation guardians) for platform maintenance and content moderation
- **Federation Guardians/Stewards**: Need to manage their federation members within their authority scope
- **Compliance Requirements**: GDPR/privacy regulation account deletion requests
- **Database Hygiene**: Cleanup of orphaned/broken registration states

### 1.2 Key Design Principles

1. **Privacy-First**: All operations use DUIDs (Deterministic User IDs) - no plaintext PII in logs or operations
2. **User Sovereignty**: Users retain their Nostr identity (npub/nsec) - only platform records are removed
3. **Audit Trail**: Complete, immutable logging of all administrative actions
4. **Rollback Capability**: 30-day backup retention for accidental removal recovery
5. **Separation of Concerns**: Platform Admins operate independently from Federation hierarchy
6. **Master Context Compliance**: Respects established role hierarchy (private|offspring|adult|steward|guardian)

### 1.3 Scope

| In Scope                     | Out of Scope                                  |
| ---------------------------- | --------------------------------------------- |
| Account removal (all types)  | Nostr relay moderation                        |
| NIP-05 record management     | Lightning Network node management             |
| Federation member management | Cross-platform identity removal               |
| Orphan cleanup automation    | Payment/transaction data (handled separately) |
| Audit logging & reporting    | Real-time content moderation                  |
| Rollback capabilities        | User data export (GDPR Article 20)            |

---

## 2. Architecture Overview

### 2.1 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        ADMIN ACCOUNT CONTROL SYSTEM                                  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                         ADMIN TIERS                                          │    │
│  │  ┌──────────────────┐          ┌──────────────────────────────────────┐     │    │
│  │  │  Platform Admin  │          │    Federation Admin                   │     │    │
│  │  │  ─────────────── │          │    ──────────────────────────────    │     │    │
│  │  │  • Cross-fed ops │          │    • Guardian: Full federation scope │     │    │
│  │  │  • Any account   │          │    • Steward: Member management only │     │    │
│  │  │  • System maint  │          │    • Scoped to their federation      │     │    │
│  │  └──────────────────┘          └──────────────────────────────────────┘     │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                    │                                                 │
│                                    ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                       AUTHENTICATION LAYER                                   │    │
│  │  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────────────┐      │    │
│  │  │   JWT Token   │──│  Role Check   │──│  Federation Scope Check     │      │    │
│  │  │   Validation  │  │  (admin_roles)│  │  (if federation admin)      │      │    │
│  │  └───────────────┘  └───────────────┘  └─────────────────────────────┘      │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                    │                                                 │
│                                    ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                         API LAYER                                            │    │
│  │  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐     │    │
│  │  │ platform-admin-     │  │ federation-admin-   │  │ account-removal- │     │    │
│  │  │ account-control.ts  │  │ account-control.ts  │  │ shared.ts        │     │    │
│  │  └─────────────────────┘  └─────────────────────┘  └──────────────────┘     │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                    │                                                 │
│                                    ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                       SERVICE LAYER                                          │    │
│  │  ┌───────────────────────────────────────────────────────────────────┐      │    │
│  │  │              AdminAccountControlService                            │      │    │
│  │  │  • removeAccountByNip05(nip05, reason, adminDuid)                 │      │    │
│  │  │  • removeFederationMember(userDuid, fedId, adminDuid)             │      │    │
│  │  │  • listOrphanedAccounts(domain?, limit?)                          │      │    │
│  │  │  • batchCleanupOrphans(domain, adminDuid, dryRun?)                │      │    │
│  │  │  • verifyAccountRemoval(nip05)                                    │      │    │
│  │  │  • rollbackRemoval(logId, adminDuid)                              │      │    │
│  │  │  • getRemovalAuditLog(filters)                                    │      │    │
│  │  └───────────────────────────────────────────────────────────────────┘      │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                    │                                                 │
│                                    ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                       DATABASE LAYER                                         │    │
│  │  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────────────┐   │    │
│  │  │ RPC: remove_user_  │  │ RPC: batch_remove_ │  │ RPC: rollback_user_  │   │    │
│  │  │ account_by_nip05() │  │ orphaned_nip05()   │  │ account_removal()    │   │    │
│  │  └────────────────────┘  └────────────────────┘  └──────────────────────┘   │    │
│  │                              │                                               │    │
│  │  ┌───────────────────────────────────────────────────────────────────┐      │    │
│  │  │                   admin_account_removal_log                        │      │    │
│  │  │  (Immutable audit trail with encrypted backup snapshots)          │      │    │
│  │  └───────────────────────────────────────────────────────────────────┘      │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
[Admin Request] → [JWT Validation] → [Role/Scope Check] → [DUID Generation]
       ↓
[Create Audit Log Entry] → [Create Backup Snapshot] → [Execute Cascading Deletes]
       ↓
[Update Audit Log] → [Return Result with Rollback Token]

---

## 3. Admin Hierarchy Design

### 3.1 Two-Tier Admin Model

The system implements two distinct administrative tiers with separate concerns:

```

┌─────────────────────────────────────────────────────────────────────────┐
│ ADMIN HIERARCHY │
├─────────────────────────────────────────────────────────────────────────┤
│ │
│ TIER 1: PLATFORM ADMINISTRATORS │
│ ════════════════════════════════════════════════════════════════════ │
│ • Identified by: Environment variable PLATFORM_ADMIN_NPUBS │
│ • Scope: Entire platform, all federations, all account types │
│ • Authority: Can remove ANY account including other admins │
│ • Use Cases: Content moderation, GDPR compliance, system maintenance │
│ │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Platform Admin Capabilities │ │
│ │ • Remove any user account (private, federation member) │ │
│ │ • Remove federation guardian/steward accounts │ │
│ │ • Dissolve entire federations │ │
│ │ • Cleanup orphaned registrations across all domains │ │
│ │ • Access cross-federation audit logs │ │
│ │ • Rollback any removal within 30 days │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ │
│ TIER 2: FEDERATION ADMINISTRATORS │
│ ════════════════════════════════════════════════════════════════════ │
│ • Identified by: admin_roles table with federation_id scope │
│ • Scope: Limited to their specific federation │
│ • Authority: Role-based within federation hierarchy │
│ │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Guardian Capabilities (within their federation) │ │
│ │ • Remove any federation member (steward, adult, offspring) │ │
│ │ • Revoke federation membership │ │
│ │ • Emergency freeze member accounts │ │
│ │ • Access federation audit logs │ │
│ │ • Rollback member removals within 30 days │ │
│ │ • CANNOT: Remove other guardians, dissolve federation without a full quorum │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Steward Capabilities (within their federation) │ │
│ │ • Remove adult and offspring members only │ │
│ │ • Revoke membership for adults/offspring │ │
│ │ • Access limited audit logs (their actions only) │ │
│ │ • CANNOT: Remove stewards/guardians, rollback, cleanup orphans │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ │
└─────────────────────────────────────────────────────────────────────────┘

````

### 3.2 Platform Admin Identification

Platform administrators are identified via secure environment configuration:

```typescript
// Environment Variable Configuration
PLATFORM_ADMIN_NPUBS="npub1admin1...,npub1admin2...,npub1admin3..."
PLATFORM_ADMIN_NIP05S="admin@satnam.pub,operator@satnam.pub"

// Runtime Resolution
interface PlatformAdminConfig {
  npubs: string[];  // List of authorized platform admin npubs
  nip05s: string[]; // List of authorized platform admin NIP-05 identifiers
}
````

### 3.3 Permission Matrix

| Action               | Platform Admin | Guardian     | Steward          | Adult | Offspring |
| -------------------- | -------------- | ------------ | ---------------- | ----- | --------- |
| Remove private user  | ✅             | ❌           | ❌               | ❌    | ❌        |
| Remove offspring     | ✅             | ✅ (own fed) | ✅ (own fed)     | ❌    | ❌        |
| Remove adult         | ✅             | ✅ (own fed) | ✅ (own fed)     | ❌    | ❌        |
| Remove steward       | ✅             | ✅ (own fed) | ❌               | ❌    | ❌        |
| Remove guardian      | ✅             | ❌           | ❌               | ❌    | ❌        |
| Dissolve federation  | ✅             | ❌           | ❌               | ❌    | ❌        |
| Cleanup orphans      | ✅             | ❌           | ❌               | ❌    | ❌        |
| View all audit logs  | ✅             | ❌           | ❌               | ❌    | ❌        |
| View federation logs | ✅             | ✅ (own fed) | ✅ (own actions) | ❌    | ❌        |
| Rollback removal     | ✅             | ✅ (own fed) | ❌               | ❌    | ❌        |

---

## 4. Account Types & Removal Scenarios

### 4.1 Account Type Definitions

| Account Type         | Characteristics                  | Federation Membership             | Tables Affected                                                  |
| -------------------- | -------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| **Private User**     | Individual, no federation        | None                              | user_identities, nip05_records, lnbits_wallets, privacy_sessions |
| **Orphaned Account** | Failed/incomplete registration   | None                              | nip05_records only (no user_identities)                          |
| **Offspring Member** | Federation member, restricted    | Yes, family_members               | All tables + family_members                                      |
| **Adult Member**     | Federation member, spending auth | Yes, family_members               | All tables + family_members                                      |
| **Steward Member**   | Federation admin                 | Yes, family_members + admin_roles | All tables + admin_roles                                         |
| **Guardian Member**  | Federation protector             | Yes, family_members + admin_roles | All tables + admin_roles                                         |
| **Federation**       | Entire federation entity         | N/A                               | family_federations + all members                                 |

### 4.2 Removal Scenarios & Workflows

#### Scenario 1: Private User Removal (Platform Admin Only)

```
Trigger: GDPR request, content violation, user request
Actor: Platform Admin
Scope: Single private user account

Workflow:
1. Admin provides NIP-05 identifier (e.g., "alice@satnam.pub")
2. System generates DUID from NIP-05
3. System verifies user is NOT a federation member
4. Create backup snapshot
5. Cascade delete: lnbits_wallets → bypass_codes → recovery_codes → nip05_records → user_identities
6. Log action with rollback token
7. Return confirmation with rollback ID

Recovery: 30-day rollback window via backup snapshot
```

#### Scenario 2: Orphaned Account Cleanup (Platform Admin Only)

```
Trigger: Database maintenance, failed registration cleanup
Actor: Platform Admin
Scope: NIP-05 records without corresponding user_identities

Workflow:
1. Admin initiates orphan scan (optional: specific domain filter)
2. System identifies orphans: nip05_records WHERE NOT EXISTS (user_identities)
3. Dry-run mode: List all orphans without deleting
4. Execute mode: Delete orphaned nip05_records
5. Batch log action

Recovery: Not applicable (orphans have no user data to recover)
```

#### Scenario 3: Federation Member Removal (Guardian/Steward)

```
Trigger: Guardian/Steward administrative action
Actor: Guardian (any member) or Steward (adult/offspring only)
Scope: Single federation member

Workflow:
1. Admin selects member from their federation
2. System verifies admin scope (federation_id match)
3. System verifies role hierarchy (can admin remove target role?)
4. Create backup snapshot including family_members record
5. Remove from family_members (soft delete or hard delete based on config)
6. Optionally: Remove entire platform account if "remove_platform_access" flag
7. Log action with federation context

Recovery: 30-day rollback by Guardian (Stewards cannot rollback)
```

#### Scenario 4: Federation Dissolution (Platform Admin Only)

```
Trigger: Federation abandonment, policy violation
Actor: Platform Admin ONLY
Scope: Entire federation and all members

Workflow:
1. Admin provides federation_id or federation name
2. System lists all members for confirmation
3. Admin confirms dissolution with reason
4. For each member:
   a. Create individual backup snapshot
   b. Remove from family_members
   c. Optionally: Keep user_identities (demote to private) or remove entirely
5. Delete family_federations record
6. Log dissolution with all member DUIDs

Recovery: Complex - requires individual member restoration
```

#### Scenario 5: Guardian/Steward Removal (Platform Admin Only)

```
Trigger: Policy violation by federation admin, account compromise
Actor: Platform Admin ONLY (Guardians cannot remove other Guardians)
Scope: Single admin account

Workflow:
1. Platform Admin provides admin's NIP-05
2. System verifies target is Guardian or Steward
3. Special warning: "Removing this account will orphan X subordinates"
4. Admin confirms with acknowledgment of consequences
5. Create comprehensive backup
6. Remove admin_roles record
7. Remove from family_members
8. Optionally: Remove user_identities (full removal) or keep (demote)
9. Log with special "admin_removal" category

Recovery: 30-day rollback; subordinates automatically re-parented to remaining Guardian
```

### 4.3 Edge Cases

| Edge Case                                                   | Handling Strategy                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| User is member of multiple federations                      | Remove from specified federation only; full removal requires separate action per federation |
| User is both Guardian and Steward in same federation        | Remove both roles atomically                                                                |
| Federation has only one Guardian                            | Platform Admin intervention required; cannot leave federation without Guardian              |
| Orphan has valid NIP-05 but failed user_identities creation | Mark for cleanup; provide username recovery option before deletion                          |
| User has active Lightning payments pending                  | Block removal; require payment settlement first                                             |
| User has FROST shares for other users                       | Archive shares; notify affected users before removal                                        |

---

## 5. Authentication & Authorization

### 5.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ADMIN AUTHENTICATION FLOW                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. INITIAL REQUEST                                                      │
│     ┌────────────┐                                                       │
│     │ Admin UI   │──[POST /api/admin/account-control]──▶                │
│     │ Dashboard  │    Authorization: Bearer <JWT_TOKEN>                  │
│     └────────────┘                                                       │
│                                                                          │
│  2. JWT TOKEN VALIDATION                                                 │
│     ┌────────────────────────────────────────────────────────────┐      │
│     │ Validate JWT signature using JWT_SECRET                     │      │
│     │ Extract: { userId (DUID), nip05, role, federationId, exp } │      │
│     │ Verify: Token not expired                                   │      │
│     └────────────────────────────────────────────────────────────┘      │
│                            │                                             │
│                            ▼                                             │
│  3. PLATFORM ADMIN CHECK                                                 │
│     ┌────────────────────────────────────────────────────────────┐      │
│     │ Is user.npub IN PLATFORM_ADMIN_NPUBS?                       │      │
│     │ OR Is user.nip05 IN PLATFORM_ADMIN_NIP05S?                  │      │
│     │                                                             │      │
│     │ YES → isPlatformAdmin = true; skip federation scope check   │      │
│     │ NO  → Continue to federation admin check                    │      │
│     └────────────────────────────────────────────────────────────┘      │
│                            │                                             │
│                            ▼                                             │
│  4. FEDERATION ADMIN CHECK (if not Platform Admin)                       │
│     ┌────────────────────────────────────────────────────────────┐      │
│     │ Query admin_roles WHERE user_duid = {duid}                  │      │
│     │                                                             │      │
│     │ Role = 'guardian' OR 'steward' → isFederationAdmin = true   │      │
│     │ Extract: federation_id for scope validation                 │      │
│     └────────────────────────────────────────────────────────────┘      │
│                            │                                             │
│                            ▼                                             │
│  5. OPERATION AUTHORIZATION                                              │
│     ┌────────────────────────────────────────────────────────────┐      │
│     │ For each requested operation:                               │      │
│     │ • Check permission matrix (Section 3.3)                     │      │
│     │ • Validate federation scope (if federation admin)           │      │
│     │ • Validate role hierarchy for target user                   │      │
│     │                                                             │      │
│     │ ALLOW → Proceed to operation execution                      │      │
│     │ DENY  → Return 403 Forbidden with reason                    │      │
│     └────────────────────────────────────────────────────────────┘      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Platform Admin Configuration

```typescript
// netlify/functions/config/platform-admin.ts

interface PlatformAdminConfig {
  npubs: string[];
  nip05s: string[];
  duids: string[]; // Pre-computed DUIDs for faster lookup
}

export function loadPlatformAdminConfig(): PlatformAdminConfig {
  const npubs = (process.env.PLATFORM_ADMIN_NPUBS || "")
    .split(",")
    .filter(Boolean);
  const nip05s = (process.env.PLATFORM_ADMIN_NIP05S || "")
    .split(",")
    .filter(Boolean);

  // Pre-compute DUIDs for NIP-05s at startup for O(1) lookup
  const duids = nip05s.map((nip05) => generateDUID(nip05));

  return { npubs, nip05s, duids };
}

export function isPlatformAdmin(
  userNpub: string,
  userNip05: string,
  userDuid: string
): boolean {
  const config = loadPlatformAdminConfig();

  return (
    config.npubs.includes(userNpub) ||
    config.nip05s.includes(userNip05) ||
    config.duids.includes(userDuid)
  );
}
```

### 5.3 Federation Scope Validation

```typescript
// services/admin/federation-scope-validator.ts

interface ScopeValidationResult {
  valid: boolean;
  reason?: string;
  allowedRoles?: string[]; // Roles this admin can manage
}

export async function validateFederationScope(
  adminDuid: string,
  targetUserDuid: string,
  targetFederationId: string,
  operation: "remove" | "view" | "rollback"
): Promise<ScopeValidationResult> {
  // 1. Get admin's federation role
  const adminRole = await getAdminRole(adminDuid);

  if (!adminRole) {
    return { valid: false, reason: "User is not a federation admin" };
  }

  // 2. Verify admin is in the same federation
  if (adminRole.federation_id !== targetFederationId) {
    return { valid: false, reason: "Admin not authorized for this federation" };
  }

  // 3. Get target user's role
  const targetRole = await getFamilyMemberRole(
    targetUserDuid,
    targetFederationId
  );

  // 4. Apply role hierarchy rules
  const roleHierarchy = ["offspring", "adult", "steward", "guardian"];
  const adminLevel = roleHierarchy.indexOf(adminRole.role);
  const targetLevel = roleHierarchy.indexOf(targetRole);

  // Guardians can manage all except other guardians
  if (adminRole.role === "guardian" && targetRole !== "guardian") {
    return { valid: true, allowedRoles: ["offspring", "adult", "steward"] };
  }

  // Stewards can only manage adults and offspring
  if (
    adminRole.role === "steward" &&
    ["offspring", "adult"].includes(targetRole)
  ) {
    return { valid: true, allowedRoles: ["offspring", "adult"] };
  }

  return { valid: false, reason: "Insufficient privileges for this operation" };
}
```

---

## 6. Admin Control Panel UI Design

### 6.1 UI Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ADMIN CONTROL PANEL UI STRUCTURE                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ROUTE: /admin/account-control                                          │
│  COMPONENT: AdminAccountControlDashboard.tsx                            │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  NAVIGATION TABS                                                 │    │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌───────────┐         │    │
│  │  │ Overview │ │ Accounts │ │ Orphans   │ │ Audit Log │         │    │
│  │  └──────────┘ └──────────┘ └───────────┘ └───────────┘         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  PLATFORM ADMIN VIEW (Full Tabs)                                        │
│  ════════════════════════════════════════════════════════════════════   │
│  • Overview: Stats, recent actions, pending requests                    │
│  • Accounts: Search & remove any account, federation dissolution        │
│  • Orphans: Scan, list, and cleanup orphaned registrations             │
│  • Audit Log: Full cross-federation audit trail                         │
│                                                                          │
│  FEDERATION ADMIN VIEW (Scoped Tabs)                                    │
│  ════════════════════════════════════════════════════════════════════   │
│  • Overview: Federation stats, member summary                           │
│  • Members: View/remove federation members (role-scoped)                │
│  • Audit Log: Federation-only audit trail                               │
│  • (No Orphans tab for federation admins)                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Component Hierarchy

```
AdminAccountControlDashboard.tsx (Route: /admin/account-control)
├── AdminAuthGuard.tsx (HOC for admin authentication)
│   ├── Checks: isPlatformAdmin || isFederationAdmin
│   └── Redirects to 403 if unauthorized
│
├── AdminControlTabs.tsx
│   ├── OverviewTab.tsx
│   │   ├── AdminStatsCards.tsx
│   │   │   ├── TotalAccountsCard
│   │   │   ├── RecentRemovalsCard
│   │   │   ├── PendingActionsCard
│   │   │   └── OrphanCountCard (Platform Admin only)
│   │   └── RecentActionsTable.tsx
│   │
│   ├── AccountsTab.tsx (Platform Admin) / MembersTab.tsx (Federation Admin)
│   │   ├── AccountSearchForm.tsx
│   │   │   ├── NIP05Input (with validation)
│   │   │   ├── DomainFilter (dropdown)
│   │   │   └── SearchButton
│   │   ├── AccountSearchResults.tsx
│   │   │   └── AccountCard.tsx (per result)
│   │   │       ├── AccountDetails (masked DUID, role, federation)
│   │   │       ├── RemoveButton (triggers confirmation)
│   │   │       └── ViewDetailsButton
│   │   └── AccountRemovalModal.tsx
│   │       ├── RemovalReasonSelect
│   │       ├── RemovalNotesInput
│   │       ├── CreateBackupCheckbox
│   │       ├── ConfirmationInput ("type REMOVE to confirm")
│   │       └── ActionButtons (Cancel / Execute Removal)
│   │
│   ├── OrphansTab.tsx (Platform Admin only)
│   │   ├── OrphanScanControls.tsx
│   │   │   ├── DomainFilter
│   │   │   ├── ScanButton
│   │   │   └── DryRunToggle
│   │   ├── OrphanResultsTable.tsx
│   │   │   └── OrphanRow.tsx
│   │   │       ├── NIP05RecordId (truncated)
│   │   │       ├── CreatedAt
│   │   │       └── SelectCheckbox
│   │   └── BatchCleanupControls.tsx
│   │       ├── SelectAllButton
│   │       ├── SelectedCountDisplay
│   │       └── CleanupButton (with confirmation)
│   │
│   └── AuditLogTab.tsx
│       ├── AuditLogFilters.tsx
│       │   ├── DateRangePicker
│       │   ├── ActionTypeFilter
│       │   ├── StatusFilter
│       │   └── AdminFilter (Platform Admin only)
│       ├── AuditLogTable.tsx
│       │   └── AuditLogRow.tsx
│       │       ├── Timestamp
│       │       ├── AdminDuid (masked)
│       │       ├── Action
│       │       ├── TargetDuid (masked)
│       │       ├── Status
│       │       └── RollbackButton (if eligible)
│       └── AuditLogPagination.tsx
│
└── RollbackConfirmationModal.tsx
    ├── RemovalDetails
    ├── BackupSnapshotPreview
    ├── RollbackWarning
    └── ActionButtons (Cancel / Execute Rollback)
```

### 6.3 Key UI Wireframes

#### Overview Tab (Platform Admin)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ADMIN ACCOUNT CONTROL                                     [Refresh] 🔄 │
├─────────────────────────────────────────────────────────────────────────┤
│  [Overview] [Accounts] [Orphans] [Audit Log]                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │ Total Users  │ │ Federations  │ │ Orphans      │ │ Removals(7d) │   │
│  │    1,247     │ │     156      │ │      23      │ │      5       │   │
│  │   ↑12 today  │ │   ↑3 today   │ │  ⚠ cleanup   │ │   ✓ normal   │   │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │
│                                                                          │
│  RECENT ACTIONS                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Time        │ Admin     │ Action              │ Target    │ Status │ │
│  │─────────────│───────────│─────────────────────│───────────│────────│ │
│  │ 2 min ago   │ admin@... │ remove_account      │ user@...  │ ✓ Done │ │
│  │ 1 hour ago  │ admin@... │ orphan_cleanup(5)   │ batch     │ ✓ Done │ │
│  │ 3 hours ago │ guard@... │ remove_member       │ member@...│ ✓ Done │ │
│  │ Yesterday   │ admin@... │ federation_dissolve │ FedName   │ ✓ Done │ │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                          [View All →]    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Account Removal Modal

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ⚠️  REMOVE ACCOUNT                                              [X]    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  You are about to remove the following account:                         │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  NIP-05: alice@satnam.pub                                        │    │
│  │  DUID:   a7f3c2b1... (truncated)                                 │    │
│  │  Role:   Private User                                            │    │
│  │  Created: 2024-06-15                                             │    │
│  │  Last Active: 2024-12-18                                         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Removal Reason: *                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ [▼] user_requested - User-Initiated Deletion Request            │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Notes (optional):                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Support ticket #12345 - User requested account deletion         │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ☑ Create backup snapshot (allows 30-day rollback)                      │
│                                                                          │
│  ⚠️  This action will remove:                                           │
│  • user_identities record                                                │
│  • nip05_records (username will become available)                       │
│  • lnbits_wallets (Lightning wallet data)                               │
│  • bypass_codes, recovery_codes                                          │
│                                                                          │
│  Type "REMOVE" to confirm: ┌──────────────────┐                         │
│                            │                  │                          │
│                            └──────────────────┘                          │
│                                                                          │
│  ┌────────────┐                                    ┌────────────────┐   │
│  │   Cancel   │                                    │ Execute Removal│   │
│  └────────────┘                                    └────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Request Submission Workflows

### 7.1 Workflow Categories

| Workflow Type              | Trigger                   | Actor                           | Channel                        |
| -------------------------- | ------------------------- | ------------------------------- | ------------------------------ |
| Direct Admin Action        | Admin initiates           | Platform/Federation Admin       | Admin UI Dashboard             |
| User Deletion Request      | User requests via support | User → Support → Platform Admin | Support Ticket → Admin Queue   |
| GDPR Article 17 Request    | Formal legal request      | User (formal)                   | Email → Legal → Platform Admin |
| Automated Orphan Scan      | Scheduled job             | System                          | Cron → Admin Review Queue      |
| Federation Member Ejection | Guardian decision         | Guardian/Steward                | Federation Admin UI            |

### 7.2 User-Initiated Deletion Request Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│              USER-INITIATED ACCOUNT DELETION WORKFLOW                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  PHASE 1: REQUEST SUBMISSION (User)                                     │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────────┐     │
│  │ User Settings  │───▶│ Delete Account │───▶│ Confirm Identity   │     │
│  │ Page           │    │ Button         │    │ (NIP-07 sign)      │     │
│  └────────────────┘    └────────────────┘    └────────────────────┘     │
│                                                       │                  │
│                                                       ▼                  │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │ Generate Deletion Request                                      │      │
│  │ • Create signed Nostr event (kind: 30078 - application data)  │      │
│  │ • Include: user_duid, nip05, reason, timestamp                 │      │
│  │ • Store in pending_deletion_requests table                     │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                       │                  │
│  PHASE 2: COOLING-OFF PERIOD (7 Days)                                   │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                       │                  │
│                                                       ▼                  │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │ User can cancel during 7-day window                            │      │
│  │ • Account remains active                                        │      │
│  │ • Daily reminder emails (if email configured)                   │      │
│  │ • In-app notification banner                                    │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                       │                  │
│  PHASE 3: ADMIN REVIEW (Day 7+)                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                       │                  │
│                                                       ▼                  │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │ Platform Admin reviews request in Admin Queue                  │      │
│  │ • Verify identity (signed event)                               │      │
│  │ • Check for pending transactions                               │      │
│  │ • Check for FROST share responsibilities                       │      │
│  │ • Approve or Flag for manual review                            │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                       │                  │
│  PHASE 4: EXECUTION                                                      │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                       │                  │
│                                                       ▼                  │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │ Execute removal via standard admin-account-control API         │      │
│  │ • Reason: "user_requested"                                     │      │
│  │ • Create backup (30-day rollback window)                       │      │
│  │ • Send confirmation to user's Nostr relay                      │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Automated Orphan Detection

```typescript
// Scheduled job: runs daily at 02:00 UTC
interface OrphanDetectionConfig {
  schedule: "0 2 * * *"; // Daily at 2 AM
  maxAge: 24 * 60 * 60 * 1000; // Orphans older than 24 hours
  autoCleanup: false; // Requires admin approval
  notifyAdmins: true;
}

// Detection query
const orphanDetectionQuery = `
  SELECT n.id, n.name_duid, n.domain, n.created_at
  FROM nip05_records n
  LEFT JOIN user_identities u ON n.name_duid = u.id
  WHERE u.id IS NULL
    AND n.is_active = TRUE
    AND n.created_at < NOW() - INTERVAL '24 hours'
  ORDER BY n.created_at ASC
`;
```

---

## 8. Database Layer Specifications

### 8.1 New Tables

#### admin_account_removal_log

```sql
-- Migration: 071_admin_account_control.sql

CREATE TABLE IF NOT EXISTS public.admin_account_removal_log (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Admin Information (DUID - no plaintext)
    admin_user_duid TEXT NOT NULL,
    admin_type TEXT NOT NULL CHECK (admin_type IN ('platform', 'federation')),
    admin_federation_id UUID, -- NULL for platform admins

    -- Target Account Information (DUID - no plaintext)
    target_user_duid TEXT NOT NULL,
    target_nip05_duid TEXT NOT NULL,
    target_account_type TEXT NOT NULL CHECK (target_account_type IN (
        'private', 'offspring', 'adult', 'steward', 'guardian', 'orphan', 'federation'
    )),
    target_federation_id UUID, -- NULL for private users/orphans

    -- Removal Context
    removal_reason TEXT NOT NULL CHECK (removal_reason IN (
        'user_requested',        -- User-initiated deletion
        'gdpr_request',          -- GDPR Article 17 formal request
        'content_moderation',    -- Platform abuse/violation
        'orphan_cleanup',        -- Failed registration cleanup
        'federation_removal',    -- Removed from federation only
        'federation_dissolution',-- Federation dissolved
        'security_incident',     -- Compromised account
        'database_maintenance',  -- System maintenance
        'admin_removal'          -- Removing admin accounts
    )),
    removal_notes TEXT, -- Optional admin notes

    -- Scope Tracking
    tables_affected JSONB NOT NULL DEFAULT '{}',
    records_deleted INTEGER NOT NULL DEFAULT 0,

    -- Backup & Rollback
    backup_snapshot JSONB, -- Encrypted backup data
    backup_encryption_key_id TEXT, -- Reference to encryption key
    rollback_expires_at TIMESTAMP WITH TIME ZONE,
    rollback_executed BOOLEAN DEFAULT FALSE,
    rollback_executed_by TEXT, -- Admin DUID who rolled back
    rollback_executed_at TIMESTAMP WITH TIME ZONE,

    -- Request Metadata (privacy-preserving)
    request_id TEXT NOT NULL UNIQUE,
    ip_address_hash TEXT, -- SHA-256 of IP for security auditing
    user_agent_hash TEXT, -- SHA-256 of User-Agent

    -- Timestamps
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE, -- Admin confirmation time
    executed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Status Tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',      -- Awaiting confirmation
        'confirmed',    -- Admin confirmed, awaiting execution
        'executing',    -- In progress
        'completed',    -- Successfully completed
        'failed',       -- Execution failed
        'rolled_back',  -- Rollback executed
        'cancelled'     -- Cancelled before execution
    )),
    error_message TEXT,

    -- Constraints
    CONSTRAINT valid_rollback_window CHECK (
        rollback_expires_at IS NULL OR rollback_expires_at > requested_at
    )
);

-- Indexes for common queries
CREATE INDEX idx_removal_log_admin ON admin_account_removal_log(admin_user_duid);
CREATE INDEX idx_removal_log_target ON admin_account_removal_log(target_user_duid);
CREATE INDEX idx_removal_log_status ON admin_account_removal_log(status);
CREATE INDEX idx_removal_log_requested_at ON admin_account_removal_log(requested_at DESC);
CREATE INDEX idx_removal_log_federation ON admin_account_removal_log(target_federation_id)
    WHERE target_federation_id IS NOT NULL;

-- RLS Policies
ALTER TABLE admin_account_removal_log ENABLE ROW LEVEL SECURITY;

-- Platform admins can see all logs
CREATE POLICY "platform_admins_full_access" ON admin_account_removal_log
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_roles ar
            WHERE ar.user_duid = auth.uid()::text
            AND ar.role IN ('guardian', 'steward')
            AND ar.federation_id IS NULL -- Platform-level admin
        )
    );

-- Federation admins can see their federation's logs
CREATE POLICY "federation_admins_scoped_access" ON admin_account_removal_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM admin_roles ar
            WHERE ar.user_duid = auth.uid()::text
            AND ar.role IN ('guardian', 'steward')
            AND ar.federation_id = admin_account_removal_log.target_federation_id
        )
    );
```

#### pending_deletion_requests (User-Initiated)

```sql
CREATE TABLE IF NOT EXISTS public.pending_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User Information
    user_duid TEXT NOT NULL UNIQUE REFERENCES user_identities(id),

    -- Request Details
    signed_event JSONB NOT NULL, -- NIP-07 signed deletion request
    reason TEXT DEFAULT 'user_requested',

    -- Cooling-off Period
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cooling_off_ends_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days',
    cancelled_at TIMESTAMP WITH TIME ZONE,

    -- Processing
    approved_by_admin TEXT, -- Admin DUID
    approved_at TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE,

    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',      -- In cooling-off period
        'ready',        -- Cooling-off complete, awaiting admin
        'approved',     -- Admin approved, pending execution
        'executed',     -- Deletion complete
        'cancelled'     -- User cancelled
    ))
);

CREATE INDEX idx_pending_deletions_status ON pending_deletion_requests(status);
CREATE INDEX idx_pending_deletions_cooling_off ON pending_deletion_requests(cooling_off_ends_at)
    WHERE status = 'pending';
```

### 8.2 Stored Procedures (RPC Functions)

#### remove_user_account_by_nip05

```sql
CREATE OR REPLACE FUNCTION remove_user_account_by_nip05(
    p_name_duid TEXT,
    p_domain TEXT,
    p_admin_duid TEXT,
    p_admin_type TEXT,
    p_admin_federation_id UUID,
    p_removal_reason TEXT,
    p_removal_notes TEXT DEFAULT NULL,
    p_request_id TEXT DEFAULT NULL,
    p_create_backup BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_duid TEXT;
    v_account_type TEXT;
    v_federation_id UUID;
    v_tables_affected JSONB := '{}';
    v_total_deleted INTEGER := 0;
    v_backup_data JSONB := NULL;
    v_log_id UUID;
    v_deleted_count INTEGER;
BEGIN
    -- Resolve user DUID (name_duid = user_identities.id in DUID architecture)
    v_user_duid := p_name_duid;

    -- Check if user exists
    SELECT id INTO v_user_duid FROM user_identities WHERE id = p_name_duid;

    IF v_user_duid IS NULL THEN
        -- Check for orphan case
        IF EXISTS (SELECT 1 FROM nip05_records WHERE name_duid = p_name_duid AND domain = p_domain) THEN
            -- Handle orphan cleanup
            DELETE FROM nip05_records WHERE name_duid = p_name_duid AND domain = p_domain;
            GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

            INSERT INTO admin_account_removal_log (
                admin_user_duid, admin_type, target_user_duid, target_nip05_duid,
                target_account_type, removal_reason, removal_notes, request_id,
                tables_affected, records_deleted, status, executed_at, completed_at
            ) VALUES (
                p_admin_duid, p_admin_type, p_name_duid, p_name_duid,
                'orphan', 'orphan_cleanup', p_removal_notes,
                COALESCE(p_request_id, gen_random_uuid()::TEXT),
                jsonb_build_object('nip05_records', v_deleted_count),
                v_deleted_count, 'completed', NOW(), NOW()
            );

            RETURN jsonb_build_object(
                'success', TRUE,
                'type', 'orphan_cleanup',
                'records_deleted', v_deleted_count
            );
        ELSE
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', 'User not found',
                'duid_checked', p_name_duid
            );
        END IF;
    END IF;

    -- Determine account type and federation
    SELECT
        COALESCE(fm.family_role, 'private'),
        fm.family_federation_id
    INTO v_account_type, v_federation_id
    FROM user_identities ui
    LEFT JOIN family_members fm ON fm.user_duid = ui.id AND fm.is_active = TRUE
    WHERE ui.id = v_user_duid;

    -- Create backup snapshot if requested
    IF p_create_backup THEN
        SELECT jsonb_build_object(
            'user_identities', (SELECT row_to_json(u.*) FROM user_identities u WHERE u.id = v_user_duid),
            'nip05_records', (SELECT jsonb_agg(row_to_json(n.*)) FROM nip05_records n WHERE n.name_duid = p_name_duid),
            'family_members', (SELECT jsonb_agg(row_to_json(f.*)) FROM family_members f WHERE f.user_duid = v_user_duid),
            'admin_roles', (SELECT jsonb_agg(row_to_json(a.*)) FROM admin_roles a WHERE a.user_duid = v_user_duid),
            'lnbits_wallets', (SELECT jsonb_agg(row_to_json(l.*)) FROM lnbits_wallets l WHERE l.user_duid = v_user_duid),
            'bypass_codes', (SELECT jsonb_agg(row_to_json(b.*)) FROM bypass_codes b WHERE b.user_duid = v_user_duid),
            'recovery_codes', (SELECT jsonb_agg(row_to_json(r.*)) FROM recovery_codes r WHERE r.user_duid = v_user_duid)
        ) INTO v_backup_data;
    END IF;

    -- Create audit log entry
    INSERT INTO admin_account_removal_log (
        admin_user_duid, admin_type, admin_federation_id,
        target_user_duid, target_nip05_duid, target_account_type, target_federation_id,
        removal_reason, removal_notes, request_id,
        backup_snapshot, rollback_expires_at,
        status, executed_at
    ) VALUES (
        p_admin_duid, p_admin_type, p_admin_federation_id,
        v_user_duid, p_name_duid, v_account_type, v_federation_id,
        p_removal_reason, p_removal_notes, COALESCE(p_request_id, gen_random_uuid()::TEXT),
        v_backup_data, CASE WHEN p_create_backup THEN NOW() + INTERVAL '30 days' ELSE NULL END,
        'executing', NOW()
    ) RETURNING id INTO v_log_id;

    -- Execute cascading deletes (order matters for FK constraints)

    -- 1. lnbits_wallets
    DELETE FROM lnbits_wallets WHERE user_duid = v_user_duid;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count > 0 THEN
        v_tables_affected := v_tables_affected || jsonb_build_object('lnbits_wallets', v_deleted_count);
        v_total_deleted := v_total_deleted + v_deleted_count;
    END IF;

    -- 2. bypass_codes
    DELETE FROM bypass_codes WHERE user_duid = v_user_duid;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count > 0 THEN
        v_tables_affected := v_tables_affected || jsonb_build_object('bypass_codes', v_deleted_count);
        v_total_deleted := v_total_deleted + v_deleted_count;
    END IF;

    -- 3. recovery_codes
    DELETE FROM recovery_codes WHERE user_duid = v_user_duid;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count > 0 THEN
        v_tables_affected := v_tables_affected || jsonb_build_object('recovery_codes', v_deleted_count);
        v_total_deleted := v_total_deleted + v_deleted_count;
    END IF;

    -- 4. admin_roles
    DELETE FROM admin_roles WHERE user_duid = v_user_duid;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count > 0 THEN
        v_tables_affected := v_tables_affected || jsonb_build_object('admin_roles', v_deleted_count);
        v_total_deleted := v_total_deleted + v_deleted_count;
    END IF;

    -- 5. family_members
    DELETE FROM family_members WHERE user_duid = v_user_duid;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count > 0 THEN
        v_tables_affected := v_tables_affected || jsonb_build_object('family_members', v_deleted_count);
        v_total_deleted := v_total_deleted + v_deleted_count;
    END IF;

    -- 6. nip05_records
    DELETE FROM nip05_records WHERE name_duid = p_name_duid AND domain = p_domain;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count > 0 THEN
        v_tables_affected := v_tables_affected || jsonb_build_object('nip05_records', v_deleted_count);
        v_total_deleted := v_total_deleted + v_deleted_count;
    END IF;

    -- 7. user_identities (last - core record)
    DELETE FROM user_identities WHERE id = v_user_duid;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count > 0 THEN
        v_tables_affected := v_tables_affected || jsonb_build_object('user_identities', v_deleted_count);
        v_total_deleted := v_total_deleted + v_deleted_count;
    END IF;

    -- Update audit log
    UPDATE admin_account_removal_log
    SET tables_affected = v_tables_affected,
        records_deleted = v_total_deleted,
        status = 'completed',
        completed_at = NOW()
    WHERE id = v_log_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'log_id', v_log_id,
        'user_duid', v_user_duid,
        'account_type', v_account_type,
        'tables_affected', v_tables_affected,
        'total_deleted', v_total_deleted,
        'rollback_available_until', CASE WHEN p_create_backup THEN NOW() + INTERVAL '30 days' ELSE NULL END
    );

EXCEPTION WHEN OTHERS THEN
    -- Log error
    IF v_log_id IS NOT NULL THEN
        UPDATE admin_account_removal_log
        SET status = 'failed', error_message = SQLERRM
        WHERE id = v_log_id;
    END IF;

    RETURN jsonb_build_object(
        'success', FALSE,
        'error', SQLERRM,
        'log_id', v_log_id
    );
END;
$$;
```

---

## 9. API Layer Specifications

### 9.1 Netlify Function: admin-account-control.ts

```typescript
// netlify/functions/admin-account-control.ts

import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { verifyJWT, extractAdminContext } from "./utils/auth";
import { isPlatformAdmin, validateFederationScope } from "./utils/admin-auth";
import { generateDUID } from "./utils/duid";
import { hashForAudit } from "./utils/privacy";

interface RemoveAccountRequest {
  action: "remove_account" | "cleanup_orphans" | "rollback" | "list_orphans";
  nip05?: string; // For remove_account
  domain?: string;
  reason?: string;
  notes?: string;
  createBackup?: boolean;
  logId?: string; // For rollback
  dryRun?: boolean; // For cleanup_orphans
}

interface AdminContext {
  duid: string;
  nip05: string;
  npub: string;
  isPlatformAdmin: boolean;
  federationId?: string;
  role?: "guardian" | "steward";
}

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // 1. Authenticate and extract admin context
    const authHeader = event.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Missing authorization" }),
      };
    }

    const token = authHeader.slice(7);
    const jwtPayload = await verifyJWT(token);
    const adminContext = await extractAdminContext(jwtPayload);

    // 2. Verify admin privileges
    if (!adminContext.isPlatformAdmin && !adminContext.role) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Admin privileges required" }),
      };
    }

    // 3. Parse request
    const request: RemoveAccountRequest = JSON.parse(event.body || "{}");

    // 4. Route to appropriate handler
    switch (request.action) {
      case "remove_account":
        return await handleRemoveAccount(request, adminContext, event);
      case "cleanup_orphans":
        return await handleCleanupOrphans(request, adminContext, event);
      case "list_orphans":
        return await handleListOrphans(request, adminContext);
      case "rollback":
        return await handleRollback(request, adminContext);
      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Invalid action" }),
        };
    }
  } catch (error) {
    console.error("Admin account control error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Internal error",
      }),
    };
  }
};

async function handleRemoveAccount(
  request: RemoveAccountRequest,
  admin: AdminContext,
  event: HandlerEvent
) {
  const {
    nip05,
    domain = "satnam.pub",
    reason,
    notes,
    createBackup = true,
  } = request;

  if (!nip05) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "NIP-05 identifier required" }),
    };
  }

  // Parse NIP-05
  const [username, nip05Domain] = nip05.includes("@")
    ? nip05.split("@")
    : [nip05, domain];
  const targetDuid = generateDUID(`${username}@${nip05Domain}`);

  // Authorization check for federation admins
  if (!admin.isPlatformAdmin) {
    const scopeCheck = await validateFederationScope(
      admin.duid,
      targetDuid,
      admin.federationId!,
      "remove"
    );
    if (!scopeCheck.valid) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: scopeCheck.reason }),
      };
    }
  }

  // Execute removal via RPC
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase.rpc("remove_user_account_by_nip05", {
    p_name_duid: targetDuid,
    p_domain: nip05Domain,
    p_admin_duid: admin.duid,
    p_admin_type: admin.isPlatformAdmin ? "platform" : "federation",
    p_admin_federation_id: admin.federationId || null,
    p_removal_reason: reason || "admin_removal",
    p_removal_notes: notes,
    p_request_id: crypto.randomUUID(),
    p_create_backup: createBackup,
  });

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify(data),
  };
}

async function handleCleanupOrphans(
  request: RemoveAccountRequest,
  admin: AdminContext,
  event: HandlerEvent
) {
  // Platform admin only
  if (!admin.isPlatformAdmin) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Platform admin required" }),
    };
  }

  const { domain, dryRun = true } = request;

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find orphans
  let query = supabase
    .from("nip05_records")
    .select("id, name_duid, domain, created_at")
    .is("user_identities.id", null)
    .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (domain) {
    query = query.eq("domain", domain);
  }

  const { data: orphans, error: findError } = await query;

  if (findError) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: findError.message }),
    };
  }

  if (dryRun) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        dryRun: true,
        orphanCount: orphans?.length || 0,
        orphans: orphans?.map((o) => ({
          id: o.id,
          domain: o.domain,
          created_at: o.created_at,
        })),
      }),
    };
  }

  // Execute cleanup
  const orphanIds = orphans?.map((o) => o.id) || [];
  const { error: deleteError } = await supabase
    .from("nip05_records")
    .delete()
    .in("id", orphanIds);

  if (deleteError) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: deleteError.message }),
    };
  }

  // Log batch cleanup
  await supabase.from("admin_account_removal_log").insert({
    admin_user_duid: admin.duid,
    admin_type: "platform",
    target_user_duid: "batch_orphan_cleanup",
    target_nip05_duid: "batch_orphan_cleanup",
    target_account_type: "orphan",
    removal_reason: "orphan_cleanup",
    removal_notes: `Cleaned up ${orphanIds.length} orphaned records`,
    request_id: crypto.randomUUID(),
    tables_affected: { nip05_records: orphanIds.length },
    records_deleted: orphanIds.length,
    status: "completed",
    executed_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      deletedCount: orphanIds.length,
    }),
  };
}

async function handleListOrphans(
  request: RemoveAccountRequest,
  admin: AdminContext
) {
  if (!admin.isPlatformAdmin) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Platform admin required" }),
    };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase.rpc("list_orphaned_nip05_records", {
    p_domain_filter: request.domain || null,
    p_limit: 100,
  });

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ orphans: data }) };
}

async function handleRollback(
  request: RemoveAccountRequest,
  admin: AdminContext
) {
  const { logId } = request;

  if (!logId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Log ID required" }),
    };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify rollback eligibility
  const { data: log, error: fetchError } = await supabase
    .from("admin_account_removal_log")
    .select("*")
    .eq("id", logId)
    .single();

  if (fetchError || !log) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Log entry not found" }),
    };
  }

  // Check authorization
  if (!admin.isPlatformAdmin) {
    if (log.target_federation_id !== admin.federationId) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Not authorized for this federation" }),
      };
    }
    if (admin.role !== "guardian") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Only guardians can rollback" }),
      };
    }
  }

  // Check rollback window
  if (new Date(log.rollback_expires_at) < new Date()) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Rollback window expired" }),
    };
  }

  if (log.rollback_executed) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Already rolled back" }),
    };
  }

  if (!log.backup_snapshot) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "No backup available" }),
    };
  }

  // Execute rollback via RPC
  const { data, error } = await supabase.rpc("rollback_account_removal", {
    p_log_id: logId,
    p_admin_duid: admin.duid,
  });

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return { statusCode: 200, body: JSON.stringify(data) };
}
```

### 9.2 API Endpoints Summary

| Endpoint                     | Method | Action          | Required Role                               |
| ---------------------------- | ------ | --------------- | ------------------------------------------- |
| `/api/admin/account-control` | POST   | remove_account  | Platform Admin or Federation Admin (scoped) |
| `/api/admin/account-control` | POST   | cleanup_orphans | Platform Admin only                         |
| `/api/admin/account-control` | POST   | list_orphans    | Platform Admin only                         |
| `/api/admin/account-control` | POST   | rollback        | Platform Admin or Guardian (scoped)         |

### 9.3 Request/Response Examples

#### Remove Account Request

```json
{
  "action": "remove_account",
  "nip05": "alice@satnam.pub",
  "reason": "user_requested",
  "notes": "Support ticket #12345",
  "createBackup": true
}
```

#### Remove Account Response

```json
{
  "success": true,
  "log_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_duid": "a7f3c2b1...",
  "account_type": "private",
  "tables_affected": {
    "user_identities": 1,
    "nip05_records": 1,
    "lnbits_wallets": 1
  },
  "total_deleted": 3,
  "rollback_available_until": "2025-01-18T12:00:00Z"
}
```

---

## 10. Implementation Phases

### Phase 1: Foundation (Week 1-2)

| Task                                         | Priority | Dependencies |
| -------------------------------------------- | -------- | ------------ |
| Create `admin_account_removal_log` table     | P0       | None         |
| Create `pending_deletion_requests` table     | P1       | None         |
| Implement `remove_user_account_by_nip05` RPC | P0       | Tables       |
| Implement `rollback_account_removal` RPC     | P1       | Tables       |
| Create platform admin config loader          | P0       | None         |
| Implement JWT admin context extraction       | P0       | None         |

### Phase 2: API Layer (Week 2-3)

| Task                                               | Priority | Dependencies  |
| -------------------------------------------------- | -------- | ------------- |
| Create `admin-account-control.ts` Netlify function | P0       | Phase 1       |
| Implement remove_account handler                   | P0       | RPC functions |
| Implement cleanup_orphans handler                  | P1       | RPC functions |
| Implement rollback handler                         | P1       | RPC functions |
| Add federation scope validation                    | P0       | Admin config  |
| Add rate limiting                                  | P1       | None          |

### Phase 3: UI Components (Week 3-4)

| Task                                    | Priority | Dependencies  |
| --------------------------------------- | -------- | ------------- |
| Create AdminAccountControlDashboard.tsx | P0       | API Layer     |
| Implement AdminAuthGuard HOC            | P0       | Admin context |
| Create OverviewTab with stats           | P1       | API Layer     |
| Create AccountsTab with search          | P0       | API Layer     |
| Create AccountRemovalModal              | P0       | API Layer     |
| Create OrphansTab (Platform Admin)      | P1       | API Layer     |
| Create AuditLogTab                      | P1       | API Layer     |
| Create RollbackConfirmationModal        | P1       | API Layer     |

### Phase 4: User Self-Service (Week 4-5)

| Task                                        | Priority | Dependencies              |
| ------------------------------------------- | -------- | ------------------------- |
| Add "Delete Account" to user settings       | P1       | Phase 1-3                 |
| Implement NIP-07 signed deletion request    | P1       | Nostr integration         |
| Create cooling-off period UI                | P1       | pending_deletion_requests |
| Implement admin queue for pending deletions | P2       | Phase 3                   |

### Phase 5: Automation & Monitoring (Week 5-6)

| Task                                  | Priority | Dependencies |
| ------------------------------------- | -------- | ------------ |
| Create orphan detection scheduled job | P2       | Phase 2      |
| Implement admin notification system   | P2       | Phase 3      |
| Add audit log export functionality    | P2       | Phase 3      |
| Create monitoring dashboard           | P2       | All phases   |

---

## 11. Security Considerations

### 11.1 Authentication Security

- **JWT Validation**: All requests must include valid JWT with admin claims
- **Token Expiry**: Admin tokens should have shorter expiry (15 minutes recommended)
- **Refresh Tokens**: Implement secure refresh token rotation for admin sessions
- **IP Binding**: Consider binding admin tokens to IP address for sensitive operations

### 11.2 Authorization Security

- **Principle of Least Privilege**: Federation admins can only access their federation
- **Role Hierarchy Enforcement**: Stewards cannot remove guardians; guardians cannot remove other guardians
- **Platform Admin Isolation**: Platform admin list stored in environment variables, not database
- **Audit Trail**: All actions logged with admin DUID, never plaintext identifiers

### 11.3 Data Protection

- **Backup Encryption**: Backup snapshots should be encrypted at rest
- **DUID-Only Storage**: No plaintext NIP-05 or npub stored in audit logs
- **IP/UA Hashing**: Request metadata hashed for security auditing without PII exposure
- **30-Day Retention**: Backup snapshots auto-deleted after rollback window expires

### 11.4 Operational Security

- **Confirmation Required**: All destructive actions require explicit confirmation
- **Dry-Run Mode**: Orphan cleanup supports dry-run to preview before execution
- **Rate Limiting**: Implement rate limits on admin endpoints (10 requests/minute)
- **Alerting**: Notify platform admins of unusual activity patterns

---

## 12. Testing Strategy

### 12.1 Unit Tests

```typescript
// tests/admin/account-control.test.ts

describe("Admin Account Control", () => {
  describe("Platform Admin Authorization", () => {
    it("should allow platform admin to remove any account");
    it("should allow platform admin to cleanup orphans");
    it("should allow platform admin to rollback any removal");
    it("should reject non-admin users");
  });

  describe("Federation Admin Authorization", () => {
    it("should allow guardian to remove steward/adult/offspring");
    it("should reject guardian removing another guardian");
    it("should allow steward to remove adult/offspring only");
    it("should reject steward removing steward/guardian");
    it("should reject cross-federation access");
  });

  describe("Account Removal", () => {
    it("should cascade delete all related records");
    it("should create backup snapshot when requested");
    it("should log removal with correct metadata");
    it("should handle orphan cleanup correctly");
  });

  describe("Rollback", () => {
    it("should restore all records from backup");
    it("should reject rollback after 30-day window");
    it("should reject rollback without backup");
    it("should update audit log on rollback");
  });
});
```

### 12.2 Integration Tests

- Test full removal flow from UI to database
- Test federation scope enforcement end-to-end
- Test orphan detection and cleanup workflow
- Test user-initiated deletion with cooling-off period

### 12.3 Security Tests

- Attempt cross-federation access (should fail)
- Attempt privilege escalation (steward → guardian actions)
- Attempt rollback without authorization
- Verify no plaintext PII in audit logs

---

## 13. Appendix

### 13.1 Environment Variables

```bash
# Platform Admin Configuration
PLATFORM_ADMIN_NPUBS="npub1admin1...,npub1admin2..."
PLATFORM_ADMIN_NIP05S="admin@satnam.pub,operator@satnam.pub"

# Security Settings
ADMIN_JWT_EXPIRY_SECONDS=900
ADMIN_RATE_LIMIT_PER_MINUTE=10
BACKUP_RETENTION_DAYS=30

# Feature Flags
ENABLE_USER_SELF_DELETE=true
ENABLE_ORPHAN_AUTO_CLEANUP=false
ENABLE_ADMIN_NOTIFICATIONS=true
```

### 13.2 Error Codes

| Code           | Message                            | Resolution                   |
| -------------- | ---------------------------------- | ---------------------------- |
| `AUTH_001`     | Missing authorization header       | Include Bearer token         |
| `AUTH_002`     | Invalid or expired token           | Re-authenticate              |
| `AUTH_003`     | Admin privileges required          | Contact platform admin       |
| `SCOPE_001`    | Not authorized for this federation | Use correct federation admin |
| `SCOPE_002`    | Insufficient role privileges       | Contact guardian             |
| `REMOVE_001`   | User not found                     | Verify NIP-05 identifier     |
| `REMOVE_002`   | Cannot remove guardian             | Platform admin required      |
| `REMOVE_003`   | Pending transactions exist         | Settle transactions first    |
| `ROLLBACK_001` | Rollback window expired            | Cannot recover               |
| `ROLLBACK_002` | No backup available                | Cannot recover               |
| `ROLLBACK_003` | Already rolled back                | No action needed             |

### 13.3 Glossary

| Term                   | Definition                                                   |
| ---------------------- | ------------------------------------------------------------ |
| **DUID**               | Deterministic User ID - SHA-256 hash of NIP-05 identifier    |
| **Platform Admin**     | System-wide administrator identified by environment variable |
| **Federation Admin**   | Guardian or Steward with scoped access to their federation   |
| **Orphan**             | NIP-05 record without corresponding user_identities entry    |
| **Rollback**           | Restoration of deleted account from backup snapshot          |
| **Cooling-off Period** | 7-day waiting period for user-initiated deletions            |
