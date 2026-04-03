-- Agent Session Cleanup & Maintenance Functions (Phase 2.5 - Step 3)
-- Automated session lifecycle management with configurable retention policies
-- Designed for scheduled execution via Netlify Functions
--
-- IMPLEMENTATION SUMMARY:
-- Task 3.1: Enhanced hibernate_inactive_sessions() - Logs state snapshots, configurable inactivity, opt-out support
-- Task 3.2: Added cleanup_terminated_sessions() - Retention-based cleanup with cascade delete
-- Task 3.3: Added purge_expired_metadata() - Removes expired metadata entries
-- Task 3.4: Added archive_old_events() - Event archival with STATE_SNAPSHOT preservation
--
-- INTEGRATION POINTS:
-- - All functions use SECURITY DEFINER for service-role equivalent access
-- - Returns JSONB summaries for observability dashboards
-- - Designed for daily scheduled execution via Netlify Functions

-- Task 3.1: Enhanced hibernate_inactive_sessions() function
-- Hibernates sessions inactive beyond configured threshold with state preservation
CREATE OR REPLACE FUNCTION hibernate_inactive_sessions(
  p_inactivity_minutes INTEGER DEFAULT 30
) RETURNS JSONB AS $$
DECLARE
  v_session RECORD;
  v_hibernated_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
  v_session_ids TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Loop through active sessions that exceed inactivity threshold
  FOR v_session IN
    SELECT 
      session_id,
      agent_id,
      conversation_context,
      auto_hibernate_after_minutes,
      last_activity_at
    FROM agent_sessions
    WHERE status = 'ACTIVE'
      AND last_activity_at < NOW() - (p_inactivity_minutes || ' minutes')::INTERVAL
  LOOP
    -- Skip sessions with auto_hibernate_after_minutes = 0 (opt-out)
    IF v_session.auto_hibernate_after_minutes = 0 THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;
    
    -- Check if session-specific hibernate threshold is set and not exceeded
    IF v_session.auto_hibernate_after_minutes IS NOT NULL 
       AND v_session.auto_hibernate_after_minutes > 0 THEN
      IF v_session.last_activity_at > NOW() - (v_session.auto_hibernate_after_minutes || ' minutes')::INTERVAL THEN
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;
    END IF;
    
    -- Log STATE_SNAPSHOT event with full conversation_context before hibernating
    PERFORM log_session_event(
      v_session.session_id,
      'STATE_SNAPSHOT',
      jsonb_build_object(
        'reason', 'auto_hibernate',
        'inactivity_minutes', EXTRACT(EPOCH FROM (NOW() - v_session.last_activity_at)) / 60,
        'conversation_context', v_session.conversation_context,
        'hibernated_at', NOW()
      )
    );
    
    -- Update session status to HIBERNATED
    UPDATE agent_sessions
    SET status = 'HIBERNATED',
        hibernated_at = NOW(),
        updated_at = NOW()
    WHERE session_id = v_session.session_id;
    
    v_hibernated_count := v_hibernated_count + 1;
    v_session_ids := array_append(v_session_ids, v_session.session_id);
  END LOOP;
  
  -- Return summary for observability
  RETURN jsonb_build_object(
    'hibernated_count', v_hibernated_count,
    'skipped_count', v_skipped_count,
    'inactivity_threshold_minutes', p_inactivity_minutes,
    'session_ids', v_session_ids,
    'executed_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Task 3.2: Add cleanup_terminated_sessions() function
-- Deletes terminated sessions beyond retention period with cascade cleanup
CREATE OR REPLACE FUNCTION cleanup_terminated_sessions(
  p_retention_days INTEGER DEFAULT 30
) RETURNS JSONB AS $$
DECLARE
  v_deleted_sessions INTEGER;
  v_deleted_events INTEGER;
  v_deleted_metadata INTEGER;
  v_deleted_performance INTEGER;
  v_cutoff_date TIMESTAMPTZ;
  v_session_ids TEXT[];
BEGIN
  v_cutoff_date := NOW() - (p_retention_days || ' days')::INTERVAL;

  -- Capture the target session IDs once to eliminate TOCTOU and redundant subqueries.
  -- All subsequent DELETEs operate on this fixed set, so the returned summary exactly
  -- reflects what was deleted — concurrent terminate_session() calls cannot slip rows
  -- in or out between the collect and delete steps.
  SELECT array_agg(session_id) INTO v_session_ids
  FROM agent_sessions
  WHERE status = 'TERMINATED'
    AND terminated_at < v_cutoff_date;

  -- Short-circuit when there is nothing to clean up
  IF v_session_ids IS NULL THEN
    RETURN jsonb_build_object(
      'deleted_sessions', 0,
      'deleted_events', 0,
      'deleted_metadata', 0,
      'deleted_performance', 0,
      'retention_days', p_retention_days,
      'cutoff_date', v_cutoff_date,
      'session_ids', ARRAY[]::TEXT[],
      'executed_at', NOW()
    );
  END IF;

  -- Delete child records using the fixed session ID array (manual cascade for counting)
  DELETE FROM agent_session_performance
  WHERE session_id = ANY(v_session_ids);
  GET DIAGNOSTICS v_deleted_performance = ROW_COUNT;

  DELETE FROM agent_session_metadata
  WHERE session_id = ANY(v_session_ids);
  GET DIAGNOSTICS v_deleted_metadata = ROW_COUNT;

  DELETE FROM agent_session_events
  WHERE session_id = ANY(v_session_ids);
  GET DIAGNOSTICS v_deleted_events = ROW_COUNT;

  -- Delete the sessions themselves last (parent after children)
  DELETE FROM agent_sessions
  WHERE session_id = ANY(v_session_ids);
  GET DIAGNOSTICS v_deleted_sessions = ROW_COUNT;
  
  -- Return cleanup summary
  RETURN jsonb_build_object(
    'deleted_sessions', v_deleted_sessions,
    'deleted_events', v_deleted_events,
    'deleted_metadata', v_deleted_metadata,
    'deleted_performance', v_deleted_performance,
    'retention_days', p_retention_days,
    'cutoff_date', v_cutoff_date,
    'session_ids', COALESCE(v_session_ids, ARRAY[]::TEXT[]),
    'executed_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Task 3.3: Add purge_expired_metadata() function
-- Removes expired metadata entries from agent_session_metadata
CREATE OR REPLACE FUNCTION purge_expired_metadata()
RETURNS JSONB AS $$
DECLARE
  v_purged_count INTEGER;
  v_metadata_keys TEXT[];
BEGIN
  -- Collect metadata keys for summary
  SELECT array_agg(DISTINCT metadata_key) INTO v_metadata_keys
  FROM agent_session_metadata
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW();

  -- Delete expired metadata
  DELETE FROM agent_session_metadata
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW();
  GET DIAGNOSTICS v_purged_count = ROW_COUNT;

  -- Return purge summary
  RETURN jsonb_build_object(
    'purged_count', v_purged_count,
    'metadata_keys', COALESCE(v_metadata_keys, ARRAY[]::TEXT[]),
    'executed_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Task 3.4: Add archive_old_events() function
-- Archives or deletes old events with STATE_SNAPSHOT preservation
CREATE OR REPLACE FUNCTION archive_old_events(
  p_retention_days INTEGER DEFAULT 90,
  p_snapshot_retention_days INTEGER DEFAULT 365
) RETURNS JSONB AS $$
DECLARE
  v_deleted_regular_events INTEGER;
  v_deleted_snapshot_events INTEGER;
  v_cutoff_date TIMESTAMPTZ;
  v_snapshot_cutoff_date TIMESTAMPTZ;
  v_event_types TEXT[];
BEGIN
  v_cutoff_date := NOW() - (p_retention_days || ' days')::INTERVAL;
  v_snapshot_cutoff_date := NOW() - (p_snapshot_retention_days || ' days')::INTERVAL;

  -- Collect event types for summary
  SELECT array_agg(DISTINCT event_type) INTO v_event_types
  FROM agent_session_events
  WHERE timestamp < v_cutoff_date
    AND event_type != 'STATE_SNAPSHOT';

  -- Delete regular events older than retention period
  DELETE FROM agent_session_events
  WHERE timestamp < v_cutoff_date
    AND event_type != 'STATE_SNAPSHOT';
  GET DIAGNOSTICS v_deleted_regular_events = ROW_COUNT;

  -- Delete STATE_SNAPSHOT events older than extended retention period
  DELETE FROM agent_session_events
  WHERE timestamp < v_snapshot_cutoff_date
    AND event_type = 'STATE_SNAPSHOT';
  GET DIAGNOSTICS v_deleted_snapshot_events = ROW_COUNT;

  -- Return archive summary
  RETURN jsonb_build_object(
    'deleted_regular_events', v_deleted_regular_events,
    'deleted_snapshot_events', v_deleted_snapshot_events,
    'regular_retention_days', p_retention_days,
    'snapshot_retention_days', p_snapshot_retention_days,
    'regular_cutoff_date', v_cutoff_date,
    'snapshot_cutoff_date', v_snapshot_cutoff_date,
    'event_types_deleted', COALESCE(v_event_types, ARRAY[]::TEXT[]),
    'executed_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Composite cleanup function for scheduled execution
-- Runs all cleanup operations in sequence and returns combined summary
CREATE OR REPLACE FUNCTION run_session_maintenance()
RETURNS JSONB AS $$
DECLARE
  v_hibernate_result JSONB;
  v_cleanup_result JSONB;
  v_purge_result JSONB;
  v_archive_result JSONB;
BEGIN
  -- Run all maintenance operations
  v_hibernate_result := hibernate_inactive_sessions(30);
  v_cleanup_result := cleanup_terminated_sessions(30);
  v_purge_result := purge_expired_metadata();
  v_archive_result := archive_old_events(90, 365);

  -- Return combined summary
  RETURN jsonb_build_object(
    'maintenance_run_at', NOW(),
    'hibernate_inactive_sessions', v_hibernate_result,
    'cleanup_terminated_sessions', v_cleanup_result,
    'purge_expired_metadata', v_purge_result,
    'archive_old_events', v_archive_result,
    'status', 'completed'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

