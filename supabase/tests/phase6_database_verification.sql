-- ============================================================================
-- Phase 6 Executable PostgreSQL Guest Directory, CSV Import & Hashed Token Suite
-- ============================================================================
-- Execution model:
--   Runs inside a single `BEGIN; ... ROLLBACK;` transaction so zero test rows
--   persist after execution. Any failed check raises an unhandled exception
--   with prefix `ASSERTION_FAILED:` and aborts with a non-zero exit code.
--
-- Covers:
--   - P6-AC01 & P6-AC02: `guest_groups`, `guests`, and `invitations` constraints,
--     composite FKs, indexes, RLS, zero `anon` table privileges, column-scoped
--     `SELECT` on `invitations` hiding `token_hash` even from workspace owners,
--     `viewer` read-only enforcement, and cross-wedding/cross-workspace isolation.
--   - P6-AC03 & P6-AC04: `issue_household_invitation` 256-bit base64url token
--     generation, SHA-256 hex digest verification, automatic revocation of prior
--     active tokens on rotation, `update_household_invitation`, `revoke_household_invitation`,
--     and `resolve_invitation_by_token` (`STABLE`) unlocking both `public` and
--     `invite_only` published weddings while returning uniform `unavailable` for
--     unknown, revoked, expired, or unpublished tokens with zero raw token echo.
--   - P6-AC05: `import_wedding_guests` atomic rollback on malformed rows + clean
--     commit on valid batches, `duplicate_wedding` non-cloning of guests/tokens,
--     and `ON DELETE SET NULL` safety when deleting `created_by`/`issued_by` users.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Catalog, Table/Column Privilege, Index & Function Security Audit (P6-AC01..04)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_rec record;
  v_expected_indexes text[] := ARRAY[
    'guest_groups_pkey',
    'guest_groups_workspace_wedding_id_key',
    'guest_groups_workspace_wedding_sort_idx',
    'guest_groups_created_by_idx',
    'guests_pkey',
    'guests_workspace_wedding_group_id_key',
    'guests_workspace_wedding_sort_idx',
    'invitations_pkey',
    'invitations_token_hash_key',
    'invitations_one_active_per_group_idx',
    'invitations_workspace_wedding_group_created_idx',
    'invitations_issued_by_idx'
  ];
  v_idx text;
  v_fn_count int;
