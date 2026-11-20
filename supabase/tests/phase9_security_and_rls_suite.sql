-- ============================================================================
-- Phase 9 Comprehensive PostgreSQL Catalog, Cross-Tenant RLS & BOLA Audit Suite
-- ============================================================================
-- Execution model:
--   Runs inside a single `BEGIN; ... ROLLBACK;` transaction so zero test rows
--   persist after execution. Any failed security invariant raises an unhandled
--   exception prefixed with `ASSERTION_FAILED:`.
--
-- Covers:
--   - P9-AC01: System-catalog security audit across all 15 `public` tables,
--     all `app_private` objects, column-level `token_hash` exclusion, exact
--     4-RPC `anon` allowlist, zero `PUBLIC` function grants, `postgres` owner +
--     empty `search_path` on all functions, zero unsafe views, zero deprecated
--     `auth.role()` / `user_metadata` RLS predicates, and `USING` + `WITH CHECK`
--     parity on every `UPDATE` policy.
--   - P9-AC02: 5-actor (`anon`, Outsider `owner`, Target `viewer`, Target
--     `editor`, Target `owner`) cross-workspace and same-workspace cross-wedding
--     BOLA / IDOR isolation across all 15 tables and all 19 `public` RPCs.
--   - P9-AC03: RBAC role-boundary enforcement, co-member email redaction,
--     immutable `published_versions` protection (`IMMUTABLE_PUBLISHED_SNAPSHOT`),
--     and sole-owner deletion blocks (`LAST_WORKSPACE_OWNER_REQUIRED`,
--     `SOLE_WORKSPACE_OWNER_DELETE_BLOCKED`).
--   - P9-AC04: Public slug, token & transactional RSVP negative-security matrix
--     with 100% atomic rollback and zero raw token echo.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- PART 1 (`P9-AC01`): System-Catalog Schema, Privilege, Policy & Function Audit
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_expected_tables constant text[] := ARRAY[
    'guest_groups',
    'guests',
    'invitations',
    'profiles',
    'published_versions',
    'rsvp_answers',
    'rsvp_attendees',
    'rsvp_questions',
    'rsvp_submissions',
    'wedding_sections',
    'wedding_settings',
    'wedding_themes',
    'weddings',
    'workspace_members',
    'workspaces'
  ];
  v_actual_tables text[];
  v_expected_anon_rpcs constant text[] := ARRAY[
    'get_public_wedding_by_slug',
    'health_check',
    'resolve_invitation_by_token',
    'submit_household_rsvp'
  ];
  v_actual_anon_rpcs text[];
  v_tbl text;
  v_rec record;
  v_unsafe_views int;
