# Phase 6 — End-to-End Testing & Documentation Plan

**Date:** 2026-03-22  
**Status:** 🚧 **IN PROGRESS**  
**Branch:** `nip-triumvirate-impl`

---

## Overview

Phase 6 focuses on comprehensive end-to-end testing of the NIP-SKL/SA/AC implementation and creating final documentation for deployment and maintenance.

**Objectives:**
1. Verify all components work together end-to-end
2. Test critical user workflows (guardian attestation, agent management, skill licensing)
3. Validate database schema integrity and RLS policies
4. Document deployment procedures and known limitations
5. Create user guides for guardians and developers

---

## 1. End-to-End Testing Strategy

### 1.1 Test Environment Setup

**Prerequisites:**
- ✅ Local Supabase instance running (or staging environment)
- ✅ Netlify Functions deployed to staging
- ✅ NIP-07 browser extension installed (Alby or nos2x)
- ✅ Test guardian account with trusted pubkey in `VITE_GUARDIAN_PUBKEYS`
- ✅ Test agent profiles created in database

**Environment Variables Required:**
```bash
VITE_GUARDIAN_PUBKEYS=<comma-separated-guardian-pubkeys>
VITE_APP_DOMAIN=satnam.pub
VITE_PLATFORM_LIGHTNING_DOMAIN=my.satnam.pub
VITE_OTS_AGENT_PROOFS_ENABLED=true
SUPABASE_URL=<supabase-project-url>
SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
```

---

### 1.2 Critical User Workflows to Test

#### Workflow 1: Guardian Attests a Skill (NIP-SKL)

**Steps:**
1. Navigate to Guardian Attestation Publisher component
2. Verify unverified skills are displayed in table
3. Click "Attest" button on a skill
4. Select attestation label (e.g. "skill/verified/tier2")
5. Confirm NIP-07 signing prompt appears
6. Sign the kind 1985 event
7. Verify success message with event ID
8. Verify database update: `skill_manifests.attestation_status = 'verified'`
9. Verify OTS proof generation triggered (check `ots_proof_records` table)
10. Verify skill no longer appears in unverified list

**Expected Results:**
- ✅ Kind 1985 event signed and published to Nostr relays
- ✅ Database updated via `nip-skl-registry` endpoint
- ✅ OTS proof record created with `proof_status = 'pending'`
- ✅ UI updates to reflect new attestation status

**Test Data:**
```sql
-- Insert test skill manifest
INSERT INTO skill_manifests (
  skill_scope_id,
  manifest_event_id,
  version,
  name,
  description,
  publisher_pubkey,
  attestation_status
) VALUES (
  '33400:test-pubkey:test-skill:1.0.0',
  'test-event-id-12345',
  '1.0.0',
  'Test Skill',
  'A test skill for attestation workflow',
  'test-pubkey-67890',
  'unverified'
);
```

---

#### Workflow 2: Guardian Manages Agent Wallet Policy (NIP-SA)

**Steps:**
1. Navigate to Agent Management Dashboard
2. Verify agents are listed with metrics
3. Click "Edit" button on an agent
4. Modify wallet policy fields:
   - max_single_spend_sats: 2000
   - daily_limit_sats: 150000
   - preferred_spend_rail: 'cashu'
5. Click "Save Wallet Policy"
6. Verify success message
7. Verify database update: `agent_profiles` row updated
8. Verify constraint validation (e.g. max_single_spend_sats <= daily_limit_sats)

**Expected Results:**
- ✅ Wallet policy form displays current values
- ✅ Form validation prevents invalid inputs
- ✅ Database updated via `nip-sa-agent` endpoint
- ✅ UI updates to reflect new wallet policy

**Test Data:**
```sql
-- Insert test agent profile
INSERT INTO agent_profiles (
  user_identity_id,
  is_agent,
  agent_username,
  unified_address,
  agent_pubkey,
  max_single_spend_sats,
  daily_limit_sats
) VALUES (
  'test-user-identity-id',
  true,
  'test-agent',
  'test-agent@ai.satnam.pub',
  'test-agent-pubkey',
  1000,
  100000
);
```

---

#### Workflow 3: Guardian Licenses Skills for Agent (NIP-SA)

**Steps:**
1. Navigate to Agent Management Dashboard
2. Click "Skills" button on an agent
3. Verify two columns: "Available Skills" and "Enabled Skills"
4. Click "+" button on an available skill
5. Verify skill moves to "Enabled Skills" column
6. Verify database update: `agent_profiles.enabled_skill_scope_ids` array updated
7. Click "-" button on an enabled skill
8. Verify skill moves back to "Available Skills" column