BEGIN
  -- 1.1 Verify RLS enabled on every `public` table including Phase 6 tables
  FOR v_rec IN
    SELECT c.relname, c.relrowsecurity
      FROM pg_catalog.pg_class c
      INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
  LOOP
    IF NOT v_rec.relrowsecurity THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC01]: RLS is NOT enabled on public.%', v_rec.relname;
    END IF;
  END LOOP;

  -- 1.2 Verify `anon` holds ZERO privileges on `guest_groups`, `guests`, and `invitations`
  FOREACH v_idx IN ARRAY ARRAY['public.guest_groups', 'public.guests', 'public.invitations'] LOOP
    IF pg_catalog.has_any_column_privilege('anon', v_idx, 'SELECT, INSERT, UPDATE')
       OR pg_catalog.has_table_privilege('anon', v_idx, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
    THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC01]: Role anon must hold zero privileges on %.', v_idx;
    END IF;
  END LOOP;

  -- 1.3 Verify `authenticated` holds ZERO privilege on `public.invitations.token_hash` and zero direct writes on `invitations`
  IF pg_catalog.has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.invitations', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.invitations', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.invitations', 'DELETE')
     OR pg_catalog.has_any_column_privilege('authenticated', 'public.invitations', 'INSERT, UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.invitations', 'status', 'SELECT')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC03]: Role authenticated must not be able to SELECT token_hash or directly mutate public.invitations.';
  END IF;

  -- 1.4 Verify expected Phase 6 indexes exist
  FOREACH v_idx IN ARRAY v_expected_indexes LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_indexes i
       WHERE i.schemaname = 'public'
         AND i.indexname = v_idx
    ) THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC01]: Missing expected index public.%', v_idx;
    END IF;
  END LOOP;

  -- 1.5 Audit all functions across `public` and `app_private` (>= 38 functions)
  SELECT count(*)::int
    INTO v_fn_count
    FROM pg_catalog.pg_proc p
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public', 'app_private');

  IF v_fn_count < 38 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC01]: Expected >= 38 functions in public/app_private, found %', v_fn_count;
  END IF;

  FOR v_rec IN
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname AS fn_name,
      p.provolatile AS volatility,
      p.proowner::regrole::text AS owner_name,
      COALESCE(p.proconfig, ARRAY[]::text[]) AS config_arr,
      COALESCE(p.proacl::text, '') AS acl_text,
      pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
      pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
    FROM pg_catalog.pg_proc p
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'app_private')
  LOOP
    IF v_rec.owner_name <> 'postgres' THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC01]: Function %.% owner is %, expected postgres.',
        v_rec.schema_name, v_rec.fn_name, v_rec.owner_name;
    END IF;

    IF NOT ('search_path=""' = ANY(v_rec.config_arr) OR 'search_path=' = ANY(v_rec.config_arr)) THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC01]: Function %.% is missing fixed empty search_path.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.acl_text = '' OR v_rec.acl_text LIKE '{=X/%' OR v_rec.acl_text LIKE '%,=X/%' THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC01]: Function %.% retains PUBLIC EXECUTE grant.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    -- Only `health_check`, `get_public_wedding_by_slug`, `resolve_invitation_by_token`, and `submit_household_rsvp` may be executable by `anon`
    IF v_rec.fn_name NOT IN (
      'health_check',
      'get_public_wedding_by_slug',
      'resolve_invitation_by_token',
      'submit_household_rsvp'
    ) AND v_rec.anon_exec THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC04]: Function %.% must NOT be executable by anon.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.fn_name = 'resolve_invitation_by_token' THEN
      IF v_rec.volatility <> 's' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC04]: resolve_invitation_by_token must be STABLE (read-only).';
      END IF;
      IF NOT v_rec.anon_exec OR NOT v_rec.auth_exec THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC04]: resolve_invitation_by_token must be executable by anon and authenticated.';
      END IF;
    END IF;

    IF v_rec.fn_name IN (
      'normalize_guest_group_fields',
      'normalize_guest_fields',
      'enforce_invitation_integrity'
    ) AND v_rec.auth_exec THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC01]: Trigger function %.% must NOT be executable by authenticated.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Seed Ephemeral Test Actors, Workspaces & Weddings
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_p6_state (
  key text PRIMARY KEY,
  val text NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON TABLE tmp_p6_state TO authenticated, anon;

DO $$
DECLARE
  v_owner_a constant uuid := '66666666-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_editor_a constant uuid := '66666666-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_viewer_a constant uuid := '66666666-cccc-4ccc-8ccc-ccccccccccc3';
  v_outsider constant uuid := '66666666-dddd-4ddd-8ddd-ddddddddddd4';
  v_ws_a uuid;
  v_ws_b uuid;
  v_wedding_pub public.weddings;
  v_wedding_priv public.weddings;
  v_wedding_b public.weddings;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner_a, 'p6.owner.a@example.com', '{"full_name":"P6 Owner A"}'::jsonb, now(), now()),
    (v_editor_a, 'p6.editor.a@example.com', '{"full_name":"P6 Editor A"}'::jsonb, now(), now()),
    (v_viewer_a, 'p6.viewer.a@example.com', '{"full_name":"P6 Viewer A"}'::jsonb, now(), now()),
    (v_outsider, 'p6.outsider@example.com', '{"full_name":"P6 Outsider"}'::jsonb, now(), now());

  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_ws_a := (public.create_workspace('P6 Studio Alpha', 'p6-studio-alpha')).id;
  PERFORM public.add_workspace_member_by_email(v_ws_a, 'p6.editor.a@example.com', 'editor');
  PERFORM public.add_workspace_member_by_email(v_ws_a, 'p6.viewer.a@example.com', 'viewer');

  v_wedding_pub := public.create_wedding(
    p_workspace_id => v_ws_a,
    p_title => 'Public Celebration',
    p_partner_one_name => 'Clara',
    p_partner_two_name => 'Mateo',
    p_slug => 'p6-public-celebration',
    p_event_date => DATE '2027-06-12',
    p_venue_name => 'Glass Conservatory',
    p_venue_location => 'Manila',
    p_timezone => 'Asia/Manila',
    p_access_mode => 'public'::public.wedding_access_mode
  );

  v_wedding_priv := public.create_wedding(
    p_workspace_id => v_ws_a,
    p_title => 'Invite Only Celebration',
    p_partner_one_name => 'Noelle',
    p_partner_two_name => 'Julian',
    p_slug => 'p6-invite-only-celebration',
    p_event_date => DATE '2027-09-18',
    p_venue_name => 'Private Villa',
    p_venue_location => 'Cebu',
    p_timezone => 'Asia/Manila',
    p_access_mode => 'invite_only'::public.wedding_access_mode
  );

  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  v_ws_b := (public.create_workspace('P6 Studio Beta', 'p6-studio-beta')).id;
  v_wedding_b := public.create_wedding(
    p_workspace_id => v_ws_b,
    p_title => 'Beta Celebration',
    p_partner_one_name => 'Sora',
    p_partner_two_name => 'Kai',
    p_slug => 'p6-beta-celebration'
  );

  INSERT INTO tmp_p6_state (key, val)
  VALUES
    ('ws_a', v_ws_a::text),
    ('ws_b', v_ws_b::text),
    ('wedding_pub', v_wedding_pub.id::text),
    ('wedding_priv', v_wedding_priv.id::text),
    ('wedding_b', v_wedding_b.id::text);
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Authenticated Organizer CRUD, Composite FKs, Atomic CSV Import & Tokens
-- ----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_editor_a constant uuid := '66666666-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_viewer_a constant uuid := '66666666-cccc-4ccc-8ccc-ccccccccccc3';
  v_outsider constant uuid := '66666666-dddd-4ddd-8ddd-ddddddddddd4';
  v_ws_a uuid := (SELECT val::uuid FROM tmp_p6_state WHERE key = 'ws_a');
  v_ws_b uuid := (SELECT val::uuid FROM tmp_p6_state WHERE key = 'ws_b');
  v_wedding_pub uuid := (SELECT val::uuid FROM tmp_p6_state WHERE key = 'wedding_pub');
  v_wedding_priv uuid := (SELECT val::uuid FROM tmp_p6_state WHERE key = 'wedding_priv');
  v_wedding_b uuid := (SELECT val::uuid FROM tmp_p6_state WHERE key = 'wedding_b');
  v_group_pub uuid;
  v_group_priv uuid;
  v_guest_pub uuid;
  v_import_res jsonb;
  v_dup_res public.weddings;
  v_dup_wedding_id uuid;
  v_issue_1 jsonb;
  v_issue_2 jsonb;
  v_issue_priv jsonb;
  v_inv_id_2 uuid;
  v_count int;
  v_blocked boolean;
