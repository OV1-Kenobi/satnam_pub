-- Migration: Create Pubky Triggers for Real-Time Updates
-- Description: This migration adds PostgreSQL triggers for LISTEN/NOTIFY on Pubky events

-- Create function to notify on pubky_domains changes
CREATE OR REPLACE FUNCTION notify_pubky_domain_changes()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    payload = json_build_object(
      'operation', TG_OP,
      'id', OLD.id,
      'domain_record_id', OLD.domain_record_id,
      'public_key', OLD.public_key
    );
  ELSE
    payload = json_build_object(
      'operation', TG_OP,
      'id', NEW.id,
      'domain_record_id', NEW.domain_record_id,
      'public_key', NEW.public_key,
      'registration_status', NEW.registration_status,
      'updated_at', NEW.updated_at
    );
  END IF;
  
  PERFORM pg_notify('pubky_domain_changes', payload::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for pubky_domains table
CREATE TRIGGER pubky_domains_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON pubky_domains
FOR EACH ROW EXECUTE FUNCTION notify_pubky_domain_changes();

-- Create function to notify on pkarr_records changes
CREATE OR REPLACE FUNCTION notify_pkarr_record_changes()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    payload = json_build_object(
      'operation', TG_OP,
      'id', OLD.id,
      'pubky_domain_id', OLD.pubky_domain_id,
      'record_type', OLD.record_type,
      'record_name', OLD.record_name
    );
  ELSE
    payload = json_build_object(
      'operation', TG_OP,
      'id', NEW.id,
      'pubky_domain_id', NEW.pubky_domain_id,
      'record_type', NEW.record_type,
      'record_name', NEW.record_name,
      'publish_status', NEW.publish_status,
      'updated_at', NEW.updated_at
    );
  END IF;
  
  PERFORM pg_notify('pkarr_record_changes', payload::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for pkarr_records table
CREATE TRIGGER pkarr_records_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON pkarr_records
FOR EACH ROW EXECUTE FUNCTION notify_pkarr_record_changes();

-- Create function to notify on sovereignty_scores changes
CREATE OR REPLACE FUNCTION notify_sovereignty_score_changes()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
  domain_name TEXT;
BEGIN
  -- Get the domain name for the domain record
  SELECT domain_name INTO domain_name
  FROM domain_records
  WHERE id = NEW.domain_record_id;
  
  IF domain_name IS NULL THEN
    RAISE WARNING 'Domain record % not found for sovereignty score', NEW.domain_record_id;
    RETURN NULL;
  END IF;

  payload = json_build_object(
    'operation', TG_OP,
    'id', NEW.id,
    'domain_record_id', NEW.domain_record_id,
    'domain_name', domain_name,
    'score', NEW.score,
    'calculated_at', NEW.calculated_at
  );
  
  PERFORM pg_notify('sovereignty_score_changes', payload::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for sovereignty_scores table
CREATE TRIGGER sovereignty_scores_notify_trigger
AFTER INSERT OR UPDATE ON sovereignty_scores
FOR EACH ROW EXECUTE FUNCTION notify_sovereignty_score_changes();

-- Create function to notify on domain_migrations changes
CREATE OR REPLACE FUNCTION notify_domain_migration_changes()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
  domain_name TEXT;
BEGIN
  -- Get the domain name for the domain record
  SELECT domain_name INTO domain_name
  FROM domain_records
  WHERE id = NEW.domain_record_id;
  
  IF domain_name IS NULL THEN
    RAISE WARNING 'Domain record % not found for domain migration', NEW.domain_record_id;
    RETURN NULL;
  END IF;

  payload = json_build_object(
    'operation', TG_OP,
    'id', NEW.id,
    'domain_record_id', NEW.domain_record_id,
    'domain_name', domain_name,
    'source_provider', NEW.source_provider,
    'target_provider', NEW.target_provider,
    'migration_status', NEW.migration_status,
    'updated_at', NEW.updated_at
  );
  
  PERFORM pg_notify('domain_migration_changes', payload::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for domain_migrations table
CREATE TRIGGER domain_migrations_notify_trigger
AFTER INSERT OR UPDATE ON domain_migrations
FOR EACH ROW EXECUTE FUNCTION notify_domain_migration_changes();

-- Create function to update domain_records sovereignty_score when sovereignty_scores changes
CREATE OR REPLACE FUNCTION update_domain_sovereignty_score()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE domain_records
  SET sovereignty_score = NEW.score,
      updated_at = NOW()
  WHERE id = NEW.domain_record_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update domain_records sovereignty_score
CREATE TRIGGER update_domain_sovereignty_score_trigger
AFTER INSERT OR UPDATE ON sovereignty_scores
FOR EACH ROW EXECUTE FUNCTION update_domain_sovereignty_score();

-- Create function to notify guardians of domain changes
CREATE OR REPLACE FUNCTION notify_guardians_of_domain_changes()
RETURNS TRIGGER AS $$
DECLARE
  guardian_ids UUID[];
  guardian_id UUID;
  payload JSON;
BEGIN
  -- Get all guardians for the domain's family
  SELECT array_agg(fg.id) INTO guardian_ids
  FROM federation_guardians fg
  JOIN domain_records dr ON dr.family_id = fg.family_id
  WHERE dr.id = NEW.id;
  
  -- If there are guardians, notify them
  IF guardian_ids IS NOT NULL THEN
    payload = json_build_object(
      'operation', TG_OP,
      'domain_id', NEW.id,
      'domain_name', NEW.domain_name,
      'domain_type', NEW.domain_type,
      'pubky_enabled', NEW.pubky_enabled,
      'sovereignty_score', NEW.sovereignty_score,
      'updated_at', NEW.updated_at
    );
    
    -- Notify each guardian
    FOREACH guardian_id IN ARRAY guardian_ids LOOP
      PERFORM pg_notify('guardian_' || guardian_id::text, payload::text);
    END LOOP;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for domain_records table to notify guardians
CREATE TRIGGER notify_guardians_domain_changes_trigger
AFTER UPDATE OF domain_type, pubky_enabled, sovereignty_score ON domain_records
FOR EACH ROW EXECUTE FUNCTION notify_guardians_of_domain_changes();