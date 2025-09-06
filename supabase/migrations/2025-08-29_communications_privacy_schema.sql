-- Communications Privacy-First Schema (Supabase)
-- Single-file, idempotent migration for contacts, messages, groups, unread state
-- Execute in Supabase SQL editor. Uses public schema.

-- Safety: ensure pgcrypto available for gen_random_uuid if needed
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Privacy Users (mapping auth.users.id -> hashed_uuid)
CREATE TABLE IF NOT EXISTS privacy_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hashed_uuid TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Encrypted Contacts (zero-knowledge at rest)
CREATE TABLE IF NOT EXISTS encrypted_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hash TEXT NOT NULL REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
  encrypted_contact TEXT NOT NULL, -- JSON string encrypted client-side (npub, nip05, displayName, notes, tags)
  contact_encryption_salt TEXT NOT NULL UNIQUE, -- per-contact salt
  contact_encryption_iv TEXT NOT NULL UNIQUE, -- per-contact IV
  contact_hash TEXT NOT NULL, -- privacy-preserving identifier (client-derived)
  contact_hash_salt TEXT NOT NULL UNIQUE,
  trust_level TEXT NOT NULL DEFAULT 'unverified' CHECK (trust_level IN ('family','trusted','known','unverified')),
  family_role TEXT CHECK (family_role IN ('private','offspring','adult','steward','guardian')),
  supports_gift_wrap BOOLEAN DEFAULT FALSE,
  preferred_encryption TEXT NOT NULL DEFAULT 'gift-wrap' CHECK (preferred_encryption IN ('gift-wrap','nip04','auto')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_contact_at TIMESTAMPTZ,
  contact_count INTEGER NOT NULL DEFAULT 0
);

-- Indexes for contacts
CREATE INDEX IF NOT EXISTS idx_encrypted_contacts_owner_hash ON encrypted_contacts(owner_hash);

-- Safety: ensure columns exist in case table pre-existed without them
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encrypted_contacts' AND column_name='added_at'
  ) THEN
    ALTER TABLE encrypted_contacts ADD COLUMN added_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encrypted_contacts' AND column_name='last_contact_at'
  ) THEN
    ALTER TABLE encrypted_contacts ADD COLUMN last_contact_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encrypted_contacts' AND column_name='contact_count'
  ) THEN
    ALTER TABLE encrypted_contacts ADD COLUMN contact_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_encrypted_contacts_contact_hash ON encrypted_contacts(contact_hash);
CREATE INDEX IF NOT EXISTS idx_encrypted_contacts_added_at ON encrypted_contacts(added_at DESC);

ALTER TABLE encrypted_contacts ENABLE ROW LEVEL SECURITY;

-- RLS: owner can access only their contacts via privacy_users mapping (dynamic column resolution)
DO $$
DECLARE user_col text;
BEGIN
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='privacy_users' AND column_name='user_id') THEN 'user_id'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='privacy_users' AND column_name='auth_user_id') THEN 'auth_user_id'
    ELSE NULL
  END INTO user_col;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'encrypted_contacts' AND policyname = 'contacts_select_own'
  ) THEN
    IF user_col IS NULL THEN
      EXECUTE 'CREATE POLICY contacts_select_own ON encrypted_contacts FOR SELECT USING (false)';
    ELSE
      EXECUTE format(
        'CREATE POLICY contacts_select_own ON encrypted_contacts FOR SELECT USING (EXISTS (SELECT 1 FROM privacy_users pu WHERE pu.hashed_uuid = encrypted_contacts.owner_hash AND pu.%I = auth.uid()))',
        user_col
      );
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'encrypted_contacts' AND policyname = 'contacts_modify_own'
  ) THEN
    IF user_col IS NULL THEN
      EXECUTE 'CREATE POLICY contacts_modify_own ON encrypted_contacts FOR ALL USING (false) WITH CHECK (false)';
    ELSE
      EXECUTE format(
        'CREATE POLICY contacts_modify_own ON encrypted_contacts FOR ALL USING (EXISTS (SELECT 1 FROM privacy_users pu WHERE pu.hashed_uuid = encrypted_contacts.owner_hash AND pu.%1$I = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM privacy_users pu WHERE pu.hashed_uuid = encrypted_contacts.owner_hash AND pu.%1$I = auth.uid()))',
        user_col
      );
    END IF;
  END IF;
END $$;

