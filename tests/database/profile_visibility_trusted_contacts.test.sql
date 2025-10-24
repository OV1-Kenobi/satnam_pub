-- Tests: Trusted-Contacts-Only visibility + auto-derivation trigger
-- How to run: Paste into Supabase SQL Editor with RLS enabled for queries
-- Expected: See EXPECT comments after each section

-- Ensure crypto functions available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Setup test identities (idempotent)
-- -----------------------------------------------------------------------------
-- Owner
INSERT INTO public.user_identities (id, user_salt, encrypted_nsec, encrypted_nsec_iv, hashed_username, hashed_npub, password_hash, password_salt, profile_visibility)
VALUES ('duid_tc_owner1', 'salt_tc_owner1', NULL, NULL, 'u_owner1', 'n_owner1', 'p_owner1', 'ps_owner1', 'private')
ON CONFLICT (id) DO NOTHING;

-- Owner privacy mapping
INSERT INTO public.privacy_users (hashed_uuid, user_salt, auth_method, last_auth_at)
VALUES ('owner_hash_tc1', 'salt_tc_owner1', 'nip07', EXTRACT(EPOCH FROM now())::bigint)
ON CONFLICT (hashed_uuid) DO NOTHING;

-- Viewers (distinct to avoid UNIQUE(owner_hash,contact_hash) conflicts)
INSERT INTO public.user_identities (id, user_salt, encrypted_nsec, encrypted_nsec_iv, hashed_username, hashed_npub, password_hash, password_salt)
VALUES
('duid_tc_viewer_trusted', 'salt_tc_viewer_trusted', NULL, NULL, 'u_vt', 'n_vt', 'p_vt', 'ps_vt'),
('duid_tc_viewer_verified', 'salt_tc_viewer_verified', NULL, NULL, 'u_vv', 'n_vv', 'p_vv', 'ps_vv'),
('duid_tc_viewer_basic', 'salt_tc_viewer_basic', NULL, NULL, 'u_vb', 'n_vb', 'p_vb', 'ps_vb'),
('duid_tc_viewer_unver', 'salt_tc_viewer_unver', NULL, NULL, 'u_vu', 'n_vu', 'p_vu', 'ps_vu'),
('duid_tc_viewer_update', 'salt_tc_viewer_update', NULL, NULL, 'u_vu2', 'n_vu2', 'p_vu2', 'ps_vu2'),
('duid_tc_viewer_noncontact', 'salt_tc_viewer_noncontact', NULL, NULL, 'u_vnc', 'n_vnc', 'p_vnc', 'ps_vnc')
ON CONFLICT (id) DO NOTHING;

-- Convenience: compute owner_hash via helper
-- (Should equal 'owner_hash_tc1' from privacy_users row)
SELECT public.get_owner_hash_from_duid('duid_tc_owner1') AS owner_hash_expect_owner_hash_tc1;

-- -----------------------------------------------------------------------------
-- Test 1-5: Trigger derivation on INSERT (EXPECT: trusted, verified, verified, basic, unverified)
-- -----------------------------------------------------------------------------
-- 1) trusted: physical_mfa=true AND (simpleproof=true OR kind0=true)
INSERT INTO public.encrypted_contacts (owner_hash, encrypted_contact, contact_hash,
  physical_mfa_verified, simpleproof_verified, kind0_verified, pkarr_verified, iroh_dht_verified)
SELECT 'owner_hash_tc1', 'enc', public.compute_contact_hash_for_owner('duid_tc_owner1','duid_tc_viewer_trusted'),
  true, true, false, false, false;
SELECT verification_level FROM public.encrypted_contacts
WHERE owner_hash='owner_hash_tc1' AND contact_hash=public.compute_contact_hash_for_owner('duid_tc_owner1','duid_tc_viewer_trusted'); -- EXPECT: trusted

-- 2) verified: simpleproof=true AND kind0=true (no physical_mfa)
INSERT INTO public.encrypted_contacts (owner_hash, encrypted_contact, contact_hash,
  physical_mfa_verified, simpleproof_verified, kind0_verified, pkarr_verified, iroh_dht_verified)
SELECT 'owner_hash_tc1', 'enc', public.compute_contact_hash_for_owner('duid_tc_owner1','duid_tc_viewer_verified'),
  false, true, true, false, false;
SELECT verification_level FROM public.encrypted_contacts
WHERE owner_hash='owner_hash_tc1' AND contact_hash=public.compute_contact_hash_for_owner('duid_tc_owner1','duid_tc_viewer_verified'); -- EXPECT: verified

-- 3) verified: physical_mfa=true (others false)
INSERT INTO public.encrypted_contacts (owner_hash, encrypted_contact, contact_hash,
  physical_mfa_verified, simpleproof_verified, kind0_verified, pkarr_verified, iroh_dht_verified)
SELECT 'owner_hash_tc1', 'enc', public.compute_contact_hash_for_owner('duid_tc_owner1','duid_tc_viewer_basic'),
  true, false, false, false, false;
SELECT verification_level FROM public.encrypted_contacts
WHERE owner_hash='owner_hash_tc1' AND contact_hash=public.compute_contact_hash_for_owner('duid_tc_owner1','duid_tc_viewer_basic'); -- EXPECT: verified

-- 4) basic: only pkarr=true
INSERT INTO public.encrypted_contacts (owner_hash, encrypted_contact, contact_hash,
  physical_mfa_verified, simpleproof_verified, kind0_verified, pkarr_verified, iroh_dht_verified)
SELECT 'owner_hash_tc1', 'enc', public.compute_contact_hash_for_owner('duid_tc_owner1','duid_tc_viewer_unver'),
  false, false, false, true, false;
