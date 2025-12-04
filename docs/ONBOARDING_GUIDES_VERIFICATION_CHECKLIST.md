# Onboarding Guides Pre-Implementation Checklist

**Date**: December 1, 2025
**Task**: Plan NIP-17 & Bi-FROST updates in onboarding guides
**Purpose**: Implementation plan for guide updates (line numbers are targets, not verified post-hoc)

> **Note**: This document serves as a pre-implementation checklist for planned updates.
> It does NOT contain verification evidence (diffs, excerpts, or timestamps) of completed work.
> Refer to the actual guide files and git history for verification of implemented changes.

---

## Guardian Onboarding Guide (`docs/guardian-onboarding-guide.md`)

### NIP-17 Updates (Planned)

- [ ] Line 3: Subtitle updated to reference FROST & NFC Physical MFA
- [ ] Line 261: Key Benefits section references NIP-17 with Noise protocol
- [ ] Line 270: "Receiving Approval Requests" section references NIP-17
- [ ] Line 295-299: Added note about NIP-17 with Noise protocol benefits
- [ ] Line 313: "Where to Find Requests" references NIP-17 encrypted messages
- [ ] Line 383-388: Workflow diagram updated to reference NIP-17
- [ ] Line 586-592: FAQ updated with Noise protocol benefits (forward secrecy, perfect privacy, replay protection)

### Bi-FROST Updates (Planned)

- [ ] Line 44: Changed from SSS to Bi-FROST in introduction
- [ ] Line 248: "How Federated Signing Works" section references Bi-FROST
- [ ] Line 256: Added Byzantine fault tolerance explanation
- [ ] Line 266: Key Benefits section includes Byzantine Fault Tolerance
- [ ] Line 375-380: Workflow diagram updated to reference Bi-FROST shares
- [ ] Line 409-416: "SSS Reconstruction" step renamed to "Bi-FROST Reconstruction"
- [ ] Line 550-552: FAQ updated with Bi-FROST explanation

### FROST Threshold Configuration (Planned)

- [ ] Documented 1-of-2 to 5-of-7 range
- [ ] Included security levels for each threshold
- [ ] Marked 2-of-3 as recommended default
- [ ] Explained fault tolerance for each configuration

### NFC Physical MFA (Planned)

- [ ] Documented automatic policy configuration
- [ ] Included member count thresholds
- [ ] Explained when NFC MFA is required

### Privacy-First Architecture (Planned)

- [ ] Zero-knowledge principles maintained
- [ ] Audit trail documentation included
- [ ] RLS policy references included
- [ ] User-friendly language for non-technical guardians

---

## Steward Onboarding Guide (`docs/steward-onboarding-guide.md`)

### NIP-17 Updates (Planned)

- [ ] Line 190: "Receiving Approval Requests" section references NIP-17
- [ ] Line 192: "Where to Find Requests" references NIP-17 encrypted messages
- [ ] Line 196-200: Added note about NIP-17 with Noise protocol benefits
- [ ] Line 447-455: "Privacy & Encryption" section updated to reference NIP-17
- [ ] Line 583-589: FAQ updated with Noise protocol benefits

### Bi-FROST Updates (Planned)

- [ ] Line 256: Section renamed from "FROST Signing Participation" to "Bi-FROST Signing Participation"
- [ ] Line 258: Introduction references Bi-FROST
- [ ] Line 271-276: Role description includes Byzantine validation step
- [ ] Line 278-290: Bi-FROST Threshold Configuration table with fault tolerance column
- [ ] Line 290: Note explains Byzantine fault tolerance
- [ ] Line 607-615: FAQ added with Bi-FROST explanation and malicious participant detection

### FROST Threshold Configuration (Planned)

- [ ] Documented 1-of-2 to 5-of-7 range
- [ ] Included fault tolerance column in table
- [ ] Explained Byzantine fault tolerance concept
- [ ] Marked 2-of-3 as recommended default

### NFC Physical MFA (Planned)

- [ ] Documented automatic policy configuration
- [ ] Included member count thresholds
- [ ] Explained when NFC MFA is required for stewards

### Privacy-First Architecture (Planned)

- [ ] Zero-knowledge principles maintained
- [ ] Audit trail documentation included
- [ ] User-friendly language for non-technical stewards
- [ ] Comprehensive FAQ with steward-specific questions

---

## Cross-Guide Consistency (Planned)

### Terminology Consistency

- [ ] Both guides use "NIP-17" (not NIP-59)
- [ ] Both guides use "Bi-FROST" (not SSS)
- [ ] Both guides reference "Noise protocol"
- [ ] Both guides explain "Byzantine fault tolerance"

### Feature Consistency

- [ ] FROST threshold ranges match (1-of-2 to 5-of-7)
- [ ] NFC MFA thresholds match (100k, 250k, 500k sats)
- [ ] Fault tolerance explanations match
- [ ] Privacy benefits explanations match

### Structure Consistency

- [ ] Both guides have similar section organization
- [ ] Both guides include comprehensive FAQ sections
- [ ] Both guides reference Phase 4 production features
- [ ] Both guides maintain user-friendly language

---

## Documentation Quality Targets

### Guardian Guide

- [ ] Version: 2.0.0 (updated from 1.0.0)
- [ ] Last Updated: 2025-12-01
- [ ] Status: Production Ready (Phase 4)
- [ ] Total Lines: ~620
- [ ] All sections updated with new technology

### Steward Guide

- [ ] Version: 1.0.0 (new file)
- [ ] Last Updated: 2025-12-01
- [ ] Status: Production Ready (Phase 4)
- [ ] Total Lines: ~631
- [ ] Comprehensive coverage of steward role

### Supporting Documentation

- [ ] Create ONBOARDING_GUIDES_UPDATE_SUMMARY.md

---

## Implementation Status

⏳ **PRE-IMPLEMENTATION CHECKLIST**

This checklist outlines planned updates for both onboarding guides:

- NIP-17 encrypted messaging with Noise protocol
- Bi-FROST threshold signing with Byzantine fault tolerance
- FROST threshold configuration (1-of-2 to 5-of-7)
- NFC Physical MFA policies
- Privacy-first, zero-knowledge architecture

**To verify completion**: Check git history and actual file contents against this plan.
