# NIP-PNS (Private Note Storage) Integration Planning

This directory contains comprehensive planning documentation for integrating NIP-PNS (kind 1080 private notes) with Noise Protocol forward secrecy into Satnam.

## Document Guide

### 1. **Private_Note_Storage_Planning.md** (Foundation)
**Purpose**: Strategic analysis of NIP-PNS integration into Satnam.

**Contents**:
- NIP-PNS specification overview (key derivation, event structure, publishing/reading flows)
- Value proposition for Satnam users
- Alignment with existing architecture (ClientSessionVault, secureNsecManager, gift-wrapped messaging)
- Phased integration roadmap (Phases 0–5)
- Risks and recommendations

**Audience**: Product managers, architects, security reviewers

**Read this first if**: You're new to NIP-PNS and want to understand why it matters for Satnam.

---

### 2. **Noise_PNS_Integration_Plan.md** (Technical Specification)
**Purpose**: Detailed technical plan for integrating Noise Protocol forward secrecy with NIP-PNS.

**Contents**:
- Executive summary introducing "Standard FS" and "Hardened FS" tiers
- Security architecture and threat model
- Key management strategy (including hardware MFA tier)
- Encryption layer design (write/read flows)
- Ephemeral vs. Everlasting notes
- Interoperability considerations
- Step-by-step implementation plan (8 phases)
- Risk analysis and testing strategy
- Open questions

**Audience**: Engineers, security architects, implementation leads

**Read this if**: You're planning to implement Noise-FS or need technical details.

---

### 3. **Noise_PNS_Review_and_Use_Cases.md** (Comprehensive Review)
**Purpose**: Detailed review of the integration plan with use cases and controlled sharing design.

**Contents**:
- **Part 1**: 7 technical gaps with improvement suggestions
- **Part 2**: Concrete use cases for 7 Satnam user personas
- **Part 3**: Controlled sharing design exploration (3 options)
- **Part 4**: Suggested edits to main plan
- **Part 5**: 7 open questions requiring user input

**Audience**: Product managers, architects, security reviewers, implementation leads

**Read this if**: You want to understand real-world use cases or review technical gaps.

---

### 4. **SECURITY_TIERS_COMPARISON.md** (Decision Framework)
**Purpose**: Detailed comparison of Standard FS vs. Hardened FS security tiers.

**Contents**:
- Executive comparison table (Standard FS, Hardened FS, Standard PNS)
- Detailed threat model analysis (4 threat scenarios)
- Use case mapping (which tier for which data)
- User journey and upgrade path
- Implementation roadmap (Phase 1 vs. Phase 2)
- Decision framework and recommendations
- Open questions for implementation

**Audience**: Product managers, security architects, decision-makers

**Read this if**: You need to decide which tier to implement first or understand security trade-offs.

---

### 5. **REVIEW_SUMMARY.md** (Executive Summary)
**Purpose**: High-level summary of review findings and next steps.

**Contents**:
- Document ecosystem overview
- Critical findings (7 technical gaps, use case validation, sharing design)
- Recommended next steps (immediate, Phase 1, Phase 2+)
- Success criteria
- Key takeaways

**Audience**: Project managers, decision-makers, implementation leads

**Read this if**: You want a quick overview of the review and next steps.

---

### 6. **NIP_PNS_Decision_Brief.md** (Stakeholder Brief)
**Purpose**: Concise, non-technical overview for stakeholders.

**Contents**:
- What is NIP-PNS and why it matters
- Key benefits and risks
- Next steps and timeline

**Audience**: Non-technical stakeholders, executives, product council

**Read this if**: You need to brief stakeholders on NIP-PNS integration.

---

## Quick Navigation

### By Role

**Product Manager**:
1. Start: `NIP_PNS_Decision_Brief.md`
2. Then: `SECURITY_TIERS_COMPARISON.md` (use case mapping)
3. Deep dive: `Noise_PNS_Review_and_Use_Cases.md` (Part 2)

