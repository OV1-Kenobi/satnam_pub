# Onboarding Guides: Key Changes Reference

**Date**: December 1, 2025  
**Purpose**: Quick reference for all changes made to onboarding guides

---

## Before → After Changes

### Messaging Protocol

**BEFORE**: NIP-59 gift-wrapped messaging  
**AFTER**: NIP-17 encrypted messaging with Noise protocol

**Benefits Added**:

- ✅ Forward Secrecy (configurable key rotation)
- ✅ Perfect Privacy (only intended recipients decrypt)
- ✅ Replay Protection (prevents message replay)

**Where Updated**:

- Guardian guide: Lines 261, 270, 295-299, 313, 383-388, 586-592
- Steward guide: Lines 190, 192, 196-200, 447-455, 583-589

---

### Threshold Signing Protocol

**BEFORE**: Shamir Secret Sharing (SSS)  
**AFTER**: Bi-FROST (Byzantine-Fault-Tolerant FROST)

**Benefits Added**:

- ✅ Byzantine Fault Tolerance (detects malicious participants)
- ✅ Fault Tolerance Details (1-2 malicious participants tolerated)
- ✅ Stronger Security (resilient to compromised guardians)

**Where Updated**:

- Guardian guide: Lines 44, 248, 256, 266, 375-380, 409-416, 550-552
- Steward guide: Lines 256, 258, 271-276, 278-290, 607-615

---

## New Content Added

### Guardian Guide

**New Sections**:

- Byzantine Fault Tolerance explanation in Key Benefits
- Fault Tolerance details in Example: 3-of-5 Threshold
- Bi-FROST explanation in FAQ

**Enhanced Sections**:

- How Federated Signing Works (added Bi-FROST details)
- Receiving Approval Requests (added NIP-17 benefits)
- Threshold Signing Workflow (added Byzantine validation)

---

### Steward Guide

**New Sections**:

- Bi-FROST Signing Participation (complete section)
- Bi-FROST Threshold Configuration (with fault tolerance table)
- Bi-FROST FAQ question with malicious participant detection

**Enhanced Sections**:

- Steward Approval Workflow (NIP-17 messaging)
- Privacy & Encryption (Noise protocol benefits)
- Messaging & Communication (NIP-17 references)

---

## Terminology Changes

| Old Term              | New Term                       | Context                         |
| --------------------- | ------------------------------ | ------------------------------- |
| NIP-59                | NIP-17                         | Messaging protocol              |
| Gift-wrapped messages | Encrypted messages             | Message delivery                |
| SSS                   | Bi-FROST                       | Threshold signing               |
| Shamir Secret Sharing | Byzantine-Fault-Tolerant FROST | Cryptographic protocol          |
| (no mention)          | Noise protocol                 | Forward secrecy mechanism       |
| (no mention)          | Byzantine fault tolerance      | Malicious participant detection |

---

## FROST Threshold Configuration

**Documented in Both Guides**:

```
1-of-2  → Low security, tolerates 1 fault
2-of-3  → Medium security (RECOMMENDED), tolerates 1 fault
3-of-4  → High security, tolerates 1 fault
4-of-5  → Very high security, tolerates 2 faults
5-of-7  → Maximum security, tolerates 2 faults
```

---

## NFC Physical MFA

**Automatic Configuration**:

```
1-3 members   → 100,000 sats threshold
4-6 members   → 250,000 sats threshold
7+ members    → 500,000 sats threshold
```

---

## FAQ Enhancements

### Guardian Guide FAQ

**New/Updated Questions**:

- Q: What is Bi-FROST? (new)
- Q: Are my communications private? (updated with Noise protocol)
- Q: Can I change FROST threshold? (existing)

### Steward Guide FAQ

**New/Updated Questions**:

- Q: What is Bi-FROST? (new, with malicious participant detection)
- Q: Are my communications private? (updated with Noise protocol)
- Q: What if I disagree with another steward? (existing)

---

## Consistency Verification

✅ **Both guides use identical terminology**:

- NIP-17 (not NIP-59)
- Bi-FROST (not SSS)
- Noise protocol (for forward secrecy)
- Byzantine fault tolerance (for malicious detection)

✅ **Both guides reference same features**:

- FROST threshold ranges (1-of-2 to 5-of-7)
- NFC MFA thresholds (100k, 250k, 500k sats)
- Fault tolerance levels (1-2 malicious participants)

✅ **Both guides maintain**:

- Privacy-first architecture
- Zero-knowledge principles
- User-friendly language
- Comprehensive examples

---

## Files Modified

1. ✅ `docs/guardian-onboarding-guide.md` (v2.0.0, 620 lines)
2. ✅ `docs/steward-onboarding-guide.md` (v1.0.0, 631 lines)

## Supporting Documentation Created

1. ✅ `docs/ONBOARDING_GUIDES_UPDATE_SUMMARY.md`
2. ✅ `docs/ONBOARDING_GUIDES_VERIFICATION_CHECKLIST.md`
3. ✅ `docs/TASK_COMPLETION_SUMMARY.md`
4. ✅ `docs/ONBOARDING_GUIDES_CHANGES_REFERENCE.md` (this file)

---

## Status: ✅ COMPLETE

All onboarding guides have been updated to reflect Phase 4 production features with NIP-17 messaging and Bi-FROST threshold signing.
