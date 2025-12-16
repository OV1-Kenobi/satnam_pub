-- Migration 062: Add content column to gift_wrapped_messages
--
-- ╔═══════════════════════════════════════════════════════════════════════════════╗
-- ║  PRIVACY-FIRST / ZERO-KNOWLEDGE ARCHITECTURE - NIP-44 ENCRYPTED CONTENT      ║
-- ╠═══════════════════════════════════════════════════════════════════════════════╣
-- ║  This column stores NIP-44 ENCRYPTED content (not plaintext)                  ║
-- ║                                                                               ║
-- ║  RULE: Content is ALWAYS encrypted CLIENT-SIDE before transmission           ║
-- ║                                                                               ║
-- ║  For ALL protocols (NIP-59, NIP-17, NIP-04, NIP-44):                          ║
-- ║  - content = NIP-44 encrypted ciphertext (encrypted by sender/recipient)     ║
-- ║  - content_hash = SHA-256 hash of original plaintext (for verification)      ║
-- ║                                                                               ║
-- ║  The server operates under zero-knowledge principles:                         ║
-- ║  - Server CANNOT decrypt content (lacks private keys)                         ║
-- ║  - Encryption/decryption happens CLIENT-SIDE only                             ║
-- ║  - Database admins cannot read message content                                ║
-- ║  - Only sender/recipient with nsec can decrypt via NIP-44 conversation key   ║
-- ║                                                                               ║
-- ║  If PLAINTEXT is ever stored here, it is a CRITICAL SECURITY VIOLATION        ║
-- ╚═══════════════════════════════════════════════════════════════════════════════╝
--
-- This migration is idempotent - safe to run multiple times

BEGIN;

-- Add content column if not exists (stores NIP-44 encrypted ciphertext)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'gift_wrapped_messages'
    AND column_name = 'content'
  ) THEN
    ALTER TABLE public.gift_wrapped_messages
    ADD COLUMN content TEXT;
    RAISE NOTICE 'Added content column to gift_wrapped_messages';
  ELSE
    RAISE NOTICE 'content column already exists';
  END IF;
END $$;

-- Add comment explaining the privacy-first / zero-knowledge requirement
COMMENT ON COLUMN public.gift_wrapped_messages.content IS
  'NIP-44 encrypted content - encrypted CLIENT-SIDE before transmission. Server CANNOT decrypt. Only sender/recipient with nsec can decrypt using NIP-44 conversation key. Storing PLAINTEXT is a CRITICAL SECURITY VIOLATION.';

COMMIT;

-- Verification query (run manually to check migration success)
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
-- AND table_name = 'gift_wrapped_messages' 
-- AND column_name = 'content';

