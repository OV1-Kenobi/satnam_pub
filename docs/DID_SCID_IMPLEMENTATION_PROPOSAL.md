# DID:SCID Implementation Proposal
## Detailed Technical Specification

**Status**: PROPOSAL FOR APPROVAL  
**Date**: 2025-10-18  
**Scope**: Phase 1 - Metadata Enhancement (Non-Breaking)

---

## Proposal Overview

Integrate DID:SCID (Self-Certifying Identifier) specification into Satnam.pub's multi-method verification system through a **phased, non-breaking approach** that adds cryptographic identity verification without disrupting existing Nostr/PKARR/DNS infrastructure.

**Key Principle**: DID:SCID is **complementary**, not a replacement for existing verification methods.

---

## Phase 1: Metadata Enhancement (Proposed)

### Objective

Add optional DID:SCID formatted identity data to kind:0 metadata events, PKARR records, and DNS records while maintaining full backward compatibility.

### Proposed Changes

#### 1.1 kind:0 Metadata Event Enhancement

**File**: `lib/central_event_publishing_service.ts`

**Current Structure**:
```json
{
  "kind": 0,
  "content": {
    "name": "Alice",
    "nip05": "alice@satnam.pub",
    "picture": "https://...",
    "about": "...",
    "lud16": "alice@satnam.pub"
  }
}
```

**Proposed Enhancement**:
```json
{
  "kind": 0,
  "content": {
    "name": "Alice",
    "nip05": "alice@satnam.pub",
    "picture": "https://...",
    "about": "...",
    "lud16": "alice@satnam.pub",
    
    // NEW: Optional DID:SCID fields
    "did": "did:scid:EaU6JR2nmwyZ-i0d8JZAoTNZH3ULvYAfSVPzhzS6b5CM",
    "did_scid_proof": {
      "inception_key": "hex_inception_pubkey",
      "derivation_code": "E",
      "timestamp": 1234567890
    }
  },
  "tags": [
    ["alt", "Satnam identity with DID:SCID verification"]
  ]
}
```

**Implementation**:
- Add optional fields to `publishProfile()` method
- Create `generateDIDSCID()` utility function
- Add feature flag: `VITE_DID_SCID_ENABLED`
- Backward compatible: existing clients ignore new fields

#### 1.2 PKARR Record Enhancement

**File**: `lib/pubky-enhanced-client.ts`

**Current Structure**:
```json
{
  "nip05": "alice@satnam.pub",
  "pubkey": "hex_pubkey",
  "name": "Alice",
  "picture": "https://...",
  "about": "..."
}
```

**Proposed Enhancement**:
```json
{
  "nip05": "alice@satnam.pub",
  "pubkey": "hex_pubkey",
  "name": "Alice",
  "picture": "https://...",
  "about": "...",
  
  // NEW: Optional DID:SCID fields
  "did": "did:scid:EaU6JR2nmwyZ-i0d8JZAoTNZH3ULvYAfSVPzhzS6b5CM",
  "did_scid_proof": {
    "inception_key": "hex_inception_pubkey",
    "derivation_code": "E",
    "timestamp": 1234567890
  }
}
```

**Implementation**:
- Update `publishRecord()` method to include DID:SCID
- Modify PKARR record parsing to handle new fields
- Maintain compatibility with existing PKARR clients

#### 1.3 DNS Record Enhancement

**File**: `src/lib/nip05-verification.ts`

**Current Format**:
```
_nostr.alice.satnam.pub TXT "names": {"alice": "hex_pubkey"}
```

**Proposed Enhancement**:
```
_nostr.alice.satnam.pub TXT "names": {
  "alice": "hex_pubkey",
  "did": "did:scid:EaU6JR2nmwyZ-i0d8JZAoTNZH3ULvYAfSVPzhzS6b5CM"
}
```

**Implementation**:
- Update DNS TXT record generation
- Modify DNS parsing to extract DID:SCID
- Maintain compatibility with existing DNS clients

### Database Schema Updates

**File**: `database/migrations/032_did_scid_integration.sql`

**New Table: `did_scid_identities`**

