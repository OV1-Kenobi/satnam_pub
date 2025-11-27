# Noise-FS Security Tiers: Detailed Comparison & Decision Framework

## Executive Comparison Table

| Aspect | Standard FS | Hardened FS | Standard PNS (Baseline) |
|--------|-------------|-------------|------------------------|
| **Forward Secrecy vs. `nsec` Compromise** | ✅ Yes | ✅ Yes | ❌ No |
| **Protection vs. Device + Vault + Password Compromise** | ❌ No | ✅ Yes (requires NFC token + PIN) | ❌ No |
| **Key Storage** | `pns_fs_root` in ClientSessionVault | `pns_fs_root` + hardware MFA metadata in vault | Deterministic from `nsec` |
| **Authentication Factors** | 3 (device, `nsec`, password) | 5 (device, `nsec`, password, token, PIN) | 2 (device, `nsec`) |
| **Threat Model** | `nsec` compromise + relay logs | `nsec` + vault + device compromise | `nsec` + relay logs |
| **User Friction** | Low (transparent) | Medium (NFC tap + PIN per session) | None |
| **Hardware Requirements** | None | NFC-capable device + Boltcard/Satscard | None |
| **Cross-Device Sync** | Requires FS secret export | Requires FS secret + hardware token enrollment | Automatic (derived from `nsec`) |
| **Recommended For** | Most users, day-to-day notes | High-value data, sensitive records | Legacy/basic users |
| **Availability** | Phase 1 | Phase 2+ |  |

---

## Detailed Threat Model Analysis

### Threat 1: `nsec` Compromise (e.g., via malware, phishing, or relay breach)

**Standard PNS (Baseline)**:
- ❌ **CRITICAL**: Attacker can derive `pns_nip44_key` and decrypt all historic notes.
- **Impact**: Complete note history exposed.

**Standard FS**:
- ✅ **PROTECTED**: Attacker cannot derive `pns_fs_root` from `nsec` alone.
- **Impact**: Notes remain encrypted; attacker sees only opaque Noise envelopes.
- **Assumption**: Device/vault not compromised.

**Hardened FS**:
- ✅ **PROTECTED**: Same as Standard FS; `nsec` compromise alone is insufficient.
- **Impact**: Notes remain encrypted.

---

### Threat 2: Device Theft + Full Vault Compromise

**Standard PNS (Baseline)**:
- ❌ **CRITICAL**: Attacker has device + `nsec` (if stored locally) → can decrypt all notes.

**Standard FS**:
- ❌ **VULNERABLE**: Attacker has device + vault → can access `pns_fs_root` and decrypt all notes.
- **Mitigation**: Vault encryption under device-level keys (OS-dependent security).

**Hardened FS**:
- ✅ **PROTECTED**: Attacker has device + vault but **cannot decrypt notes without**:
  - Physical NFC token (Boltcard/Satscard), AND
  - Correct PIN for the token.
- **Impact**: Notes remain encrypted even with full device compromise.
- **Assumption**: NFC token not stolen or compromised.

---

### Threat 3: Device Theft + `nsec` Compromise (Combined Attack)

**Standard PNS (Baseline)**:
- ❌ **CRITICAL**: Attacker has both → complete access to all notes.

**Standard FS**:
- ❌ **VULNERABLE**: Attacker has both → can decrypt all notes (vault is on device).

**Hardened FS**:
- ✅ **PROTECTED**: Attacker has both but **still cannot decrypt notes without**:
  - Physical NFC token, AND
  - Correct PIN.
- **Impact**: Defense-in-depth; multiple factors required.

---

### Threat 4: Relay Compromise (Attacker Controls Relays)

**All Tiers**:
- ✅ **PROTECTED**: Relays only see outer NIP-44 ciphertext; cannot decrypt notes.
- **Note**: Relays can see metadata (kind 1080, pubkey, timestamps) but not content.

---

## Use Case Mapping: Which Tier for Which Data?

### Standard FS (Recommended for Most Users)

**Best For**:
- Day-to-day personal notes
- Project planning and brainstorming
- General knowledge management
- Temporary notes (ephemeral)
- Collaborative notes (shared via NIP-17/NIP-59)

**Examples**:
- "Meeting notes from today's standup"
- "Ideas for next quarter's roadmap"
- "Recipe ideas for dinner"
- "Book recommendations"

**Rationale**: Forward secrecy against `nsec` compromise is sufficient; device security is user's responsibility.

---

### Hardened FS (Recommended for High-Value Data)

**Best For**:
- Recovery credentials and backup codes
- Financial records and tax documents
- Medical and health information
- Legal documents and contracts
- Sensitive family information
- Unreleased creative work
- Customer PII and business records

