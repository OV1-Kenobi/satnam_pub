# Guardian Onboarding Guide

## Federated Signing with FROST & NFC Physical MFA

**Version:** 2.0.0
**Last Updated:** 2025-12-01
**Audience:** Family Federation Guardians
**Status:** Production Ready (Phase 4)

---

## Table of Contents

1. [Introduction](#introduction)
2. [What is a Guardian?](#what-is-a-guardian)
3. [Family Foundry Wizard](#family-foundry-wizard)
4. [FROST Threshold Configuration](#frost-threshold-configuration)
5. [NFC Physical MFA](#nfc-physical-mfa)
6. [How Federated Signing Works](#how-federated-signing-works)
7. [Receiving Approval Requests](#receiving-approval-requests)
8. [Responding to Requests](#responding-to-requests)
9. [Threshold Signing Workflow](#threshold-signing-workflow)
10. [Security Best Practices](#security-best-practices)
11. [Troubleshooting](#troubleshooting)
12. [FAQ](#faq)

---

## Introduction

Welcome to the Satnam.pub Guardian Onboarding Guide! As a guardian in a Family Federation, you play a crucial role in protecting your family's digital sovereignty through multi-signature approval workflows.

This guide will help you understand:

- Your responsibilities as a guardian
- How to receive and respond to signing requests
- The threshold signing process
- Security best practices

---

## What is a Guardian?

A **Guardian** is a trusted family member with elevated permissions to approve sensitive operations within a Family Federation. Guardians use **Bi-FROST** (Byzantine-Fault-Tolerant FROST) to collectively sign important events without any single guardian having access to the complete private key.

### Guardian Responsibilities

✅ **Review signing requests** carefully before approving  
✅ **Respond promptly** to time-sensitive requests  
✅ **Maintain security** of your guardian credentials  
✅ **Communicate** with other guardians when needed  
✅ **Stay informed** about family federation activities

### Guardian Roles

In the Master Context hierarchy, guardians have the highest level of authority:

```
Private → Offspring → Adult → Steward → Guardian
```

---

## Family Foundry Wizard

As a guardian, you'll create your family federation using the **Family Foundry Wizard**, a 4-step process that sets up your family's governance structure, FROST threshold configuration, and NFC Physical MFA policies.

### Step 1: Charter (Family Foundation)

Define your family's identity and values:

- **Family Name** - Your family's official name
- **Family Motto** - A guiding principle or motto
- **Founding Date** - When your family federation is established
- **Mission Statement** - Your family's purpose and goals
- **Core Values** - Key principles your family lives by

**Guardian Role**: As the federation creator, you establish the family's foundational values and governance principles.

### Step 2: RBAC Setup (Role Hierarchy & FROST Threshold)

Configure your family's role hierarchy and select your FROST signing threshold:

**Role Definitions** (Master Context Hierarchy):

- **Guardian** - Highest authority, approves critical operations
- **Steward** - Day-to-day operations, routine approvals
- **Adult** - Full family member, limited spending authority
- **Offspring** - Junior family member, supervised access

**FROST Threshold Selection** (see [FROST Threshold Configuration](#frost-threshold-configuration) below)

### Step 3: Invite Peers

Invite trusted family members to join your federation:

- Enter each member's **Nostr public key (npub)**
- Assign their **role** in the family hierarchy
- Specify their **relationship** to the family

**Guardian Role**: You determine who has guardian authority and what roles other family members hold.

### Step 4: Review & Submit

Review all settings and create your federation:

- Verify charter information
- Confirm role assignments
- Review FROST threshold configuration
- Confirm NFC MFA policies
- Submit to create the federation

**Result**: Your family federation is created with:

- ✅ FROST threshold configuration active
- ✅ NFC MFA policies automatically configured
- ✅ Audit trail enabled
- ✅ All members notified via Nostr

---

## FROST Threshold Configuration

**FROST** (Flexible Round-Optimized Schnorr Threshold Signatures) is a cryptographic protocol that enables multi-signature operations. During Step 2 of the Family Foundry Wizard, you'll select your federation's FROST threshold.

### What is a FROST Threshold?

A FROST threshold specifies how many guardians must approve an operation for it to be executed. For example:

- **2-of-3**: 2 out of 3 guardians must approve
- **3-of-5**: 3 out of 5 guardians must approve
- **5-of-7**: 5 out of 7 guardians must approve

### Supported Configurations

| Threshold  | Participants | Security Level | Speed   | Use Case                  |
| ---------- | ------------ | -------------- | ------- | ------------------------- |
| **1-of-2** | 2            | Low            | Fast    | Minimum (fastest)         |
| **2-of-3** | 3            | Medium         | Normal  | **Recommended (default)** |
| **3-of-4** | 4            | High           | Slower  | Enhanced security         |
| **4-of-5** | 5            | Very High      | Slow    | Strict governance         |
| **5-of-7** | 7            | Maximum        | Slowest | Maximum security          |

### How to Select Your Threshold

1. **Open Family Foundry Wizard** → Step 2: RBAC Setup
2. **Scroll to "FROST Threshold Configuration"** section
3. **Click the dropdown menu** to see available options
4. **Select your threshold** based on your family's needs
5. **Review the security guidance** for your selection
6. **Continue to Step 3** to invite members

### Security Tradeoffs

**Lower Thresholds (1-of-2, 2-of-3)**

- ✅ Faster approvals
- ✅ More forgiving if members are unavailable
- ⚠️ Less security (fewer guardians required)
- **Best for**: Small families, low-value operations

**Higher Thresholds (4-of-5, 5-of-7)**

- ✅ Maximum security
- ✅ Requires consensus from most guardians
- ⚠️ Slower approvals
- ⚠️ More difficult if members are unavailable
- **Best for**: Large families, high-value operations, critical governance changes

**Recommended Default: 2-of-3**

- ✅ Balanced security and usability
- ✅ Suitable for most families
- ✅ Fast approvals while preventing single-guardian control
- ✅ Forgiving if one guardian is temporarily unavailable

### Validation Rules

When selecting your FROST threshold, the system enforces:

- ✅ Threshold must be between **1 and 5**
- ✅ Threshold cannot exceed **participant count**
- ✅ Minimum **2 participants** required
- ✅ Maximum **7 participants** supported
- ✅ Example: If you invite 3 members, threshold can be 1, 2, or 3 (not 4 or 5)

### Changing Your Threshold

After federation creation, changing your FROST threshold requires **guardian consensus** and is treated as a critical governance change. Contact your family federation administrator for threshold modification procedures.

---

## NFC Physical MFA

**NFC Physical MFA** (Near Field Communication Multi-Factor Authentication) adds a third layer of security using physical NFC cards (like Boltcard or Satscard) for high-value operations.

### Three-Layer Authentication

Your family federation uses three layers of authentication:

1. **Identity Layer** - Your Nostr identity (nsec or NIP-07 extension)
2. **Personhood Layer** - NFC physical card authentication
3. **Consensus Layer** - FROST threshold signature approval

### Automatic NFC MFA Policies

Based on your federation's member count, NFC MFA policies are automatically configured:

| Members | Amount Threshold | Policy                              |
| ------- | ---------------- | ----------------------------------- |
| 1-3     | 100,000 sats     | Required for operations > 100k sats |
| 4-6     | 250,000 sats     | Required for operations > 250k sats |
| 7+      | 500,000 sats     | Required for operations > 500k sats |

### How NFC MFA Works

When a high-value operation is initiated:

1. **Operation Submitted** - Family member initiates a transaction or governance change
2. **Amount Checked** - System checks if amount exceeds NFC MFA threshold
3. **NFC Required** - If threshold exceeded, NFC card authentication required
4. **Physical Tap** - Guardian taps their NFC card to a compatible device
5. **FROST Signing** - After NFC verification, FROST threshold signing proceeds
6. **Operation Completed** - Transaction or change is executed

### Guardian NFC Card Setup

During federation creation, guardians should:

1. **Obtain an NFC Card** - Boltcard, Satscard, or compatible NFC hardware token
2. **Register Card** - Add your NFC card to your guardian profile
3. **Test Authentication** - Verify NFC card works with your device
4. **Keep Card Secure** - Store in a safe location, similar to a hardware wallet

### Viewing Your NFC MFA Policy

After federation creation, you can view your NFC MFA policy:

1. **Open Satnam.pub Dashboard**
2. **Navigate to Family Federation Settings**
3. **View "NFC MFA Configuration"** section
4. **See your amount threshold** and policy details

---

## How Federated Signing Works

Federated signing uses **Bi-FROST (Byzantine-Fault-Tolerant FROST)** to enable multi-signature operations. Bi-FROST allows a threshold number of guardians to collectively sign events without any single guardian having access to the complete private key, while providing Byzantine fault tolerance for robustness against malicious participants.

### Example: 3-of-5 Threshold

- **Total Guardians:** 5
- **Threshold:** 3 (configured during Step 2 of Family Foundry Wizard)
- **Requirement:** At least 3 guardians must approve for the signing to complete
- **Security:** No individual guardian can sign alone; consensus required
- **Fault Tolerance:** System tolerates up to 2 offline guardians, or 1 malicious guardian (Byzantine fault tolerance requires 3F+1 participants for F faults)

### Key Benefits

🔒 **No Single Point of Failure** - No individual guardian has the complete key
🛡️ **Privacy-First** - Uses NIP-17 encrypted messaging with Noise protocol for all communications
⚡ **Flexible Thresholds** - Supports 1-of-2 to 5-of-7 configurations (user-configurable)
🔐 **Zero-Knowledge** - Private keys never exist in plaintext
🛡️ **Physical MFA** - NFC card authentication for high-value operations
📊 **Audit Trail** - All operations logged for transparency
🛡️ **Byzantine Fault Tolerance** - Detects and handles malicious participants

---

## Receiving Approval Requests

When a family member initiates a signing request, you'll receive a **NIP-17 encrypted message** via Nostr with **Noise protocol** encryption for configurable forward secrecy.

### Message Format

```json
{
  "type": "guardian_approval_request",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "familyId": "family-federation-123",
  "eventType": "payment_request",
  "threshold": 3,
  "expiresAt": 1730000000000,
  "requesterPubkey": "npub1...",
  "eventTemplate": {
    "kind": 1,
    "content": "Payment request for family expenses",
    "tags": [
      ["amount", "50000"],
      ["currency", "sats"]
    ],
    "created_at": 1729900000
  }
}
```

**Note**: Messages are encrypted using NIP-17 with Noise protocol, providing:

- ✅ **Forward Secrecy** - Configurable key rotation prevents past message decryption
- ✅ **Perfect Privacy** - Only intended recipients can decrypt messages
- ✅ **Replay Protection** - Prevents message replay attacks

### Message Fields

| Field             | Description                                               |
| ----------------- | --------------------------------------------------------- |
| `requestId`       | Unique identifier for this signing request                |
| `familyId`        | Your family federation identifier                         |
| `eventType`       | Type of event (payment_request, key_rotation, etc.)       |
| `threshold`       | Number of guardian approvals required                     |
| `expiresAt`       | Unix timestamp when request expires (typically 24 hours)  |
| `requesterPubkey` | Public key of the family member who initiated the request |
| `eventTemplate`   | The Nostr event to be signed                              |

### Where to Find Requests

1. **Nostr Client** - Check your DMs for NIP-17 encrypted messages
2. **Satnam.pub Dashboard** - View pending requests in the Guardian Panel
3. **Mobile Notifications** - If you have Amber or another NIP-55 signer configured

---

## Responding to Requests

### Step 1: Review the Request

Before approving, carefully review:

✅ **Event Type** - What operation is being requested?  
✅ **Event Content** - What are the details?  
✅ **Requester** - Who initiated this request?  
✅ **Expiration** - How much time do you have to respond?  
✅ **Threshold** - How many other guardians need to approve?

### Step 2: Verify Authenticity

🔍 **Check the requester's public key** - Is this a known family member?  
🔍 **Verify the event details** - Does this match expected family activity?  
🔍 **Confirm with other guardians** - If unsure, communicate via secure channels

### Step 3: Submit Your Approval

If you approve the request:

1. **Open the Guardian Panel** in Satnam.pub
2. **Select the pending request** from the list
3. **Click "Approve"** to submit your signature
4. **Confirm** the action with your NIP-07 extension or NIP-05/password

Your approval will be recorded, and you'll receive a confirmation message.

### Step 4: Wait for Threshold

Once the threshold is met (e.g., 3 out of 5 guardians approve):

1. **The event is automatically signed** using SSS reconstruction
2. **The signed event is broadcast** to Nostr relays
3. **All participating guardians are notified** of completion

---

## Threshold Signing Workflow

### Complete Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Family Member Initiates Signing Request                  │
│    - Creates event template                                 │
│    - Specifies threshold (e.g., 3-of-5)                     │
│    - Sets expiration time (24 hours)                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. System Generates Bi-FROST Shares                         │
│    - Splits signing key into 5 shares                       │
│    - Encrypts each share for specific guardian             │
│    - Stores encrypted shares with Byzantine validation      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Guardians Receive NIP-17 Approval Requests               │
│    - Encrypted messages sent to all 5 guardians            │
│    - Noise protocol provides forward secrecy               │
│    - Guardians have 24 hours to respond                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Guardians Review and Approve                             │
│    - Guardian 1: Approves ✅                                │
│    - Guardian 2: Approves ✅                                │
│    - Guardian 3: Approves ✅                                │
│    - Guardian 4: No response ⏸️                             │
│    - Guardian 5: No response ⏸️                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Threshold Met (3 approvals received)                     │
│    - System collects shares from approving guardians       │
│    - Validates threshold requirement                        │
│    - Proceeds to reconstruction                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Bi-FROST Reconstruction                                  │
│    - Combines 3 guardian shares                             │
│    - Validates Byzantine fault tolerance                    │
│    - Reconstructs signing key (temporary, in-memory)        │
│    - Signs the event template                               │
│    - IMMEDIATELY wipes key from memory                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Event Broadcasting                                        │
│    - Verifies event signature                               │
│    - Broadcasts to Nostr relays                             │
│    - Records event ID in database                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Guardian Notifications                                    │
│    - All 5 guardians receive completion notice             │
│    - Notification includes event ID and timestamp           │
│    - Request status updated to "completed"                  │
└─────────────────────────────────────────────────────────────┘
```

### Timeline Example

| Time     | Event                                 |
| -------- | ------------------------------------- |
| T+0 min  | Request initiated by family member    |
| T+1 min  | All guardians receive NIP-17 messages |
| T+15 min | Guardian 1 approves                   |
| T+30 min | Guardian 2 approves                   |
| T+45 min | Guardian 3 approves (threshold met!)  |
| T+46 min | Event signed and broadcast            |
| T+47 min | All guardians notified of completion  |

---

## Security Best Practices

### 🔐 Protect Your Guardian Credentials

✅ **Use NIP-07 browser extension** (preferred) or NIP-05/password  
✅ **Enable 2FA** if using password authentication  
✅ **Never share your nsec** with anyone  
✅ **Use hardware wallets** for high-value operations  
✅ **Keep backup of your credentials** in a secure location

### 🛡️ Verify Before Approving

✅ **Check the requester's identity** - Verify it's a known family member  
✅ **Review event details carefully** - Understand what you're approving  
✅ **Confirm with other guardians** - If something seems unusual  
✅ **Watch for phishing attempts** - Be cautious of unexpected requests

### ⏰ Respond Promptly

✅ **Check for requests daily** - Don't let important requests expire  
✅ **Set up notifications** - Enable alerts for new approval requests  
✅ **Communicate delays** - Let other guardians know if you'll be unavailable

### 🚨 Report Suspicious Activity

If you notice anything suspicious:

1. **Do NOT approve the request**
2. **Contact other guardians immediately**
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

- Threshold not yet met (need more guardian approvals)
- Request expired before threshold was reached
- Network connectivity issues

**Solutions:**

- Check the Guardian Panel for request status
- Verify how many approvals have been received
- Contact other guardians to coordinate

### Problem: I accidentally approved the wrong request

**Solutions:**

- Contact family federation administrator immediately
- If threshold not yet met, request can still be cancelled
- If already completed, may need to initiate a reversal request

### Problem: The request expired before I could respond

**Solutions:**

- Requester can initiate a new signing request
- Consider enabling notifications to respond faster
- Coordinate with other guardians for time-sensitive requests

---

## FAQ

### Q: How many guardians are required?

**A:** Family federations can configure thresholds from 1-of-2 to 5-of-7. Common configurations:

- **1-of-2** - Minimum (fastest, lowest security)
- **2-of-3** - Small families (recommended default)
- **3-of-4** - Medium families with enhanced security
- **4-of-5** - Large families with strict governance
- **5-of-7** - Maximum security (slowest, requires most consensus)

### Q: How do I select my FROST threshold?

**A:** During Step 2 (RBAC Setup) of the Family Foundry Wizard:

1. Scroll to "FROST Threshold Configuration"
2. Click the dropdown menu
3. Select your threshold (1-of-2 to 5-of-7)
4. Review the security guidance
5. Continue to Step 3

The system validates that your threshold doesn't exceed your participant count.

### Q: What is Bi-FROST?

**A:** Bi-FROST is a Byzantine-fault-tolerant version of FROST that provides additional security guarantees. It detects and handles malicious or faulty participants, ensuring that even if some guardians act dishonestly, the signing process remains secure and correct. This makes your family federation more resilient to compromised guardian accounts.

### Q: What is NFC Physical MFA?

**A:** NFC Physical MFA uses a physical NFC card (like Boltcard or Satscard) to add an extra layer of security for high-value operations. When an operation exceeds your federation's amount threshold, you must tap your NFC card to authenticate before the FROST signing proceeds.

### Q: What are the NFC MFA amount thresholds?

**A:** Thresholds are automatically configured based on member count:

- **1-3 members**: 100,000 sats
- **4-6 members**: 250,000 sats
- **7+ members**: 500,000 sats

Operations below the threshold don't require NFC authentication.

### Q: What happens if a guardian is unavailable?

**A:** As long as the threshold is met, the signing can complete. For example, in a 3-of-5 configuration, only 3 guardians need to approve even if 2 are unavailable.

### Q: Can I change my approval after submitting?

**A:** No, approvals are final once submitted. Review carefully before approving.

### Q: How long do I have to respond?

**A:** Typically 24 hours, but this can vary. Check the `expiresAt` field in the request.

### Q: What if I lose access to my guardian credentials?

**A:** Contact your family federation administrator immediately. They can help with account recovery or reassigning guardian responsibilities.

### Q: Are my communications with other guardians private?

**A:** Yes! All guardian communications use NIP-17 encrypted messaging with Noise protocol for maximum privacy. Noise protocol provides:

- **Forward Secrecy** - Configurable key rotation ensures past messages remain private even if current keys are compromised
- **Perfect Privacy** - Only intended recipients can decrypt messages
- **Replay Protection** - Prevents attackers from replaying old messages

Your NFC card data is also encrypted and never transmitted in plaintext.

### Q: Can I see the history of past signing requests?

**A:** Yes, the Guardian Panel shows all past requests with their status (completed, failed, expired). You can also view the federation audit log for all operations.

### Q: Can I change my FROST threshold after federation creation?

**A:** Changing your FROST threshold is treated as a critical governance change and requires guardian consensus. Contact your family federation administrator for threshold modification procedures.

### Q: What if I don't have an NFC card yet?

**A:** You can still create your federation and participate in FROST signing. NFC MFA is only required for operations exceeding your federation's amount threshold. You can register your NFC card later in your guardian profile settings.

---

## Need Help?

If you have questions or need assistance:

1. **Check the FAQ** above
2. **Contact your family federation administrator**
3. **Visit the Satnam.pub documentation** at https://docs.satnam.pub
4. **Join the community** on Nostr (npub1satnam...)

---

**Thank you for being a guardian and protecting your family's digital sovereignty!** 🛡️