```sql
CREATE TABLE IF NOT EXISTS public.did_scid_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User identification
    user_duid VARCHAR(50) NOT NULL,
    
    -- DID:SCID data
    did VARCHAR(255) NOT NULL UNIQUE,
    inception_key VARCHAR(64) NOT NULL,
    derivation_code VARCHAR(10) NOT NULL,
    
    -- Timestamps
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    verified_at BIGINT,
    
    -- Verification tracking
    verification_method VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    rotation_sequence INTEGER DEFAULT 0,
    
    -- Metadata
    metadata JSONB,
    
    -- Constraints
    CONSTRAINT user_duid_fk FOREIGN KEY (user_duid) 
        REFERENCES user_identities(duid),
    CONSTRAINT did_format CHECK (did LIKE 'did:scid:%'),
    CONSTRAINT inception_key_format CHECK (inception_key ~ '^[0-9a-f]{64}$')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_did_scid_user ON did_scid_identities(user_duid);
CREATE INDEX IF NOT EXISTS idx_did_scid_did ON did_scid_identities(did);
CREATE INDEX IF NOT EXISTS idx_did_scid_active ON did_scid_identities(is_active);
CREATE INDEX IF NOT EXISTS idx_did_scid_created ON did_scid_identities(created_at);

-- RLS Policies
ALTER TABLE public.did_scid_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_did_scid" ON public.did_scid_identities
    FOR SELECT
    USING (user_duid = (SELECT user_duid FROM user_identities WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "service_role_manage_did_scid" ON public.did_scid_identities
    FOR ALL
    USING (true);
```

**Update: `multi_method_verification_results` Table**

Add DID:SCID verification tracking:

```sql
ALTER TABLE public.multi_method_verification_results
ADD COLUMN IF NOT EXISTS did_scid_verified BOOLEAN,
ADD COLUMN IF NOT EXISTS did_scid_response_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS did_scid_error TEXT,
ADD COLUMN IF NOT EXISTS did_scid_did VARCHAR(255);
```

### Utility Functions

**File**: `src/lib/crypto/did-scid-utils.ts` (NEW)

```typescript
/**
 * Generate DID:SCID from inception key
 * Uses KERI derivation code "E" (Ed25519)
 */
export function generateDIDSCID(inceptionKeyHex: string): string {
  // 1. Hash inception key with KERI derivation
  // 2. Encode as base64url
  // 3. Return as did:scid:...
}

/**
 * Verify DID:SCID derivation
 */
export function verifyDIDSCIDDerivation(
  did: string,
  inceptionKeyHex: string
): boolean {
  // 1. Extract SCID from DID
  // 2. Regenerate from inception key
  // 3. Compare for match
}

/**
 * Create DID:SCID proof object
 */
export function createDIDSCIDProof(
  inceptionKeyHex: string,
  derivationCode: "E" | "D" | "A" = "E"
): DIDSCIDProof {
  return {
    did: generateDIDSCID(inceptionKeyHex),
    inception_key: inceptionKeyHex,
    derivation_code: derivationCode,
    timestamp: Math.floor(Date.now() / 1000)
  };
}
```

### Feature Flags

**File**: `src/config/env.client.ts`

```typescript
// Add to ClientConfig type
export type ClientConfig = {
  // ... existing fields
  flags: {
    // ... existing flags
    didScidEnabled: boolean;
    didScidVerificationEnabled: boolean;
    didScidRequireProof: boolean;
  };
};

// Add constants
const DID_SCID_ENABLED = 
  ((process.env.VITE_DID_SCID_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

const DID_SCID_VERIFICATION_ENABLED = 
  ((process.env.VITE_DID_SCID_VERIFICATION_ENABLED as string) || "false")
    .toString()
    .toLowerCase() === "true";

const DID_SCID_REQUIRE_PROOF = 
  ((process.env.VITE_DID_SCID_REQUIRE_PROOF as string) || "false")
    .toString()
    .toLowerCase() === "true";

// Add to clientConfig
export const clientConfig: ClientConfig = {
  // ... existing config
  flags: {
    // ... existing flags
    didScidEnabled: DID_SCID_ENABLED,
    didScidVerificationEnabled: DID_SCID_VERIFICATION_ENABLED,
    didScidRequireProof: DID_SCID_REQUIRE_PROOF,
  },
};
```