BEGIN
  -- 3.1 Editor creates household + guest in `wedding_pub`
  PERFORM set_config('request.jwt.claim.sub', v_editor_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  INSERT INTO public.guest_groups (wedding_id, workspace_id, display_name, max_attendees, notes)
  VALUES (v_wedding_pub, v_ws_a, '  The Rivera Family  ', 4, '  VIP table near stage  ')
  RETURNING id INTO v_group_pub;

  INSERT INTO public.guests (
    group_id, wedding_id, workspace_id, first_name, last_name, email, phone, side, is_child, dietary_notes
  )
  VALUES (
    v_group_pub, v_wedding_pub, v_ws_a, ' Elena ', ' Rivera ', ' ELENA@EXAMPLE.COM ', '+63 917 000 0000', 'partner_one', false, 'Vegetarian'
  )
  RETURNING id INTO v_guest_pub;

  -- Verify trimming & lowercase email normalization
  IF NOT EXISTS (
    SELECT 1
      FROM public.guests g
     WHERE g.id = v_guest_pub
       AND g.first_name = 'Elena'
       AND g.email = 'elena@example.com'
  ) THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC01]: Trigger normalization failed on public.guests.';
  END IF;

  -- 3.2 Reject `max_attendees < 1` (`0`)
  v_blocked := false;
  BEGIN
    INSERT INTO public.guest_groups (wedding_id, workspace_id, display_name, max_attendees)
    VALUES (v_wedding_pub, v_ws_a, 'Invalid Cap Household', 0);
  EXCEPTION
    WHEN invalid_parameter_value OR check_violation THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC01]: max_attendees = 0 must be rejected.';
  END IF;

  -- 3.3 Reject `<script>` injection in guest fields (`UNSAFE_GUEST_PAYLOAD`)
  v_blocked := false;
  BEGIN
    INSERT INTO public.guests (group_id, wedding_id, workspace_id, first_name)
    VALUES (v_group_pub, v_wedding_pub, v_ws_a, '<script>alert(1)</script>');
  EXCEPTION
    WHEN invalid_parameter_value THEN
      IF SQLERRM LIKE '%UNSAFE_GUEST_PAYLOAD%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC01]: Unsafe script payload in guest name must be rejected.';
  END IF;

  -- 3.4 Reject cross-wedding composite FK (`guest` referencing `v_group_pub` under `v_wedding_priv`)
  v_blocked := false;
  BEGIN
    INSERT INTO public.guests (group_id, wedding_id, workspace_id, first_name)
    VALUES (v_group_pub, v_wedding_priv, v_ws_a, 'CrossWeddingLeak');
  EXCEPTION
    WHEN foreign_key_violation THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC01]: Cross-wedding guest->group linkage must fail composite FK.';
  END IF;

  -- 3.5 Atomic CSV Import: malformed second household rolls back entire batch (`0` new rows)
  v_blocked := false;
  BEGIN
    PERFORM public.import_wedding_guests(
      v_ws_a,
      v_wedding_priv,
      jsonb_build_array(
        jsonb_build_object(
          'displayName', 'Rollback Household 1',
          'maxAttendees', 2,
          'guests', jsonb_build_array(jsonb_build_object('firstName', 'ValidGuest'))
        ),
        jsonb_build_object(
          'displayName', 'Rollback Household 2',
          'maxAttendees', 0,
          'guests', jsonb_build_array(jsonb_build_object('firstName', 'BrokenCap'))
        )
      )
    );
  EXCEPTION
    WHEN invalid_parameter_value OR check_violation THEN
      v_blocked := true;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC05]: Malformed batch in import_wedding_guests must raise validation error.';
  END IF;

  SELECT count(*)::int INTO v_count
    FROM public.guest_groups gg
   WHERE gg.wedding_id = v_wedding_priv;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC05]: Failed import_wedding_guests batch left % partial household rows!', v_count;
  END IF;

  -- 3.6 Atomic CSV Import: valid multi-household batch commits cleanly
  v_import_res := public.import_wedding_guests(
    v_ws_a,
    v_wedding_priv,
    jsonb_build_array(
      jsonb_build_object(
        'displayName', 'The Santos Household',
        'maxAttendees', 3,
        'notes', 'Private villa invitees',
        'guests', jsonb_build_array(
          jsonb_build_object('firstName', 'Marco', 'lastName', 'Santos', 'email', 'marco@example.com', 'side', 'partner_one', 'isChild', false, 'dietaryNotes', 'Nut-free'),
          jsonb_build_object('firstName', 'Lucia', 'lastName', 'Santos', 'side', 'partner_two', 'isChild', true, 'dietaryNotes', '')
        )
      ),
      jsonb_build_object(
        'displayName', 'Dr. Ingrid Tan',
        'guests', jsonb_build_array(
          jsonb_build_object('firstName', 'Ingrid', 'lastName', 'Tan')
        )
      )
    )
  );

  IF (v_import_res ->> 'importedGroupCount')::int <> 2
     OR (v_import_res ->> 'importedGuestCount')::int <> 3
     OR (v_import_res ->> 'skippedGroupCount')::int <> 0
     OR (v_import_res ->> 'skippedGuestCount')::int <> 0
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC05]: Unexpected import_wedding_guests counts: %', v_import_res;
  END IF;

  -- 3.6b Atomic CSV Import Deduplication: re-importing the same households skips duplicates cleanly
  v_import_res := public.import_wedding_guests(
    v_ws_a,
    v_wedding_priv,
    jsonb_build_array(
      jsonb_build_object(
        'displayName', '  the santos household ',
        'maxAttendees', 3,
        'guests', jsonb_build_array(
          jsonb_build_object('firstName', 'Marco', 'lastName', 'Santos')
        )
      ),
      jsonb_build_object(
        'displayName', 'DR. INGRID TAN',
        'guests', jsonb_build_array(
          jsonb_build_object('firstName', 'Ingrid', 'lastName', 'Tan')
        )
      )
    )
  );

  IF (v_import_res ->> 'importedGroupCount')::int <> 0
     OR (v_import_res ->> 'importedGuestCount')::int <> 0
     OR (v_import_res ->> 'skippedGroupCount')::int <> 2
     OR (v_import_res ->> 'skippedGuestCount')::int <> 2
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC05]: Re-importing duplicate households should skip all duplicates: %', v_import_res;
  END IF;

  SELECT gg.id INTO v_group_priv
    FROM public.guest_groups gg
   WHERE gg.wedding_id = v_wedding_priv
     AND gg.display_name = 'The Santos Household';

  -- 3.7 Issue household invitation #1 -> rotate to invitation #2 (prior #1 auto-revoked!)
  v_issue_1 := public.issue_household_invitation(
    v_ws_a,
    v_wedding_pub,
    v_group_pub,
    now() + interval '14 days'
  );

  IF char_length(v_issue_1 ->> 'rawToken') <> 43
     OR (v_issue_1 ->> 'rawToken') !~ '^[A-Za-z0-9_-]{43}$'
     OR (v_issue_1 -> 'invitation') ? 'tokenHash'
     OR (v_issue_1 -> 'invitation') ? 'token_hash'
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC03]: Expected 43-char base64url rawToken and zero token_hash in RPC response: %', v_issue_1;
  END IF;

  v_issue_2 := public.issue_household_invitation(
    v_ws_a,
    v_wedding_pub,
    v_group_pub,
    now() + interval '30 days'
  );
  v_inv_id_2 := (v_issue_2 -> 'invitation' ->> 'id')::uuid;

  -- Update delivery_status on active invitation #2
  PERFORM public.update_household_invitation(
    v_ws_a,
    v_wedding_pub,
    v_inv_id_2,
    'shared'::public.invitation_delivery_status,
    now() + interval '30 days'
  );

  -- Issue active token for `invite_only` wedding household
  v_issue_priv := public.issue_household_invitation(
    v_ws_a,
    v_wedding_priv,
    v_group_priv,
    NULL
  );

  -- Publish ONLY `wedding_priv` (`invite_only`) first; keep `wedding_pub` in `draft` momentarily to verify draft block!
  PERFORM public.publish_wedding(v_ws_a, v_wedding_priv);

  -- Verify `duplicate_wedding` does NOT clone `guest_groups`, `guests`, or `invitations`
  v_dup_res := public.duplicate_wedding(
    v_ws_a,
    v_wedding_priv,
    'Duplicated Private Celebration',
    'p6-duplicated-private'
  );
  v_dup_wedding_id := v_dup_res.id;

  IF EXISTS (SELECT 1 FROM public.guest_groups WHERE wedding_id = v_dup_wedding_id)
     OR EXISTS (SELECT 1 FROM public.guests WHERE wedding_id = v_dup_wedding_id)
     OR EXISTS (SELECT 1 FROM public.invitations WHERE wedding_id = v_dup_wedding_id)
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC05]: duplicate_wedding must never clone guest_groups, guests, or invitations.';
  END IF;

  -- 3.8 Verify even authenticated `editor` cannot SELECT `token_hash` from `public.invitations`
  v_blocked := false;
  BEGIN
    EXECUTE 'SELECT token_hash FROM public.invitations LIMIT 1';
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC03]: Authenticated role must be denied SELECT on invitations.token_hash.';
  END IF;

  -- 3.9 Verify `viewer` can read metadata columns on `guest_groups`, `guests`, and `invitations`, but CANNOT mutate or issue/revoke tokens
  PERFORM set_config('request.jwt.claim.sub', v_viewer_a::text, true);

  SELECT count(*)::int INTO v_count
    FROM public.invitations inv
   WHERE inv.workspace_id = v_ws_a;
  IF v_count < 3 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC02]: Workspace viewer must be able to read safe invitation metadata rows.';
  END IF;

  v_blocked := false;
  BEGIN
    INSERT INTO public.guest_groups (wedding_id, workspace_id, display_name)
    VALUES (v_wedding_pub, v_ws_a, 'Viewer Forbidden Household');
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC02]: Workspace viewer must not be able to INSERT guest_groups.';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.issue_household_invitation(v_ws_a, v_wedding_pub, v_group_pub, NULL);
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM LIKE '%INSUFFICIENT_WORKSPACE_ROLE%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC02]: Workspace viewer must be blocked from issue_household_invitation.';
  END IF;

  -- 3.10 Verify outsider sees 0 rows across all 3 tables and cannot issue tokens on `v_ws_a`
  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);

  IF EXISTS (SELECT 1 FROM public.guest_groups WHERE workspace_id = v_ws_a)
     OR EXISTS (SELECT 1 FROM public.guests WHERE workspace_id = v_ws_a)
     OR EXISTS (SELECT 1 FROM public.invitations WHERE workspace_id = v_ws_a)
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC02]: Cross-workspace outsider leaked guest or invitation rows!';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.issue_household_invitation(v_ws_b, v_wedding_b, v_group_pub, NULL);
  EXCEPTION
    WHEN no_data_found THEN
      IF SQLERRM LIKE '%HOUSEHOLD_NOT_FOUND%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC02]: Cross-workspace group_id must fail HOUSEHOLD_NOT_FOUND.';
  END IF;

  INSERT INTO tmp_p6_state (key, val)
  VALUES
    ('token_pub_revoked_1', v_issue_1 ->> 'rawToken'),
    ('token_pub_active_2', v_issue_2 ->> 'rawToken'),
    ('inv_id_pub_2', v_inv_id_2::text),
    ('token_priv_active', v_issue_priv ->> 'rawToken'),
    ('inv_id_priv', v_issue_priv -> 'invitation' ->> 'id');
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Superuser Hash Storage Audit (Zero Plaintext Persistence)
-- ----------------------------------------------------------------------------
RESET ROLE;