BEGIN
  -- 1.1 Exact 15 tables in `public`, each with `relrowsecurity = true`
  SELECT array_agg(c.relname ORDER BY c.relname)
    INTO v_actual_tables
    FROM pg_catalog.pg_class c
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r';

  IF v_actual_tables IS DISTINCT FROM v_expected_tables THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC01]: Unexpected public table inventory: %', v_actual_tables;
  END IF;

  FOR v_rec IN
    SELECT c.relname, c.relrowsecurity
      FROM pg_catalog.pg_class c
      INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
  LOOP
    IF NOT v_rec.relrowsecurity THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC01]: RLS disabled on public.%', v_rec.relname;
    END IF;
  END LOOP;

  -- 1.2 `anon` holds ZERO table or column privileges across all 15 `public` tables and `app_private`
  FOREACH v_tbl IN ARRAY v_expected_tables LOOP
    IF pg_catalog.has_table_privilege(
         'anon',
         'public.' || v_tbl,
         'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
       )
       OR pg_catalog.has_any_column_privilege(
         'anon',
         'public.' || v_tbl,
         'SELECT, INSERT, UPDATE, REFERENCES'
       )
    THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC01]: Role anon holds table/column privileges on public.%', v_tbl;
    END IF;
  END LOOP;

  IF pg_catalog.has_schema_privilege('anon', 'app_private', 'USAGE, CREATE')
     OR pg_catalog.has_schema_privilege('authenticated', 'app_private', 'CREATE')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC01]: Unexpected schema privileges on app_private.';
  END IF;

  -- 1.3 `public.invitations.token_hash` is unreadable/unwritable by both `anon` and `authenticated`
  IF pg_catalog.has_column_privilege('anon', 'public.invitations', 'token_hash', 'SELECT')
     OR pg_catalog.has_column_privilege('anon', 'public.invitations', 'token_hash', 'INSERT')
     OR pg_catalog.has_column_privilege('anon', 'public.invitations', 'token_hash', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'SELECT')
     OR pg_catalog.has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'INSERT')
     OR pg_catalog.has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'UPDATE')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC01]: invitations.token_hash must have zero anon/authenticated column grants.';
  END IF;

  -- 1.4 Function ACL, `postgres` ownership & fixed empty `search_path` audit
  FOR v_rec IN
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname AS fn_name,
      p.prosecdef AS is_secdef,
      p.proowner::regrole::text AS owner_name,
      COALESCE(p.proconfig, ARRAY[]::text[]) AS config_arr,
      COALESCE(p.proacl::text, '') AS acl_text,
      pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
    FROM pg_catalog.pg_proc p
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'app_private')
  LOOP
    IF v_rec.owner_name <> 'postgres' THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC01]: Function %.% owner is %, expected postgres.',
        v_rec.schema_name, v_rec.fn_name, v_rec.owner_name;
    END IF;

    IF NOT ('search_path=""' = ANY(v_rec.config_arr) OR 'search_path=' = ANY(v_rec.config_arr)) THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC01]: Function %.% is missing fixed empty search_path.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.acl_text = '' OR v_rec.acl_text LIKE '{=X/%' OR v_rec.acl_text LIKE '%,=X/%' THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC01]: Function %.% retains PUBLIC EXECUTE grant.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.schema_name = 'app_private' AND v_rec.anon_exec THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC01]: app_private.% must never be executable by anon.',
        v_rec.fn_name;
    END IF;
  END LOOP;

  SELECT array_agg(p.proname ORDER BY p.proname)
    INTO v_actual_anon_rpcs
    FROM pg_catalog.pg_proc p
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_actual_anon_rpcs IS DISTINCT FROM v_expected_anon_rpcs THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC01]: Unexpected anon callable RPCs: %', v_actual_anon_rpcs;
  END IF;

  -- 1.5 Zero unsafe views (`security_invoker = true` required on any view in `public`)
  SELECT count(*)::int
    INTO v_unsafe_views
    FROM pg_catalog.pg_class c
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'v'
     AND NOT ('security_invoker=true' = ANY(COALESCE(c.reloptions, ARRAY[]::text[])));

  IF v_unsafe_views <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC01]: Found % public views without security_invoker=true.', v_unsafe_views;
  END IF;

  -- 1.6 Audit all RLS policies in `public`: zero deprecated `auth.role()`, zero `user_metadata`,
  --     and mandatory `USING` + `WITH CHECK` on every `UPDATE` policy
  FOR v_rec IN
    SELECT
      pol.schemaname,
      pol.tablename,
      pol.policyname,
      pol.cmd,
      COALESCE(pol.qual, '') AS qual_expr,
      COALESCE(pol.with_check, '') AS check_expr
    FROM pg_catalog.pg_policies pol
    WHERE pol.schemaname = 'public'
  LOOP
    IF lower(v_rec.qual_expr || ' ' || v_rec.check_expr) LIKE '%auth.role%'
       OR lower(v_rec.qual_expr || ' ' || v_rec.check_expr) LIKE '%user_metadata%'
       OR lower(v_rec.qual_expr || ' ' || v_rec.check_expr) LIKE '%raw_user_meta_data%'
    THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC01]: Policy %.% uses forbidden auth.role() or user_metadata.',
        v_rec.tablename, v_rec.policyname;
    END IF;

    IF v_rec.cmd = 'UPDATE' AND (btrim(v_rec.qual_expr) = '' OR btrim(v_rec.check_expr) = '') THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC01]: UPDATE policy %.% must define both USING and WITH CHECK.',
        v_rec.tablename, v_rec.policyname;
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- SEED: Multi-Workspace, Multi-Wedding Tenant Fixtures
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_p9_ctx (
  item_id text PRIMARY KEY,
  item_val text NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON TABLE tmp_p9_ctx TO authenticated, anon;

DO $$
DECLARE
  v_owner_a  constant uuid := '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_admin_a  constant uuid := '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  v_editor_a constant uuid := '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  v_viewer_a constant uuid := '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
  v_owner_b  constant uuid := '99999999-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

  v_ws_a uuid;
  v_ws_b uuid;
  v_wed_a1 public.weddings;
  v_wed_a2 public.weddings;
  v_wed_b1 public.weddings;

  v_grp_a1_1 uuid;
  v_grp_a1_2 uuid;
  v_grp_a2_1 uuid;
  v_grp_b1_1 uuid;

  v_guest_a1_1 uuid;
  v_guest_a1_2 uuid;
  v_guest_a2_1 uuid;
  v_guest_b1_1 uuid;

  v_q_a1 uuid;
  v_q_a2 uuid;

  v_issued_a1 jsonb;
  v_issued_exp jsonb;
  v_issued_rev jsonb;
  v_issued_a2 jsonb;
  v_pv1 public.published_versions;
  v_pv2 public.published_versions;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner_a,  'p9.owner.alpha@example.com',  '{"full_name":"Alpha Owner"}'::jsonb,  now(), now()),
    (v_admin_a,  'p9.admin.alpha@example.com',  '{"full_name":"Alpha Admin"}'::jsonb,  now(), now()),
    (v_editor_a, 'p9.editor.alpha@example.com', '{"full_name":"Alpha Editor"}'::jsonb, now(), now()),
    (v_viewer_a, 'p9.viewer.alpha@example.com', '{"full_name":"Alpha Viewer"}'::jsonb, now(), now()),
    (v_owner_b,  'p9.owner.bravo@example.com',  '{"full_name":"Bravo Outsider"}'::jsonb, now(), now());

  -- Tenant Alpha setup (`Owner A`)
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_ws_a := (public.create_workspace('P9 Alpha Studio', 'p9-alpha-studio')).id;
  PERFORM public.add_workspace_member_by_email(v_ws_a, 'p9.admin.alpha@example.com', 'admin');
  PERFORM public.add_workspace_member_by_email(v_ws_a, 'p9.editor.alpha@example.com', 'editor');
  PERFORM public.add_workspace_member_by_email(v_ws_a, 'p9.viewer.alpha@example.com', 'viewer');

  -- Wedding A1: public published wedding (`allow_plus_ones_default = false`, `max_attendees = 2`)
  v_wed_a1 := public.create_wedding(
    p_workspace_id => v_ws_a,
    p_title => 'Alpha Gala One',
    p_partner_one_name => 'Clara',
    p_partner_two_name => 'Mateo',
    p_slug => 'p9-alpha-gala-one',
    p_event_date => DATE '2027-10-12',
    p_venue_name => 'Palacio Conservatory',
    p_venue_location => 'Manila',
    p_timezone => 'Asia/Manila',
    p_rsvp_deadline => now() + interval '10 days',
    p_access_mode => 'public'::public.wedding_access_mode,
    p_is_rsvp_open => true,
    p_allow_plus_ones_default => false
  );

  -- Wedding A2: invite-only published wedding in the SAME workspace (`Workspace A`)
  v_wed_a2 := public.create_wedding(
    p_workspace_id => v_ws_a,
    p_title => 'Alpha Private Dinner',
    p_partner_one_name => 'Iris',
    p_partner_two_name => 'Noah',
    p_slug => 'p9-alpha-private-dinner',
    p_timezone => 'Asia/Manila',
    p_rsvp_deadline => now() + interval '10 days',
    p_access_mode => 'invite_only'::public.wedding_access_mode,
    p_is_rsvp_open => true,
    p_allow_plus_ones_default => true
  );

  -- Publish v1 & v2 on Wedding A1, and v1 on Wedding A2
  v_pv1 := public.publish_wedding(v_ws_a, v_wed_a1.id);
  UPDATE public.wedding_themes
     SET preset_id = 'garden_sage'
   WHERE workspace_id = v_ws_a AND wedding_id = v_wed_a1.id;
  v_pv2 := public.publish_wedding(v_ws_a, v_wed_a1.id);
  PERFORM public.publish_wedding(v_ws_a, v_wed_a2.id);

  -- Households, guests, custom questions & invitations on Wedding A1 and A2
  INSERT INTO public.guest_groups (workspace_id, wedding_id, display_name, max_attendees, notes)
  VALUES (v_ws_a, v_wed_a1.id, 'Alpha Household One', 2, 'Front row')
  RETURNING id INTO v_grp_a1_1;

  INSERT INTO public.guest_groups (workspace_id, wedding_id, display_name, max_attendees, notes)
  VALUES (v_ws_a, v_wed_a1.id, 'Alpha Household Two', 2, 'Balcony')
  RETURNING id INTO v_grp_a1_2;

  INSERT INTO public.guest_groups (workspace_id, wedding_id, display_name, max_attendees, notes)
  VALUES (v_ws_a, v_wed_a2.id, 'Alpha Two Private Household', 2, 'Private table')
  RETURNING id INTO v_grp_a2_1;

  INSERT INTO public.guests (workspace_id, wedding_id, group_id, first_name, last_name, sort_order)
  VALUES (v_ws_a, v_wed_a1.id, v_grp_a1_1, 'Lucia', 'Reyes', 0)
  RETURNING id INTO v_guest_a1_1;

  INSERT INTO public.guests (workspace_id, wedding_id, group_id, first_name, last_name, sort_order)
  VALUES (v_ws_a, v_wed_a1.id, v_grp_a1_1, 'Tomas', 'Reyes', 1);

  INSERT INTO public.guests (workspace_id, wedding_id, group_id, first_name, last_name, sort_order)
  VALUES (v_ws_a, v_wed_a1.id, v_grp_a1_1, 'Diego', 'Reyes', 2);

  INSERT INTO public.guests (workspace_id, wedding_id, group_id, first_name, last_name, sort_order)
  VALUES (v_ws_a, v_wed_a1.id, v_grp_a1_2, 'Camila', 'Navarro', 0)
  RETURNING id INTO v_guest_a1_2;

  INSERT INTO public.guests (workspace_id, wedding_id, group_id, first_name, last_name, sort_order)
  VALUES (v_ws_a, v_wed_a2.id, v_grp_a2_1, 'Hugo', 'Vidal', 0)
  RETURNING id INTO v_guest_a2_1;

  INSERT INTO public.rsvp_questions (workspace_id, wedding_id, label, question_type, options, is_required, sort_order)
  VALUES (v_ws_a, v_wed_a1.id, 'Course Preference', 'single_select', '["Fish","Veg"]'::jsonb, true, 0)
  RETURNING id INTO v_q_a1;

  INSERT INTO public.rsvp_questions (workspace_id, wedding_id, label, question_type, is_required, sort_order)
  VALUES (v_ws_a, v_wed_a2.id, 'Song Request', 'short_text', false, 0)
  RETURNING id INTO v_q_a2;

  -- Issue active token on A1 Group 1, revoke+reissue to get a revoked token, and create an expired token on A1 Group 2
  v_issued_rev := public.issue_household_invitation(v_ws_a, v_wed_a1.id, v_grp_a1_1);
  v_issued_a1 := public.issue_household_invitation(v_ws_a, v_wed_a1.id, v_grp_a1_1);

  v_issued_exp := public.issue_household_invitation(
    v_ws_a,
    v_wed_a1.id,
    v_grp_a1_2,
    now() + interval '1 hour'
  );
  UPDATE public.invitations
     SET expires_at = now() - interval '2 hours'
   WHERE id = (v_issued_exp -> 'invitation' ->> 'id')::uuid;

  v_issued_a2 := public.issue_household_invitation(v_ws_a, v_wed_a2.id, v_grp_a2_1);

  -- Submit baseline valid v1 RSVP on A1 Group 1 (`1` attending, `2` declined)
  PERFORM public.submit_household_rsvp(
    v_issued_a1 ->> 'rawToken',
    jsonb_build_object(
      'overallStatus', 'attending',
      'additionalGuestsCount', 0,
      'householdNote', 'Baseline valid RSVP',
      'attendees', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'guestId', g.id,
            'attendanceStatus', CASE WHEN g.id = v_guest_a1_1 THEN 'attending' ELSE 'declined' END,
            'dietaryNotes', 'None'
          )
          ORDER BY g.sort_order
        )
        FROM public.guests g
        WHERE g.group_id = v_grp_a1_1
      ),
      'answers', jsonb_build_array(
        jsonb_build_object('questionId', v_q_a1, 'answerText', 'Veg')
      )
    )
  );

  -- Tenant Bravo setup (`Owner B` — Outsider)
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  v_ws_b := (public.create_workspace('P9 Bravo Studio', 'p9-bravo-studio')).id;
  v_wed_b1 := public.create_wedding(
    p_workspace_id => v_ws_b,
    p_title => 'Bravo Draft Event',
    p_partner_one_name => 'Sora',
    p_partner_two_name => 'Ken',
    p_slug => 'p9-bravo-draft-event'
  );

  INSERT INTO public.guest_groups (workspace_id, wedding_id, display_name, max_attendees)
  VALUES (v_ws_b, v_wed_b1.id, 'Bravo Household', 2)
  RETURNING id INTO v_grp_b1_1;

  INSERT INTO public.guests (workspace_id, wedding_id, group_id, first_name, last_name)
  VALUES (v_ws_b, v_wed_b1.id, v_grp_b1_1, 'Ren', 'Sato')
  RETURNING id INTO v_guest_b1_1;

  INSERT INTO tmp_p9_ctx (item_id, item_val)
  VALUES
    ('ws_a', v_ws_a::text),
    ('ws_b', v_ws_b::text),
    ('wed_a1', v_wed_a1.id::text),
    ('wed_a2', v_wed_a2.id::text),
    ('wed_b1', v_wed_b1.id::text),
    ('grp_a1_1', v_grp_a1_1::text),
    ('grp_a1_2', v_grp_a1_2::text),
    ('grp_a2_1', v_grp_a2_1::text),
    ('guest_a1_1', v_guest_a1_1::text),
    ('guest_a1_2', v_guest_a1_2::text),
    ('guest_a2_1', v_guest_a2_1::text),
    ('q_a1', v_q_a1::text),
    ('q_a2', v_q_a2::text),
    ('inv_a1_id', (v_issued_a1 -> 'invitation' ->> 'id')),
    ('inv_a2_id', (v_issued_a2 -> 'invitation' ->> 'id')),
    ('raw_inv_a1', (v_issued_a1 ->> 'rawToken')),
    ('raw_inv_rev', (v_issued_rev ->> 'rawToken')),
    ('raw_inv_exp', (v_issued_exp ->> 'rawToken')),
    ('raw_inv_a2', (v_issued_a2 ->> 'rawToken')),
    ('pv1_id', v_pv1.id::text),
    (
      'one_attending_json',
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'guestId', g.id,
            'attendanceStatus', CASE WHEN g.id = v_guest_a1_1 THEN 'attending' ELSE 'declined' END,
            'dietaryNotes', ''
          )
          ORDER BY g.sort_order
        )::text
        FROM public.guests g
        WHERE g.group_id = v_grp_a1_1
      )
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- PART 2 (`P9-AC02`): 5-Actor Cross-Workspace & Cross-Wedding BOLA / IDOR Suite
-- ----------------------------------------------------------------------------

