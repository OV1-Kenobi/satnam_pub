# NIP-03 Architecture Diagram

---

## SYSTEM ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER FLOWS                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Flow 1: Identity Creation    Flow 2: Key Rotation             │
│  ┌──────────────────────┐     ┌──────────────────────┐         │
│  │ IdentityForge.tsx    │     │ KeyRotationModal.tsx │         │
│  │ (UI Component)       │     │ (UI Component)       │         │
│  └──────────┬───────────┘     └──────────┬───────────┘         │
│             │                            │                     │
│             ▼                            ▼                     │
│  ┌──────────────────────┐     ┌──────────────────────┐         │
│  │ register-identity.ts │     │ nostr-key-recovery.ts│         │
│  │ (Netlify Function)   │     │ (Service)            │         │
│  └──────────┬───────────┘     └──────────┬───────────┘         │
│             │                            │                     │
│             └────────────┬───────────────┘                     │
│                          │                                     │
│                          ▼                                     │
│             ┌────────────────────────┐                         │
│             │ attestation-manager.ts │                         │
│             │ (Orchestrator)         │                         │
│             └────────────┬───────────┘                         │
│                          │                                     │
└──────────────────────────┼─────────────────────────────────────┘
                           │
┌──────────────────────────┼─────────────────────────────────────┐
│                          ▼                                     │
│              ATTESTATION PIPELINE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. CREATE NOSTR EVENT (Kind:0, Kind:1776, etc.)        │   │
│  │    - Sign with CEPS                                    │   │
│  │    - Publish to relays                                 │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                        │
│  ┌────────────────────▼────────────────────────────────────┐   │
│  │ 2. CREATE SIMPLEPROOF TIMESTAMP                         │   │
│  │    - Call simpleproof-timestamp.ts                      │   │
│  │    - Get OTS proof + Bitcoin block/tx                   │   │
│  │    - Store in simpleproof_timestamps table              │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                        │
│  ┌────────────────────▼────────────────────────────────────┐   │
│  │ 3. CREATE NIP-03 ATTESTATION (Kind:1040)               │   │
│  │    - nip03-attestation-service.ts                       │   │
│  │    - Build Kind:1040 event with OTS proof              │   │
│  │    - Sign with CEPS                                    │   │
│  │    - Publish to relays                                 │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                        │
│  ┌────────────────────▼────────────────────────────────────┐   │
│  │ 4. STORE ATTESTATION METADATA                           │   │
│  │    - nip03_attestations table                           │   │
│  │    - Link to original event                             │   │
│  │    - Store OTS proof & Bitcoin details                  │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                        │
└───────────────────────┼────────────────────────────────────────┘
                        │
┌───────────────────────┼────────────────────────────────────────┐
│                       ▼                                        │
│              STORAGE & PUBLISHING                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │ Supabase Database    │  │ Nostr Relays         │            │
│  │ ┌────────────────┐   │  │ ┌────────────────┐   │            │
│  │ │ nip03_         │   │  │ │ wss://relay.   │   │            │
│  │ │ attestations   │   │  │ │ satnam.pub     │   │            │
│  │ │ (RLS policies) │   │  │ │ (Kind:1040)    │   │            │
│  │ └────────────────┘   │  │ └────────────────┘   │            │
│  │ ┌────────────────┐   │  │ ┌────────────────┐   │            │
│  │ │ simpleproof_   │   │  │ │ wss://nos.lol  │   │            │
│  │ │ timestamps     │   │  │ │ (Kind:1040)    │   │            │
│  │ │ (OTS proofs)   │   │  │ └────────────────┘   │            │
│  │ └────────────────┘   │  │ ┌────────────────┐   │            │
│  │ ┌────────────────┐   │  │ │ Other relays   │   │            │
│  │ │ pkarr_records  │   │  │ │ (Kind:1040)    │   │            │
│  │ │ (Optional)     │   │  │ └────────────────┘   │            │
│  │ └────────────────┘   │  └──────────────────────┘            │
│  └──────────────────────┘                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## DATA FLOW: IDENTITY CREATION

```
┌─────────────────────────────────────────────────────────────────┐
│ USER INITIATES REGISTRATION                                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. CREATE KIND:0 EVENT                                          │
│    - Username, profile, NIP-05                                  │
│    - Sign with CEPS                                             │
│    - Publish to relays                                          │
│    - Get event ID: abc123...                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. CREATE SIMPLEPROOF TIMESTAMP                                 │
│    - Data: event ID (abc123...)                                 │
│    - Call SimpleProof API                                       │
│    - Get OTS proof + Bitcoin block/tx                           │
│    - Store in simpleproof_timestamps table                      │
│    - Get timestamp ID: def456...                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. CREATE NIP-03 KIND:1040 EVENT                                │
│    - Reference event: abc123...                                 │
│    - Include OTS proof                                          │
│    - Include Bitcoin block/tx                                   │
│    - Sign with CEPS                                             │
│    - Publish to relays                                          │
│    - Get event ID: ghi789...                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. STORE ATTESTATION METADATA                                   │
│    - nip03_attestations table                                   │
│    - attested_event_id: abc123...                               │
│    - nip03_event_id: ghi789...                                  │
│    - simpleproof_timestamp_id: def456...                        │
│    - event_type: identity_creation                              │
│    - user_duid: user_hash...                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ REGISTRATION COMPLETE                                           │
│ - User has immutable blockchain-backed identity                 │
│ - All events published to Nostr relays                          │
│ - Attestation verifiable by anyone                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## SERVICE INTERACTION DIAGRAM

```
┌──────────────────────────────────────────────────────────────────┐
│                    CEPS (Central Event                           │
│                    Publishing Service)                           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ - signEventWithActiveSession()                             │  │
│  │ - publishEvent()                                           │  │
│  │ - verifyEvent()                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
         ▲                                    ▲
         │                                    │
         │ (sign & publish)                   │ (sign & publish)
         │                                    │
