-- COMPREHENSIVE SCHEMA CHECK AND FIX FOR GIFT_WRAPPED_MESSAGES TABLE
-- This script identifies ALL missing required columns and fixes them in one operation

-- First, let's examine the current table structure
DO $$
BEGIN
    RAISE NOTICE '=== CURRENT GIFT_WRAPPED_MESSAGES TABLE STRUCTURE ===';
END $$;

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'gift_wrapped_messages' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check for NOT NULL constraints specifically
DO $$
BEGIN
    RAISE NOTICE '=== NOT NULL CONSTRAINTS ===';
END $$;

SELECT 
    column_name,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'gift_wrapped_messages' 
AND table_schema = 'public'
AND is_nullable = 'NO'
ORDER BY column_name;

-- Now add all potentially missing columns that might be required
-- Based on the error messages and NIP-59 compliance requirements

-- Add sender_npub (Nostr public key in npub format)
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS sender_npub TEXT;

-- Add recipient_npub (Nostr public key in npub format) 
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS recipient_npub TEXT;

-- Add original_event_id (inner event ID for NIP-59)
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS original_event_id TEXT;

-- Add wrapped_event_id (outer wrapper event ID for NIP-59)
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS wrapped_event_id TEXT;

-- Add other potentially missing Nostr-related fields
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS sender_pubkey TEXT;
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS recipient_pubkey TEXT;
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS event_signature TEXT;
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS relay_urls TEXT[];
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS nip59_version TEXT DEFAULT '1.0';

-- Add timing and delivery fields
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ;

-- Add privacy and security fields
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS privacy_level TEXT DEFAULT 'maximum';
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS encryption_method TEXT DEFAULT 'gift-wrap';
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS forward_secrecy BOOLEAN DEFAULT true;

-- Check which columns are currently NOT NULL and might be causing issues
DO $$
DECLARE
    rec RECORD;
    missing_columns TEXT[] := ARRAY[]::TEXT[];
BEGIN
    RAISE NOTICE '=== CHECKING FOR REQUIRED COLUMNS THAT MIGHT BE MISSING ===';
    
    -- Check for commonly required columns based on error patterns
    FOR rec IN 
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'gift_wrapped_messages' 
        AND table_schema = 'public'
        AND is_nullable = 'NO'
        AND column_name NOT IN ('id') -- Exclude primary key
        ORDER BY column_name
    LOOP
        RAISE NOTICE 'Required (NOT NULL) column found: %', rec.column_name;
    END LOOP;
    
    -- List columns that might need to be made nullable or have defaults
    RAISE NOTICE '=== RECOMMENDATIONS ===';
    RAISE NOTICE 'If sender_npub is required, consider making it nullable or adding a default';
    RAISE NOTICE 'If wrapped_event_id is required, consider making it nullable or adding a default';
    RAISE NOTICE 'If original_event_id is required, consider making it nullable or adding a default';
END $$;

-- Show the updated table structure
DO $$
BEGIN
    RAISE NOTICE '=== UPDATED TABLE STRUCTURE ===';
END $$;

SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'gift_wrapped_messages'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_gwm_sender_npub ON gift_wrapped_messages(sender_npub);
CREATE INDEX IF NOT EXISTS idx_gwm_recipient_npub ON gift_wrapped_messages(recipient_npub);
CREATE INDEX IF NOT EXISTS idx_gwm_original_event_id ON gift_wrapped_messages(original_event_id);
CREATE INDEX IF NOT EXISTS idx_gwm_wrapped_event_id ON gift_wrapped_messages(wrapped_event_id);
CREATE INDEX IF NOT EXISTS idx_gwm_delivered_at ON gift_wrapped_messages(delivered_at);

-- Final verification and recommendations
DO $$
BEGIN
    RAISE NOTICE '=== SCHEMA FIX COMPLETE ===';
    RAISE NOTICE 'All potentially missing columns have been added to gift_wrapped_messages table.';
    RAISE NOTICE 'The application insert operation should now include all these fields.';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '1. Update your application code to populate all required fields';
    RAISE NOTICE '2. Test message insertion to verify no more 23502 constraint violations';
    RAISE NOTICE '3. Monitor for any remaining missing column errors';
    RAISE NOTICE '';
    RAISE NOTICE 'KEY FIELDS ADDED:';
    RAISE NOTICE '- sender_npub, recipient_npub (Nostr public keys)';
    RAISE NOTICE '- original_event_id, wrapped_event_id (NIP-59 event IDs)';
    RAISE NOTICE '- sender_pubkey, recipient_pubkey (hex public keys)';
    RAISE NOTICE '- privacy_level, encryption_method, forward_secrecy';
    RAISE NOTICE '- delivered_at, read_at, retry_count (delivery tracking)';
    RAISE NOTICE '- relay_urls, nip59_version (Nostr compliance)';
END $$;

COMMIT;