-- 2A. Anonymous (`anon`) blocked from all 15 organizer RPCs
SET LOCAL ROLE anon;

DO $$
DECLARE
  v_ws_a uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'ws_a');
  v_wed_a1 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'wed_a1');
  v_grp_a1_1 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'grp_a1_1');
  v_inv_a1_id uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'inv_a1_id');
  v_calls text[] := ARRAY[
    format('SELECT public.create_workspace(%L)', 'Anon Attempt'),
    format('SELECT public.list_workspace_members(%L::uuid)', v_ws_a),
    format('SELECT public.add_workspace_member_by_email(%L::uuid, %L, %L)', v_ws_a, 'p9.owner.bravo@example.com', 'viewer'),
    format('SELECT public.update_workspace_member_role(%L::uuid, %L::uuid, %L)', v_ws_a, '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'editor'),
    format('SELECT public.remove_workspace_member(%L::uuid, %L::uuid)', v_ws_a, '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa4'),
    format('SELECT public.create_wedding(p_workspace_id => %L::uuid, p_title => %L, p_partner_one_name => %L, p_partner_two_name => %L)', v_ws_a, 'X', 'A', 'B'),
    format('SELECT public.duplicate_wedding(p_workspace_id => %L::uuid, p_source_wedding_id => %L::uuid, p_title => %L)', v_ws_a, v_wed_a1, 'Dup'),
    format('SELECT public.reorder_wedding_sections(%L::uuid, %L::uuid, ARRAY[]::uuid[])', v_ws_a, v_wed_a1),
    format('SELECT public.publish_wedding(%L::uuid, %L::uuid)', v_ws_a, v_wed_a1),
    format('SELECT public.unpublish_wedding(%L::uuid, %L::uuid)', v_ws_a, v_wed_a1),
    format('SELECT public.list_wedding_published_versions(%L::uuid, %L::uuid)', v_ws_a, v_wed_a1),
    format('SELECT public.rollback_wedding_published_version(%L::uuid, %L::uuid, 1)', v_ws_a, v_wed_a1),
    format('SELECT public.import_wedding_guests(%L::uuid, %L::uuid, %L::jsonb)', v_ws_a, v_wed_a1, '[]'),
    format('SELECT public.issue_household_invitation(%L::uuid, %L::uuid, %L::uuid)', v_ws_a, v_wed_a1, v_grp_a1_1),
    format('SELECT public.update_household_invitation(%L::uuid, %L::uuid, %L::uuid, %L)', v_ws_a, v_wed_a1, v_inv_a1_id, 'shared'),
    format('SELECT public.revoke_household_invitation(%L::uuid, %L::uuid, %L::uuid)', v_ws_a, v_wed_a1, v_inv_a1_id)
  ];
  v_sql text;
  v_denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  FOREACH v_sql IN ARRAY v_calls LOOP
    v_denied := false;
    BEGIN
      EXECUTE v_sql;
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_denied := true;
    END;
    IF NOT v_denied THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC02]: anon was NOT denied on statement: %', v_sql;
    END IF;
  END LOOP;
