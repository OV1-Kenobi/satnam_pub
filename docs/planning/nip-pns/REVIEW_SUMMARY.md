# Noise-PNS Integration: Review Summary & Next Steps

## Document Ecosystem

Three planning documents now exist for Noise-PNS integration:

1. **`Noise_PNS_Integration_Plan.md`** (Main Technical Plan)
   - 10 sections covering security architecture, key management, implementation roadmap, risks, and testing
   - Introduces "Standard FS" and "Hardened FS" two-tier security model
   - Ready for implementation planning

2. **`Noise_PNS_Review_and_Use_Cases.md`** (Comprehensive Review)
   - Part 1: 7 technical gaps with specific improvement suggestions
   - Part 2: Concrete use cases for 7 Satnam user personas
   - Part 3: Controlled sharing design exploration (3 options)
   - Part 4: Suggested edits to main plan
   - Part 5: 7 open questions requiring user input

3. **`NIP_PNS_Decision_Brief.md`** (Stakeholder Summary)
   - Executive-level overview for non-technical decision-makers
   - 2-page format with key benefits, risks, and next steps

---

## Critical Findings from Review

### Technical Gaps (Priority Order)

| Gap | Severity | Impact | Suggested Fix |
|-----|----------|--------|---------------|
| Vault integration lifecycle unclear | HIGH | Affects session security | Add Section 3.4 with vault/MFA interaction model |
| NoisePnsEnvelope format not specified | HIGH | Blocks implementation | Add Section 4.4 with JSON schema and versioning |
| FS secret portability undefined | MEDIUM | Affects cross-device sync | Add Section 6.1 with relay storage strategy |
| Ephemeral deletion semantics vague | MEDIUM | Affects data retention | Expand Section 5.2 with deletion log design |
| Backward compatibility not addressed | MEDIUM | Affects migration | Add Section 7.1 with re-encryption strategy |
| Hardware MFA enrollment flow missing | MEDIUM | Affects UX | Expand Section 8 with flow diagrams |
| Two-tier model inconsistency | LOW | Affects clarity | Add comparison table in Section 2 |

### Use Case Validation

✅ **All 7 personas have strong use cases** for Noise-FS:
- Guardians: recovery credentials, family federation data
- Business owners: confidential records, financial tracking
- Families: health records, estate planning
- Artists: unreleased work, contract negotiations
- Event hosts: attendee PII, vendor contracts
- Marketplace operators: vendor vetting, dispute resolution
- Solo-preneurs: client notes, financial tracking

**Value Proposition**: Noise-FS enables users to maintain private, searchable knowledge bases without relying on centralized cloud services or exposing data to relays.

### Controlled Sharing Design

**Recommendation: Phase 1 + Phase 2 Approach**

- **Phase 1** (Immediate): Implement Option A (separate NIP-17/NIP-59 sharing feature)
  - Simple, low-risk, reuses existing infrastructure
  - Manual, one-time sharing
  - Suitable for MVP

- **Phase 2+** (Future): Implement Option B (envelope-based access control)
  - Granular, time-limited, persistent sharing
  - Requires recipient to implement Noise-FS extension
  - Higher complexity but more powerful

- **Key Principle**: Encrypt all access control metadata inside `NoisePnsEnvelope` to prevent social graph leakage on relays.

---

## Recommended Next Steps

### Immediate (Before Implementation)

1. **Resolve 7 Open Questions** (see Part 5 of review document):
   - Vault integration model (session-level vs. operation-level gating)
   - FS secret portability (relay storage vs. local-only)
   - Ephemeral deletion strategy (deletion log design)
   - Backward compatibility (re-encryption policy)
   - Controlled sharing approach (Phase 1 vs. Phase 2)
   - Metadata encryption (social graph privacy)
   - Hardware MFA backup policy (required vs. optional)

2. **Incorporate Suggested Edits** into Noise_PNS_Integration_Plan.md:
   - Add 7 new subsections (Sections 3.4, 4.4, 6.1, 7.1, etc.)
   - Add comparison table (Standard FS vs. Hardened FS)
   - Expand hardware MFA section with flow diagrams

3. **Create Implementation Specification**:
   - Finalize `NoisePnsEnvelope` JSON schema
   - Define challenge-response protocol for hardware MFA
   - Specify cross-device sync mechanism for FS secrets

### Phase 1 Implementation

1. **Core Noise-FS** (Standard tier):
   - Implement `NoisePnsManager` with per-note key derivation
   - Extend `PnsService` to support Noise-FS envelope
   - Add ephemeral note support with TTL/deletion

2. **Separate Sharing Feature**:
   - Implement "Export notes for sharing" UI
   - Use NIP-17/NIP-59 giftwrap for encrypted sharing
   - Support tag/date-range filtering

3. **Testing & Security Review**:
   - Unit tests for key derivation and encryption
   - Property tests for forward secrecy guarantees
   - Security review of key schedule and AEAD usage

### Phase 2+ (Future)

1. **Hardened FS Tier**:
   - Implement `HardwareMfaService` with Web NFC integration
   - Add enrollment and recovery flows
   - Support backup token registration

2. **Envelope-Based Sharing** (Option B):
   - Extend `NoisePnsEnvelope` with access control metadata
   - Implement selective decryption keys
   - Add time-limited and tag-based access control

3. **Cross-Device Sync**:
   - Design FS secret backup mechanism (relay storage + NIP-59)
   - Implement device binding to prevent unauthorized restore
   - Add migration flow for new devices

---

## Success Criteria

✅ **Technical**: All 7 gaps addressed, envelope format specified, cross-references verified.

✅ **Use Cases**: All 7 personas have documented, concrete use cases with clear value propositions.

✅ **Sharing**: Design options evaluated, Phase 1 approach selected, trade-offs documented.

✅ **Planning**: Open questions resolved, implementation roadmap clear, security review scheduled.

---

## Key Takeaways

1. **Noise-FS is strategically important** for Satnam's privacy-first positioning and enables real-world use cases across all user personas.

2. **Two-tier model (Standard + Hardened FS) provides flexibility**: users can start simple and upgrade to hardware MFA as needed.

3. **Controlled sharing is a natural extension** but should be phased: start with simple NIP-17/NIP-59 sharing, add envelope-based access control later if demand warrants.

4. **Privacy-first principles must be maintained**: all metadata (including shares) should be encrypted to prevent social graph leakage on relays.

5. **Implementation is feasible** with existing Satnam components (ClientSessionVault, secureNsecManager, Noise primitives) and Web Crypto APIs.

---

**Status**: ✅ Planning complete. Ready for implementation planning and security review.

**Owner**: [Assign implementation lead]

**Timeline**: [To be determined based on priority and resource availability]

