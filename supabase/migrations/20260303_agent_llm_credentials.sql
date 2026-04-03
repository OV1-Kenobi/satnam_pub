-- Agent LLM Credentials Table (Phase 1, Task 1.2)
-- Secure storage for encrypted LLM API keys (OpenAI, Anthropic, etc.)
-- Follows secure-credential-manager.ts encryption pattern (AES-256-GCM)
--
-- SECURITY:
-- - API keys encrypted client-side with AES-256-GCM before transmission
-- - Never stored in plaintext (zero-knowledge architecture)
-- - Encryption key derived from user password using PBKDF2
-- - Each credential has unique IV (initialization vector) and salt
-- - RLS policies ensure only agent owner can access their credentials
--
-- ENCRYPTION PATTERN (from secure-credential-manager.ts):
-- 1. Client generates salt (16 bytes random)
-- 2. Client derives encryption key from password using PBKDF2 (100k iterations, SHA-256)
-- 3. Client encrypts API key with AES-256-GCM (generates IV and auth tag)
-- 4. Client sends: encrypted_api_key (base64), iv (base64), salt (base64)
-- 5. Server stores encrypted data only (never sees plaintext API key)
--
-- DEPENDENCIES:
-- - Requires user_identities table
-- - Requires agent_profiles table from 20260212_agent_profiles.sql

-- ============================================================================
-- CREATE AGENT_LLM_CREDENTIALS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_llm_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Agent ownership
  agent_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  
  -- LLM provider metadata
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'custom')),
  provider_label TEXT, -- Optional user-friendly label (e.g., "ChatGPT Business Account")
  
  -- Encrypted API key (AES-256-GCM)
  encrypted_api_key TEXT NOT NULL, -- Base64-encoded ciphertext
  iv TEXT NOT NULL, -- Base64-encoded initialization vector (12 bytes for GCM)
  salt TEXT NOT NULL, -- Base64-encoded salt for PBKDF2 key derivation (16 bytes)
  
  -- Key metadata (for validation without decryption)
  key_prefix TEXT, -- First 4 chars of API key (e.g., "sk-1234") for user verification
  key_created_at TIMESTAMPTZ DEFAULT NOW(),
  key_last_used_at TIMESTAMPTZ,
  
  -- Credential lifecycle
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: one active credential per agent per provider
  CONSTRAINT unique_active_credential UNIQUE (agent_id, provider, is_active)
    DEFERRABLE INITIALLY DEFERRED
);

-- ============================================================================
-- CREATE INDEXES
-- ============================================================================

-- Index for agent credential lookup
DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_llm_credentials_agent ON agent_llm_credentials(agent_id, is_active)';
END $$;

-- Index for provider lookup
DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_llm_credentials_provider ON agent_llm_credentials(provider, is_active)';
END $$;

-- Index for last used tracking
DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_llm_credentials_last_used ON agent_llm_credentials(key_last_used_at DESC)';
END $$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE agent_llm_credentials ENABLE ROW LEVEL SECURITY;

-- Policy: Agent can read their own credentials
DO $$ BEGIN
  CREATE POLICY "agent_llm_credentials_own_read" ON agent_llm_credentials
    FOR SELECT USING (agent_id = auth.uid()::TEXT);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Policy: Agent can insert their own credentials
DO $$ BEGIN
  CREATE POLICY "agent_llm_credentials_own_insert" ON agent_llm_credentials
    FOR INSERT WITH CHECK (agent_id = auth.uid()::TEXT);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Policy: Agent can update their own credentials
DO $$ BEGIN
  CREATE POLICY "agent_llm_credentials_own_update" ON agent_llm_credentials
    FOR UPDATE USING (agent_id = auth.uid()::TEXT);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Policy: Agent can delete their own credentials
DO $$ BEGIN
  CREATE POLICY "agent_llm_credentials_own_delete" ON agent_llm_credentials
    FOR DELETE USING (agent_id = auth.uid()::TEXT);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Policy: Service role has full access (for admin operations)
DO $$ BEGIN
  CREATE POLICY "agent_llm_credentials_service_all" ON agent_llm_credentials
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_agent_llm_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trigger_update_agent_llm_credentials_updated_at
    BEFORE UPDATE ON agent_llm_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_llm_credentials_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE agent_llm_credentials IS 
  'Secure storage for encrypted LLM API keys. Keys are encrypted client-side with AES-256-GCM before transmission. Zero-knowledge architecture - server never sees plaintext keys.';

COMMENT ON COLUMN agent_llm_credentials.encrypted_api_key IS 
  'Base64-encoded AES-256-GCM ciphertext of API key. Encrypted client-side using key derived from user password via PBKDF2.';

COMMENT ON COLUMN agent_llm_credentials.iv IS 
  'Base64-encoded initialization vector (12 bytes) for AES-256-GCM decryption.';

COMMENT ON COLUMN agent_llm_credentials.salt IS 
  'Base64-encoded salt (16 bytes) for PBKDF2 key derivation from user password.';

COMMENT ON COLUMN agent_llm_credentials.key_prefix IS 
  'First 4 characters of API key (e.g., sk-1234) for user verification without decryption. Optional.';

COMMENT ON CONSTRAINT unique_active_credential ON agent_llm_credentials IS 
  'Ensures only one active credential per agent per provider. Allows multiple inactive credentials for key rotation.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Agent LLM Credentials table migration completed successfully';
  RAISE NOTICE 'Created table: agent_llm_credentials with AES-256-GCM encryption support';
  RAISE NOTICE 'Created indexes: idx_llm_credentials_agent, idx_llm_credentials_provider, idx_llm_credentials_last_used';
  RAISE NOTICE 'Created RLS policies: own_read, own_insert, own_update, own_delete, service_all';
  RAISE NOTICE 'Created trigger: update_agent_llm_credentials_updated_at';
END $$;