END;
$$;

-- 2B. Outsider (`Owner B`) cross-workspace BOLA/IDOR isolation across all 15 tables & RPCs
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_owner_b  constant uuid := '99999999-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  v_owner_a  constant uuid := '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_viewer_a constant uuid := '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
  v_ws_a uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'ws_a');
  v_ws_b uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'ws_b');
  v_wed_a1 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'wed_a1');
  v_grp_a1_1 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'grp_a1_1');
  v_inv_a1_id uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'inv_a1_id');
  v_leak_count int;
  v_affected int;
  v_blocked boolean;
  v_rpc_sql text;
  v_outsider_rpcs text[];
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- Verify ZERO Tenant Alpha rows visible across all 15 tables
  SELECT
    (SELECT count(*) FROM public.profiles WHERE id = v_owner_a) +
    (SELECT count(*) FROM public.workspaces WHERE id = v_ws_a) +
    (SELECT count(*) FROM public.workspace_members WHERE workspace_id = v_ws_a) +
    (SELECT count(*) FROM public.weddings WHERE workspace_id = v_ws_a) +
    (SELECT count(*) FROM public.wedding_settings WHERE workspace_id = v_ws_a) +
    (SELECT count(*) FROM public.wedding_themes WHERE workspace_id = v_ws_a) +
    (SELECT count(*) FROM public.wedding_sections WHERE workspace_id = v_ws_a) +
    (SELECT count(*) FROM public.published_versions WHERE workspace_id = v_ws_a) +
    (SELECT count(*) FROM public.guest_groups WHERE workspace_id = v_ws_a) +
    (SELECT count(*) FROM public.guests WHERE workspace_id = v_ws_a) +
    (SELECT count(*) FROM public.invitations WHERE id = v_inv_a1_id) +
    (SELECT count(*) FROM public.rsvp_questions WHERE workspace_id = v_ws_a) +
    (SELECT count(*) FROM public.rsvp_submissions WHERE workspace_id = v_ws_a) +
    (SELECT count(*) FROM public.rsvp_attendees WHERE workspace_id = v_ws_a) +
    (SELECT count(*) FROM public.rsvp_answers WHERE workspace_id = v_ws_a)
  INTO v_leak_count;

  IF v_leak_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC02]: Outsider leaked % rows from Tenant Alpha!', v_leak_count;
  END IF;

  -- Outsider direct UPDATE/DELETE attempts on Tenant Alpha must affect 0 rows
  UPDATE public.weddings SET title = 'Hijacked' WHERE id = v_wed_a1;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC02]: Outsider updated Tenant Alpha wedding!';
  END IF;

  DELETE FROM public.weddings WHERE id = v_wed_a1;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC02]: Outsider deleted Tenant Alpha wedding!';
  END IF;

  DELETE FROM public.guest_groups WHERE id = v_grp_a1_1;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC02]: Outsider deleted Tenant Alpha household!';
  END IF;

  -- Outsider direct INSERT into Tenant Alpha wedding must fail RLS
  v_blocked := false;
  BEGIN
    INSERT INTO public.guest_groups (workspace_id, wedding_id, display_name, max_attendees)
    VALUES (v_ws_a, v_wed_a1, 'Injected Outsider Group', 2);
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC02]: Outsider inserted into Tenant Alpha guest_groups!';
  END IF;

  -- Outsider cross-workspace reassignment (`workspace_id` hijack on own wedding) must fail
  v_blocked := false;
  BEGIN
    INSERT INTO public.guest_groups (workspace_id, wedding_id, display_name, max_attendees)
    VALUES (v_ws_b, v_wed_a1, 'Cross-WS FK Hijack', 2);
  EXCEPTION
    WHEN foreign_key_violation OR insufficient_privilege THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC02]: Cross-workspace FK hijack succeeded!';
  END IF;

  -- Outsider BOLA/IDOR calls across every workspace/wedding organizer RPC (including passing `v_ws_b` + `v_wed_a1`)
  v_outsider_rpcs := ARRAY[
    format('SELECT public.list_workspace_members(%L::uuid)', v_ws_a),
    format('SELECT public.add_workspace_member_by_email(%L::uuid, %L, %L)', v_ws_a, 'p9.owner.bravo@example.com', 'owner'),
    format('SELECT public.update_workspace_member_role(%L::uuid, %L::uuid, %L)', v_ws_a, v_viewer_a, 'owner'),
    format('SELECT public.remove_workspace_member(%L::uuid, %L::uuid)', v_ws_a, v_viewer_a),
    format('SELECT public.create_wedding(p_workspace_id => %L::uuid, p_title => %L, p_partner_one_name => %L, p_partner_two_name => %L)', v_ws_a, 'Hijack', 'A', 'B'),
    format('SELECT public.duplicate_wedding(p_workspace_id => %L::uuid, p_source_wedding_id => %L::uuid, p_title => %L)', v_ws_b, v_wed_a1, 'Cross Tenant Clone'),
    format('SELECT public.reorder_wedding_sections(%L::uuid, %L::uuid, ARRAY[]::uuid[])', v_ws_a, v_wed_a1),
    format('SELECT public.publish_wedding(%L::uuid, %L::uuid)', v_ws_a, v_wed_a1),
    format('SELECT public.publish_wedding(%L::uuid, %L::uuid)', v_ws_b, v_wed_a1),
    format('SELECT public.unpublish_wedding(%L::uuid, %L::uuid)', v_ws_a, v_wed_a1),
    format('SELECT public.list_wedding_published_versions(%L::uuid, %L::uuid)', v_ws_a, v_wed_a1),
    format('SELECT public.list_wedding_published_versions(%L::uuid, %L::uuid)', v_ws_b, v_wed_a1),
    format('SELECT public.rollback_wedding_published_version(%L::uuid, %L::uuid, 1)', v_ws_a, v_wed_a1),
    format('SELECT public.rollback_wedding_published_version(%L::uuid, %L::uuid, 1)', v_ws_b, v_wed_a1),
    format('SELECT public.import_wedding_guests(%L::uuid, %L::uuid, %L::jsonb)', v_ws_b, v_wed_a1, '[{"displayName":"X","maxAttendees":1,"guests":[{"firstName":"A"}]}]'),
    format('SELECT public.issue_household_invitation(%L::uuid, %L::uuid, %L::uuid)', v_ws_b, v_wed_a1, v_grp_a1_1),
    format('SELECT public.update_household_invitation(%L::uuid, %L::uuid, %L::uuid, %L)', v_ws_b, v_wed_a1, v_inv_a1_id, 'shared'),
    format('SELECT public.revoke_household_invitation(%L::uuid, %L::uuid, %L::uuid)', v_ws_b, v_wed_a1, v_inv_a1_id)
  ];

  FOREACH v_rpc_sql IN ARRAY v_outsider_rpcs LOOP
    v_blocked := false;
    BEGIN
      EXECUTE v_rpc_sql;
    EXCEPTION
      WHEN insufficient_privilege OR no_data_found OR invalid_parameter_value THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC02]: Outsider BOLA RPC succeeded: %', v_rpc_sql;
    END IF;
  END LOOP;
