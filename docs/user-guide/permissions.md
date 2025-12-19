# Permissions User Guide

**Version:** 1.0  
**Last Updated:** 2025-12-19

---

## Introduction

The Granular Nostr Event Signing Permissions system gives family federations fine-grained control over who can sign different types of Nostr events. This guide explains how to use the permission features.

---

## Understanding Roles

Your family federation has five roles with different default permissions:

| Role | Description | Default Permissions |
|------|-------------|---------------------|
| **Guardian** | Family administrator | Full access to all event types |
| **Steward** | Trusted adult manager | Most event types, some restrictions |
| **Adult** | Adult family member | Standard posting and messaging |
| **Offspring** | Minor family member | Limited, requires approval for payments |
| **Private** | Privacy-focused member | Minimal, opt-in permissions |

---

## Viewing Your Permissions

### Permission Matrix

1. Navigate to **Family Finances Dashboard**
2. Click the **Signing Permissions** tab
3. View the **Permission Matrix** showing all roles

The matrix uses color coding:
- 🟢 **Green**: Allowed
- 🟡 **Yellow**: Requires approval
- 🔴 **Red**: Blocked
- ⚪ **Gray**: Not applicable

### Your Personal Permissions

Click **My Permissions** to see exactly what you can sign based on your role and any personal overrides.

---

## For Guardians: Configuring Permissions

### Setting Role Permissions

1. Go to **Permission Configuration Panel**
2. Select a role (e.g., "Adult")
3. For each event category:
   - Toggle **Allowed/Blocked**
   - Set **Daily Limits** if needed
   - Enable **Approval Required** for sensitive actions
4. Click **Save Configuration**

### Creating Member Overrides

Sometimes a specific member needs different permissions than their role:

1. Go to **Member Override Manager**
2. Search for the family member
3. Click **Add Override**
4. Select the permission to grant or restrict
5. Set an **expiration date** (recommended)
6. Enter a **reason** for the override
7. Click **Grant Override**

### Setting Time Windows

Restrict when certain permissions are active:

1. Go to **Time Window Configurator**
2. Select the role or member
3. Choose the permission category
4. Set **blocked hours** (e.g., 3-6 PM for homework time)
5. Select **days of week**
6. Save the time window

---

## For Members: Requesting Approval

If you try to sign something that requires approval:

1. You'll see a **"Requires Approval"** message
2. Your request goes to the **Approval Queue**
3. A Guardian or Steward will review it
4. You'll be notified when approved or rejected

### Checking Request Status

1. Go to **My Signing Requests**
2. View pending, approved, and rejected requests
3. See reasons for any rejections

---

## Approval Queue (Guardians/Stewards)

### Reviewing Requests

1. Navigate to **Signing Approval Queue**
2. Review pending requests showing:
   - Who is requesting
   - What they want to sign
   - When they requested it
3. Click **Approve** or **Reject**
4. Add a note if rejecting

### Bulk Actions

For multiple similar requests:
1. Select multiple requests using checkboxes
2. Click **Bulk Approve** or **Bulk Reject**
3. Confirm the action

---

## Audit Log

All permission changes are logged for transparency:

1. Go to **Audit Log Viewer**
2. Filter by:
   - Date range
   - Action type (grant, revoke, approve, reject)
   - Actor (who made the change)
3. Export logs for record-keeping

---

## Common Questions

**Q: Why can't I post right now?**  
A: Check if there's a time window restriction. Your Guardian may have set homework hours or quiet times.

**Q: How long do overrides last?**  
A: Overrides can be permanent or have an expiration date. Check with your Guardian.

**Q: Can I see who approved my request?**  
A: Yes, the approval history shows who approved and when.

**Q: What happens when my override expires?**  
A: You return to your role's default permissions automatically.

---

## Getting Help

If you have questions about your permissions:
1. Check the **Permission Matrix** for your role
2. Ask your family **Guardian** or **Steward**
3. Review the **Audit Log** for recent changes

---

*For technical documentation, see [Developer Guide](../dev/permissions-architecture.md)*

