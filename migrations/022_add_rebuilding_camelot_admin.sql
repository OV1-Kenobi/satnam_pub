-- Migration: Add Rebuilding Camelot as Admin NIP-05 Record
-- File: migrations/022_add_rebuilding_camelot_admin.sql
-- Author: Zencoder
-- Date: 2025-01-XX

-- Add Rebuilding Camelot as admin account
-- Note: The actual npub will be retrieved from vault at runtime
INSERT INTO nip05_records (name, pubkey, user_id) VALUES
    ('admin', 'npub1rebuilding_camelot_public_key_here', '00000000-0000-0000-0000-000000000000'),
    ('RebuildingCamelot', 'npub1rebuilding_camelot_public_key_here', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (name) DO UPDATE SET
    pubkey = EXCLUDED.pubkey,
    updated_at = NOW();

-- Add comment for documentation
COMMENT ON TABLE nip05_records IS 'NIP-05 verification records with Rebuilding Camelot as admin account'; 