**Expected Results:**
- ✅ Skills are categorized correctly (available vs. enabled)
- ✅ Enable/disable actions call `nip-sa-agent` endpoint
- ✅ Database array updated correctly
- ✅ UI updates in real-time

---

#### Workflow 4: Guardian Views OTS Proofs (OTS Integration)

**Steps:**
1. Navigate to Agent Management Dashboard
2. Click "Proofs" button on an agent
3. Verify OTS proofs are listed in table
4. Verify status badges display correctly (pending/confirmed/failed)
5. Click "Download" button on a proof
6. Verify .ots file downloads
7. Filter by proof_status (e.g. "confirmed")
8. Verify pagination works (if > 50 proofs)

**Expected Results:**
- ✅ Proofs are displayed with correct metadata
- ✅ Status badges are color-coded correctly
- ✅ Download button retrieves .ots file from storage
- ✅ Filters and pagination work correctly

---

### 1.3 Database Schema Integrity Tests

**Test 1: RLS Policies**
```sql
-- Test 1: Authenticated users can SELECT skill_manifests
SET ROLE authenticated;
SELECT * FROM skill_manifests LIMIT 1;
-- Expected: Success

-- Test 2: Authenticated users cannot INSERT skill_manifests
SET ROLE authenticated;
INSERT INTO skill_manifests (skill_scope_id, manifest_event_id, version, name, publisher_pubkey)
VALUES ('test', 'test', '1.0', 'test', 'test');
-- Expected: Permission denied

-- Test 3: Service role can INSERT skill_manifests
SET ROLE service_role;
INSERT INTO skill_manifests (skill_scope_id, manifest_event_id, version, name, publisher_pubkey)
VALUES ('test', 'test', '1.0', 'test', 'test');
-- Expected: Success

-- Test 4: Agents can SELECT their own OTS proofs
SET ROLE authenticated;
SELECT * FROM ots_proof_records WHERE agent_pubkey = current_setting('request.jwt.claims')::json->>'sub';
-- Expected: Success

-- Test 5: Public can SELECT confirmed OTS proofs
SET ROLE anon;
SELECT * FROM ots_proof_records WHERE proof_status = 'confirmed';
-- Expected: Success (if RLS policy allows)
```

**Test 2: Foreign Key Constraints**
```sql
-- Test: Cannot insert agent_profile with invalid user_identity_id
INSERT INTO agent_profiles (user_identity_id, is_agent, agent_username)
VALUES ('non-existent-id', true, 'test');
-- Expected: Foreign key violation

-- Test: Cannot insert OTS proof with invalid agent_pubkey
INSERT INTO ots_proof_records (proof_hash, ots_proof_file_url, agent_pubkey)
VALUES ('test-hash', 'test-url', 'non-existent-pubkey');
-- Expected: Success (no FK constraint on agent_pubkey, it's just a TEXT field)
```

**Test 3: Check Constraints**
```sql
-- Test: Cannot insert invalid attestation_status
INSERT INTO skill_manifests (skill_scope_id, manifest_event_id, version, name, publisher_pubkey, attestation_status)
VALUES ('test', 'test', '1.0', 'test', 'test', 'invalid-status');
-- Expected: Check constraint violation

-- Test: Cannot insert invalid proof_status
INSERT INTO ots_proof_records (proof_hash, ots_proof_file_url, agent_pubkey, proof_status)
VALUES ('test', 'test', 'test', 'invalid-status');
-- Expected: Check constraint violation
```

---

### 1.4 API Endpoint Tests

**Test 1: NIP-SKL Registry Endpoint**
```bash
# Test register-skill
curl -X POST https://satnam.pub/.netlify/functions/nip-skl-registry \
  -H "Content-Type: application/json" \
  -d '{
    "action": "register-skill",
    "nostr_event": {
      "kind": 33400,
      "pubkey": "test-pubkey",
      "created_at": 1234567890,
      "tags": [["d", "test-skill"], ["version", "1.0.0"], ["name", "Test Skill"]],
      "content": "{}",
      "id": "test-event-id",
      "sig": "test-signature"
    }
  }'
# Expected: 400 (invalid signature) or 200 (if signature is valid)

# Test query-skills
curl -X POST https://satnam.pub/.netlify/functions/nip-skl-registry \
  -H "Content-Type: application/json" \
  -d '{
    "action": "query-skills",
    "attestation_status": "verified",
    "limit": 10
  }'
# Expected: 200 with skills array
```

