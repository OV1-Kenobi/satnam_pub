DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'family_federations'
  ) THEN

    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = 'family_federations'
        AND policyname = 'family_federations_member_access'
    ) THEN
      DROP POLICY "family_federations_member_access" ON family_federations;
    END IF;

    -- Drop new policies if present
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = 'family_federations'
        AND policyname = 'family_federations_name_availability_check'
    ) THEN
      DROP POLICY "family_federations_name_availability_check" ON family_federations;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = 'family_federations'
        AND policyname = 'family_federations_member_write_access_insert'
    ) THEN
      DROP POLICY "family_federations_member_write_access_insert" ON family_federations;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = 'family_federations'
        AND policyname = 'family_federations_member_write_access_update'
    ) THEN
      DROP POLICY "family_federations_member_write_access_update" ON family_federations;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = 'family_federations'
        AND policyname = 'family_federations_member_write_access_delete'
    ) THEN
      DROP POLICY "family_federations_member_write_access_delete" ON family_federations;
    END IF;

    -- 1) Global SELECT policy
    CREATE POLICY "family_federations_name_availability_check" ON family_federations
      FOR SELECT
      TO authenticated
      USING (true);

    -- 2) Member-only write policies (INSERT/UPDATE/DELETE)
    CREATE POLICY "family_federations_member_write_access_insert" ON family_federations
      FOR INSERT
      TO authenticated
      WITH CHECK (
        id IN (
          SELECT family_federation_id
          FROM family_members
          WHERE user_duid = current_setting('app.current_user_duid', true)
            AND is_active = true
        )
      );

    CREATE POLICY "family_federations_member_write_access_update" ON family_federations
      FOR UPDATE
      TO authenticated
      USING (
        id IN (
          SELECT family_federation_id
          FROM family_members
          WHERE user_duid = current_setting('app.current_user_duid', true)
            AND is_active = true
        )
      )
      WITH CHECK (
        id IN (
          SELECT family_federation_id
          FROM family_members
          WHERE user_duid = current_setting('app.current_user_duid', true)
            AND is_active = true
        )
      );

    CREATE POLICY "family_federations_member_write_access_delete" ON family_federations
      FOR DELETE
      TO authenticated
      USING (
        id IN (
          SELECT family_federation_id
          FROM family_members
          WHERE user_duid = current_setting('app.current_user_duid', true)
            AND is_active = true
        )
      );

  END IF;
END $$;