**Examples**:
- "Backup `nsec` and recovery codes"
- "2024 tax return and financial statements"
- "Family health history and medication list"
- "Estate planning documents"
- "Unreleased album lyrics and compositions"
- "Customer contact database"

**Rationale**: High-value data warrants defense-in-depth; hardware MFA provides additional protection against device theft + credential compromise.

---

### Standard PNS (Legacy/Baseline)

**Best For**:
- Users who don't need forward secrecy
- Public or semi-public notes
- Temporary notes that don't require long-term privacy

**Examples**:
- "Public announcements"
- "Temporary meeting notes"

**Rationale**: Simplest option; no additional secrets to manage.

---

## User Journey: Tier Selection & Upgrade Path

### Initial Setup (Phase 1)

1. User creates Satnam account and enables NIP-PNS.
2. **Default**: Standard FS is enabled automatically.
3. User can choose to use Standard PNS (no FS) if they prefer simplicity.
4. UI clearly explains: "Standard FS protects against `nsec` compromise but not device theft."

### Upgrade to Hardened FS (Phase 2+)

1. User navigates to "Security Settings" → "Private Notes Protection".
2. Sees comparison: "Standard FS vs. Hardened FS".
3. Clicks "Upgrade to Hardened FS".
4. **Enrollment flow**:
   - Detects NFC-capable device.
   - Prompts user to tap Boltcard/Satscard.
   - Reads card public key and stores metadata in vault.
   - Prompts user to set/confirm PIN on card.
   - Confirms enrollment: "Hardened FS is now active."
5. **Backup token** (optional but recommended):
   - User can enroll a second card as backup.
   - If primary card is lost, backup card can still unlock notes.

### Downgrade from Hardened FS (If Needed)

1. User navigates to "Security Settings" → "Private Notes Protection".
2. Clicks "Downgrade to Standard FS".
3. **Confirmation flow**:
   - Warns: "You will no longer need your NFC token to access notes."
   - Requires full authentication (password + `nsec` + current card tap).
   - Removes hardware MFA metadata from vault.
4. Notes remain encrypted with Standard FS; no re-encryption needed.

---

## Implementation Roadmap

### Phase 1: Standard FS (MVP)

**Timeline**: [To be determined]

**Deliverables**:
- ✅ `NoisePnsManager` with per-note key derivation
- ✅ `NoisePnsEnvelope` format and encryption/decryption
- ✅ Ephemeral note support (TTL, deletion)
- ✅ Separate NIP-17/NIP-59 sharing feature
- ✅ Unit and integration tests
- ✅ Security review

**Success Criteria**:
- All 7 personas can use Standard FS for their use cases
- Forward secrecy against `nsec` compromise verified
- No performance degradation vs. standard PNS

---

### Phase 2: Hardened FS + Envelope-Based Sharing

**Timeline**: [To be determined, after Phase 1 stabilizes]

**Deliverables**:
- ✅ `HardwareMfaService` with Web NFC integration
- ✅ Enrollment and recovery flows
- ✅ Backup token support
- ✅ Envelope-based access control (Option B)
- ✅ Time-limited and tag-based sharing
- ✅ Cross-device sync with FS secret backup

**Success Criteria**:
- Hardened FS provides defense-in-depth against device + credential compromise
- Hardware MFA enrollment is intuitive and error-resistant
- Controlled sharing enables real-world collaboration scenarios

---

## Decision Framework: Which Tier to Implement First?

### Recommendation: **Phase 1 with Standard FS**

**Rationale**:
1. ✅ **High impact**: Solves the `nsec` compromise problem for all users.
2. ✅ **Low complexity**: Reuses existing Noise primitives and ClientSessionVault.
3. ✅ **Fast time-to-market**: Can be implemented in parallel with other features.
4. ✅ **User-friendly**: No additional hardware or PIN management required.
5. ✅ **Foundation for Phase 2**: Hardened FS builds on Standard FS infrastructure.

**Alternative**: If hardware MFA is a strategic priority, implement both tiers in Phase 1 (higher complexity but complete solution).

---

## Open Questions for Implementation

1. **Vault Integration**: Should `pns_fs_root` be released for the entire session or only during each operation?
2. **FS Secret Backup**: Should `pns_fs_root` be stored on relays (encrypted) for cross-device sync?
3. **Ephemeral Deletion**: Should Satnam maintain a local deletion log to prevent re-displaying deleted notes?
4. **Backward Compatibility**: Should existing standard PNS notes be re-encrypted when FS is enabled?
5. **Sharing Approach**: Should Phase 1 implement Option A (separate feature) or Option B (envelope extension)?
6. **Metadata Encryption**: Should access control metadata be encrypted inside `NoisePnsEnvelope`?
7. **Hardware MFA Backup**: Should backup token enrollment be required or optional?

---

**Status**: ✅ Comparison complete. Ready for implementation planning.

