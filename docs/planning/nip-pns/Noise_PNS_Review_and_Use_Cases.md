# Noise Protocol Overlay + NIP-PNS Integration: Comprehensive Review & Use Cases

## Overview & Navigation

This document provides a comprehensive review of the Noise_PNS_Integration_Plan.md with three main sections:

1. **Part 1: Technical Review & Improvements** – Identifies 7 technical gaps, suggests specific improvements, and verifies cross-references to existing Satnam components.
2. **Part 2: Use Case Analysis** – Describes concrete use cases for Noise-FS protected notes across 7 Satnam user personas (guardians, business owners, families, artists, event hosts, marketplace operators, solo-preneurs).
3. **Part 3: Controlled Sharing & Selective Disclosure** – Explores three design options for extending Noise-FS to support granular sharing without breaking forward secrecy or privacy principles.
4. **Part 4: Summary of Suggested Edits** – Lists specific edits to the main plan document and recommendations for new sections.
5. **Part 5: Open Questions** – 7 design decisions requiring user input before implementation.

**Key Recommendation**: Start with Phase 1 (separate NIP-17/NIP-59 sharing feature) to keep Noise-FS simple and focused. Implement Option B (envelope-based access control) in Phase 2+ if user demand warrants.

---

## Part 1: Technical Review & Improvements

### 1.1 Technical Gaps & Suggested Improvements

#### Gap 1: Vault Integration Clarity

**Issue**: Section 3.3 mentions `HardwareMfaGuard` wrapping operations but doesn't specify how it integrates with `ClientSessionVault` lifecycle.

**Suggestion**: Add a subsection "3.4 Hardware MFA Integration with ClientSessionVault" clarifying:

- When is `pns_fs_root` released into memory? (e.g., only during read/write, or for entire session?)
- Does the vault maintain a separate "hardware-gated" compartment, or is MFA checked at each operation?
- How does session timeout interact with hardware MFA? (e.g., does re-authentication require another NFC tap?)

#### Gap 2: Noise Envelope Format Specification

**Issue**: Section 4.1–4.2 describe flows but don't detail the exact `NoisePnsEnvelope` structure.

**Suggestion**: Add a subsection "4.4 NoisePnsEnvelope Format Specification" with:

```
{
  "version": 1,
  "fs_mode": "noise-fs" | "none",
  "note_epoch": <uint32>,
  "ttl": <uint32 seconds, optional>,
  "expires_at": <unix timestamp, optional>,
  "noise_nonce": <base64>,
  "noise_ciphertext": <base64>,
  "metadata": { /* optional user-defined tags */ }
}
```

- Clarify versioning strategy for future upgrades.
- Specify nonce handling (random per note, or derived from epoch?).

#### Gap 3: Cross-Device Sync & FS Secret Portability

**Issue**: Section 6 mentions "exporting/importing the PNS FS secret" but doesn't detail the mechanism.

**Suggestion**: Add a subsection "6.1 Cross-Device Sync Strategy" covering:

- Should `pns_fs_root` be encrypted and stored on relays (like a backup), or only in local vault?
- If stored on relays, use NIP-59 giftwrap to a secondary identity?
- How does a user restore FS secrets on a new device without losing forward secrecy guarantees?
- Should there be a "device binding" mechanism to prevent relay-stored secrets from being used on unauthorized devices?

#### Gap 4: Ephemeral Note Deletion Semantics

**Issue**: Section 5.2 says "best-effort relay deletion" but doesn't address relay non-compliance or cache persistence.

**Suggestion**: Clarify:

