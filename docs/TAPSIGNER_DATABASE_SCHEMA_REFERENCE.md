# Tapsigner Database Schema Reference

**Status**: READY FOR EXECUTION  
**Date**: November 5, 2025  
**Scope**: Complete database schema for Tapsigner integration

---

## 📊 Schema Overview

### Extended Tables (Existing)

#### lnbits_boltcards (Extended)
**Migration**: `database/migrations/043_tapsigner_lnbits_extension.sql`

**New Columns**:
```sql
card_type TEXT DEFAULT 'boltcard' CHECK (card_type IN ('boltcard', 'tapsigner'))
public_key_hex TEXT
xpub TEXT
derivation_path TEXT DEFAULT 'm/84h/0h/0h'
```

**New Indexes**:
- `idx_lnbits_boltcards_type`: For card type queries
- `idx_lnbits_boltcards_pubkey`: For public key lookups (Tapsigner only)
- `idx_lnbits_boltcards_user_type`: For user + card type queries

**Backward Compatibility**: ✅ YES
- Existing NTAG424 records unchanged
- `card_type` defaults to 'boltcard'
- No breaking changes

---

### New Tables (Tapsigner-Specific)

#### tapsigner_registrations
**Migration**: `database/migrations/036_tapsigner_setup.sql`

**Purpose**: Stores registered Tapsigner cards with public keys and metadata

**Columns**:
```sql
id UUID PRIMARY KEY
owner_hash TEXT NOT NULL (FK: privacy_users.hashed_uuid)
card_id TEXT NOT NULL UNIQUE
public_key_hex TEXT NOT NULL
xpub TEXT
derivation_path TEXT DEFAULT 'm/84h/0h/0h'
family_role TEXT DEFAULT 'private' (CHECK: private|offspring|adult|steward|guardian)
pin_attempts INT DEFAULT 0
pin_locked_until TIMESTAMPTZ
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
last_used TIMESTAMPTZ
```

**Indexes**:
- `idx_tapsigner_owner`: For user lookups
- `idx_tapsigner_card_id`: For card lookups
- `idx_tapsigner_last_used`: For activity tracking

**RLS Policies**:
- SELECT: `owner_hash = current_setting('app.current_user_hash')`
- INSERT: `owner_hash = current_setting('app.current_user_hash')`
- UPDATE: `owner_hash = current_setting('app.current_user_hash')`
- DELETE: `owner_hash = current_setting('app.current_user_hash')`

---

#### tapsigner_operations_log
**Migration**: `database/migrations/036_tapsigner_setup.sql`

**Purpose**: Audit trail for all Tapsigner operations (auth, signing, payments)

**Columns**:
```sql
id UUID PRIMARY KEY
owner_hash TEXT NOT NULL (FK: privacy_users.hashed_uuid)
card_id TEXT NOT NULL
operation_type TEXT NOT NULL 
  CHECK (operation_type IN ('register','auth','sign','payment','verify','error'))
success BOOLEAN NOT NULL DEFAULT false
error_message TEXT
signature_hex TEXT
timestamp TIMESTAMPTZ DEFAULT NOW()
metadata JSONB DEFAULT '{}'::jsonb
```

**Indexes**:
- `idx_tapsigner_ops_owner`: For user lookups
- `idx_tapsigner_ops_timestamp`: For time-based queries
- `idx_tapsigner_ops_type`: For operation type queries

**RLS Policies**:
- SELECT: `owner_hash = current_setting('app.current_user_hash')`
- INSERT: `owner_hash = current_setting('app.current_user_hash')`

---

#### tapsigner_lnbits_links
**Migration**: `database/migrations/036_tapsigner_setup.sql`

**Purpose**: Maps Tapsigner cards to LNbits wallets for payment authorization

**Columns**:
```sql
id UUID PRIMARY KEY
owner_hash TEXT NOT NULL (FK: privacy_users.hashed_uuid)
card_id TEXT NOT NULL
wallet_id TEXT NOT NULL (FK: lnbits_wallets.wallet_id)
spend_limit_sats BIGINT DEFAULT 50000
tap_to_spend_enabled BOOLEAN DEFAULT false
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()

CONSTRAINT unique_card_wallet UNIQUE(owner_hash, card_id)
```

**Indexes**:
- `idx_tapsigner_lnbits_owner`: For user lookups
- `idx_tapsigner_lnbits_wallet`: For wallet lookups

**RLS Policies**:
- SELECT: `owner_hash = current_setting('app.current_user_hash')`
- INSERT: `owner_hash = current_setting('app.current_user_hash')`
- UPDATE: `owner_hash = current_setting('app.current_user_hash')`
- DELETE: `owner_hash = current_setting('app.current_user_hash')`

---

## 🔍 Query Patterns