END;
$$;

-- 2C. Same-Workspace Cross-Wedding Mixing (`Editor A` mixing `Wedding A1` & `Wedding A2` IDs)
DO $$
DECLARE
  v_editor_a constant uuid := '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  v_ws_a uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'ws_a');
  v_wed_a1 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'wed_a1');
  v_wed_a2 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'wed_a2');
  v_grp_a2_1 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'grp_a2_1');
  v_inv_a2_id uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'inv_a2_id');
  v_a2_sections uuid[];
  v_blocked boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_editor_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- Cannot attach a Wedding A1 guest to a Wedding A2 household (`guests_workspace_wedding_group_fkey`)
  v_blocked := false;
  BEGIN
    INSERT INTO public.guests (workspace_id, wedding_id, group_id, first_name, last_name)
    VALUES (v_ws_a, v_wed_a1, v_grp_a2_1, 'Cross', 'Wedding');
  EXCEPTION
    WHEN foreign_key_violation THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC02]: Cross-wedding guest->group FK violation was not blocked!';
  END IF;

  -- Cannot reorder Wedding A1 sections using Wedding A2 section UUIDs
  SELECT array_agg(s.id ORDER BY s.sort_order)
    INTO v_a2_sections
    FROM public.wedding_sections s
   WHERE s.workspace_id = v_ws_a AND s.wedding_id = v_wed_a2;

  v_blocked := false;
  BEGIN
    PERFORM public.reorder_wedding_sections(v_ws_a, v_wed_a1, v_a2_sections);
  EXCEPTION
    WHEN invalid_parameter_value THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC02]: Cross-wedding reorder_wedding_sections was not blocked!';
  END IF;

  -- Cannot issue/update/revoke Wedding A2 household invitation while passing `p_wedding_id = v_wed_a1`
  v_blocked := false;
  BEGIN
    PERFORM public.issue_household_invitation(v_ws_a, v_wed_a1, v_grp_a2_1);
  EXCEPTION
    WHEN no_data_found THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC02]: Cross-wedding issue_household_invitation was not blocked!';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.update_household_invitation(v_ws_a, v_wed_a1, v_inv_a2_id, 'shared');
  EXCEPTION
    WHEN no_data_found THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC02]: Cross-wedding update_household_invitation was not blocked!';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.revoke_household_invitation(v_ws_a, v_wed_a1, v_inv_a2_id);
  EXCEPTION
    WHEN no_data_found THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC02]: Cross-wedding revoke_household_invitation was not blocked!';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- PART 3 (`P9-AC03`): RBAC Role Boundaries, Email Privacy & Immutability Guards
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_owner_a  constant uuid := '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_admin_a  constant uuid := '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  v_editor_a constant uuid := '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  v_viewer_a constant uuid := '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
  v_ws_a uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'ws_a');
  v_wed_a1 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'wed_a1');
  v_grp_a1_1 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'grp_a1_1');
  v_inv_a1_id uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'inv_a1_id');
  v_pv1_id uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'pv1_id');
  v_co_member_emails int;
  v_history jsonb;
  v_affected int;
  v_blocked boolean;
  v_viewer_rpcs text[];
  v_sql text;
  v_disposable_wed public.weddings;