- What happens if a relay ignores the kind 5 delete event? (Note remains on relay but client won't display it.)
- Should Satnam maintain a local "deletion log" to prevent re-displaying notes even if relays return them?
- For Hardened FS notes, should deletion require hardware MFA confirmation?

#### Gap 5: Backward Compatibility & Migration

**Issue**: No mention of how existing standard PNS notes (without FS) are handled when FS is enabled.

**Suggestion**: Add a subsection "7.1 Migration & Backward Compatibility" specifying:

- Can users enable FS on an account that already has standard PNS notes?
- Should old notes remain unencrypted, or should there be a "re-encrypt" flow?
- How does the client distinguish between old (no FS) and new (FS) notes in the UI?

#### Gap 6: Hardware MFA Enrollment & Recovery

**Issue**: Section 8 mentions token loss but doesn't detail enrollment or recovery flows.

**Suggestion**: Expand "8. Hardware MFA (NFC) Integration" with:

- **Enrollment flow diagram**: detect card → read pubkey → set PIN → store metadata → confirm.
- **Backup token registration**: allow users to enroll 2–3 backup cards upfront.
- **Token loss recovery**: if primary card is lost, can user use backup? What if no backup exists?
- **Downgrade flow**: how to deliberately disable hardware MFA while still retaining Standard FS?

#### Gap 7: Two-Tier Model Consistency

**Issue**: "Standard FS" and "Hardened FS" are introduced in Executive Summary but not consistently referenced in later sections.

**Suggestion**:

- Add a table in Section 1 or 2 comparing Standard FS vs. Hardened FS across threat models, key factors, and use cases.
- Update Section 8 (Risk Analysis) to explicitly separate risks for each tier.
- Clarify in Section 7 which implementation steps apply to Standard FS only vs. both tiers.

---

### 1.2 Cross-Reference Verification

✅ **ClientSessionVault**: Correctly referenced in Sections 3.1, 3.3, 7.8. Assumption: vault supports encrypted compartments for `pns_fs_root` and hardware MFA metadata.

✅ **secureNsecManager**: Correctly referenced in Section 4.1 for one-shot `device_key` derivation.

✅ **Noise overlay primitives** (`src/lib/noise/primitives.ts`): Correctly referenced in Sections 3.1, 4.3, 7.2. Assumption: primitives expose HKDF and AEAD helpers.

⚠️ **NIP-44 v2**: Referenced in Sections 2.2, 4.1 but no explicit link to NIP-44 v2 spec or version negotiation. Suggest: add a note that Satnam must enforce v2 (not v1) for outer encryption.

⚠️ **NIP-59 giftwrap**: Mentioned in context of FS secret backup but not formally integrated. Suggest: clarify whether FS secret export uses NIP-59 or a separate mechanism.

---

## Part 2: Use Case Analysis

### 2.1 Concrete Use Cases by Persona

#### **Trust Providers / Guardians**

- **Use Case**: Managing recovery credentials and family federation metadata.
  - Store encrypted recovery codes, backup `nsec` derivatives, and attestation records in Noise-FS notes.
  - Use Hardened FS tier to ensure that even if a guardian's device is compromised, recovery credentials remain protected.
  - Ephemeral notes for temporary OTP codes or time-sensitive recovery instructions.
  - **Value**: Guardians can safely store sensitive family data without fear of wholesale compromise if their device is stolen.

#### **Business Owners**

- **Use Case**: Confidential business records and financial tracking.
  - Private ledgers, vendor contracts, customer PII, pricing strategies, and strategic planning notes.
  - Use Standard FS for day-to-day notes; Hardened FS for high-value records (e.g., key vendor agreements, financial forecasts).
  - Ephemeral notes for temporary project notes or meeting minutes that should auto-delete after 30 days.
  - **Value**: Business owners can maintain a private, encrypted knowledge base without relying on centralized cloud services or trusting third-party note apps.

#### **Family Patriarchs/Matriarchs**

- **Use Case**: Family health records, estate planning, and sensitive coordination.
  - Store medical histories, medication lists, insurance details, and estate planning notes.
  - Use Hardened FS for estate documents and sensitive family history.
  - Ephemeral notes for temporary family coordination (e.g., "Mom's doctor appointment on Tuesday").
  - **Value**: Family leaders can maintain a private, searchable archive of critical family information without exposing it to cloud providers or family members who shouldn't have access.

#### **Musicians / Artists**

- **Use Case**: Unreleased work, contract negotiations, and creative planning.
  - Store unreleased lyrics, composition drafts, production notes, and royalty tracking.
  - Use Standard FS for creative drafts; Hardened FS for contract negotiations and financial records.
  - Ephemeral notes for collaboration notes or temporary project ideas.
  - **Value**: Artists can safely store unreleased work and sensitive business information without fear of leaks or unauthorized access.

#### **Event Hosts / Organizers**

- **Use Case**: Attendee PII, vendor contracts, and post-event analysis.
  - Store attendee contact info, dietary restrictions, vendor agreements, and budget breakdowns.
  - Use Standard FS for general event notes; Hardened FS for attendee PII and vendor contracts.
  - Ephemeral notes for real-time event coordination (auto-delete after event).
  - **Value**: Event organizers can manage sensitive attendee data and vendor relationships without exposing them to cloud services or unauthorized team members.

#### **Marketplace Operators**

- **Use Case**: Vendor vetting, dispute resolution, and transaction metadata.
  - Store vendor background checks, dispute resolution notes, and transaction metadata.
  - Use Standard FS for routine notes; Hardened FS for sensitive vendor vetting or dispute records.
  - Ephemeral notes for temporary dispute coordination.
  - **Value**: Marketplace operators can maintain a private audit trail of vendor relationships and disputes without exposing sensitive data to relays or other parties.

#### **Individual Solo-preneurs**

- **Use Case**: Client notes, project planning, and personal knowledge management.
  - Store client contact info, project timelines, income/expense tracking, and personal knowledge base.
  - Use Standard FS for general notes; Hardened FS for client PII and financial records.
  - Ephemeral notes for temporary project notes or meeting minutes.
  - **Value**: Solo-preneurs can maintain a private, searchable knowledge base and client database without relying on centralized services or exposing sensitive data.

---

## Part 3: Controlled Sharing & Selective Disclosure

### 3.1 Design Exploration: Extending Noise-FS for Controlled Sharing

#### **Challenge**: Pure "Note2Self" vs. Controlled Sharing

Standard Noise-FS notes are encrypted only to the user's `pns_fs_root`, making them completely private. However, real-world workflows often require **selective sharing** with trusted parties (accountants, lawyers, family members, business partners) without breaking forward secrecy or exposing all notes.

#### **Option A: Separate Sharing Layer (Recommended for Phase 1)**

**Approach**: Keep Noise-FS notes as pure "Note2Self" (no sharing). For sharing, use a separate mechanism:

- User selects notes to share and exports them as a **NIP-17/NIP-59 giftwrapped message** containing the plaintext or a decryption key.
- Recipient receives the giftwrapped message and can decrypt it with their own `nsec`.
- **Pros**: Simple, maintains forward secrecy of original notes, reuses existing NIP-17/NIP-59 infrastructure.
- **Cons**: Sharing is manual and one-time; no granular access control or revocation.

#### **Option B: Selective Decryption Keys (Phase 2+)**

**Approach**: Extend `NoisePnsEnvelope` with optional "share metadata":

```json
{
  "version": 1,
  "fs_mode": "noise-fs",
  "note_epoch": 42,
  "noise_ciphertext": "...",
  "shares": [
    {
      "recipient_npub": "npub1...",
      "share_key_encrypted": "...",  // recipient's pubkey encrypts a per-note share key
      "access_level": "read" | "read_write",
      "expires_at": 1735689600,
      "conditions": { "tags": ["finance"], "date_range": ["2024-01-01", "2024-12-31"] }
    }
  ]
}
```

- User can grant time-limited, tag-based, or date-range-based access to specific recipients.
- Recipient's client can decrypt the `share_key_encrypted` using their `nsec` and then decrypt the note.
- **Pros**: Granular access control, time-limited sharing, revocation possible (by re-encrypting note with new key).
- **Cons**: Adds complexity, requires recipient to implement Noise-FS extension, sharing metadata is visible on relays (though encrypted).

#### **Option C: Hybrid Approach (Recommended for Long-term)**

**Approach**: Combine Options A and B:

- **Phase 1**: Implement Option A (manual sharing via NIP-17/NIP-59).
- **Phase 2**: Add Option B (selective decryption keys) as an opt-in feature for power users.
- Users can choose: "Share this note" (one-time giftwrap) or "Grant access" (persistent share key).

---

### 3.2 Export & Subset Sharing

#### **Use Case**: Accountant Access to Financial Notes

A business owner wants to share only their financial notes (tagged `#finance`) from the past year with their accountant, without exposing personal notes or future notes.

**Workflow**:

1. User opens Satnam and selects "Export notes for sharing".
2. Filters: tag = `#finance`, date range = `2024-01-01` to `2024-12-31`.
3. Client decrypts matching notes using `pns_fs_root` and per-note keys.
4. User chooses recipient (accountant's `npub`) and access level (`read` or `read_write`).
5. Client encrypts each note's plaintext (or a share key) to the accountant's pubkey using NIP-44 v2.
6. Client wraps the encrypted notes in a NIP-59 giftwrapped message and publishes to relays.
7. Accountant receives the giftwrapped message, decrypts it, and can view the financial notes.

**Trade-offs**:

- ✅ Accountant can only see notes matching the filter; personal notes remain private.
- ✅ Sharing is time-limited (user can set expiry).
- ⚠️ Accountant's client must implement Noise-FS extension to decrypt notes (or user exports plaintext, losing FS guarantee).
- ⚠️ Revocation requires user to re-encrypt notes with a new key and re-share (not instant).

---

### 3.3 Access Control Metadata & Zero-Knowledge Principles

#### **Challenge**: Balancing Metadata Visibility with Privacy

If we add access control metadata to `NoisePnsEnvelope` (e.g., "shareable with npub X after date Y"), relays can see:

- Which notes are shared.
- With whom (recipient's `npub`).
- When sharing expires.

This leaks **social graph information** and **sharing patterns**, violating Satnam's privacy-first principles.

#### **Solution: Encrypt Metadata**

- Store access control metadata **inside** the `NoisePnsEnvelope`, encrypted with `note_key_i`.
- Relays see only the outer NIP-44 ciphertext; they cannot infer sharing patterns.
- Only the note owner and authorized recipients can decrypt the metadata.

**Revised `NoisePnsEnvelope` structure**:

```json
{
  "version": 1,
  "fs_mode": "noise-fs",
  "note_epoch": 42,
  "noise_ciphertext": "...", // includes plaintext + access control metadata
  "metadata_nonce": "..."
}
```

- All metadata (including shares) is encrypted inside `noise_ciphertext`.
- Relays see only opaque ciphertext; no social graph leakage.

---

### 3.4 Forward Secrecy & Sharing Trade-offs

#### **Question**: Does Sharing Weaken Forward Secrecy?

**Answer**: Depends on the sharing mechanism.

**Option A (NIP-17/NIP-59 giftwrap)**:

- ✅ Original note's forward secrecy is **not weakened**; `pns_fs_root` remains secret.
- ⚠️ Shared plaintext (in the giftwrapped message) has **no forward secrecy** (if recipient's device is compromised later, shared plaintext can be decrypted).

**Option B (Selective decryption keys)**:

- ✅ Original note's forward secrecy is **preserved** (share key is separate from `pns_fs_root`).
- ⚠️ Share key itself has **no forward secrecy** (if recipient's device is compromised, share key can be used to decrypt the note).
- **Mitigation**: Use time-limited share keys; user can revoke by re-encrypting the note.

**Recommendation**: Document this trade-off clearly in UX:

- "Sharing a note via giftwrap: recipient can decrypt it, but if their device is later compromised, the shared plaintext is exposed."
- "Granting persistent access: recipient can decrypt the note as long as the share key is valid, but the note's forward secrecy is not affected."

---

### 3.5 Separate Feature vs. Envelope Extension

#### **Design Decision**: Should Controlled Sharing be a Separate Feature or Part of Noise-PNS?

**Option 1: Separate Feature (Recommended for Phase 1)**

- Noise-FS notes remain pure "Note2Self".
- Sharing is handled by a separate "Note Export & Share" feature using NIP-17/NIP-59.
- **Pros**: Simpler, lower risk, reuses existing infrastructure.
- **Cons**: Sharing is manual and one-time; no persistent access control.

**Option 2: Envelope Extension (Phase 2+)**

- Extend `NoisePnsEnvelope` with optional access control metadata.
- Sharing is built into the note itself; recipients can decrypt with a share key.
- **Pros**: Granular access control, time-limited sharing, persistent access.
- **Cons**: More complex, requires recipient to implement Noise-FS extension.

**Recommendation**: Start with Option 1 (separate feature) in Phase 1. If user demand for persistent sharing is high, implement Option 2 in Phase 2.

---

## Part 4: Summary of Suggested Edits

### Edits to Noise_PNS_Integration_Plan.md

1. **Add Section 3.4**: "Hardware MFA Integration with ClientSessionVault" (vault lifecycle, session timeout, operation-level gating).
2. **Add Section 4.4**: "NoisePnsEnvelope Format Specification" (JSON structure, versioning, nonce handling).
3. **Add Section 6.1**: "Cross-Device Sync Strategy" (FS secret portability, device binding, relay storage).
4. **Expand Section 5.2**: Clarify ephemeral note deletion semantics (relay non-compliance, deletion log, hardware MFA confirmation).
5. **Add Section 7.1**: "Migration & Backward Compatibility" (enabling FS on existing accounts, re-encryption, UI distinction).
6. **Expand Section 8**: Add enrollment flow diagram, backup token registration, downgrade flow.
7. **Add Section 2.3**: Comparison table: Standard FS vs. Hardened FS (threat models, key factors, use cases).
8. **Update Section 10**: Add open questions about FS secret export mechanism and NIP-59 integration.

### New Document: Noise_PNS_Use_Cases_and_Sharing.md

Create a separate document covering:

- Detailed use cases for each Satnam persona.
- Controlled sharing design exploration (Options A, B, C).
- Export & subset sharing workflow.
- Access control metadata and zero-knowledge principles.
- Forward secrecy trade-offs.
- Recommendation: Phase 1 (separate feature) vs. Phase 2+ (envelope extension).

---

## Part 5: Open Questions Requiring User Input

1. **Vault Integration**: Should `pns_fs_root` be released for the entire session, or only during each read/write operation?
2. **FS Secret Portability**: Should `pns_fs_root` be stored on relays (encrypted) for cross-device sync, or only in local vault?
3. **Ephemeral Deletion**: Should Satnam maintain a local deletion log to prevent re-displaying deleted notes even if relays return them?
4. **Backward Compatibility**: Should existing standard PNS notes be automatically re-encrypted when FS is enabled, or remain unencrypted?
5. **Controlled Sharing**: Should Phase 1 implement Option A (separate NIP-17/NIP-59 feature) or Option B (envelope extension)?
6. **Metadata Encryption**: Should access control metadata be encrypted inside `NoisePnsEnvelope` to prevent social graph leakage?
7. **Hardware MFA Backup**: Should users be required to enroll backup tokens during initial setup, or optional?

---

**Next Steps**: Review this document, provide feedback on suggested edits and design decisions, and confirm which open questions should be resolved before implementation begins.
