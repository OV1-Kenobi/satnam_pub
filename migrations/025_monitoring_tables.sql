-- ============================================================================
-- Migration 025: Monitoring Tables
-- Phase 5: Automation & Monitoring
-- ============================================================================
-- Creates tables for orphan detection runs and admin notifications
-- CRITICAL: All operations are idempotent with IF NOT EXISTS checks
-- ============================================================================

-- ============================================================================
-- 1. Orphan Detection Runs Table
-- Tracks scheduled orphan detection job executions
-- ============================================================================

CREATE TABLE IF NOT EXISTS orphan_detection_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  orphans_found INTEGER NOT NULL DEFAULT 0,
  orphans_cleaned_up INTEGER NOT NULL DEFAULT 0,
  auto_cleanup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  domains_affected TEXT[] DEFAULT ARRAY[]::TEXT[],
  duration_ms INTEGER,
  errors JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying recent runs
CREATE INDEX IF NOT EXISTS idx_orphan_detection_runs_timestamp 
  ON orphan_detection_runs(run_timestamp DESC);

-- Index for filtering by cleanup status
CREATE INDEX IF NOT EXISTS idx_orphan_detection_runs_cleanup 
  ON orphan_detection_runs(auto_cleanup_enabled, orphans_cleaned_up);

COMMENT ON TABLE orphan_detection_runs IS 
  'Tracks scheduled orphan detection job executions for monitoring dashboard';
COMMENT ON COLUMN orphan_detection_runs.orphans_found IS 
  'Number of orphaned NIP-05 records detected during this run';
COMMENT ON COLUMN orphan_detection_runs.orphans_cleaned_up IS 
  'Number of orphaned records automatically cleaned up (if auto-cleanup enabled)';
COMMENT ON COLUMN orphan_detection_runs.domains_affected IS 
  'List of domains that had orphaned records';
COMMENT ON COLUMN orphan_detection_runs.errors IS 
  'JSON array of errors encountered during the run';

-- ============================================================================
-- 2. Admin Notifications Table
-- Stores notifications for platform administrators
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'orphan_detection',
    'account_removal', 
    'security_alert',
    'system_health',
    'rate_limit_exceeded',
    'backup_reminder'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ
);

-- Index for querying unread notifications
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread 
  ON admin_notifications(read, created_at DESC) WHERE read = FALSE;

-- Index for filtering by type and severity
CREATE INDEX IF NOT EXISTS idx_admin_notifications_type_severity 
  ON admin_notifications(notification_type, severity);

-- Index for recent notifications
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created 
  ON admin_notifications(created_at DESC);

COMMENT ON TABLE admin_notifications IS 
  'Stores notifications for platform administrators from automated jobs';
COMMENT ON COLUMN admin_notifications.notification_type IS 
  'Type of notification: orphan_detection, account_removal, security_alert, etc.';
COMMENT ON COLUMN admin_notifications.severity IS 
  'Notification severity level: info, warning, error, critical';
COMMENT ON COLUMN admin_notifications.metadata IS 
  'Additional JSON metadata specific to the notification type';

-- ============================================================================
-- 3. Row Level Security Policies
-- CRITICAL: Restrict to admin users only (guardian/steward roles)
-- Defense-in-depth: Database-level enforcement, not just API-level
-- ============================================================================

-- Enable RLS on orphan_detection_runs
ALTER TABLE orphan_detection_runs ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for scheduled functions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orphan_detection_runs'
    AND policyname = 'orphan_detection_runs_service_all'
  ) THEN
    CREATE POLICY orphan_detection_runs_service_all ON orphan_detection_runs
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Only admin users (guardian/steward) can read orphan detection runs
-- Checks user_identities.role for admin privileges (guardian = platform, steward = federation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orphan_detection_runs'
    AND policyname = 'orphan_detection_runs_admin_read'
  ) THEN
    CREATE POLICY orphan_detection_runs_admin_read ON orphan_detection_runs
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_identities
          WHERE id = auth.uid()::text
            AND role IN ('guardian', 'steward')
            AND is_active = true
        )
      );
  END IF;
END $$;

-- Enable RLS on admin_notifications
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_notifications'
    AND policyname = 'admin_notifications_service_all'
  ) THEN
    CREATE POLICY admin_notifications_service_all ON admin_notifications
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Only admin users can read notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_notifications'
    AND policyname = 'admin_notifications_admin_read'
  ) THEN
    CREATE POLICY admin_notifications_admin_read ON admin_notifications
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_identities
          WHERE id = auth.uid()::text
            AND role IN ('guardian', 'steward')
            AND is_active = true
        )
      );
  END IF;
END $$;

-- Only admin users can update notifications (mark as read)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_notifications'
    AND policyname = 'admin_notifications_admin_update'
  ) THEN
    CREATE POLICY admin_notifications_admin_update ON admin_notifications
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_identities
          WHERE id = auth.uid()::text
            AND role IN ('guardian', 'steward')
            AND is_active = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM user_identities
          WHERE id = auth.uid()::text
            AND role IN ('guardian', 'steward')
            AND is_active = true
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 4. Trigger to restrict notification updates to read/read_at columns only
-- Prevents modification of title, message, severity, metadata, etc.
-- ============================================================================

CREATE OR REPLACE FUNCTION restrict_notification_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow changes to read and read_at columns
  -- Service role is exempt to allow full administrative access
  IF current_user != 'service_role' THEN
    IF NEW.notification_type IS DISTINCT FROM OLD.notification_type OR
       NEW.severity IS DISTINCT FROM OLD.severity OR
       NEW.title IS DISTINCT FROM OLD.title OR
       NEW.message IS DISTINCT FROM OLD.message OR
       NEW.metadata IS DISTINCT FROM OLD.metadata OR
       NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Only read and read_at columns can be updated by non-service users';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'admin_notifications_update_restrict'
  ) THEN
    CREATE TRIGGER admin_notifications_update_restrict
      BEFORE UPDATE ON admin_notifications
      FOR EACH ROW
      EXECUTE FUNCTION restrict_notification_update();
  END IF;
END $$;

COMMENT ON FUNCTION restrict_notification_update() IS
  'Security trigger: Restricts authenticated users to only updating read/read_at columns on admin_notifications';