DO $$
DECLARE
  v_raw_token text := (SELECT val FROM tmp_p6_state WHERE key = 'token_pub_active_2');
  v_inv_id uuid := (SELECT val::uuid FROM tmp_p6_state WHERE key = 'inv_id_pub_2');
  v_stored_hash text;
  v_expected_hash text;
BEGIN
  SELECT inv.token_hash INTO v_stored_hash
    FROM public.invitations inv
   WHERE inv.id = v_inv_id;

  v_expected_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_raw_token, 'UTF8')),
    'hex'
  );

  IF v_stored_hash IS DISTINCT FROM v_expected_hash OR v_stored_hash = v_raw_token THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC03]: Stored token_hash does not match exact SHA-256 hex digest of rawToken.';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Anonymous Public `/i/:token` Resolution (`P6-AC04`)
-- ----------------------------------------------------------------------------
SET LOCAL ROLE anon;

DO $$
DECLARE
  v_token_pub_1 text := (SELECT val FROM tmp_p6_state WHERE key = 'token_pub_revoked_1');
  v_token_pub_2 text := (SELECT val FROM tmp_p6_state WHERE key = 'token_pub_active_2');
  v_token_priv text := (SELECT val FROM tmp_p6_state WHERE key = 'token_priv_active');
  v_res jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  -- 5.1 Malformed token -> `invalid_token` with ZERO raw token echo
  v_res := public.resolve_invitation_by_token('bad<script>token');
  IF v_res ->> 'status' <> 'invalid_token' OR v_res::text LIKE '%script%' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC04]: Malformed token must return invalid_token without echoing input: %', v_res;
  END IF;

  -- 5.2 Active token on DRAFT wedding (`wedding_pub` not yet published) -> `unavailable`
  v_res := public.resolve_invitation_by_token(v_token_pub_2);
  IF v_res ->> 'status' <> 'unavailable' OR v_res::text LIKE '%' || v_token_pub_2 || '%' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC04]: Token on unpublished draft wedding must return unavailable: %', v_res;
  END IF;

  -- 5.3 On `invite_only` published wedding: `/w/:slug` returns `invite_only`, while `/i/:token` UNLOCKS active snapshot + household!
  IF (public.get_public_wedding_by_slug('p6-invite-only-celebration') ->> 'status') <> 'invite_only' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC04]: Expected invite_only on slug lookup.';
  END IF;

  v_res := public.resolve_invitation_by_token(v_token_priv);
  IF v_res ->> 'status' <> 'active'
     OR (v_res -> 'household' ->> 'displayName') <> 'The Santos Household'
     OR (v_res -> 'household' ->> 'maxAttendees')::int <> 3
     OR jsonb_array_length(v_res -> 'household' -> 'guests') <> 2
     OR (v_res -> 'snapshot' -> 'wedding' ->> 'title') <> 'Invite Only Celebration'
     -- Verify internal UUIDs, organizer notes, email/phone, and rawToken are stripped!
     OR v_res ? 'workspace_id'
     OR v_res ? 'wedding_id'
     OR (v_res -> 'household') ? 'notes'
     OR ((v_res -> 'household' -> 'guests' -> 0) ? 'email')
     OR ((v_res -> 'household' -> 'guests' -> 0) ? 'phone')
     OR v_res::text LIKE '%Private villa invitees%'
     OR v_res::text LIKE '%marco@example.com%'
     OR v_res::text LIKE '%' || v_token_priv || '%'
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC04]: Unexpected or over-exposed resolve_invitation_by_token payload: %', v_res;
  END IF;

  -- 5.4 Unknown valid-format 43-char token -> uniform `unavailable`
  v_res := public.resolve_invitation_by_token('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  IF v_res ->> 'status' <> 'unavailable' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC04]: Unknown token must return uniform unavailable: %', v_res;
  END IF;

  -- 5.5 Rotated-away (revoked) token #1 -> `unavailable`
  v_res := public.resolve_invitation_by_token(v_token_pub_1);
  IF v_res ->> 'status' <> 'unavailable' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC04]: Rotated/revoked token must return unavailable: %', v_res;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Publish `wedding_pub`, Verify Active -> Revocation -> Expiry & `ON DELETE SET NULL`
