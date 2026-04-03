# Hierarchical Role-Based Access Control (RBAC) System

> **Start here.** This document is the authoritative entry point for the RBAC and
> permissions systems. All other documents and source files are subordinate to it.

## Document Map

| What you need                                                                         | Go to                                                                                                                         |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Role descriptions, hierarchy rules, best practices                                    | This file (you are here)                                                                                                      |
| Service APIs, DB schema, API endpoint table                                           | [`docs/dev/permissions-architecture.md`](dev/permissions-architecture.md)                                                     |
| UI walkthrough for Guardians and members                                              | [`docs/user-guide/permissions.md`](user-guide/permissions.md)                                                                 |
| **Type authority** — `FederationRole`, `ROLE_HIERARCHY` levels, permission interfaces | [`src/types/permissions.ts`](../src/types/permissions.ts)                                                                     |
| **Behavioral authority** — spending limits, promotion/demotion matrices               | [`src/lib/family/role-manager.ts`](../src/lib/family/role-manager.ts)                                                         |
| HTTP handlers for role changes and permission checks                                  | [`api/family/role-management.js`](../api/family/role-management.js)                                                           |
| DB tables and RLS policies                                                            | [`supabase/rls_policies.sql`](../supabase/rls_policies.sql)                                                                   |
| Agent rules enforcement                                                               | [`.augment/rules/Subagent - RBAC Permissions Reviewer.md`](../.augment/rules/Subagent%20-%20RBAC%20Permissions%20Reviewer.md) |

---

## Overview

The Satnam.pub platform implements a hierarchical Role-Based Access Control (RBAC) system
designed for family federations and individual sovereignty. It provides granular Nostr event
signing permissions while maintaining privacy and zero-knowledge security principles.

## Role Hierarchy

### Role Types

1. **Private** - Autonomous users not part of any Family Federation
2. **Offspring** - Family members under adult supervision
3. **Adult** - Family members with spending authority
4. **Steward** - Family administrators with creation/control authority
5. **Guardian** - Family protectors with oversight authority

### Hierarchy Structure

```
Guardian (Level 4)
├── Steward (Level 3)
│   ├── Adult (Level 2)
│   │   └── Offspring (Level 1)
│   └── Adult (Level 2)
└── Steward (Level 3)
    └── Adult (Level 2)
        └── Offspring (Level 1)

Private (No Hierarchy)
```

## Role Permissions

### Private Role

- **Full autonomy** over funds and custody
- **No RBAC restrictions**
- **Not tracked** in family memberships
- **Complete privacy** and sovereignty

### Offspring Role

- **Controlled by Adults** and Stewards
- **Spending limits** and approval requirements
- **Educational access** and learning tracking
- **Privacy protection** with guardian oversight

### Adult Role

- **Spending authority** within family limits
- **Offspring supervision** capabilities
- **Family coordination** participation
- **Privacy controls** with family transparency

### Steward Role

- **Family creation** and administration
- **Adult management** and oversight
- **Treasury control** and allocation
- **Policy enforcement** and monitoring

### Guardian Role

- **Steward oversight** and removal authority
- **Family protection** and emergency controls
- **Privacy enforcement** and compliance
- **Recovery procedures** and backup management

## Implementation Details

### Database Schema

The RBAC system uses these actual tables (see `docs/dev/permissions-architecture.md` for
full column listings):

- `family_federations` — Federation records; referenced by `federation_duid`
- `family_members` — Links users to federations with their assigned role
- `event_signing_permissions` — Role-based Nostr event signing rules per federation
- `member_signing_overrides` — Per-member permission overrides with optional expiry
- `signing_approval_requests` — Pending approval queue for restricted event types
- `permission_time_windows` — Time-based restrictions (blocked hours, days of week)
- `signing_audit_log` — Immutable audit trail for all permission changes

### API Endpoints

| Method | Path                                           | Description                                   |
| ------ | ---------------------------------------------- | --------------------------------------------- |
| GET    | `/api/family/role-management/hierarchy`        | Get role hierarchy for current user           |
| POST   | `/api/family/role-management/change-role`      | Promote or demote a member                    |
| POST   | `/api/family/role-management/check-permission` | Check if user can perform action              |
| POST   | `/api/family/role-management/remove-user`      | Remove member from federation (Guardian only) |
| GET    | `/permissions/federation/{id}`                 | Get federation signing permissions            |
| POST   | `/permissions/role`                            | Configure role signing permissions            |
| POST   | `/permissions/override`                        | Grant member signing override                 |
| DELETE | `/permissions/override/{id}`                   | Revoke member override                        |
| GET    | `/signing/approval-queue`                      | List pending approval requests                |
| POST   | `/signing/approval-queue/{id}`                 | Approve or reject a signing request           |

### Security Features

- **Role validation** on all operations
- **Permission inheritance** through hierarchy
- **Audit logging** for all role changes
- **Approval workflows** for sensitive operations
- **Emergency override** capabilities for guardians

## Migration from Legacy Roles

The system includes automatic migration from legacy roles:

- `parent` → `adult`
- `child` → `offspring`
- `guardian` → `steward` (with new guardian role added)

## Privacy Considerations

- **Role information** is encrypted in transit
- **Permission checks** are performed client-side when possible
- **Audit logs** are user-controlled and locally stored
- **Role changes** require appropriate approvals
- **Emergency procedures** maintain family security

## Usage Examples

### Creating a Family Federation

```typescript
// Create family with steward role
const family = await createFamily({
  name: "Nakamoto Family",
  stewardId: "user123",
  initialMembers: [
    { userId: "user456", role: "adult" },
    { userId: "user789", role: "offspring" },
  ],
});
```

### Role-Based Permission Check

```typescript
// Check if user can approve spending
const canApprove = await checkPermission({
  userId: "user123",
  action: "approve_spending",
  targetAmount: 1000000, // 1M sats
  familyId: "family456",
});
```

### Emergency Guardian Override

```typescript
// Guardian emergency action
const emergencyResult = await guardianEmergencyAction({
  guardianId: "guardian123",
  action: "remove_steward",
  targetUserId: "steward456",
  reason: "Policy violation",
  familyId: "family789",
});
```

## Best Practices

1. **Start with Private** - New users begin as private for maximum sovereignty
2. **Gradual Role Assignment** - Assign roles based on demonstrated responsibility
3. **Regular Reviews** - Periodically review role assignments and permissions
4. **Emergency Planning** - Have guardian recovery procedures in place
5. **Privacy First** - Always consider privacy implications of role changes

## Future Enhancements

- **Dynamic Role Permissions** - Context-aware permission adjustments
- **Temporary Role Delegation** - Time-limited role assignments
- **Multi-Family Roles** - Users with roles in multiple families
- **Advanced Approval Workflows** - Complex multi-step approval processes
- **Role Analytics** - Privacy-preserving role usage insights

---

_For technical implementation details, see the API documentation and source code._
