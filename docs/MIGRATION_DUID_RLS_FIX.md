# DUID‑aware RLS + Contacts‑Only Visibility (Phase 2)

This migration updates the profile visibility system to be DUID‑aware and implements contacts‑only visibility using the encrypted_contacts table while preserving the privacy‑first architecture.

## Why this change?

- Previous policies compared `user_identities.id` (DUID stored as TEXT) against `auth.uid()` (Supabase UUID). This prevented owners from reading/updating their own profiles and viewing analytics.
- Contacts‑only visibility previously referenced a non‑existent `contacts` table. Production uses `encrypted_contacts` with privacy‑first hashed identifiers.

## What’s implemented

1. DUID context helper used by all policies
2. Contact membership check via encrypted_contacts with privacy‑first hashes
3. Owner self‑access policies updated to DUID‑aware logic
4. Add verification flags to encrypted_contacts (future‑proofing)

## Architecture

- Source of truth for contact relationships: `public.encrypted_contacts`
  - Identifiers: `owner_hash` (privacy_users.hashed_uuid) and `contact_hash` (owner‑bound, 32‑hex substring of SHA‑256)
- NFC‑validated contacts remain in `public.validated_contacts` (not used in RLS policies)
- DUID resolution precedence: `app.current_user_duid` (GUC) → `request.jwt.claims.userId` (JWT claim)
- No plaintext usernames/npubs/UUIDs are used in RLS lookups

## Helper functions added (idempotent)

- `get_current_user_duid()`
  - Resolves the current viewer’s DUID from session context or JWT claims
- `get_owner_hash_from_duid(p_owner_duid TEXT)`
  - Maps owner DUID → `privacy_users.hashed_uuid` via `user_salt` join
- `compute_contact_hash_for_owner(p_owner_duid TEXT, p_viewer_duid TEXT)`
  - Computes owner‑bound `contact_hash` as the first 32 hex chars of `SHA‑256(viewer_duid || '|' || owner.user_salt)`
- `is_contact_of_owner(p_owner_duid TEXT, p_viewer_duid TEXT)`
  - SECURITY DEFINER function that returns boolean membership by checking `encrypted_contacts(owner_hash, contact_hash)`

Security notes:

- SECURITY DEFINER is required to avoid circular RLS when checking contact membership; the function only returns a boolean (no data leakage).
- Fully‑qualified table names and a defensive `search_path` setting are used to prevent function‑hijacking.

## RLS policies updated

- Public profiles: unchanged (`profile_visibility = 'public'`)
- Contacts‑only profiles: now enforced via `encrypted_contacts`
- Owner self‑access: `id = get_current_user_duid()` for SELECT/UPDATE and analytics

Default behavior: any contact listed in `encrypted_contacts` is sufficient for viewing `contacts_only` profiles (no verification level gating in Phase 2).

## Schema enhancement (idempotent)

Adds verification flags to `encrypted_contacts` for future workflows:

- `physical_mfa_verified BOOLEAN DEFAULT false`
- `simpleproof_verified BOOLEAN DEFAULT false`
- `kind0_verified BOOLEAN DEFAULT false`
- `pkarr_verified BOOLEAN DEFAULT false`
- `iroh_dht_verified BOOLEAN DEFAULT false`
- `verification_level TEXT CHECK (verification_level IN ('unverified','basic','verified','trusted')) DEFAULT 'unverified'`

No behavior change in Phase 2; app logic may update these fields.

## Verification queries

Run these in Supabase SQL Editor after applying the migration.

1. Owner can read/update own profile

```sql
SELECT set_config('app.current_user_duid', '<OWNER_DUID>', true);
SELECT id FROM user_identities WHERE id = '<OWNER_DUID>';
UPDATE user_identities SET profile_banner_url = 'https://example.com/banner.png' WHERE id = '<OWNER_DUID>';
```

2. Public profile visible to everyone

```sql
SELECT set_config('app.current_user_duid', '<OTHER_DUID>', true);
SELECT id FROM user_identities WHERE id = '<PUBLIC_OWNER_DUID>' AND profile_visibility = 'public';
```

3. Contacts‑only: allowed viewer

