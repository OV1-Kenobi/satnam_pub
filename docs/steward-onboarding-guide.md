# Steward Onboarding Guide

## Day-to-Day Family Federation Operations

**Version:** 1.0.0  
**Last Updated:** 2025-12-01  
**Audience:** Family Federation Stewards  
**Status:** Production Ready (Phase 4)

---

## Table of Contents

1. [Introduction](#introduction)
2. [What is a Steward?](#what-is-a-steward)
3. [Steward Role Definition](#steward-role-definition)
4. [Family Foundry Wizard](#family-foundry-wizard)
5. [Steward Approval Workflow](#steward-approval-workflow)
6. [FROST Signing Participation](#frost-signing-participation)
7. [NFC MFA Requirements](#nfc-mfa-requirements)
8. [Day-to-Day Operations](#day-to-day-operations)
9. [Spending Approvals](#spending-approvals)
10. [Messaging & Communication](#messaging--communication)
11. [Security Best Practices](#security-best-practices)
12. [Troubleshooting](#troubleshooting)
13. [FAQ](#faq)

---

## Introduction

Welcome to the Satnam.pub Steward Onboarding Guide! As a steward in a Family Federation, you play a vital role in managing day-to-day operations while maintaining the family's security and governance principles.

This guide will help you understand:

- Your responsibilities as a steward
- How to participate in approval workflows
- How to manage spending and messaging operations
- Security best practices for steward operations

---

## What is a Steward?

A **Steward** is a trusted family member responsible for managing day-to-day operations within a Family Federation. Stewards have elevated permissions to approve routine operations, manage spending, and facilitate family communications.

### Steward Responsibilities

✅ **Approve routine operations** - Spending, messaging, and routine governance  
✅ **Manage family spending** - Review and approve transactions within limits  
✅ **Facilitate communications** - Coordinate with family members and guardians  
✅ **Maintain security** - Protect steward credentials and NFC cards  
✅ **Monitor operations** - Track family federation activities  
✅ **Escalate issues** - Report concerns to guardians when needed

### Steward Authority Level

In the Master Context hierarchy, stewards have the second-highest level of authority:

```
Private → Offspring → Adult → Steward → Guardian
```

Stewards have authority over:

- ✅ Day-to-day spending (within limits)
- ✅ Routine messaging and communications
- ✅ Member invitations and onboarding
- ✅ Standard operational approvals

Stewards do NOT have authority over:

- ❌ Critical governance changes (requires guardian consensus)
- ❌ Key rotation or recovery (requires guardian consensus)
- ❌ Federation dissolution (requires guardian consensus)
- ❌ Role hierarchy modifications (requires guardian consensus)

---

## Steward Role Definition

### Rights (Permissions)

As a steward, you have the right to:

- **Approve Spending** - Authorize transactions up to your spending limit
- **Send Messages** - Communicate with family members via Nostr
- **Invite Members** - Add new family members to the federation
- **View Operations** - Access audit logs and operation history
- **Manage Approvals** - Review and approve routine requests
- **Access Dashboard** - View family federation status and metrics

### Responsibilities (Duties)

As a steward, you are responsible for:

- **Careful Review** - Thoroughly review all requests before approving
- **Timely Response** - Respond to approval requests promptly
- **Security Maintenance** - Keep your credentials and NFC card secure
- **Communication** - Coordinate with other stewards and guardians
- **Compliance** - Follow family federation policies and procedures
- **Documentation** - Maintain records of approvals and decisions

### Rewards (Benefits)

As a steward, you receive:

- **Operational Authority** - Make day-to-day decisions for the family
- **Spending Privileges** - Access to family funds within your limit
- **Communication Access** - Direct messaging with family members
- **Information Access** - Full visibility into family operations
- **Recognition** - Acknowledged role in family governance
- **Flexibility** - Ability to delegate routine tasks to adults

---

## Family Foundry Wizard

As a steward, you'll be invited to join your family federation through the **Family Foundry Wizard**. Here's what to expect:

### Step 1: Charter (Family Foundation)

The guardian creates your family's identity and values:

- Family name and motto
- Founding date and mission statement
- Core family values

**Your Role**: Review and understand your family's foundational principles.

### Step 2: RBAC Setup (Role Hierarchy & FROST Threshold)

The guardian configures role definitions and selects the FROST threshold:

- **Role Definitions** - Guardian, Steward, Adult, Offspring
- **FROST Threshold** - How many guardians must approve critical operations
- **Steward Permissions** - Your specific rights and responsibilities

**Your Role**: Understand your steward role and the FROST threshold that governs critical operations.

### Step 3: Invite Peers

The guardian invites family members, including you:

- Your **Nostr public key (npub)** is added
- Your **role** is set to "Steward"
- Your **relationship** to the family is specified

**Your Role**: Accept the invitation and set up your steward profile.

### Step 4: Review & Submit

The guardian reviews all settings and creates the federation:

- Charter information confirmed
- Role assignments verified
- FROST threshold confirmed
- NFC MFA policies configured

**Your Role**: Receive notification that the federation is active and ready for operations.

---

## Steward Approval Workflow

As a steward, you'll receive approval requests for routine operations. Here's how the workflow works:

### Request Types

**Spending Approvals**

- Transaction requests from family members
- Require steward threshold approval
- Subject to NFC MFA if amount exceeds threshold

**Messaging Approvals**

- Communication requests requiring steward authorization
- Typically for sensitive family communications
- May require NFC MFA for high-priority messages

**Operational Approvals**

- Routine governance operations
- Member invitations or role changes
- Standard federation maintenance

### Receiving Approval Requests

You'll receive approval requests via **NIP-17 encrypted messages** on Nostr with **Noise protocol** encryption:

1. **Nostr Client** - Check your DMs for NIP-17 encrypted messages
2. **Satnam.pub Dashboard** - View pending requests in the Steward Panel
3. **Mobile Notifications** - If you have Amber or another NIP-55 signer configured

**Note**: Messages are encrypted using NIP-17 with Noise protocol, providing:

- ✅ **Forward Secrecy** - Configurable key rotation prevents past message decryption
- ✅ **Perfect Privacy** - Only intended recipients can decrypt messages
- ✅ **Replay Protection** - Prevents message replay attacks

### Request Format

```json
{
  "type": "steward_approval_request",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "familyId": "family-federation-123",
  "operationType": "spending_approval",
  "amount": 50000,
  "currency": "sats",
  "requesterPubkey": "npub1...",
  "threshold": 2,
  "expiresAt": 1730000000000,
  "details": {
    "description": "Groceries and household supplies",
    "recipient": "merchant_address",
    "timestamp": 1729900000
  }
}
```

### Reviewing Requests

Before approving, carefully review:

✅ **Operation Type** - What is being requested?  
✅ **Amount** - How much is being spent?  
✅ **Requester** - Who initiated this request?  
✅ **Details** - What are the specifics?  
✅ **Expiration** - How much time do you have?  
✅ **Threshold** - How many stewards need to approve?

### Submitting Your Approval

1. **Open the Steward Panel** in Satnam.pub
2. **Select the pending request** from the list
3. **Review the details** carefully
4. **Click "Approve"** to submit your approval
5. **Confirm** with your NIP-07 extension or NIP-05/password
6. **Provide NFC authentication** if required (for high-value operations)

Your approval will be recorded, and you'll receive a confirmation message.

### Threshold Met

Once the steward threshold is met (e.g., 2 out of 3 stewards approve):

1. **The operation is authorized**
2. **FROST signing may be initiated** (if guardian approval also needed)
3. **All participating stewards are notified** of completion
4. **Operation proceeds** (spending, messaging, etc.)

---

## Bi-FROST Signing Participation

As a steward, you may participate in Bi-FROST threshold signing for critical operations that require both steward AND guardian approval.

### When Bi-FROST Signing is Required

Bi-FROST signing is required for:

- **Critical Governance Changes** - Federation modifications requiring guardian consensus
- **High-Value Operations** - Spending exceeding NFC MFA thresholds
- **Key Rotation** - Updating federation signing keys
- **Emergency Recovery** - Activating recovery procedures

### Your Role in Bi-FROST Signing

1. **Receive Bi-FROST Request** - Guardian initiates Bi-FROST signing session
2. **Review Operation** - Understand what is being signed
3. **Provide Your Share** - Submit your cryptographic share
4. **Byzantine Validation** - System validates your share against malicious participants
5. **Await Threshold** - Wait for other guardians/stewards to provide shares
6. **Operation Completes** - Once threshold met and Byzantine validation passes, operation is signed and executed

### Bi-FROST Threshold Configuration

Your federation's Bi-FROST threshold is configured during Step 2 of the Family Foundry Wizard:

| Threshold | Participants | Security  | Fault Tolerance | Use Case        |
| --------- | ------------ | --------- | --------------- | --------------- |
| 1-of-2    | 2            | Low       | Tolerates 1     | Minimum         |
| 2-of-3    | 3            | Medium    | Tolerates 1     | **Recommended** |
| 3-of-4    | 4            | High      | Tolerates 1     | Enhanced        |
| 4-of-5    | 5            | Very High | Tolerates 2     | Strict          |
| 5-of-7    | 7            | Maximum   | Tolerates 2     | Maximum         |

**Note**: As a steward, you participate in Bi-FROST signing only for operations that require both steward and guardian approval. Routine steward operations don't require Bi-FROST. Byzantine fault tolerance means the system can detect and handle malicious or faulty participants.

---

## NFC MFA Requirements

**NFC Physical MFA** (Near Field Communication Multi-Factor Authentication) adds an extra layer of security for high-value operations.

### When NFC MFA is Required

NFC MFA is required when:

- **Amount Exceeds Threshold** - Operation amount > federation's NFC MFA threshold
- **Critical Operations** - Governance changes or key modifications
- **High-Priority Messaging** - Sensitive family communications

### NFC MFA Thresholds

Based on your federation's member count:

| Members | Amount Threshold | Policy                              |
| ------- | ---------------- | ----------------------------------- |
| 1-3     | 100,000 sats     | Required for operations > 100k sats |
| 4-6     | 250,000 sats     | Required for operations > 250k sats |
| 7+      | 500,000 sats     | Required for operations > 500k sats |

### NFC Card Setup

To participate as a steward with NFC MFA:

1. **Obtain an NFC Card** - Boltcard, Satscard, or compatible NFC hardware token
2. **Register Card** - Add your NFC card to your steward profile
3. **Test Authentication** - Verify NFC card works with your device
4. **Keep Card Secure** - Store in a safe location, similar to a hardware wallet

### Using Your NFC Card

When NFC MFA is required:

1. **Receive Approval Request** - Operation requiring NFC authentication
2. **Review Details** - Understand what you're approving
3. **Tap NFC Card** - Hold your NFC card to a compatible device
4. **Verify Authentication** - Confirm NFC card was read successfully
5. **Submit Approval** - Complete the approval process
6. **Operation Proceeds** - After NFC verification, operation is executed

---

## Day-to-Day Operations

### Spending Approvals

As a steward, you approve spending requests from family members:

**Process**:

1. Family member submits spending request
2. You receive approval notification
3. You review the request details
4. You approve or reject the request
5. If threshold met, spending is authorized

**Spending Limits**:

- Stewards have spending authority up to their configured limit
- Amounts exceeding the limit require guardian approval
- NFC MFA required for amounts exceeding the federation's threshold

### Messaging & Communication

As a steward, you can:

- **Send Messages** - Communicate with family members via Nostr
- **Approve Messages** - Authorize sensitive family communications
- **Coordinate Operations** - Communicate with other stewards and guardians
- **Receive Notifications** - Get alerts for important family events

All communications use **NIP-59 gift-wrapped messaging** for privacy.

### Member Management

As a steward, you can:

- **Invite Members** - Add new family members to the federation
- **View Members** - See all current family members and their roles
- **Monitor Activity** - Track member operations and approvals
- **Report Issues** - Escalate concerns to guardians

### Audit Trail Access

You have access to the federation's audit trail:

- **View All Operations** - See all family federation activities
- **Filter by Type** - Spending, messaging, governance, etc.
- **Filter by Member** - See activities by specific family members
- **Export Reports** - Generate reports for record-keeping

---

## Spending Approvals

### Spending Request Process

1. **Family Member Initiates** - Submits spending request with details
2. **You Receive Request** - Notification in Steward Panel
3. **You Review Details** - Amount, recipient, description, etc.
4. **You Approve/Reject** - Submit your decision
5. **Threshold Checked** - System verifies if threshold is met
6. **Operation Authorized** - If threshold met, spending is approved
7. **Notification Sent** - All participants notified of result

### Spending Limits

Your federation configures spending limits:

- **Per-Transaction Limit** - Maximum amount per single transaction
- **Daily Limit** - Maximum total spending per day
- **Weekly Limit** - Maximum total spending per week
- **Monthly Limit** - Maximum total spending per month

Requests exceeding limits require guardian approval.

### NFC MFA for High-Value Spending

For spending exceeding your federation's NFC MFA threshold:

1. **Spending Request Submitted** - Amount exceeds threshold
2. **NFC Authentication Required** - System requests NFC verification
3. **Tap NFC Card** - Provide physical authentication
4. **Steward Approval** - Submit your approval
5. **FROST Signing** - If guardian approval also needed, FROST signing proceeds
6. **Spending Authorized** - Operation is executed

---

## Messaging & Communication

### Sending Messages

As a steward, you can send messages to family members:

1. **Open Messaging Interface** - In Satnam.pub Dashboard
2. **Select Recipient** - Choose family member to message
3. **Compose Message** - Write your message
4. **Send** - Message is encrypted and sent via Nostr
5. **Confirmation** - Receive delivery confirmation

### Approving Messages

For sensitive communications, you may need to approve messages:

1. **Receive Message Request** - Notification in Steward Panel
2. **Review Message** - Read the proposed message
3. **Approve/Reject** - Submit your decision
4. **Threshold Checked** - Verify if threshold is met
5. **Message Sent** - If approved, message is delivered

### Privacy & Encryption

All steward communications use:

- **NIP-17 Encrypted Messaging** - End-to-end encrypted with Noise protocol
- **Nostr Protocol** - Decentralized messaging
- **Forward Secrecy** - Configurable key rotation prevents past message decryption
- **Zero-Knowledge** - No plaintext stored on servers
- **Audit Trail** - All communications logged for compliance

---

## Security Best Practices

### 🔐 Protect Your Steward Credentials

✅ **Use NIP-07 browser extension** (preferred) or NIP-05/password  
✅ **Enable 2FA** if using password authentication  
✅ **Never share your nsec** with anyone  
✅ **Keep backup of your credentials** in a secure location  
✅ **Use hardware wallets** for high-value operations

### 🛡️ Protect Your NFC Card

✅ **Store in a secure location** - Similar to a hardware wallet  
✅ **Keep separate from credentials** - Don't store with nsec or passwords  
✅ **Enable card protection** - Use PIN or biometric if available  
✅ **Monitor for tampering** - Check card regularly for signs of tampering  
✅ **Report loss immediately** - Contact administrator if card is lost

### ✅ Verify Before Approving

✅ **Check the requester's identity** - Verify it's a known family member  
✅ **Review operation details** - Understand what you're approving  
✅ **Confirm with other stewards** - If something seems unusual  
✅ **Watch for phishing attempts** - Be cautious of unexpected requests

### ⏰ Respond Promptly

✅ **Check for requests daily** - Don't let important requests expire  
✅ **Set up notifications** - Enable alerts for new approval requests  
✅ **Communicate delays** - Let other stewards know if you'll be unavailable

### 🚨 Report Suspicious Activity

If you notice anything suspicious:

1. **Do NOT approve the request**
2. **Contact other stewards immediately**
3. **Report to family federation administrator**
4. **Document the incident** for future reference

---

## Troubleshooting

### Problem: I didn't receive the approval request

**Solutions:**

- Check your Nostr client's DM inbox
- Verify your relay connections (wss://relay.satnam.pub)
- Check if the request expired before you saw it
- Ensure your NIP-07 extension is connected

### Problem: I approved but nothing happened

**Possible Causes:**

- Threshold not yet met (need more steward approvals)
- Request expired before threshold was reached
- Network connectivity issues

**Solutions:**

- Check the Steward Panel for request status
- Verify how many approvals have been received
- Contact other stewards to coordinate

### Problem: I accidentally approved the wrong request

**Solutions:**

- Contact family federation administrator immediately
- If threshold not yet met, request can still be cancelled
- If already completed, may need to initiate a reversal request

### Problem: My NFC card isn't working

**Solutions:**

- Verify NFC is enabled on your device
- Try tapping card at different angles
- Check if card battery is depleted (for active cards)
- Re-register card in your steward profile
- Contact administrator if problem persists

### Problem: I don't have an NFC card yet

**Solutions:**

- You can still approve routine operations
- NFC MFA only required for high-value operations
- Order an NFC card and register it when received
- Contact administrator for card recommendations

---

## FAQ

### Q: What's the difference between a steward and a guardian?

**A:** Guardians have the highest authority and approve critical governance changes. Stewards manage day-to-day operations and routine approvals. Guardians configure the FROST threshold; stewards participate in approvals within that threshold.

### Q: Can I approve spending without NFC authentication?

**A:** Yes, for spending below your federation's NFC MFA threshold. NFC authentication is only required for high-value operations exceeding the threshold.

### Q: What happens if I'm unavailable?

**A:** As long as the steward threshold is met, operations can proceed without your approval. For example, in a 2-of-3 steward configuration, only 2 stewards need to approve even if 1 is unavailable.

### Q: Can I change my approval after submitting?

**A:** No, approvals are final once submitted. Review carefully before approving.

### Q: How long do I have to respond to requests?

**A:** Typically 24 hours, but this can vary. Check the `expiresAt` field in the request.

### Q: What if I lose access to my steward credentials?

**A:** Contact your family federation administrator immediately. They can help with account recovery or reassigning steward responsibilities.

### Q: Are my communications with other stewards private?

**A:** Yes! All steward communications use NIP-17 encrypted messaging with Noise protocol for maximum privacy. Noise protocol provides:

- **Forward Secrecy** - Configurable key rotation ensures past messages remain private even if current keys are compromised
- **Perfect Privacy** - Only intended recipients can decrypt messages
- **Replay Protection** - Prevents attackers from replaying old messages

Your NFC card data is also encrypted and never transmitted in plaintext.

### Q: Can I see the history of past approvals?

**A:** Yes, the Steward Panel shows all past requests with their status (completed, failed, expired). You can also view the federation audit log for all operations.

### Q: What's my spending limit?

**A:** Your spending limit is configured by the guardians during federation setup. Check your steward profile in the Satnam.pub Dashboard to see your current limit.

### Q: Can I invite new family members?

**A:** Yes, as a steward you can invite new family members. However, assigning them to the guardian role requires guardian approval.

### Q: What if I disagree with another steward's approval?

**A:** If you believe an approval was made in error, contact the other steward and the family federation administrator. They can review the operation and take corrective action if needed.

### Q: What is Bi-FROST and how does it protect my family?

**A:** Bi-FROST is a Byzantine-fault-tolerant threshold signing protocol that detects and handles malicious or faulty participants. This means:

- **Malicious Guardian Detection** - If a guardian tries to sign something dishonest, Bi-FROST detects it
- **Fault Tolerance** - The system continues working even if some guardians are compromised
- **Stronger Security** - Your family federation is more resilient to attacks

For example, in a 3-of-5 Bi-FROST configuration, the system can tolerate 1 malicious guardian while still ensuring correct signing.

---

## Need Help?

If you have questions or need assistance:

1. **Check the FAQ** above
2. **Contact your family federation administrator**
3. **Visit the Satnam.pub documentation** at https://docs.satnam.pub
4. **Join the community** on Nostr

---

**Thank you for being a steward and helping your family thrive!** 🛡️
