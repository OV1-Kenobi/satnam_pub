# Permissions System Migration Guide

**Version:** 1.0  
**Last Updated:** 2025-12-19

---

## Overview

This guide covers migrating existing federations to the Granular Nostr Event Signing Permissions system.

---

## Pre-Migration Checklist

- [ ] Backup existing federation data
- [ ] Review current role assignments
- [ ] Plan permission configuration for each role
- [ ] Schedule migration during low-activity period
- [ ] Notify federation members of upcoming changes

---

## Migration Steps

### Step 1: Database Migration

Run the permissions schema migration:

```sql
-- Execute in Supabase SQL Editor
\i supabase/migrations/20250619_event_signing_permissions.sql
```

This creates:
- `event_signing_permissions` table
- `member_signing_overrides` table
- `signing_approval_requests` table
- `permission_time_windows` table
- `signing_audit_log` table
- Required indexes and RLS policies

### Step 2: Initialize Default Permissions

For each existing federation, initialize default role permissions:

```typescript
import { EventSigningPermissionService } from './services/permissions';

async function initializeFederationPermissions(federationDuid: string) {
  const service = new EventSigningPermissionService();
  
  // Initialize with sensible defaults
  await service.initializeDefaultPermissions(federationDuid);
}
```

Default permission matrix:

| Event Type | Guardian | Steward | Adult | Offspring | Private |
|------------|----------|---------|-------|-----------|---------|
| Content (kind 1) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Reactions | ✅ | ✅ | ✅ | ✅ | ❌ |
| DMs (NIP-04) | ✅ | ✅ | ✅ | 🔶 | ❌ |
| Gift Wrap (NIP-59) | ✅ | ✅ | ✅ | 🔶 | ❌ |
| Zaps | ✅ | ✅ | ✅ | 🔶 | ❌ |
| Profile Updates | ✅ | ✅ | ✅ | 🔶 | ❌ |
| Relay Lists | ✅ | ✅ | ❌ | ❌ | ❌ |
| App-Specific | ✅ | ✅ | ❌ | ❌ | ❌ |

Legend: ✅ Allowed, 🔶 Requires Approval, ❌ Blocked

### Step 3: Migrate Existing Overrides

If you have existing member-specific permissions:

```typescript
async function migrateExistingOverrides(federationDuid: string) {
  // Query existing custom permissions
  const existingOverrides = await getExistingCustomPermissions(federationDuid);
  
  for (const override of existingOverrides) {
    await service.grantMemberOverride(
      override.memberDuid,
      {
        eventType: override.eventType,
        allowed: override.allowed,
        expiresAt: null, // Permanent unless specified
        reason: 'Migrated from legacy system'
      },
      'SYSTEM_MIGRATION'
    );
  }
}
```

### Step 4: Update UI Components

Ensure the new permission UI components are deployed:

1. `PermissionConfigurationPanel` - For guardians
2. `MemberOverrideManager` - For managing overrides
3. `SigningApprovalQueue` - For approval workflow
4. `PermissionMatrixView` - For viewing permissions
5. `AuditLogViewer` - For audit trail

### Step 5: Verify Migration

Run verification checks:

```typescript
async function verifyMigration(federationDuid: string) {
  const service = new EventSigningPermissionService();
  
  // Check all roles have permissions
  const roles = ['guardian', 'steward', 'adult', 'offspring', 'private'];
  for (const role of roles) {
    const perms = await service.getRolePermissions(federationDuid, role);
    console.log(`${role}: ${perms.length} permissions configured`);
  }
  
  // Check RLS policies work
  const testResult = await service.canSign(testMemberDuid, 'kind:1', {});
  console.log('Permission check working:', testResult.allowed !== undefined);
}
```

---

## Rollback Procedure

If issues occur, rollback with:

```sql
-- Disable new permission checks (feature flag)
UPDATE feature_flags SET enabled = false WHERE flag = 'granular_permissions';

-- Optionally drop new tables (data loss warning)
-- DROP TABLE IF EXISTS event_signing_permissions CASCADE;
-- DROP TABLE IF EXISTS member_signing_overrides CASCADE;
-- etc.
```

---

## Post-Migration Tasks

1. **Monitor audit logs** for unexpected permission denials
2. **Gather feedback** from federation members
3. **Adjust defaults** based on usage patterns
4. **Document** any federation-specific configurations

---

## Support

For migration issues:
1. Check `signing_audit_log` for error details
2. Verify RLS policies with `SELECT * FROM pg_policies`
3. Test permission checks with service methods

---

*Last Updated: 2025-12-19*