-- 3) Gift-Wrapped Messages (metadata-only; content encrypted client-side)
CREATE TABLE IF NOT EXISTS gift_wrapped_messages (
  id TEXT PRIMARY KEY, -- privacy-preserving message id
  sender_hash TEXT NOT NULL, -- hashed sender id (privacy-preserving)
  recipient_hash TEXT NOT NULL, -- hashed recipient id (privacy-preserving)
  group_id TEXT, -- optional hashed group id for group messages
  content_hash TEXT NOT NULL, -- hash of encrypted content
  encryption_level TEXT NOT NULL CHECK (encryption_level IN ('standard','enhanced','maximum')),
  communication_type TEXT NOT NULL CHECK (communication_type IN ('family','individual')),
  message_type TEXT NOT NULL DEFAULT 'direct' CHECK (message_type IN ('direct','group','payment','credential')),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','delivered','read','failed','pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);


-- Safety for legacy schemas: ensure required columns exist even if table pre-existed without them
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS sender_hash TEXT;
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS recipient_hash TEXT;
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS group_id TEXT;
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS encryption_level TEXT;
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS communication_type TEXT;
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS message_type TEXT;
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE gift_wrapped_messages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Best-effort backfill from possible legacy columns
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_wrapped_messages' AND column_name='sender_duid'
  ) THEN
    EXECUTE 'UPDATE gift_wrapped_messages SET sender_hash = COALESCE(sender_hash, sender_duid) WHERE sender_hash IS NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_wrapped_messages' AND column_name='sender_id'
  ) THEN
    EXECUTE 'UPDATE gift_wrapped_messages SET sender_hash = COALESCE(sender_hash, sender_id::text) WHERE sender_hash IS NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_wrapped_messages' AND column_name='from_hash'
  ) THEN
    EXECUTE 'UPDATE gift_wrapped_messages SET sender_hash = COALESCE(sender_hash, from_hash) WHERE sender_hash IS NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_wrapped_messages' AND column_name='recipient_duid'
  ) THEN
    EXECUTE 'UPDATE gift_wrapped_messages SET recipient_hash = COALESCE(recipient_hash, recipient_duid) WHERE recipient_hash IS NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_wrapped_messages' AND column_name='recipient_id'
  ) THEN
    EXECUTE 'UPDATE gift_wrapped_messages SET recipient_hash = COALESCE(recipient_hash, recipient_id::text) WHERE recipient_hash IS NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_wrapped_messages' AND column_name='to_hash'
  ) THEN
    EXECUTE 'UPDATE gift_wrapped_messages SET recipient_hash = COALESCE(recipient_hash, to_hash) WHERE recipient_hash IS NULL';
  END IF;
END $$;

-- Conversation support: ordered pair index
CREATE INDEX IF NOT EXISTS idx_gwm_sender_recipient ON gift_wrapped_messages(sender_hash, recipient_hash);
CREATE INDEX IF NOT EXISTS idx_gwm_created_at ON gift_wrapped_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gwm_group_id ON gift_wrapped_messages(group_id);

ALTER TABLE gift_wrapped_messages ENABLE ROW LEVEL SECURITY;

-- RLS: users can see only rows where they are sender or recipient (via privacy_users mapping)
DO $$
DECLARE
  user_col text;
  sender_col text;
  recipient_col text;