**Test 2: NIP-SA Agent Endpoint**
```bash
# Test update-wallet-policy
curl -X POST https://satnam.pub/.netlify/functions/nip-sa-agent \
  -H "Content-Type: application/json" \
  -d '{
    "action": "update-wallet-policy",
    "agent_pubkey": "test-agent-pubkey",
    "guardian_pubkey": "test-guardian-pubkey",
    "wallet_policy": {
      "max_single_spend_sats": 2000,
      "daily_limit_sats": 150000
    }
  }'
# Expected: 200 with updated agent_profile
```

**Test 3: .well-known/agent.json Endpoint**
```bash
# Test agent discovery
curl https://satnam.pub/.well-known/agent.json?address=test-agent@ai.satnam.pub
# Expected: 200 with agent metadata JSON
```

---

## 2. Known Limitations & TODOs

### High Priority
1. **Control Board Integration** — Phase 5 components not yet integrated into Control Board tabs
2. **CEPS Integration** — Kind 1985 relay publishing not yet integrated with `lib/central_event_publishing_service.ts`
3. **Guardian Auth Context** — `"TODO"` placeholders need to be replaced with actual guardian pubkey from auth context
4. **OTS Proof Verifier Modal** — Verify button in OTSProofList currently just logs to console

### Medium Priority
5. **Skill Verification Before Enabling** — SkillLicensingManager should verify skill exists and has valid attestation before enabling
6. **Guardian Authorization Check** — Full guardian authority verification not yet implemented in `nip-sa-agent.js`
7. **Create `nip_revocation_events` Table** — Revocation event tracking table not yet created

### Low Priority
8. **Drag-and-Drop Skill Licensing** — Current UI is button-based, drag-and-drop would enhance UX
9. **Batch Skill Enable/Disable** — Allow enabling/disabling multiple skills at once
10. **Agent Creation UI** — Currently only management of existing agents, no creation UI

---

## 3. Deployment Checklist

### Database Migrations
- [ ] Execute `20260320_nip_skl_schema.sql` in Supabase SQL Editor
- [ ] Execute `20260321_nip_sa_agent_profiles.sql` in Supabase SQL Editor
- [ ] Execute `20260322_ots_simpleproof_integration.sql` in Supabase SQL Editor
- [ ] Execute `20260323_agent_skill_management_functions.sql` in Supabase SQL Editor
- [ ] Verify all tables exist: `skill_manifests`, `ots_proof_records`, `agent_profiles` (extended)
- [ ] Verify all functions exist: `enable_agent_skill`, `disable_agent_skill`, `increment_ots_attestation_count`
- [ ] Verify RLS policies are enabled on all tables

### Netlify Functions
- [ ] Deploy `nip-skl-registry.js` to `netlify/functions_active/`
- [ ] Deploy `nip-sa-agent.js` to `netlify/functions_active/`
- [ ] Deploy `well-known-agent.js` to `netlify/functions_active/`
- [ ] Deploy `nip-ac-revocation-handler.js` to `netlify/functions_active/`
- [ ] Update `netlify.toml` with .well-known/agent.json redirect
- [ ] Verify all functions are accessible via `/.netlify/functions/<function-name>`

### Environment Variables
- [ ] Set `VITE_GUARDIAN_PUBKEYS` in Netlify environment variables
- [ ] Set `VITE_OTS_AGENT_PROOFS_ENABLED=true` (if enabling OTS proofs)
- [ ] Verify `SUPABASE_SERVICE_ROLE_KEY` is set for Netlify Functions

### UI Components
- [ ] Deploy Phase 5 components to production
- [ ] Verify components render without errors
- [ ] Test NIP-07 signing in production environment
- [ ] Verify API endpoint integration works in production

---

## 4. User Documentation

### Guardian User Guide (To Be Created)

**File:** `docs/user-guides/GUARDIAN-GUIDE.md`

**Sections:**
1. Introduction to Guardian Role
2. How to Attest Skills
3. How to Manage Agents
4. How to License Skills for Agents
5. How to View and Verify OTS Proofs
6. Troubleshooting Common Issues

### Developer Documentation (To Be Created)

**File:** `docs/developer-guides/NIP-TRIUMVIRATE-DEVELOPER-GUIDE.md`

**Sections:**
1. Architecture Overview
2. Database Schema Reference
3. Netlify Functions API Reference
4. UI Components Reference
5. Testing Guide
6. Deployment Guide
7. Contributing Guidelines

---

## 5. Next Steps

**Phase 6 is in progress.** Testing and documentation are ongoing.

**Immediate Actions:**
1. Execute database migrations in staging environment
2. Deploy Netlify Functions to staging
3. Run end-to-end workflow tests
4. Document test results
5. Create user and developer guides
6. Prepare for production deployment

**Awaiting approval before production deployment.**

