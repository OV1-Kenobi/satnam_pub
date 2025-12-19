# User Acceptance Testing Scenarios

**Date:** 2025-12-19  
**Version:** 1.0  
**Status:** Ready for UAT

---

## Overview

This document provides test scenarios for User Acceptance Testing of the Granular Nostr Event Signing Permissions system.

---

## Scenario 1: Guardian Configures Role Permissions

**Actor:** Family Guardian  
**Precondition:** Guardian is logged into Family Finances Dashboard

### Steps:
1. Navigate to "Signing Permissions" tab
2. Select "Adult" role from role dropdown
3. Enable "Content Posting" permission category
4. Set daily limit to 50 posts
5. Click "Save Configuration"

### Expected Result:
- Success toast notification appears
- Permission matrix updates to show Adult can post
- Audit log records the configuration change

---

## Scenario 2: Steward Grants Member Override

**Actor:** Family Steward  
**Precondition:** Steward has manage permissions

### Steps:
1. Navigate to Member Override Manager
2. Search for specific family member
3. Click "Add Override"
4. Select "Gift Wrap Messaging" permission
5. Set expiration to 7 days
6. Enter reason: "Business trip communication"
7. Click "Grant Override"

### Expected Result:
- Override appears in member's override list
- Member can now sign gift-wrapped messages
- Override shows expiration countdown

---

## Scenario 3: Offspring Requests Payment Approval

**Actor:** Offspring (Minor)  
**Precondition:** Payment permissions require approval

### Steps:
1. Offspring attempts to send 1000 sats payment
2. System detects approval requirement
3. Request appears in Guardian's approval queue

### Expected Result:
- Offspring sees "Pending Approval" status
- Guardian receives notification
- Approval queue shows request with details

---

## Scenario 4: Guardian Approves Signing Request

**Actor:** Family Guardian  
**Precondition:** Pending approval exists in queue

### Steps:
1. Navigate to Signing Approval Queue
2. Review pending request details
3. Click "Approve" button
4. Confirm approval in modal

### Expected Result:
- Request status changes to "Approved"
- Original requester can now sign
- Audit log records approval with Guardian DUID

---

## Scenario 5: View Permission Matrix

**Actor:** Any family member  
**Precondition:** User is authenticated

### Steps:
1. Navigate to Permission Matrix View
2. Review permission grid by role
3. Click on specific cell for details
4. Filter by permission category

### Expected Result:
- Matrix displays all roles and event types
- Color coding indicates permission levels
- Detail popup shows approval requirements

---

## Scenario 6: Offspring Time-Restricted Access

**Actor:** Family Guardian  
**Precondition:** Guardian wants to set homework hours

### Steps:
1. Navigate to Time Window Configurator
2. Select Offspring role
3. Set "Content Posting" blocked 3-6 PM weekdays
4. Save configuration

### Expected Result:
- Offspring cannot post during blocked hours
- Clear error message shown during blocked time
- Access resumes automatically after window ends

---

## Scenario 7: View Audit Log

**Actor:** Guardian or Steward  
**Precondition:** Permission activities have occurred

### Steps:
1. Navigate to Audit Log Viewer
2. Filter by date range (last 7 days)
3. Filter by action type (grants only)
4. Export filtered results

### Expected Result:
- Audit entries display with timestamps
- Filters work correctly
- Export generates downloadable file

---

## Scenario 8: Revoke Member Override

**Actor:** Guardian  
**Precondition:** Active override exists

### Steps:
1. Find member with active override
2. Click "Revoke" on the override
3. Enter revocation reason
4. Confirm revocation

### Expected Result:
- Override status changes to "Revoked"
- Member loses the elevated permission
- Audit log records revocation with reason

---

## Scenario 9: Cross-Federation Delegation

**Actor:** Guardian of Alliance Member Federation  
**Precondition:** Federation alliance exists

### Steps:
1. Navigate to Cross-Federation Delegations
2. Create new delegation to allied federation
3. Select delegated event types
4. Set usage limits
5. Confirm delegation

### Expected Result:
- Delegation appears in both federations
- Allied members can use delegated permissions
- Usage counter tracks delegation usage

---

## Scenario 10: Emergency Override by Guardian

**Actor:** Guardian  
**Precondition:** Normal permissions insufficient

### Steps:
1. Identify urgent signing need
2. Use Guardian Emergency Override
3. Complete signing operation
4. Review audit trail

### Expected Result:
- Override allows immediate signing
- Audit log captures emergency usage
- Override requires explicit justification

---

## UAT Sign-Off Criteria

- [ ] All 10 scenarios completed successfully
- [ ] No blocking issues identified
- [ ] Performance acceptable to users
- [ ] Error messages clear and actionable
- [ ] Mobile responsiveness verified

---

*Last Updated: 2025-12-19*