BEGIN
  -- Resolve privacy_users auth column name
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='privacy_users' AND column_name='user_id') THEN 'user_id'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='privacy_users' AND column_name='auth_user_id') THEN 'auth_user_id'
    ELSE NULL
  END INTO user_col;

  -- Resolve sender/recipient column names from existing gift_wrapped_messages schema
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_wrapped_messages' AND column_name='sender_hash') THEN 'sender_hash'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_wrapped_messages' AND column_name='sender_duid') THEN 'sender_duid'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_wrapped_messages' AND column_name='sender_id') THEN 'sender_id'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_wrapped_messages' AND column_name='from_hash') THEN 'from_hash'
    ELSE NULL
  END INTO sender_col;

  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_wrapped_messages' AND column_name='recipient_hash') THEN 'recipient_hash'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_wrapped_messages' AND column_name='recipient_duid') THEN 'recipient_duid'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_wrapped_messages' AND column_name='recipient_id') THEN 'recipient_id'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_wrapped_messages' AND column_name='to_hash') THEN 'to_hash'
    ELSE NULL
  END INTO recipient_col;

  -- Create policies only if we can resolve all required columns
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='gift_wrapped_messages' AND policyname='gwm_select_participant'
  ) THEN
    IF user_col IS NULL OR sender_col IS NULL OR recipient_col IS NULL THEN
      RAISE NOTICE 'Skipping gwm_select_participant policy creation due to unresolved columns (user_col: %, sender_col: %, recipient_col: %)', user_col, sender_col, recipient_col;
    ELSE
      EXECUTE format(
        'CREATE POLICY gwm_select_participant ON gift_wrapped_messages FOR SELECT USING (EXISTS (SELECT 1 FROM privacy_users pu WHERE pu.hashed_uuid = %1$s.%2$I AND pu.%3$I = auth.uid()) OR EXISTS (SELECT 1 FROM privacy_users pu WHERE pu.hashed_uuid = %1$s.%4$I AND pu.%3$I = auth.uid()))',
        'gift_wrapped_messages', sender_col, user_col, recipient_col
      );
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='gift_wrapped_messages' AND policyname='gwm_insert_sender'
  ) THEN
    IF user_col IS NULL OR sender_col IS NULL THEN
      RAISE NOTICE 'Skipping gwm_insert_sender policy creation due to unresolved columns (user_col: %, sender_col: %)', user_col, sender_col;
    ELSE
      EXECUTE format(
        'CREATE POLICY gwm_insert_sender ON gift_wrapped_messages FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM privacy_users pu WHERE pu.hashed_uuid = %1$s.%2$I AND pu.%3$I = auth.uid()))',
        'gift_wrapped_messages', sender_col, user_col
      );
    END IF;
  END IF;
END $$;

-- 4) Unread State Tracking
-- Create table first without FK to handle legacy type mismatches; add FK after aligning types
CREATE TABLE IF NOT EXISTS message_read_state (
  message_id TEXT NOT NULL,
  owner_hash TEXT NOT NULL REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, owner_hash)
);