SELECT verification_level FROM public.encrypted_contacts
WHERE owner_hash='owner_hash_tc1' AND contact_hash=public.compute_contact_hash_for_owner('duid_tc_owner1','duid_tc_viewer_unver'); -- EXPECT: basic

-- 5) unverified: all flags false (use a distinct owner to avoid UNIQUE)
INSERT INTO public.user_identities (id, user_salt, encrypted_nsec, encrypted_nsec_iv, hashed_username, hashed_npub, password_hash, password_salt, profile_visibility)
VALUES ('duid_tc_owner2', 'salt_tc_owner2', NULL, NULL, 'u_owner2', 'n_owner2', 'p_owner2', 'ps_owner2', 'private')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.privacy_users (hashed_uuid, user_salt, auth_method, last_auth_at)
VALUES ('owner_hash_tc2','salt_tc_owner2','nip07', EXTRACT(EPOCH FROM now())::bigint)
ON CONFLICT (hashed_uuid) DO NOTHING;
INSERT INTO public.encrypted_contacts (owner_hash, encrypted_contact, contact_hash,
  physical_mfa_verified, simpleproof_verified, kind0_verified, pkarr_verified, iroh_dht_verified)
SELECT 'owner_hash_tc2', 'enc', public.compute_contact_hash_for_owner('duid_tc_owner2','duid_tc_viewer_unver'),
  false, false, false, false, false;
SELECT verification_level FROM public.encrypted_contacts
WHERE owner_hash='owner_hash_tc2' AND contact_hash=public.compute_contact_hash_for_owner('duid_tc_owner2','duid_tc_viewer_unver'); -- EXPECT: unverified

-- -----------------------------------------------------------------------------
-- Test 6-7: Trigger derivation on UPDATE (EXPECT transitions)
-- -----------------------------------------------------------------------------
-- 6) basic -> verified (set simpleproof + kind0)
UPDATE public.encrypted_contacts SET simpleproof_verified=true, kind0_verified=true
WHERE owner_hash='owner_hash_tc1' AND contact_hash=public.compute_contact_hash_for_owner('duid_tc_owner1','duid_tc_viewer_unver');
SELECT verification_level FROM public.encrypted_contacts
WHERE owner_hash='owner_hash_tc1' AND contact_hash=public.compute_contact_hash_for_owner('duid_tc_owner1','duid_tc_viewer_unver'); -- EXPECT: verified

-- 7) verified -> trusted (set physical_mfa)
UPDATE public.encrypted_contacts SET physical_mfa_verified=true
WHERE owner_hash='owner_hash_tc1' AND contact_hash=public.compute_contact_hash_for_owner('duid_tc_owner1','duid_tc_viewer_unver');
SELECT verification_level FROM public.encrypted_contacts
WHERE owner_hash='owner_hash_tc1' AND contact_hash=public.compute_contact_hash_for_owner('duid_tc_owner1','duid_tc_viewer_unver'); -- EXPECT: trusted

-- -----------------------------------------------------------------------------
-- Test 8-10: RLS for trusted_contacts_only
-- -----------------------------------------------------------------------------
-- Set owner's visibility to trusted_contacts_only
UPDATE public.user_identities SET profile_visibility='trusted_contacts_only' WHERE id='duid_tc_owner1';

-- 8) Allowed: trusted contact
SELECT set_config('app.current_user_duid', 'duid_tc_viewer_unver', true);
SELECT id FROM public.user_identities WHERE id='duid_tc_owner1' AND profile_visibility='trusted_contacts_only'; -- EXPECT: 1 row

-- 9) Allowed: verified contact
SELECT set_config('app.current_user_duid', 'duid_tc_viewer_verified', true);
SELECT id FROM public.user_identities WHERE id='duid_tc_owner1' AND profile_visibility='trusted_contacts_only'; -- EXPECT: 1 row

-- 10) Blocked: basic contact (viewer_basic has verification_level=verified now via test 3)
-- Reset it to basic to test blocking
UPDATE public.encrypted_contacts SET physical_mfa_verified=false, simpleproof_verified=false, kind0_verified=false, pkarr_verified=true, iroh_dht_verified=false
WHERE owner_hash='owner_hash_tc1' AND contact_hash=public.compute_contact_hash_for_owner('duid_tc_owner1','duid_tc_viewer_basic');
SELECT set_config('app.current_user_duid', 'duid_tc_viewer_basic', true);
SELECT id FROM public.user_identities WHERE id='duid_tc_owner1' AND profile_visibility='trusted_contacts_only'; -- EXPECT: 0 rows

-- 11) Blocked: non-contact
SELECT set_config('app.current_user_duid', 'duid_tc_viewer_noncontact', true);
SELECT id FROM public.user_identities WHERE id='duid_tc_owner1' AND profile_visibility='trusted_contacts_only'; -- EXPECT: 0 rows

-- -----------------------------------------------------------------------------
-- Test 11-12: Backward compatibility for contacts_only and owner self-access
-- -----------------------------------------------------------------------------
-- 12) contacts_only: any contact is sufficient
UPDATE public.user_identities SET profile_visibility='contacts_only' WHERE id='duid_tc_owner1';
SELECT set_config('app.current_user_duid', 'duid_tc_viewer_basic', true);
SELECT id FROM public.user_identities WHERE id='duid_tc_owner1' AND profile_visibility='contacts_only'; -- EXPECT: 1 row

-- 13) Owner can read/update regardless of visibility
SELECT set_config('app.current_user_duid', 'duid_tc_owner1', true);
SELECT id FROM public.user_identities WHERE id='duid_tc_owner1'; -- EXPECT: 1 row
UPDATE public.user_identities SET profile_banner_url='https://example.com/banner.png' WHERE id='duid_tc_owner1'; -- EXPECT: update succeeds