### Implementation Steps

1. **Create DID:SCID utilities** (`src/lib/crypto/did-scid-utils.ts`)
   - SCID generation from inception key
   - Derivation verification
   - Proof creation

2. **Update kind:0 publishing** (`lib/central_event_publishing_service.ts`)
   - Add optional DID:SCID fields to `publishProfile()`
   - Generate SCID if feature flag enabled
   - Maintain backward compatibility

3. **Update PKARR records** (`lib/pubky-enhanced-client.ts`)
   - Include DID:SCID in record publishing
   - Parse DID:SCID from records
   - Handle missing fields gracefully

4. **Update DNS parsing** (`src/lib/nip05-verification.ts`)
   - Extract DID:SCID from DNS TXT records
   - Handle both old and new formats
   - Validate DID:SCID format

5. **Create database migration** (`database/migrations/032_did_scid_integration.sql`)
   - Create `did_scid_identities` table
   - Add columns to `multi_method_verification_results`
   - Set up RLS policies

6. **Add feature flags** (`src/config/env.client.ts`)
   - `VITE_DID_SCID_ENABLED` - Enable DID:SCID generation
   - `VITE_DID_SCID_VERIFICATION_ENABLED` - Enable verification
   - `VITE_DID_SCID_REQUIRE_PROOF` - Require proof validation

### Testing Strategy

**Unit Tests**:
- SCID generation correctness
- Derivation verification
- Proof creation and validation
- Format validation

**Integration Tests**:
- kind:0 event publishing with DID:SCID
- PKARR record storage and retrieval
- DNS record parsing
- Database operations

**Backward Compatibility Tests**:
- Existing clients can read new events
- Old format still works
- Feature flag disables new functionality

### Rollout Plan

1. **Phase 1a**: Deploy code with feature flags disabled
2. **Phase 1b**: Enable for internal testing
3. **Phase 1c**: Enable for beta users (5-10%)
4. **Phase 1d**: Monitor for issues
5. **Phase 1e**: Gradual rollout to all users

---

## Success Criteria

- ✅ All existing functionality continues to work
- ✅ DID:SCID fields optional in all formats
- ✅ Feature flags allow disabling new functionality
- ✅ Database migration is idempotent
- ✅ No performance degradation
- ✅ Comprehensive test coverage
- ✅ Documentation updated

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Breaking existing clients | Low | High | Backward compatible design |
| Performance impact | Low | Medium | Feature flags, lazy loading |
| Database migration issues | Low | High | Idempotent migration, testing |
| Adoption resistance | Medium | Low | Gradual rollout, education |

---

## Timeline

- **Week 1**: Utility functions + database migration
- **Week 2**: kind:0 and PKARR updates
- **Week 3**: DNS parsing + feature flags
- **Week 4**: Testing + documentation
- **Week 5**: Beta rollout
- **Week 6**: Production rollout

---

## Approval Checklist

- [ ] Architecture review approved
- [ ] Data format specifications approved
- [ ] Database schema approved
- [ ] Feature flag strategy approved
- [ ] Testing plan approved
- [ ] Rollout plan approved
- [ ] Security review completed
- [ ] Privacy review completed

---

## Next Steps

1. **Review**: Present proposal to stakeholders
2. **Feedback**: Gather feedback on approach
3. **Approval**: Get sign-off on implementation
4. **Planning**: Create detailed sprint plan
5. **Development**: Begin Phase 1 implementation

---

## Questions for Stakeholders

1. Should DID:SCID be required or optional?
2. What's the target adoption timeline?
3. Should we integrate with KERI libraries or implement custom?
4. How should we handle key rotation with DID:SCID?
5. Should DID:SCID be used for other identity types (family, business)?

---

## References

- [DID:SCID Integration Analysis](./DID_SCID_INTEGRATION_ANALYSIS.md)
- [Multi-Method Verification Guide](./MULTI_METHOD_VERIFICATION_GUIDE.md)
- [KERI Specification](https://identity.foundation/keri/did_methods/)
- [W3C DID Core](https://www.w3.org/TR/did-core/)

