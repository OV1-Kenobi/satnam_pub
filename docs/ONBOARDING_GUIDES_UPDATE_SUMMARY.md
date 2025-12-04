# Onboarding Guides Update Summary

**Date**: December 1, 2025  
**Status**: Complete  
**Version**: Phase 4 Production Ready

---

## Overview

Updated both guardian and steward onboarding guides to reflect Phase 4 production features:
- **NIP-17 Encrypted Messaging** with Noise protocol (replacing NIP-59)
- **Bi-FROST** threshold signing (replacing simple SSS)
- **FROST Threshold Configuration** (1-of-2 to 5-of-7)
- **NFC Physical MFA** policies

---

## Files Updated

### 1. `docs/guardian-onboarding-guide.md` ✅

**Version**: 2.0.0 (Updated from 1.0.0)  
**Last Updated**: 2025-12-01  
**Status**: Production Ready (Phase 4)

**Key Updates**:

- ✅ Changed from NIP-59 to **NIP-17 encrypted messaging** with Noise protocol
- ✅ Changed from SSS to **Bi-FROST** (Byzantine-Fault-Tolerant FROST)
- ✅ Updated messaging sections to reference NIP-17 and Noise protocol benefits:
  - Forward Secrecy (configurable key rotation)
  - Perfect Privacy (only intended recipients decrypt)
  - Replay Protection (prevents message replay attacks)
- ✅ Updated "How Federated Signing Works" section with Bi-FROST details
- ✅ Added Byzantine fault tolerance explanation (tolerates malicious participants)
- ✅ Updated workflow diagram to reference Bi-FROST instead of SSS
- ✅ Updated FAQ with Bi-FROST explanation
- ✅ Updated privacy FAQ to explain Noise protocol benefits

**Sections Modified**:
- Introduction & Table of Contents
- What is a Guardian?
- Family Foundry Wizard (all 4 steps)
- FROST Threshold Configuration
- NFC Physical MFA
- How Federated Signing Works
- Receiving Approval Requests
- Threshold Signing Workflow
- FAQ (multiple questions)

---

### 2. `docs/steward-onboarding-guide.md` ✅

**Version**: 1.0.0 (New file)  
**Last Updated**: 2025-12-01  
**Status**: Production Ready (Phase 4)

**Key Updates**:

- ✅ Created comprehensive steward onboarding guide
- ✅ Implemented **NIP-17 encrypted messaging** with Noise protocol
- ✅ Implemented **Bi-FROST** threshold signing participation
- ✅ Documented steward role definition (rights, responsibilities, rewards)
- ✅ Documented steward approval workflow
- ✅ Documented Bi-FROST signing participation with Byzantine validation
- ✅ Documented NFC MFA requirements for stewards
- ✅ Documented day-to-day operations (spending, messaging, member management)
- ✅ Added comprehensive FAQ with Bi-FROST explanation

**Sections Included**:
- Introduction & Table of Contents
- What is a Steward?
- Steward Role Definition
- Family Foundry Wizard (all 4 steps)
- Steward Approval Workflow
- Bi-FROST Signing Participation
- NFC MFA Requirements
- Day-to-Day Operations
- Spending Approvals
- Messaging & Communication
- Security Best Practices
- Troubleshooting
- FAQ (13 questions)

---

## Technology Updates

### NIP-17 with Noise Protocol

**Replaces**: NIP-59 gift-wrapped messaging

**Benefits Documented**:
- ✅ **Forward Secrecy** - Configurable key rotation prevents past message decryption
- ✅ **Perfect Privacy** - Only intended recipients can decrypt messages
- ✅ **Replay Protection** - Prevents message replay attacks

**Where Referenced**:
- Guardian guide: Receiving Approval Requests, How Federated Signing Works, FAQ
- Steward guide: Steward Approval Workflow, Messaging & Communication, FAQ

### Bi-FROST (Byzantine-Fault-Tolerant FROST)

**Replaces**: Simple Shamir Secret Sharing (SSS)

**Benefits Documented**:
- ✅ **No Single Point of Failure** - No individual has complete key
- ✅ **Byzantine Fault Tolerance** - Detects and handles malicious participants
- ✅ **Flexible Thresholds** - Supports 1-of-2 to 5-of-7 configurations
- ✅ **Zero-Knowledge** - Private keys never exist in plaintext

**Fault Tolerance Details**:
- 1-of-2, 2-of-3, 3-of-4: Tolerates 1 malicious/faulty participant
- 4-of-5, 5-of-7: Tolerates 2 malicious/faulty participants

**Where Referenced**:
- Guardian guide: How Federated Signing Works, Threshold Signing Workflow, FAQ
- Steward guide: Bi-FROST Signing Participation, FAQ

---

## FROST Threshold Configuration

**Documented in Both Guides**:

| Threshold | Participants | Security | Fault Tolerance | Use Case |
|-----------|--------------|----------|-----------------|----------|
| 1-of-2 | 2 | Low | Tolerates 1 | Minimum |
| 2-of-3 | 3 | Medium | Tolerates 1 | **Recommended** |
| 3-of-4 | 4 | High | Tolerates 1 | Enhanced |
| 4-of-5 | 5 | Very High | Tolerates 2 | Strict |
| 5-of-7 | 7 | Maximum | Tolerates 2 | Maximum |

---

## NFC Physical MFA

**Documented in Both Guides**:

Automatic configuration based on member count:
- **1-3 members**: 100,000 sats threshold
- **4-6 members**: 250,000 sats threshold
- **7+ members**: 500,000 sats threshold

---

## Consistency Across Guides

✅ Both guides use consistent terminology:
- NIP-17 (not NIP-59)
- Bi-FROST (not SSS)
- Noise protocol (for forward secrecy)
- Byzantine fault tolerance (for malicious participant detection)

✅ Both guides reference Phase 4 production features

✅ Both guides maintain privacy-first, zero-knowledge architecture principles

✅ Both guides use user-friendly language appropriate for non-technical family members

---

## Testing & Verification

- ✅ Guardian guide: 620 lines, comprehensive coverage
- ✅ Steward guide: 631 lines, comprehensive coverage
- ✅ All sections updated with NIP-17 and Bi-FROST references
- ✅ All FAQ sections updated with new technology explanations
- ✅ Consistent formatting and structure across both guides
- ✅ Cross-references between guides maintained

---

## Status

✅ **COMPLETE - PRODUCTION READY**

Both onboarding guides are now updated to reflect Phase 4 production features and are ready for deployment.