**Engineer / Implementation Lead**:
1. Start: `Noise_PNS_Integration_Plan.md`
2. Then: `Noise_PNS_Review_and_Use_Cases.md` (Part 1 & 4)
3. Reference: `SECURITY_TIERS_COMPARISON.md` (threat models)

**Security Architect**:
1. Start: `Noise_PNS_Integration_Plan.md` (Sections 2–3)
2. Then: `SECURITY_TIERS_COMPARISON.md` (threat analysis)
3. Review: `Noise_PNS_Review_and_Use_Cases.md` (Part 1)

**Executive / Decision-Maker**:
1. Start: `NIP_PNS_Decision_Brief.md`
2. Then: `REVIEW_SUMMARY.md`
3. Optional: `SECURITY_TIERS_COMPARISON.md` (use case mapping)

---

## Key Concepts

### Standard FS (Forward Secrecy)
- Noise-FS protection using only `pns_fs_root` in ClientSessionVault
- Protects against `nsec` compromise but not device + vault + password compromise
- Recommended for most users and day-to-day notes
- **Phase 1 implementation**

### Hardened FS (Hardware MFA)
- Noise-FS protection enhanced with NFC hardware token MFA (Boltcard/Satscard)
- Requires all 5 factors: device, `nsec`, password, physical token, PIN
- Recommended for high-value data (recovery credentials, financial records, medical info)
- **Phase 2+ implementation**

### Controlled Sharing
- **Option A** (Phase 1): Separate NIP-17/NIP-59 sharing feature (simple, one-time)
- **Option B** (Phase 2+): Envelope-based access control (granular, persistent)
- **Recommendation**: Start with Option A, implement Option B if demand warrants

---

## Implementation Status

| Phase | Component | Status | Timeline |
|-------|-----------|--------|----------|
| Phase 1 | Standard FS (core) | 📋 Planning | [TBD] |
| Phase 1 | Ephemeral notes | 📋 Planning | [TBD] |
| Phase 1 | NIP-17/NIP-59 sharing | 📋 Planning | [TBD] |
| Phase 2+ | Hardened FS (hardware MFA) | 📋 Planning | [TBD] |
| Phase 2+ | Envelope-based sharing | 📋 Planning | [TBD] |
| Phase 2+ | Cross-device sync | 📋 Planning | [TBD] |

---

## Next Steps

### Immediate (Before Implementation)

1. ✅ **Review this planning**: Read relevant documents based on your role (see Quick Navigation).
2. ⏳ **Resolve 7 open questions**: See `Noise_PNS_Review_and_Use_Cases.md` (Part 5) and `SECURITY_TIERS_COMPARISON.md`.
3. ⏳ **Incorporate suggested edits**: See `Noise_PNS_Review_and_Use_Cases.md` (Part 4).
4. ⏳ **Create implementation specification**: Finalize `NoisePnsEnvelope` format, challenge-response protocol, cross-device sync.

### Phase 1 (Standard FS)

1. Implement `NoisePnsManager` with per-note key derivation
2. Extend `PnsService` to support Noise-FS envelope
3. Add ephemeral note support (TTL, deletion)
4. Implement separate NIP-17/NIP-59 sharing feature
5. Comprehensive testing and security review

### Phase 2+ (Hardened FS + Advanced Sharing)

1. Implement `HardwareMfaService` with Web NFC integration
2. Add enrollment and recovery flows
3. Implement envelope-based access control (Option B)
4. Add cross-device sync with FS secret backup

---

## Questions & Feedback

For questions or feedback on this planning:
1. Review the relevant document (see Quick Navigation)
2. Check the "Open Questions" section
3. Raise issues or PRs with specific feedback

---

**Last Updated**: [Date]

**Owner**: [Assign planning lead]

**Status**: ✅ Planning complete. Ready for implementation planning and security review.

