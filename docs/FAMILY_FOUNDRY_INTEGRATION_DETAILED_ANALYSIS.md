# Family Foundry Integration - Detailed Technical Analysis

**Date**: December 1, 2025  
**Status**: COMPREHENSIVE ANALYSIS  
**Scope**: Complete backend infrastructure mapping and integration requirements

---

## PART 1: DATABASE SCHEMA MAPPING

### family_federations Table
```sql
- id: UUID (primary key)
- federation_name: TEXT
- federation_duid: TEXT (UNIQUE, privacy-first identifier)
- domain: VARCHAR(255)
- relay_url: VARCHAR(255)
- is_active: BOOLEAN
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### family_members Table
```sql
- id: UUID (primary key)
- family_federation_id: UUID (FK → family_federations.id)
- user_duid: TEXT (privacy-first user identifier)
- family_role: TEXT CHECK ('offspring'|'adult'|'steward'|'guardian')
- spending_approval_required: BOOLEAN
- voting_power: INTEGER (default: 1)
- joined_at: TIMESTAMP
- is_active: BOOLEAN
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### family_charters Table
```sql
- id: TEXT (privacy-preserving identifier)
- family_name: TEXT
- family_motto: TEXT
- founding_date: DATE
- mission_statement: TEXT
- core_values: JSONB (array of values)
- rbac_configuration: JSONB (role definitions)
- created_by: TEXT (user_duid)
- status: TEXT ('active'|'suspended')
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### frost_signing_sessions Table
```sql
- session_id: TEXT (primary key)
- family_id: TEXT (FK → family_federations.federation_duid)
- message_hash: TEXT
- participants: JSONB (array of user_duids)
- threshold: INTEGER
- nonce_commitments: JSONB
- partial_signatures: JSONB
- status: TEXT ('pending'|'complete'|'failed')
- created_at: TIMESTAMP
- expires_at: TIMESTAMP
```

### nfc_mfa_audit_log Table
```sql
- id: UUID (primary key)
- family_id: TEXT (FK → family_federations.federation_duid)
- operation_type: TEXT
- steward_duid: TEXT (anonymized)
- nfc_signature_hash: TEXT (truncated)
- verification_result: BOOLEAN
- policy_enforced: TEXT
- created_at: TIMESTAMP
```

---

## PART 2: API ENDPOINT MAPPING

### Federation Creation
**Endpoint**: `POST /api/family/foundry`
**Input**:
```typescript
{
  charter: CharterDefinition,
  rbac: RBACDefinition
}
```
**Output**:
```typescript
{
  success: boolean,
  data: {
    charterId: string,
    federationId: string,
    familyName: string,
    status: 'active'
  }
}
```

### Role Management
**Endpoint**: `POST /api/family/role-management/change-role`
**Input**:
```typescript
{
  targetUserId: string,
  newRole: 'offspring'|'adult'|'steward'|'guardian',
  reason: string
}
```

### Federation Details
**Endpoint**: `GET /family-federations/{duid}`
**Returns**: Federation metadata with members list

### Member Management
**Endpoint**: `GET /family-federations/{duid}/members`
**Returns**: Array of family_members with roles and permissions

---

## PART 3: SERVICE LAYER INTEGRATION

### FamilyFoundryService (src/lib/api/family-foundry.ts)
- `createFamilyFoundry()` - Main entry point
- Validates charter and RBAC
- Calls backend API
- Returns federation ID and charter ID

### FrostSessionManager (lib/frost/frost-session-manager.ts)
- `createSession()` - Initialize FROST signing
- `submitNonceCommitment()` - Round 1
- `submitPartialSignature()` - Round 2
- `aggregateSignatures()` - Combine signatures
- `verifyNfcMfaSignatures()` - Post-aggregation NFC verification

### StewardApprovalClient (src/lib/steward/approval-client.ts)
- `publishApprovalRequests()` - Send to stewards via Nostr DMs
- `awaitApprovals()` - Wait for threshold approvals
- Integrates with NFC MFA for high-value operations

### FrostNfcMfa (src/lib/steward/frost-nfc-mfa.ts)
- `collectNfcMfaSignature()` - Tap card to sign
- `verifyNfcMfaSignature()` - Verify P-256 signature
- `storeNfcMfaSignature()` - Store in database

---

## PART 4: MASTER CONTEXT ROLE HIERARCHY

**Hierarchy** (top to bottom):
1. **Guardian** (hierarchyLevel: 4)
   - Ultimate authority, complete control
   - Can manage all roles, approve all operations
   - Requires NFC MFA for high-value operations

2. **Steward** (hierarchyLevel: 3)
   - Day-to-day operations, spending approvals
   - Can manage adults and offspring
   - Requires steward approval for spending

3. **Adult** (hierarchyLevel: 2)
   - Can manage offspring, limited spending
   - Requires approval for high-value operations

4. **Offspring** (hierarchyLevel: 1)
   - Limited permissions, learning role
   - All operations require approval

---

## PART 5: INTEGRATION FLOW DIAGRAM

```
FamilyFoundryWizard
  ├─ Step 1: Charter Definition
  │  └─ Collect: family name, motto, mission, values
  ├─ Step 2: RBAC Definition
  │  └─ Configure: roles, rights, responsibilities, rewards
  ├─ Step 3: Member Invitation
  │  └─ Collect: member npubs, roles, relationships
  └─ Step 4: Federation Creation
     ├─ Generate federation_duid
     ├─ Create family_federations record
     ├─ Create family_members records
     ├─ Initialize FROST configuration
     ├─ Set up NFC MFA policy
     └─ Publish steward approval requests
```

---

## PART 6: CRITICAL IMPLEMENTATION POINTS

1. **federation_duid Generation**: Privacy-first SHA-256 hash with per-family salt
2. **user_duid Mapping**: Convert npub → user_duid during member invitation
3. **Role Validation**: Enforce Master Context hierarchy constraints
4. **FROST Threshold**: Set based on guardian count and policy
5. **NFC MFA Policy**: Configure based on charter values and spending limits
6. **Steward Approval**: Integrate with existing approval workflow
7. **Error Handling**: Graceful rollback on any step failure
8. **Audit Logging**: Log all federation creation and role assignment events

---

## PART 7: TESTING STRATEGY

- **Unit Tests**: Federation creation, role validation, DUID generation
- **Integration Tests**: API calls, database operations, FROST integration
- **E2E Tests**: Complete wizard flow with NFC MFA verification
- **Security Tests**: RLS policy enforcement, privacy-first validation
- **Performance Tests**: Large member lists, concurrent operations

**Total Test Coverage Target**: 95%+ for critical paths