┌────────┴──────────────────┐    ┌───────────┴──────────────────┐
│ attestation-manager.ts    │    │ nip03-attestation-service.ts │
│ ┌──────────────────────┐  │    │ ┌──────────────────────────┐ │
│ │ createAttestation()  │  │    │ │ createAttestation()      │ │
│ │ getAttestations()    │  │    │ │ publishAttestation()     │ │
│ │ getAttestation()     │  │    │ │ storeAttestation()       │ │
│ │ formatAttestation()  │  │    │ │ getAttestation()         │ │
│ └──────────────────────┘  │    │ │ listAttestations()       │ │
└────────┬──────────────────┘    │ └──────────────────────────┘ │
         │                       └───────────┬──────────────────┘
         │                                   │
         │ (calls)                           │ (calls)
         │                                   │
         ▼                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                    SimpleProof Service                           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ simpleproof-timestamp.ts (Netlify Function)                │  │
│  │ - callSimpleProofApi()                                     │  │
│  │ - storeTimestamp()                                         │  │
│  │ - Returns: ots_proof, bitcoin_block, bitcoin_tx            │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
         ▲
         │ (HTTP POST)
         │
┌────────┴──────────────────────────────────────────────────────────┐
│                    SimpleProof API                                │
│  - /timestamp endpoint                                            │
│  - Creates OpenTimestamps proofs                                  │
│  - Anchors to Bitcoin blockchain                                  │
└───────────────────────────────────────────────────────────────────┘
```

---

## DATABASE SCHEMA RELATIONSHIPS

```
┌─────────────────────────────────────────────────────────────────┐
│ user_identities                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ id (DUID)                                                   │ │
│ │ username                                                    │ │
│ │ npub                                                        │ │
│ │ nip05                                                       │ │
│ │ role (private/offspring/adult/steward/guardian)            │ │
│ └─────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │ (1:N)
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ nip03_attestations                                              │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ id (UUID)                                                   │ │
│ │ attested_event_id (Kind:0, Kind:1776, etc.)                │ │
│ │ nip03_event_id (Kind:1040)                                  │ │
│ │ simpleproof_timestamp_id (FK)                               │ │
│ │ user_duid (FK to user_identities)                           │ │
│ │ event_type (identity_creation/key_rotation/role_change)    │ │
│ │ ots_proof                                                   │ │
│ │ bitcoin_block                                               │ │
│ │ bitcoin_tx                                                  │ │
│ │ published_at                                                │ │
│ │ metadata (JSONB)                                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │ (1:1)
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ simpleproof_timestamps                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ id (UUID)                                                   │ │
│ │ verification_id (FK)                                        │ │
│ │ ots_proof                                                   │ │
│ │ bitcoin_block                                               │ │
│ │ bitcoin_tx                                                  │ │
│ │ created_at                                                  │ │
│ │ verified_at                                                 │ │
│ │ is_valid                                                    │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## FEATURE FLAG FLOW

```
┌─────────────────────────────────────────────────────────────────┐
│ VITE_NIP03_ENABLED (Master Flag)                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌────────┐      ┌────────┐      ┌────────┐
    │ Phase1 │      │ Phase2 │      │ Phase3 │
    │ Key    │      │Identity│      │ Role   │
    │Rotation│      │Creation│      │Changes │
    └────────┘      └────────┘      └────────┘
         │               │               │
         ▼               ▼               ▼
    VITE_NIP03_    VITE_NIP03_    VITE_NIP03_
    KEY_ROTATION   IDENTITY_     ROLE_CHANGES
                   CREATION
```

---

## DEPLOYMENT STAGES

```
┌─────────────────────────────────────────────────────────────────┐
│ DEVELOPMENT                                                     │
│ - All flags: false                                              │
│ - Local testing                                                 │
│ - Unit & integration tests                                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGING                                                         │
│ - Phase 1 flag: true                                            │
│ - E2E testing                                                   │
│ - Performance testing                                           │
│ - Security audit                                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ PRODUCTION (Phase 1)                                            │
│ - VITE_NIP03_ENABLED: true                                      │
│ - VITE_NIP03_KEY_ROTATION: true                                 │
│ - Monitor Sentry (24 hours)                                     │
│ - Verify blockchain confirmations                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ PRODUCTION (Phase 2 & 3)                                        │
│ - Enable additional flags progressively                         │
│ - Monitor performance & errors                                  │
│ - Collect user feedback                                         │
└─────────────────────────────────────────────────────────────────┘
```

