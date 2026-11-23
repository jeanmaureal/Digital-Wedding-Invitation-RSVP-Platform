-- ============================================================================
-- Deduplicate households during CSV bulk import (`public.import_wedding_guests`)
-- ============================================================================
-- Adds a case-insensitive household name lookup index on `public.guest_groups`
-- and updates `public.import_wedding_guests` so re-importing the same CSV file
-- (or any household whose normalized `display_name` already exists in the same
-- wedding) skips duplicate households atomically and reports skipped counts.
--
-- Note: The index is intentionally non-unique so weddings that already contain
-- duplicate household rows before this migration can apply it cleanly without
-- failing on existing data.
-- ============================================================================

CREATE INDEX IF NOT EXISTS guest_groups_workspace_wedding_lower_name_idx
  ON public.guest_groups (workspace_id, wedding_id, pg_catalog.lower(display_name));

CREATE OR REPLACE FUNCTION public.import_wedding_guests(
  p_workspace_id uuid,
  p_wedding_id uuid,
  p_households jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role public.workspace_role;
  v_household_count integer;
  v_next_group_sort integer;
  v_imported_groups integer := 0;
  v_imported_guests integer := 0;
  v_skipped_groups integer := 0;
  v_skipped_guests integer := 0;
  v_total_batch_guests integer := 0;
  v_household jsonb;
  v_guest jsonb;
  v_guests_arr jsonb;
  v_guest_count integer;
  v_display_name text;
  v_notes text;
  v_max_attendees integer;
  v_group_id uuid;
  v_guest_sort integer;
  v_side_raw text;
  v_side public.guest_side;
  v_is_child boolean;
  v_is_duplicate boolean;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required to import wedding guests.'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL OR p_wedding_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace ID and wedding ID are required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT wm.role
    INTO v_caller_role
    FROM public.workspace_members wm
   WHERE wm.workspace_id = p_workspace_id
     AND wm.user_id = v_caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED: You do not have access to this workspace.'
      USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN (
    'owner'::public.workspace_role,
    'admin'::public.workspace_role,
    'editor'::public.workspace_role
  ) THEN
    RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: Only workspace owners, admins, and editors can import guests.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
    FROM public.weddings w
   WHERE w.workspace_id = p_workspace_id
     AND w.id = p_wedding_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WEDDING_NOT_FOUND: Wedding project not found in this workspace.'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_households IS NULL
     OR pg_catalog.jsonb_typeof(p_households) <> 'array'
     OR pg_catalog.octet_length(p_households::text) > 262144
  THEN
    RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Import payload must be a JSON array up to 256 KB.'
      USING ERRCODE = '22023';
  END IF;

  v_household_count := pg_catalog.jsonb_array_length(p_households);
  IF v_household_count < 1 OR v_household_count > 200 THEN
    RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Import batch must contain between 1 and 200 households.'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(gg.sort_order), -1) + 1
    INTO v_next_group_sort
    FROM public.guest_groups gg
   WHERE gg.workspace_id = p_workspace_id
     AND gg.wedding_id = p_wedding_id;

  FOR v_household IN SELECT value FROM pg_catalog.jsonb_array_elements(p_households) LOOP
    IF pg_catalog.jsonb_typeof(v_household) <> 'object' THEN
      RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Each household entry must be an object.'
        USING ERRCODE = '22023';
    END IF;

    v_display_name := pg_catalog.btrim(COALESCE(v_household ->> 'displayName', ''));
    v_notes := pg_catalog.btrim(COALESCE(v_household ->> 'notes', ''));
    v_guests_arr := v_household -> 'guests';

    IF pg_catalog.char_length(v_display_name) < 1 OR pg_catalog.char_length(v_display_name) > 120 THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Household display name must be between 1 and 120 characters.'
        USING ERRCODE = '22023';
    END IF;

    IF v_guests_arr IS NULL OR pg_catalog.jsonb_typeof(v_guests_arr) <> 'array' THEN
      RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Household "%" must include a guests array.', v_display_name
        USING ERRCODE = '22023';
    END IF;

    v_guest_count := pg_catalog.jsonb_array_length(v_guests_arr);
    IF v_guest_count < 1 OR v_guest_count > 50 THEN
      RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Household "%" must contain between 1 and 50 guests.', v_display_name
        USING ERRCODE = '22023';
    END IF;

    v_total_batch_guests := v_total_batch_guests + v_guest_count;
    IF v_total_batch_guests > 500 THEN
      RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Import batch exceeds the 500-guest per-import limit.'
        USING ERRCODE = '22023';
    END IF;

    IF v_household ? 'maxAttendees' AND pg_catalog.jsonb_typeof(v_household -> 'maxAttendees') <> 'null' THEN
      IF pg_catalog.jsonb_typeof(v_household -> 'maxAttendees') <> 'number'
         OR (v_household ->> 'maxAttendees') !~ '^[0-9]+$'
      THEN
        RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Household "%" has a non-integer maxAttendees value.', v_display_name
          USING ERRCODE = '22023';
      END IF;
      v_max_attendees := (v_household ->> 'maxAttendees')::integer;
    ELSE
      v_max_attendees := v_guest_count;
    END IF;

    IF v_max_attendees < 1 OR v_max_attendees > 50 THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Household max_attendees must be between 1 and 50.'
        USING ERRCODE = '22023';
    END IF;

    -- Case-insensitive duplicate household check within this wedding (also catches
    -- duplicates repeated inside the same p_households payload).
    SELECT EXISTS (
      SELECT 1
        FROM public.guest_groups gg
       WHERE gg.workspace_id = p_workspace_id
         AND gg.wedding_id = p_wedding_id
         AND pg_catalog.lower(gg.display_name) = pg_catalog.lower(v_display_name)
    )
    INTO v_is_duplicate;

    IF v_is_duplicate THEN
      v_skipped_groups := v_skipped_groups + 1;
      v_skipped_guests := v_skipped_guests + v_guest_count;
      CONTINUE;
    END IF;

    INSERT INTO public.guest_groups (
      wedding_id,
      workspace_id,
      display_name,
      max_attendees,
      notes,
      sort_order,
      created_by
    )
    VALUES (
      p_wedding_id,
      p_workspace_id,
      v_display_name,
      v_max_attendees,
      v_notes,
      v_next_group_sort,
      v_caller_id
    )
    RETURNING id INTO v_group_id;

    v_next_group_sort := v_next_group_sort + 1;
    v_imported_groups := v_imported_groups + 1;
    v_guest_sort := 0;

    FOR v_guest IN SELECT value FROM pg_catalog.jsonb_array_elements(v_guests_arr) LOOP
      IF pg_catalog.jsonb_typeof(v_guest) <> 'object' THEN
        RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Each guest item in household "%" must be an object.', v_display_name
          USING ERRCODE = '22023';
      END IF;

      v_side_raw := pg_catalog.lower(pg_catalog.btrim(COALESCE(v_guest ->> 'side', 'mutual')));
      IF v_side_raw = '' THEN
        v_side_raw := 'mutual';
      END IF;
      IF v_side_raw NOT IN ('partner_one', 'partner_two', 'mutual', 'other') THEN
        RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Invalid guest side "%" in household "%".', v_side_raw, v_display_name
          USING ERRCODE = '22023';
      END IF;
      v_side := v_side_raw::public.guest_side;

      IF v_guest ? 'isChild' AND pg_catalog.jsonb_typeof(v_guest -> 'isChild') <> 'null' THEN
        IF pg_catalog.jsonb_typeof(v_guest -> 'isChild') <> 'boolean' THEN
          RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Guest isChild flag in household "%" must be boolean.', v_display_name
            USING ERRCODE = '22023';
        END IF;
        v_is_child := (v_guest ->> 'isChild')::boolean;
      ELSE
        v_is_child := false;
      END IF;

      INSERT INTO public.guests (
        group_id,
        wedding_id,
        workspace_id,
        first_name,
        last_name,
        email,
        phone,
        side,
        is_child,
        dietary_notes,
        sort_order
      )
      VALUES (
        v_group_id,
        p_wedding_id,
        p_workspace_id,
        COALESCE(v_guest ->> 'firstName', ''),
        COALESCE(v_guest ->> 'lastName', ''),
        COALESCE(v_guest ->> 'email', ''),
        COALESCE(v_guest ->> 'phone', ''),
        v_side,
        v_is_child,
        COALESCE(v_guest ->> 'dietaryNotes', ''),
        v_guest_sort
      );

      v_guest_sort := v_guest_sort + 1;
      v_imported_guests := v_imported_guests + 1;
    END LOOP;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'importedGroupCount', v_imported_groups,
    'importedGuestCount', v_imported_guests,
    'skippedGroupCount', v_skipped_groups,
    'skippedGuestCount', v_skipped_guests
  );
END;
$$;

ALTER FUNCTION public.import_wedding_guests(uuid, uuid, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.import_wedding_guests(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_wedding_guests(uuid, uuid, jsonb)
  TO authenticated;
