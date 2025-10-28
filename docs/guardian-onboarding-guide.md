# Guardian Onboarding Guide
## Federated Signing with Shamir Secret Sharing (SSS)

**Version:** 1.0.0  
**Last Updated:** 2025-10-27  
**Audience:** Family Federation Guardians

---

## Table of Contents

1. [Introduction](#introduction)
2. [What is a Guardian?](#what-is-a-guardian)
3. [How Federated Signing Works](#how-federated-signing-works)
4. [Receiving Approval Requests](#receiving-approval-requests)
5. [Responding to Requests](#responding-to-requests)
6. [Threshold Signing Workflow](#threshold-signing-workflow)
7. [Security Best Practices](#security-best-practices)
8. [Troubleshooting](#troubleshooting)
9. [FAQ](#faq)

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

A **Guardian** is a trusted family member with elevated permissions to approve sensitive operations within a Family Federation. Guardians use **Shamir Secret Sharing (SSS)** to collectively sign important events without any single guardian having access to the complete private key.

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

## How Federated Signing Works

Federated signing uses **Shamir Secret Sharing (SSS)** to split a private key into multiple shares. A threshold number of guardians must provide their shares to reconstruct the key and sign an event.

### Example: 3-of-5 Threshold

- **Total Guardians:** 5
- **Threshold:** 3
- **Requirement:** At least 3 guardians must approve for the signing to complete

### Key Benefits

🔒 **No Single Point of Failure** - No individual guardian has the complete key  
🛡️ **Privacy-First** - Uses NIP-59 gift-wrapped messaging for all communications  
⚡ **Flexible Thresholds** - Supports 1-of-N to 7-of-7 configurations  
🔐 **Zero-Knowledge** - Private keys never exist in plaintext  

---

## Receiving Approval Requests

When a family member initiates a signing request, you'll receive a **NIP-59 gift-wrapped message** via Nostr.

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
    "tags": [["amount", "50000"], ["currency", "sats"]],
    "created_at": 1729900000
  }
}
```

### Message Fields

| Field | Description |
|-------|-------------|
| `requestId` | Unique identifier for this signing request |
| `familyId` | Your family federation identifier |
| `eventType` | Type of event (payment_request, key_rotation, etc.) |
| `threshold` | Number of guardian approvals required |
| `expiresAt` | Unix timestamp when request expires (typically 24 hours) |
| `requesterPubkey` | Public key of the family member who initiated the request |
| `eventTemplate` | The Nostr event to be signed |

### Where to Find Requests

1. **Nostr Client** - Check your DMs for gift-wrapped messages
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
│ 2. System Generates SSS Shares                              │
│    - Splits signing key into 5 shares                       │
│    - Encrypts each share for specific guardian             │
│    - Stores encrypted shares in database                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Guardians Receive NIP-59 Approval Requests               │
│    - Gift-wrapped messages sent to all 5 guardians         │
│    - Each message contains request details                  │
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
│ 6. SSS Reconstruction                                        │
│    - Combines 3 guardian shares                             │
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

| Time | Event |
|------|-------|
| T+0 min | Request initiated by family member |
| T+1 min | All guardians receive NIP-59 messages |
| T+15 min | Guardian 1 approves |
| T+30 min | Guardian 2 approves |
| T+45 min | Guardian 3 approves (threshold met!) |
| T+46 min | Event signed and broadcast |
| T+47 min | All guardians notified of completion |

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

**A:** Family federations can configure thresholds from 1-of-N to 7-of-7. Common configurations:
- **2-of-3** - Small families
- **3-of-5** - Medium families
- **5-of-7** - Large families or high-security requirements

### Q: What happens if a guardian is unavailable?

**A:** As long as the threshold is met, the signing can complete. For example, in a 3-of-5 configuration, only 3 guardians need to approve even if 2 are unavailable.

### Q: Can I change my approval after submitting?

**A:** No, approvals are final once submitted. Review carefully before approving.

### Q: How long do I have to respond?

**A:** Typically 24 hours, but this can vary. Check the `expiresAt` field in the request.

### Q: What if I lose access to my guardian credentials?

**A:** Contact your family federation administrator immediately. They can help with account recovery or reassigning guardian responsibilities.

### Q: Are my communications with other guardians private?

**A:** Yes! All guardian communications use NIP-59 gift-wrapped messaging for maximum privacy.

### Q: Can I see the history of past signing requests?

**A:** Yes, the Guardian Panel shows all past requests with their status (completed, failed, expired).

---

## Need Help?

If you have questions or need assistance:

1. **Check the FAQ** above
2. **Contact your family federation administrator**
3. **Visit the Satnam.pub documentation** at https://docs.satnam.pub
4. **Join the community** on Nostr (npub1satnam...)

---

**Thank you for being a guardian and protecting your family's digital sovereignty!** 🛡️

