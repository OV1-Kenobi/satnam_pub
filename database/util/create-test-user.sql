-- Create test user for authentication testing
-- Run this in Supabase SQL editor if the user doesn't exist

-- Check if user exists first
DO $$
DECLARE
    user_exists BOOLEAN;
    test_duid TEXT := '01e87c2e0b210e27fb4e9b8ba2cc0a884384c82224396480191dab4926306b93a';
    test_nip05 TEXT := 'testing1383@satnam.pub';
    test_username TEXT := 'testing1383';
BEGIN
    -- Check if user already exists
    SELECT EXISTS(
        SELECT 1 FROM user_identities 
        WHERE id = test_duid OR nip05 = test_nip05
    ) INTO user_exists;
    
    IF user_exists THEN
        RAISE NOTICE 'Test user already exists with DUID: %', test_duid;
        
        -- Show existing user details
        RAISE NOTICE 'Existing user details:';
        FOR rec IN 
            SELECT id, nip05, username, is_active, created_at 
            FROM user_identities 
            WHERE id = test_duid OR nip05 = test_nip05
        LOOP
            RAISE NOTICE 'ID: %, NIP-05: %, Username: %, Active: %, Created: %', 
                rec.id, rec.nip05, rec.username, rec.is_active, rec.created_at;
        END LOOP;
    ELSE
        RAISE NOTICE 'Creating test user with DUID: %', test_duid;
        
        -- Create the test user
        INSERT INTO user_identities (
            id,
            nip05,
            username,
            npub,
            password_hash,
            password_salt,
            user_salt,
            hashed_encrypted_nsec,
            is_active,
            role,
            created_at,
            updated_at
        ) VALUES (
            test_duid,
            test_nip05,
            test_username,
            'npub1test123456789abcdef', -- placeholder npub
            '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/A5/jF/.OC', -- bcrypt hash of 'password123'
            'test_password_salt_12345678901234567890123456789012',
            'test_user_salt_12345678901234567890123456789012345',
            'encrypted_nsec_data_placeholder_for_testing_purposes_only',
            true,
            'private',
            NOW(),
            NOW()
        );
        
        RAISE NOTICE 'Test user created successfully!';
        RAISE NOTICE 'NIP-05: %', test_nip05;
        RAISE NOTICE 'Username: %', test_username;
        RAISE NOTICE 'Password: password123';
        RAISE NOTICE 'DUID: %', test_duid;
    END IF;
END $$;

-- Verify the user exists and show details
SELECT 
    id,
    nip05,
    username,
    is_active,
    role,
    created_at,
    CASE 
        WHEN LENGTH(password_hash) > 0 THEN 'Has password hash'
        ELSE 'No password hash'
    END as password_status
FROM user_identities 
WHERE id = '01e87c2e0b210e27fb4e9b8ba2cc0a884384c82224396480191dab4926306b93a'
   OR nip05 = 'testing1383@satnam.pub';