```sql
SELECT set_config('app.current_user_duid', '<VIEWER_DUID>', true);
SELECT is_contact_of_owner('<OWNER_DUID>', get_current_user_duid()); -- expect true
SELECT id FROM user_identities WHERE id = '<OWNER_DUID>' AND profile_visibility = 'contacts_only'; -- expect 1 row
```

4. Contacts‑only: blocked non‑contact

```sql
SELECT set_config('app.current_user_duid', '<NON_CONTACT_DUID>', true);
SELECT is_contact_of_owner('<OWNER_DUID>', get_current_user_duid()); -- expect false
SELECT id FROM user_identities WHERE id = '<OWNER_DUID>' AND profile_visibility = 'contacts_only'; -- expect 0 rows
```

5. Analytics readable by owner

```sql
SELECT set_config('app.current_user_duid', '<OWNER_DUID>', true);
SELECT COUNT(*) FROM profile_views WHERE profile_id = '<OWNER_DUID>';
```

## Operational notes

- Ensure pgcrypto extension is enabled (digest function). The codebase already uses it elsewhere.
- JWTs must include the `userId` claim carrying the DUID (already implemented in auth‑unified.js).
- For server‑side operations, set `app.current_user_duid` to avoid relying on JWT parsing inside the database when appropriate.

## Future enhancements (not included in Phase 2)

- Trusted‑contacts‑only visibility by gating on `verification_level`
- Trigger to auto‑derive `verification_level` from individual verification flags
- Additional verification sources (e.g., relay‑confirmed presence, CEPS interactions)

## Phase 2 Enhancement: Trusted-Contacts-Only Mode

This enhancement introduces a fourth visibility mode and automated derivation of contact verification levels while preserving the existing “contacts_only” behavior.

### New visibility mode

- `trusted_contacts_only`: Profile is readable only to contacts whose verification_level is `verified` or `trusted`.
- Implemented by a new RLS policy using `is_trusted_contact_of_owner(id, get_current_user_duid())`.

### Verification level auto-derivation

A BEFORE trigger updates `encrypted_contacts.verification_level` on INSERT/UPDATE of verification flags.

- trusted: `physical_mfa_verified = true` AND (`simpleproof_verified = true` OR `kind0_verified = true`)
- verified: `physical_mfa_verified = true` OR (`simpleproof_verified = true` AND `kind0_verified = true`)
- basic: any single flag is true (physical_mfa OR simpleproof OR kind0 OR pkarr OR iroh_dht)
- unverified: all flags false

Quick reference table:

- physical_mfa + simpleproof = trusted
- physical_mfa + kind0 = trusted
- simpleproof + kind0 (no physical_mfa) = verified
- physical_mfa only = verified
- any of pkarr/iroh_dht only = basic
- no flags = unverified

### Example verification queries (trusted-contacts-only)

```sql
-- Set owner's visibility to trusted_contacts_only
UPDATE user_identities SET profile_visibility='trusted_contacts_only' WHERE id='<OWNER_DUID>';

-- Trusted contact allowed (viewer with verification_level in ['verified','trusted'])
SELECT set_config('app.current_user_duid', '<TRUSTED_OR_VERIFIED_VIEWER_DUID>', true);
SELECT id FROM user_identities WHERE id='<OWNER_DUID>' AND profile_visibility='trusted_contacts_only';

-- Basic contact blocked
SELECT set_config('app.current_user_duid', '<BASIC_VIEWER_DUID>', true);
SELECT id FROM user_identities WHERE id='<OWNER_DUID>' AND profile_visibility='trusted_contacts_only'; -- expect 0 rows

-- Non-contact blocked
SELECT set_config('app.current_user_duid', '<NON_CONTACT_DUID>', true);
SELECT id FROM user_identities WHERE id='<OWNER_DUID>' AND profile_visibility='trusted_contacts_only'; -- expect 0 rows
```

### Backward compatibility

- Existing `contacts_only` behavior is unchanged: any contact in `encrypted_contacts` can read `contacts_only` profiles (no verification_level gating in Phase 2).
- No changes to contact_hash derivation algorithm.
- All changes are idempotent and privacy-first; no plaintext identifiers are stored or compared.