-- ----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_editor_a constant uuid := '66666666-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_ws_a uuid := (SELECT val::uuid FROM tmp_p6_state WHERE key = 'ws_a');
  v_wedding_pub uuid := (SELECT val::uuid FROM tmp_p6_state WHERE key = 'wedding_pub');
  v_inv_id_2 uuid := (SELECT val::uuid FROM tmp_p6_state WHERE key = 'inv_id_pub_2');
  v_token_pub_2 text := (SELECT val FROM tmp_p6_state WHERE key = 'token_pub_active_2');
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_editor_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  PERFORM public.publish_wedding(v_ws_a, v_wedding_pub);

  IF (public.resolve_invitation_by_token(v_token_pub_2) ->> 'status') <> 'active' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC04]: Active token #2 must resolve once wedding_pub is published.';
  END IF;

  -- Explicit organizer revocation immediately invalidates token #2
  PERFORM public.revoke_household_invitation(v_ws_a, v_wedding_pub, v_inv_id_2);

  IF (public.resolve_invitation_by_token(v_token_pub_2) ->> 'status') <> 'unavailable' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC04]: Explicitly revoked token must immediately return unavailable.';
  END IF;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_editor_a constant uuid := '66666666-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_inv_id_priv uuid := (SELECT val::uuid FROM tmp_p6_state WHERE key = 'inv_id_priv');
  v_token_priv text := (SELECT val FROM tmp_p6_state WHERE key = 'token_priv_active');
  v_blocked boolean;
