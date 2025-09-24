-- did:scid support for issuer_registry (idempotent)
-- Extends method enum to include 'did:scid', adds optional SCID columns,
-- creates helpful indexes, and seeds satnam.pub entries.

BEGIN;

-- 1) Add optional columns for did:scid metadata
ALTER TABLE IF EXISTS public.issuer_registry
  ADD COLUMN IF NOT EXISTS scid_format TEXT,
  ADD COLUMN IF NOT EXISTS scid_version INT,
  ADD COLUMN IF NOT EXISTS src_urls TEXT[];

-- 1b) Additional fields used by vp-verify responses
ALTER TABLE IF EXISTS public.issuer_registry
  ADD COLUMN IF NOT EXISTS issuer_name TEXT,
  ADD COLUMN IF NOT EXISTS trust_tier TEXT;


-- 2) Update CHECK constraint on method to include 'did:scid'
-- We need to drop any existing CHECK constraints on (method) that restrict to ('did:jwk','did:web'),
-- then add a new one that includes 'did:scid'.
DO $$
DECLARE
  con RECORD;
  def TEXT;
BEGIN
  FOR con IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'issuer_registry' AND c.contype = 'c'
  LOOP
    def := con.def;
    -- Heuristic: if the constraint definition mentions the column "method" and either 'did:jwk' or 'did:web',
    -- we assume it's the previous method whitelist and drop it in favor of v2 below.
    IF position('method' in def) > 0 AND (position('did:jwk' in def) > 0 OR position('did:web' in def) > 0)
    THEN
      EXECUTE format('ALTER TABLE public.issuer_registry DROP CONSTRAINT %I', con.conname);
    END IF;
  END LOOP;

  -- Add the new method whitelist constraint if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'issuer_registry' AND c.conname = 'issuer_registry_method_check_v2'
  ) THEN
    EXECUTE 'ALTER TABLE public.issuer_registry
             ADD CONSTRAINT issuer_registry_method_check_v2
             CHECK (method IN (''did:jwk'',''did:web'',''did:scid''))';
  END IF;
END $$;

-- 3) Helpful indexes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname='idx_issuer_registry_method_status' AND n.nspname='public'
  ) THEN
    EXECUTE 'CREATE INDEX idx_issuer_registry_method_status ON public.issuer_registry(method, status)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname='idx_issuer_registry_issuer_did' AND n.nspname='public'
  ) THEN
    EXECUTE 'CREATE INDEX idx_issuer_registry_issuer_did ON public.issuer_registry(issuer_did)';
  END IF;
END $$;

-- 4) Seed satnam.pub issuer entries (safe upsert)
-- did:web for domain
INSERT INTO public.issuer_registry (issuer_id, issuer_did, method, domain, status)
VALUES ('satnam_web', 'did:web:satnam.pub', 'did:web', 'satnam.pub', 'active')
ON CONFLICT (issuer_id) DO UPDATE SET updated_at = NOW();

-- did:scid placeholder (paused until actual SCID is published)
INSERT INTO public.issuer_registry (
  issuer_id, issuer_did, method, domain, scid_format, scid_version, src_urls, status
) VALUES (
  'satnam_scid_ke1', 'did:scid:ke:1:__TBD__', 'did:scid', 'satnam.pub', 'ke', 1, ARRAY['https://satnam.pub/.well-known/did.json'], 'paused'
)
ON CONFLICT (issuer_id) DO UPDATE SET updated_at = NOW();

COMMIT;