BEGIN
  -- 3.1 `Viewer A`: read access + co-member email redaction + zero mutation capability
  PERFORM set_config('request.jwt.claim.sub', v_viewer_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*)::int
    INTO v_co_member_emails
    FROM public.list_workspace_members(v_ws_a) m
   WHERE m.user_id <> v_viewer_a
     AND m.email IS NOT NULL;

  IF v_co_member_emails <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC03]: Viewer leaked % co-member emails in list_workspace_members!', v_co_member_emails;
  END IF;

  v_history := public.list_wedding_published_versions(v_ws_a, v_wed_a1);
  IF jsonb_array_length(v_history) <> 2 OR strpos(lower(v_history::text), '@example.com') > 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC03]: Viewer history read failed or leaked emails: %', v_history;
  END IF;

  UPDATE public.weddings SET title = 'Viewer Edit' WHERE id = v_wed_a1;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC03]: Viewer updated weddings!';
  END IF;

  UPDATE public.wedding_themes SET preset_id = 'editorial_ivory' WHERE wedding_id = v_wed_a1;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC03]: Viewer updated wedding_themes!';
  END IF;

  DELETE FROM public.guest_groups WHERE id = v_grp_a1_1;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC03]: Viewer deleted guest_groups!';
  END IF;

  v_viewer_rpcs := ARRAY[
    format('SELECT public.add_workspace_member_by_email(%L::uuid, %L, %L)', v_ws_a, 'p9.owner.bravo@example.com', 'viewer'),
    format('SELECT public.update_workspace_member_role(%L::uuid, %L::uuid, %L)', v_ws_a, v_editor_a, 'viewer'),
    format('SELECT public.remove_workspace_member(%L::uuid, %L::uuid)', v_ws_a, v_editor_a),
    format('SELECT public.create_wedding(p_workspace_id => %L::uuid, p_title => %L, p_partner_one_name => %L, p_partner_two_name => %L)', v_ws_a, 'Viewer Wed', 'A', 'B'),
    format('SELECT public.duplicate_wedding(p_workspace_id => %L::uuid, p_source_wedding_id => %L::uuid, p_title => %L)', v_ws_a, v_wed_a1, 'Viewer Dup'),
    format('SELECT public.publish_wedding(%L::uuid, %L::uuid)', v_ws_a, v_wed_a1),
    format('SELECT public.unpublish_wedding(%L::uuid, %L::uuid)', v_ws_a, v_wed_a1),
    format('SELECT public.rollback_wedding_published_version(%L::uuid, %L::uuid, 1)', v_ws_a, v_wed_a1),
    format('SELECT public.import_wedding_guests(%L::uuid, %L::uuid, %L::jsonb)', v_ws_a, v_wed_a1, '[{"displayName":"V","maxAttendees":1,"guests":[{"firstName":"V"}]}]'),
    format('SELECT public.issue_household_invitation(%L::uuid, %L::uuid, %L::uuid)', v_ws_a, v_wed_a1, v_grp_a1_1),
    format('SELECT public.update_household_invitation(%L::uuid, %L::uuid, %L::uuid, %L)', v_ws_a, v_wed_a1, v_inv_a1_id, 'shared'),
    format('SELECT public.revoke_household_invitation(%L::uuid, %L::uuid, %L::uuid)', v_ws_a, v_wed_a1, v_inv_a1_id)
  ];

  FOREACH v_sql IN ARRAY v_viewer_rpcs LOOP
    v_blocked := false;
    BEGIN
      EXECUTE v_sql;
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC03]: Viewer was NOT blocked on mutating RPC: %', v_sql;
    END IF;
  END LOOP;

  -- 3.2 `Editor A`: co-member email redaction + blocked from permanent wedding DELETE & workspace admin
  PERFORM set_config('request.jwt.claim.sub', v_editor_a::text, true);

  SELECT count(*)::int
    INTO v_co_member_emails
    FROM public.list_workspace_members(v_ws_a) m
   WHERE m.user_id <> v_editor_a
     AND m.email IS NOT NULL;

  IF v_co_member_emails <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC03]: Editor leaked % co-member emails!', v_co_member_emails;
  END IF;

  v_disposable_wed := public.create_wedding(
    p_workspace_id => v_ws_a,
    p_title => 'Editor Disposable Draft',
    p_partner_one_name => 'A',
    p_partner_two_name => 'B'
  );

  DELETE FROM public.weddings WHERE id = v_disposable_wed.id;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC03]: Editor permanently deleted a wedding!';
  END IF;

  UPDATE public.workspaces SET name = 'Editor Rename Attempt' WHERE id = v_ws_a;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC03]: Editor renamed workspace!';
  END IF;

  -- `Admin A` CAN permanently delete the disposable wedding & see co-member emails
  PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);
  DELETE FROM public.weddings WHERE id = v_disposable_wed.id;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 1 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC03]: Admin could not delete disposable wedding!';
  END IF;

  -- 3.3 Snapshot immutability (`IMMUTABLE_PUBLISHED_SNAPSHOT`) & sole-owner guards (`Owner A`)
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);

  v_blocked := false;
  BEGIN
    PERFORM public.remove_workspace_member(v_ws_a, v_owner_a);
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%LAST_WORKSPACE_OWNER_REQUIRED%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC03]: Removing sole workspace owner was not blocked!';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.update_workspace_member_role(v_ws_a, v_owner_a, 'admin');
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%LAST_WORKSPACE_OWNER_REQUIRED%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC03]: Demoting sole workspace owner was not blocked!';
  END IF;

  -- Direct client UPDATE/DELETE on `published_versions` is denied at grant/RLS level
  v_blocked := false;
  BEGIN
    DELETE FROM public.published_versions WHERE id = v_pv1_id;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC03]: Direct DELETE on published_versions was not blocked!';
  END IF;