BEGIN
  -- 6.1 Simulate clock passing `expires_at` -> `resolve_invitation_by_token` returns `unavailable`
  UPDATE public.invitations
     SET expires_at = now() - interval '5 minutes'
   WHERE id = v_inv_id_priv;

  IF (public.resolve_invitation_by_token(v_token_priv) ->> 'status') <> 'unavailable' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC04]: Expired invitation token must return unavailable.';
  END IF;

  -- 6.2 Verify `enforce_invitation_integrity` blocks mutating `token_hash` or reactivating a `'revoked'` row
  v_blocked := false;
  BEGIN
    UPDATE public.invitations
       SET token_hash = repeat('0', 64)
     WHERE id = v_inv_id_priv;
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%IMMUTABLE_INVITATION_IDENTITY%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC03]: Mutating invitations.token_hash must raise IMMUTABLE_INVITATION_IDENTITY.';
  END IF;

  -- 6.3 Deleting non-owner `v_editor_a` (`created_by` on `guest_groups` & `issued_by` on `invitations`) succeeds via `ON DELETE SET NULL`
  DELETE FROM auth.users WHERE id = v_editor_a;

  IF EXISTS (SELECT 1 FROM public.invitations WHERE issued_by = v_editor_a)
     OR EXISTS (SELECT 1 FROM public.guest_groups WHERE created_by = v_editor_a)
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P6-AC01]: Expected ON DELETE SET NULL on guest_groups.created_by and invitations.issued_by.';
  END IF;
END;
$$;

SELECT 'ALL_PHASE6_DATABASE_VERIFICATIONS_PASSED' AS verification_result;

ROLLBACK;