### Get All Cards for User

```sql
-- Both NTAG424 and Tapsigner
SELECT * FROM lnbits_boltcards 
WHERE user_duid = $1 
ORDER BY created_at DESC;

-- Tapsigner only
SELECT * FROM lnbits_boltcards 
WHERE user_duid = $1 AND card_type = 'tapsigner'
ORDER BY created_at DESC;

-- NTAG424 only
SELECT * FROM lnbits_boltcards 
WHERE user_duid = $1 AND card_type = 'boltcard'
ORDER BY created_at DESC;
```

### Get Card by Public Key (Tapsigner)

```sql
SELECT * FROM lnbits_boltcards 
WHERE public_key_hex = $1 AND card_type = 'tapsigner';
```

### Get Tapsigner Registration

```sql
SELECT * FROM tapsigner_registrations 
WHERE owner_hash = $1 AND card_id = $2;
```

### Get Wallet Link for Card

```sql
SELECT * FROM tapsigner_lnbits_links 
WHERE owner_hash = $1 AND card_id = $2;
```

### Log Operation

```sql
INSERT INTO tapsigner_operations_log 
  (owner_hash, card_id, operation_type, success, error_message, metadata)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;
```

### Get Operation History

```sql
SELECT * FROM tapsigner_operations_log 
WHERE owner_hash = $1 
ORDER BY timestamp DESC 
LIMIT 100;
```

---

## 🔐 Privacy & Security

### Zero-Knowledge Principles

- ✅ Private keys never stored in database
- ✅ Only public keys stored (public_key_hex)
- ✅ Card IDs hashed with per-user salts
- ✅ No plaintext identifiers
- ✅ RLS policies enforce user isolation

### Hashing Strategy

**Card ID Hashing**:
```typescript
// Server-side only
const cardIdHash = await hashCardId(cardId, userSalt);
// Store cardIdHash in database, never plaintext cardId
```

**User Isolation**:
```sql
-- RLS ensures users can only see their own data
WHERE owner_hash = current_setting('app.current_user_hash')
```

---

## 📋 Migration Execution Checklist

### Before Execution

- [ ] Backup Supabase database
- [ ] Review both migration files
- [ ] Verify Supabase connection
- [ ] Check for existing tables/columns

### Execution

- [ ] Execute `043_tapsigner_lnbits_extension.sql`
- [ ] Verify success message
- [ ] Execute `036_tapsigner_setup.sql`
- [ ] Verify success message

### Verification

- [ ] Verify all columns added to `lnbits_boltcards`
- [ ] Verify all Tapsigner tables created
- [ ] Verify all indexes created
- [ ] Verify RLS policies enabled
- [ ] Verify backward compatibility (existing NTAG424 records unchanged)

### Testing

- [ ] Query existing NTAG424 records
- [ ] Verify `card_type = 'boltcard'` for existing records
- [ ] Test new Tapsigner columns are NULL for existing records
- [ ] Verify RLS policies work correctly

---

## 🚀 Next Steps

### After Schema Execution

1. **Add Feature Flags** (Task 1.3)
   - Add to `netlify.toml`
   - Add to `.env`

2. **Create Type Definitions** (Task 1.4)
   - Create `src/types/tapsigner.ts`
   - Export from `src/types/index.ts`

3. **Scaffold UI Components** (Task 1.5)
   - Create `TapsignerAuthModal.tsx`
   - Create `TapsignerSetupFlow.tsx`
   - Create `TapsignerStatusDisplay.tsx`

4. **Begin Phase 2** (Week 2)
   - Implement TapsignerProtocol class
   - Implement ECDSA verification
   - Create Netlify Function handlers

---

## 📚 Reference Files

- **Migration 1**: `database/migrations/043_tapsigner_lnbits_extension.sql`
- **Migration 2**: `database/migrations/036_tapsigner_setup.sql`
- **Documentation**: `docs/TAPSIGNER_LNBITS_INTEGRATION.md`
- **Execution Guide**: `docs/PHASE1_TAPSIGNER_EXECUTION_GUIDE.md`
- **Ready to Execute**: `docs/PHASE1_TAPSIGNER_READY_TO_EXECUTE.md`

---

## ✅ Summary

**Two idempotent migrations are ready to execute**:

1. **043_tapsigner_lnbits_extension.sql**: Extends `lnbits_boltcards` for unified card management
2. **036_tapsigner_setup.sql**: Creates three Tapsigner-specific tables

**Both migrations**:
- ✅ Are idempotent (safe to re-run)
- ✅ Maintain backward compatibility
- ✅ Include RLS policies
- ✅ Include performance indexes
- ✅ Include verification checks
- ✅ Are ready to execute in Supabase SQL Editor

**Status**: ✅ READY FOR EXECUTION