END;
$$;

-- Superuser-level verification of trigger-based immutability & sole-owner `auth.users` deletion block
RESET ROLE;

DO $$
DECLARE
  v_owner_a constant uuid := '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_pv1_id uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'pv1_id');
  v_blocked boolean;
BEGIN
  v_blocked := false;
  BEGIN
    UPDATE public.published_versions
       SET content_snapshot = '{}'::jsonb
     WHERE id = v_pv1_id;
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%IMMUTABLE_PUBLISHED_SNAPSHOT%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC03]: IMMUTABLE_PUBLISHED_SNAPSHOT trigger failed to block payload edit!';
  END IF;

  v_blocked := false;
  BEGIN
    DELETE FROM auth.users WHERE id = v_owner_a;
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%SOLE_WORKSPACE_OWNER_DELETE_BLOCKED%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC03]: SOLE_WORKSPACE_OWNER_DELETE_BLOCKED trigger failed on auth.users!';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- PART 4 (`P9-AC04`): Public Slug, Token & Transactional RSVP Negative Matrix
-- ----------------------------------------------------------------------------
SET LOCAL ROLE anon;

DO $$
DECLARE
  v_grp_a1_1 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'grp_a1_1');
  v_guest_a1_1 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'guest_a1_1');
  v_guest_a1_2 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'guest_a1_2');
  v_q_a1 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'q_a1');
  v_q_a2 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'q_a2');
  v_raw_a1 text := (SELECT item_val FROM tmp_p9_ctx WHERE item_id = 'raw_inv_a1');
  v_raw_rev text := (SELECT item_val FROM tmp_p9_ctx WHERE item_id = 'raw_inv_rev');
  v_raw_exp text := (SELECT item_val FROM tmp_p9_ctx WHERE item_id = 'raw_inv_exp');
  v_raw_a2 text := (SELECT item_val FROM tmp_p9_ctx WHERE item_id = 'raw_inv_a2');
  v_one_attending jsonb := (SELECT item_val::jsonb FROM tmp_p9_ctx WHERE item_id = 'one_attending_json');
  v_probe text := 'guest_link_probe_1111111111111111111111111111';
  v_res jsonb;
  v_blocked boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  -- 4.1 Draft wedding slug returns `unavailable` with zero internal UUIDs
  v_res := public.get_public_wedding_by_slug('p9-bravo-draft-event');
  IF (v_res ->> 'status') <> 'unavailable' OR (v_res ? 'weddingId') THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC04]: Draft slug leaked data: %', v_res;
  END IF;

  -- 4.2 Invite-only wedding slug returns `invite_only` without snapshot or UUIDs
  v_res := public.get_public_wedding_by_slug('p9-alpha-private-dinner');
  IF (v_res ->> 'status') <> 'invite_only' OR (v_res ? 'snapshot') OR (v_res ? 'weddingId') THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC04]: Invite-only slug leaked snapshot/UUIDs: %', v_res;
  END IF;

  -- 4.3 Valid private token (`v_raw_a2`) unlocks invite-only snapshot (`status = 'active'`) without echoing raw token
  v_res := public.resolve_invitation_by_token(v_raw_a2);
  IF (v_res ->> 'status') <> 'active' OR strpos(v_res::text, v_raw_a2) > 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC04]: Valid private token failed or echoed raw token: %', v_res;
  END IF;

  -- 4.4 Unknown, revoked, and expired tokens fail closed (`<> 'active'`) with zero raw token echo
  FOREACH v_probe IN ARRAY ARRAY[
    'short',
    'guest_link_probe_1111111111111111111111111111',
    v_raw_rev,
    v_raw_exp
  ] LOOP
    v_res := public.resolve_invitation_by_token(v_probe);
    IF (v_res ->> 'status') = 'active' OR strpos(v_res::text, v_probe) > 0 THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC04]: Invalid/revoked/expired token resolved active or echoed probe!';
    END IF;
  END LOOP;

  -- 4.5 Negative RSVP submissions: revoked/expired/unknown token -> `INVITATION_UNAVAILABLE` (zero echo)
  FOREACH v_probe IN ARRAY ARRAY[
    'guest_link_probe_1111111111111111111111111111',
    v_raw_rev,
    v_raw_exp
  ] LOOP
    v_blocked := false;
    BEGIN
      PERFORM public.submit_household_rsvp(
        v_probe,
        jsonb_build_object('overallStatus', 'declined', 'additionalGuestsCount', 0, 'attendees', '[]'::jsonb, 'answers', '[]'::jsonb)
      );
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM LIKE '%INVITATION_UNAVAILABLE%' AND strpos(SQLERRM, v_probe) = 0 THEN
          v_blocked := true;
        END IF;
    END;
    IF NOT v_blocked THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC04]: Revoked/expired/unknown RSVP submission did not fail safely!';
    END IF;
  END LOOP;

  -- 4.6 Incomplete household roster -> `HOUSEHOLD_MEMBER_MISMATCH`, and disallowed plus-ones -> `PLUS_ONES_NOT_ALLOWED`
  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(
      v_raw_a1,
      jsonb_build_object(
        'overallStatus', 'attending',
        'additionalGuestsCount', 0,
        'householdNote', 'Partial roster attempt',
        'attendees', jsonb_build_array(
          jsonb_build_object('guestId', v_guest_a1_1, 'attendanceStatus', 'attending', 'dietaryNotes', '')
        ),
        'answers', jsonb_build_array(jsonb_build_object('questionId', v_q_a1, 'answerText', 'Veg'))
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%HOUSEHOLD_MEMBER_MISMATCH%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC04]: Partial household roster was not rejected!';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(
      v_raw_a1,
      jsonb_build_object(
        'overallStatus', 'attending',
        'additionalGuestsCount', 1,
        'householdNote', 'Plus one attempt',
        'attendees', v_one_attending,
        'answers', jsonb_build_array(jsonb_build_object('questionId', v_q_a1, 'answerText', 'Veg'))
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%PLUS_ONES_NOT_ALLOWED%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC04]: Disallowed plus-ones were not rejected!';
  END IF;

  -- 4.6b Unsafe script/URI payload -> `UNSAFE_RSVP_PAYLOAD`
  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(
      v_raw_a1,
      jsonb_build_object(
        'overallStatus', 'attending',
        'additionalGuestsCount', 0,
        'householdNote', 'Hello <script>alert(1)</script>',
        'attendees', v_one_attending,
        'answers', jsonb_build_array(jsonb_build_object('questionId', v_q_a1, 'answerText', 'Veg'))
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%UNSAFE_RSVP_PAYLOAD%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC04]: Unsafe <script> RSVP payload was not rejected!';
  END IF;

  -- 4.7 Cross-household `guestId` tampering (`v_guest_a1_2` belongs to Group 2) -> `CROSS_HOUSEHOLD_GUEST_DENIED`
  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(
      v_raw_a1,
      jsonb_build_object(
        'overallStatus', 'attending',
        'additionalGuestsCount', 0,
        'householdNote', 'Cross household tamper',
        'attendees', jsonb_build_array(
          jsonb_build_object('guestId', v_guest_a1_2, 'attendanceStatus', 'attending', 'dietaryNotes', '')
        ),
        'answers', jsonb_build_array(jsonb_build_object('questionId', v_q_a1, 'answerText', 'Veg'))
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%CROSS_HOUSEHOLD_GUEST_DENIED%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC04]: Cross-household guestId injection was not rejected!';
  END IF;
END;
$$;

-- Verify `RSVP_CLOSED`, `RSVP_DEADLINE_PASSED`, `HOUSEHOLD_CAPACITY_EXCEEDED`, cross-wedding `questionId`,
-- and 100% preservation of the baseline v1 RSVP submission!
RESET ROLE;

DO $$
DECLARE
  v_wed_a1 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'wed_a1');
  v_grp_a1_1 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'grp_a1_1');
  v_q_a1 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'q_a1');
  v_q_a2 uuid := (SELECT item_val::uuid FROM tmp_p9_ctx WHERE item_id = 'q_a2');
  v_raw_a1 text := (SELECT item_val FROM tmp_p9_ctx WHERE item_id = 'raw_inv_a1');
  v_all_attendees jsonb;
  v_one_attendee jsonb;
  v_sub record;
  v_blocked boolean;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object('guestId', g.id, 'attendanceStatus', 'attending', 'dietaryNotes', '')
    ORDER BY g.sort_order
  )
  INTO v_all_attendees
  FROM public.guests g
  WHERE g.group_id = v_grp_a1_1;

  SELECT jsonb_agg(
    jsonb_build_object(
      'guestId', g.id,
      'attendanceStatus', CASE WHEN g.sort_order = 0 THEN 'attending' ELSE 'declined' END,
      'dietaryNotes', ''
    )
    ORDER BY g.sort_order
  )
  INTO v_one_attendee
  FROM public.guests g
  WHERE g.group_id = v_grp_a1_1;

  -- Over-capacity (`3 > max_attendees 2`) -> `HOUSEHOLD_CAPACITY_EXCEEDED`
  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(
      v_raw_a1,
      jsonb_build_object(
        'overallStatus', 'attending',
        'additionalGuestsCount', 0,
        'householdNote', 'Overflow',
        'attendees', v_all_attendees,
        'answers', jsonb_build_array(jsonb_build_object('questionId', v_q_a1, 'answerText', 'Veg'))
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%HOUSEHOLD_CAPACITY_EXCEEDED%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC04]: Over-capacity RSVP was not rejected!';
  END IF;

  -- Cross-wedding `questionId` (`v_q_a2` belongs to Wedding A2) -> `INVALID_RSVP_QUESTION`
  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(
      v_raw_a1,
      jsonb_build_object(
        'overallStatus', 'attending',
        'additionalGuestsCount', 0,
        'householdNote', 'Cross wedding question',
        'attendees', v_one_attendee,
        'answers', jsonb_build_array(
          jsonb_build_object('questionId', v_q_a1, 'answerText', 'Veg'),
          jsonb_build_object('questionId', v_q_a2, 'answerText', 'Injected')
        )
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%INVALID_RSVP_QUESTION%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC04]: Cross-wedding questionId injection was not rejected!';
  END IF;

  -- Out-of-enum `single_select` answer (`'Lobster'` vs `["Fish","Veg"]`) -> `RSVP_ANSWER_VALIDATION_ERROR`
  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(
      v_raw_a1,
      jsonb_build_object(
        'overallStatus', 'attending',
        'additionalGuestsCount', 0,
        'householdNote', 'Invalid choice attempt',
        'attendees', v_one_attendee,
        'answers', jsonb_build_array(
          jsonb_build_object('questionId', v_q_a1, 'answerText', 'Lobster')
        )
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%RSVP_ANSWER_VALIDATION_ERROR%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC04]: Invalid single_select choice was not rejected!';
  END IF;

  -- Past deadline (`rsvp_deadline < now()`) -> `RSVP_DEADLINE_PASSED`
  UPDATE public.wedding_settings
     SET rsvp_deadline = now() - interval '5 minutes'
   WHERE wedding_id = v_wed_a1;

  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(
      v_raw_a1,
      jsonb_build_object(
        'overallStatus', 'attending',
        'additionalGuestsCount', 0,
        'householdNote', 'Late attempt',
        'attendees', v_one_attendee,
        'answers', jsonb_build_array(jsonb_build_object('questionId', v_q_a1, 'answerText', 'Veg'))
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%RSVP_DEADLINE_PASSED%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC04]: Past-deadline RSVP was not rejected!';
  END IF;

  -- Closed RSVP (`is_rsvp_open = false`) -> `RSVP_CLOSED`
  UPDATE public.wedding_settings
     SET rsvp_deadline = now() + interval '5 days',
         is_rsvp_open = false
   WHERE wedding_id = v_wed_a1;

  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(
      v_raw_a1,
      jsonb_build_object(
        'overallStatus', 'attending',
        'additionalGuestsCount', 0,
        'householdNote', 'Closed attempt',
        'attendees', v_one_attendee,
        'answers', jsonb_build_array(jsonb_build_object('questionId', v_q_a1, 'answerText', 'Veg'))
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%RSVP_CLOSED%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC04]: Closed RSVP was not rejected!';
  END IF;

  -- Verify baseline v1 submission remained 100% intact across all rejected negative attempts!
  SELECT response_version, attending_count, household_note
    INTO v_sub
    FROM public.rsvp_submissions
   WHERE group_id = v_grp_a1_1;

  IF v_sub.response_version <> 1
     OR v_sub.attending_count <> 1
     OR v_sub.household_note <> 'Baseline valid RSVP'
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P9-AC04]: Baseline submission was mutated by failed negative attempts: %', v_sub;
  END IF;
END;
$$;

SELECT 'ALL_PHASE9_SECURITY_AND_RLS_VERIFICATIONS_PASSED' AS verification_result;

ROLLBACK;
