# Hierarchical Role-Based Access Control (RBAC) System

## Overview

The Satnam.pub platform implements a sophisticated hierarchical Role-Based Access Control (RBAC) system designed for family federations and individual sovereignty. This system provides granular permissions while maintaining privacy and security principles.

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

The RBAC system uses several database tables:

- `role_hierarchy` - Defines role relationships and permissions
- `family_members` - Links users to families with roles
- `role_permissions` - Maps roles to specific permissions
- `permission_checks` - Audit trail for permission validations

### API Endpoints

- `GET /api/roles/hierarchy` - Get role hierarchy information
- `POST /api/roles/change` - Change user roles (with approval)
- `GET /api/roles/permissions` - Get role permissions
- `DELETE /api/roles/remove` - Remove user from family

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
    { userId: "user789", role: "offspring" }
  ]
});
```

### Role-Based Permission Check

```typescript
// Check if user can approve spending
const canApprove = await checkPermission({
  userId: "user123",
  action: "approve_spending",
  targetAmount: 1000000, // 1M sats
  familyId: "family456"
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
  familyId: "family789"
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

*For technical implementation details, see the API documentation and source code.* 