-- =====================================================
-- STEP-BY-STEP TABLE CREATION
-- Run each section individually to isolate any problems
-- =====================================================

-- STEP 1: Enable extensions (run this first)
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

SELECT 'Extensions enabled successfully' as step_1_result;

-- STEP 2: Create privacy_users table only
-- =====================================================
-- Run this section by itself first

CREATE TABLE IF NOT EXISTS public.privacy_users (
    hashed_uuid VARCHAR(50) PRIMARY KEY,
    user_salt VARCHAR(32) NOT NULL,
    federation_role VARCHAR(20) NOT NULL DEFAULT 'private',
    is_whitelisted BOOLEAN NOT NULL DEFAULT false,
    voting_power INTEGER NOT NULL DEFAULT 1,
    guardian_approved BOOLEAN NOT NULL DEFAULT false,
    auth_method VARCHAR(20) NOT NULL DEFAULT 'nip07',
    privacy_level VARCHAR(10) NOT NULL DEFAULT 'enhanced',
    zero_knowledge_enabled BOOLEAN NOT NULL DEFAULT true,
    last_auth_at BIGINT NOT NULL DEFAULT extract(epoch from now()),
    auth_failure_count INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL DEFAULT extract(epoch from now()),
    updated_at BIGINT NOT NULL DEFAULT extract(epoch from now()),
    data_retention_days INTEGER NOT NULL DEFAULT 2555
);

SELECT 'privacy_users table created successfully' as step_2_result;

-- STEP 3: Create nip05_records table only
-- =====================================================
-- Run this section after step 2 succeeds

CREATE TABLE IF NOT EXISTS public.nip05_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    pubkey VARCHAR(100) NOT NULL,
    domain VARCHAR(255) NOT NULL DEFAULT 'satnam.pub',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

SELECT 'nip05_records table created successfully' as step_3_result;

-- STEP 4: Test inserting data into nip05_records
-- =====================================================
-- Run this section after step 3 succeeds

INSERT INTO nip05_records (name, pubkey, domain) VALUES
    ('test', 'npub1test123456789abcdef', 'satnam.pub')
ON CONFLICT DO NOTHING;

SELECT 'Test data inserted successfully' as step_4_result;

-- STEP 5: Create profiles table only
-- =====================================================
-- Run this section after step 4 succeeds

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL,
    npub VARCHAR(100) NOT NULL,
    nip05 VARCHAR(255),
    lightning_address VARCHAR(255),
    family_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

SELECT 'profiles table created successfully' as step_5_result;

-- STEP 6: Create user_identities table only
-- =====================================================
-- Run this section after step 5 succeeds

CREATE TABLE IF NOT EXISTS public.user_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL,
    npub VARCHAR(100) NOT NULL,
    encrypted_nsec TEXT,
    nip05 VARCHAR(255),
    lightning_address VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'private',
    spending_limits JSONB DEFAULT '{}',
    privacy_settings JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

SELECT 'user_identities table created successfully' as step_6_result;

-- STEP 7: Enable basic RLS (run after all tables created)
-- =====================================================

ALTER TABLE privacy_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE nip05_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;

-- Create permissive policies
CREATE POLICY "allow_all_privacy_users" ON privacy_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_nip05_records" ON nip05_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_profiles" ON profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_user_identities" ON user_identities FOR ALL USING (true) WITH CHECK (true);

SELECT 'RLS enabled successfully' as step_7_result;

-- STEP 8: Grant permissions
-- =====================================================

GRANT ALL ON privacy_users TO authenticated, anon;
GRANT ALL ON nip05_records TO authenticated, anon;
GRANT ALL ON profiles TO authenticated, anon;
GRANT ALL ON user_identities TO authenticated, anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;

SELECT 'Permissions granted successfully' as step_8_result;

-- FINAL VERIFICATION
-- =====================================================

SELECT 
    table_name,
    'Created successfully' as status
FROM information_schema.tables 
WHERE table_name IN ('privacy_users', 'nip05_records', 'profiles', 'user_identities')
AND table_schema = 'public'
ORDER BY table_name;