-- Align message_read_state.message_id type with gift_wrapped_messages.id, then add FK
DO $$
DECLARE desired_type text;
DECLARE current_type text;
BEGIN
  SELECT CASE WHEN data_type = 'uuid' THEN 'uuid' ELSE 'text' END
  INTO desired_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='gift_wrapped_messages' AND column_name='id';

  IF desired_type IS NULL THEN
    RAISE NOTICE 'gift_wrapped_messages.id not found; skipping FK creation for message_read_state.message_id';
  ELSE
    SELECT data_type INTO current_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='message_read_state' AND column_name='message_id';

    IF desired_type <> current_type THEN
      IF desired_type = 'uuid' THEN
        EXECUTE 'ALTER TABLE message_read_state ALTER COLUMN message_id TYPE uuid USING (NULLIF(message_id, '''')::uuid)';
      ELSE
        EXECUTE 'ALTER TABLE message_read_state ALTER COLUMN message_id TYPE text USING (message_id::text)';
      END IF;
    END IF;

    -- Drop existing FK if any (to avoid conflict) and recreate with correct type
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'message_read_state_message_id_fkey' AND conrelid = 'public.message_read_state'::regclass
    ) THEN
      ALTER TABLE message_read_state DROP CONSTRAINT message_read_state_message_id_fkey;
    END IF;

    ALTER TABLE message_read_state
      ADD CONSTRAINT message_read_state_message_id_fkey
      FOREIGN KEY (message_id) REFERENCES gift_wrapped_messages(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mrs_owner ON message_read_state(owner_hash);

ALTER TABLE message_read_state ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE user_col text;
BEGIN
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='privacy_users' AND column_name='user_id') THEN 'user_id'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='privacy_users' AND column_name='auth_user_id') THEN 'auth_user_id'
    ELSE NULL
  END INTO user_col;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_read_state' AND policyname='mrs_select_own'
  ) THEN
    IF user_col IS NULL THEN
      EXECUTE 'CREATE POLICY mrs_select_own ON message_read_state FOR SELECT USING (false)';
    ELSE
      EXECUTE format(
        'CREATE POLICY mrs_select_own ON message_read_state FOR SELECT USING (EXISTS (SELECT 1 FROM privacy_users pu WHERE pu.hashed_uuid = owner_hash AND pu.%1$I = auth.uid()))',
        user_col
      );
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_read_state' AND policyname='mrs_modify_own'
  ) THEN
    IF user_col IS NULL THEN
      EXECUTE 'CREATE POLICY mrs_modify_own ON message_read_state FOR ALL USING (false) WITH CHECK (false)';
    ELSE
      EXECUTE format(
        'CREATE POLICY mrs_modify_own ON message_read_state FOR ALL USING (EXISTS (SELECT 1 FROM privacy_users pu WHERE pu.hashed_uuid = owner_hash AND pu.%1$I = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM privacy_users pu WHERE pu.hashed_uuid = owner_hash AND pu.%1$I = auth.uid()))',
        user_col
      );
    END IF;
  END IF;
END $$;

-- Unread count helper (returns integer)
CREATE OR REPLACE FUNCTION get_unread_count(p_owner_hash TEXT)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM gift_wrapped_messages m
  WHERE (m.recipient_hash = p_owner_hash OR m.sender_hash = p_owner_hash)
    AND NOT EXISTS (
      SELECT 1 FROM message_read_state r
      WHERE r.message_id = m.id AND r.owner_hash = p_owner_hash
    );
  RETURN cnt;
END;$$;

-- 5) Groups (encrypted metadata)
CREATE TABLE IF NOT EXISTS encrypted_groups (
  id TEXT PRIMARY KEY, -- hashed/derived group id
  creator_hash TEXT NOT NULL REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
  encrypted_metadata TEXT NOT NULL, -- client-side encrypted (name, description, settings)
  group_encryption_salt TEXT NOT NULL,
  group_encryption_iv TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES encrypted_groups(id) ON DELETE CASCADE,
  member_hash TEXT NOT NULL REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','left','removed')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  PRIMARY KEY (group_id, member_hash)
);

CREATE INDEX IF NOT EXISTS idx_group_members_member ON group_members(member_hash);

ALTER TABLE encrypted_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE user_col text;
BEGIN
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='privacy_users' AND column_name='user_id') THEN 'user_id'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='privacy_users' AND column_name='auth_user_id') THEN 'auth_user_id'
    ELSE NULL
  END INTO user_col;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='encrypted_groups' AND policyname='groups_access_own'
  ) THEN
    IF user_col IS NULL THEN
      EXECUTE 'CREATE POLICY groups_access_own ON encrypted_groups FOR ALL USING (false) WITH CHECK (false)';
    ELSE
      EXECUTE format(
        'CREATE POLICY groups_access_own ON encrypted_groups FOR ALL USING (EXISTS (SELECT 1 FROM privacy_users pu WHERE pu.hashed_uuid = creator_hash AND pu.%1$I = auth.uid()) OR EXISTS (SELECT 1 FROM group_members gm JOIN privacy_users pu ON pu.hashed_uuid = gm.member_hash WHERE gm.group_id = encrypted_groups.id AND pu.%1$I = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM privacy_users pu WHERE pu.hashed_uuid = creator_hash AND pu.%1$I = auth.uid()))',
        user_col
      );
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_members' AND policyname='group_members_access'
  ) THEN
    IF user_col IS NULL THEN
      EXECUTE 'CREATE POLICY group_members_access ON group_members FOR ALL USING (false) WITH CHECK (false)';
    ELSE
      EXECUTE format(
        'CREATE POLICY group_members_access ON group_members FOR ALL USING (EXISTS (SELECT 1 FROM privacy_users pu WHERE pu.hashed_uuid = group_members.member_hash AND pu.%1$I = auth.uid()) OR EXISTS (SELECT 1 FROM encrypted_groups g JOIN privacy_users pu ON pu.hashed_uuid = g.creator_hash WHERE g.id = group_members.group_id AND pu.%1$I = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM privacy_users pu WHERE pu.hashed_uuid = group_members.member_hash AND pu.%1$I = auth.uid()))',
        user_col
      );
    END IF;
  END IF;
END $$;

-- Helpful indexes for unread queries per conversation
CREATE INDEX IF NOT EXISTS idx_gwm_sender_created ON gift_wrapped_messages(sender_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gwm_recipient_created ON gift_wrapped_messages(recipient_hash, created_at DESC);

-- Notes:
-- - All secret fields are client-encrypted; server never sees plaintext.
-- - owner_hash/member_hash/sender_hash/recipient_hash are privacy-preserving identifiers derived client-side.
-- - Use Web Crypto in the client to encrypt/decrypt; salts/IVs are per-record.
-- - RLS ties data access to auth.uid() via privacy_users mapping.

