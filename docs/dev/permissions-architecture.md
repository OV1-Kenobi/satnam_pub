# Permissions Architecture - Developer Guide

**Version:** 1.0  
**Last Updated:** 2025-12-19

---

## Overview

This document describes the technical architecture of the Granular Nostr Event Signing Permissions system for developers.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Components                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ Permission   │ │ Member       │ │ Signing Approval Queue   │ │
│  │ Config Panel │ │ Override Mgr │ │                          │ │
│  └──────┬───────┘ └──────┬───────┘ └────────────┬─────────────┘ │
└─────────┼────────────────┼──────────────────────┼───────────────┘
          │                │                      │
          ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API Layer (Netlify Functions)                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ event-signing-permissions.ts                              │   │
│  │ - GET/POST /permissions/federation/{id}                   │   │
│  │ - POST /permissions/role, /permissions/override           │   │
│  │ - GET/POST /signing/approval-queue                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Service Layer                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ EventSigningPermissionService                             │   │
│  │ - canSign(memberDuid, eventType, context)                 │   │
│  │ - configureRolePermissions(role, permissions)             │   │
│  │ - grantMemberOverride(target, permissions, expiry)        │   │
│  │ - processApprovalRequest(requestId, decision)             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Database Layer (Supabase)                     │
│  ┌────────────────────┐ ┌────────────────────────────────────┐  │
│  │ event_signing_     │ │ member_signing_overrides           │  │
│  │ permissions        │ │ - member_duid, event_type          │  │
│  │ - federation_duid  │ │ - allowed, expires_at              │  │
│  │ - role, event_type │ │ - granted_by, reason               │  │
│  └────────────────────┘ └────────────────────────────────────┘  │
│  ┌────────────────────┐ ┌────────────────────────────────────┐  │
│  │ signing_approval_  │ │ permission_time_windows            │  │
│  │ requests           │ │ - member_duid, event_type          │  │
│  │ - requester_duid   │ │ - blocked_hours, days_of_week      │  │
│  │ - status, approver │ │                                    │  │
│  └────────────────────┘ └────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. EventSigningPermissionService

Location: `src/services/permissions/EventSigningPermissionService.ts`

```typescript
interface PermissionCheckResult {
  allowed: boolean;
  reason: string;
  requiresApproval?: boolean;
  approvalRequestId?: string;
}

class EventSigningPermissionService {
  async canSign(
    memberDuid: string,
    eventType: NostrEventType,
    context?: SigningContext
  ): Promise<PermissionCheckResult>;
  
  async configureRolePermissions(
    federationDuid: string,
    role: MasterContextRole,
    permissions: RolePermissionConfig,
    configuredBy: string
  ): Promise<void>;
  
  async grantMemberOverride(
    targetDuid: string,
    permissions: OverrideConfig,
    grantedBy: string
  ): Promise<void>;
}
```

### 2. Permission Check Flow

```
1. canSign() called with member DUID and event type
2. Check member overrides (highest priority)
3. Check time windows (block if in restricted period)
4. Check role permissions (from federation config)
5. Check daily limits (if applicable)
6. Return result with reason
```

### 3. Database Schema

See: `supabase/migrations/20250619_event_signing_permissions.sql`

Key tables:
- `event_signing_permissions` - Role-based permissions per federation
- `member_signing_overrides` - Individual member overrides
- `signing_approval_requests` - Pending approval queue
- `permission_time_windows` - Time-based restrictions
- `signing_audit_log` - Audit trail

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/permissions/federation/{id}` | Get federation permissions |
| POST | `/permissions/role` | Configure role permissions |
| POST | `/permissions/override` | Grant member override |
| DELETE | `/permissions/override/{id}` | Revoke override |
| GET | `/signing/approval-queue` | Get pending approvals |
| POST | `/signing/approval-queue/{id}` | Process approval |

---

## Security Considerations

1. **Server-side validation only** - Never trust client permission claims
2. **Role hierarchy enforcement** - Lower roles cannot grant higher permissions
3. **RLS policies** - Database enforces federation isolation
4. **Audit logging** - All changes logged with actor DUID
5. **Rate limiting** - Prevent abuse of permission checks

---

## Integration Points

- **Nostr Signing**: `SignerAdapterFactory` checks permissions before signing
- **Family Dashboard**: UI components for configuration
- **Audit System**: All changes logged to `signing_audit_log`

---

*For user documentation, see [User Guide](../user-guide/permissions.md)*

