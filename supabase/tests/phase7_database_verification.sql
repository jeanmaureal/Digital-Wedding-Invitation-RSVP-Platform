-- ============================================================================
-- Phase 7 Executable PostgreSQL Transactional RSVP & Gate 5 Verification Suite
-- ============================================================================
-- Execution model:
--   Runs inside a single `BEGIN; ... ROLLBACK;` transaction so zero test rows
--   persist after execution. Any failed check raises an unhandled exception
--   with prefix `ASSERTION_FAILED:` and aborts with a non-zero exit code.
--
-- Covers:
--   - P7-AC01 & P7-AC02: `rsvp_questions`, `rsvp_submissions`, `rsvp_attendees`,
--     and `rsvp_answers` composite FKs, indexes, RLS, zero `anon` table grants,
--     `SELECT`-only `authenticated` grants on response tables, `editor`+ CRUD on
--     `rsvp_questions`, `viewer` read-only enforcement, and cross-tenant isolation.
--   - P7-AC03 & P7-AC04 (Gate 5): `submit_household_rsvp` atomic commit (`v1`),
--     idempotent update (`v2`), 100% atomic rollback on `HOUSEHOLD_CAPACITY_EXCEEDED`,
--     `CROSS_HOUSEHOLD_GUEST_DENIED`, `RSVP_ANSWER_VALIDATION_ERROR`, and
--     `UNSAFE_RSVP_PAYLOAD`, server-side enforcement of `RSVP_CLOSED`,
--     `RSVP_DEADLINE_PASSED`, `PLUS_ONES_NOT_ALLOWED`, and `INVITATION_UNAVAILABLE`,
--     with zero raw token echo.
--   - P7-AC13: `duplicate_wedding` never clones `rsvp_submissions`,
--     `rsvp_attendees`, or `rsvp_answers`.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Catalog, Privilege, Index & Function Security Audit (`P7-AC01`..`P7-AC03`)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_rec record;
  v_expected_indexes text[] := ARRAY[
    'rsvp_questions_pkey',
    'rsvp_questions_workspace_wedding_id_key',
    'rsvp_questions_workspace_wedding_sort_idx',
    'rsvp_submissions_pkey',
    'rsvp_submissions_group_id_key',
    'rsvp_submissions_workspace_wedding_group_id_key',
    'rsvp_submissions_workspace_wedding_updated_idx',
    'rsvp_submissions_invitation_id_idx',
    'rsvp_attendees_pkey',
    'rsvp_attendees_submission_guest_key',
    'rsvp_attendees_workspace_wedding_group_submission_idx',
    'rsvp_attendees_workspace_wedding_group_guest_idx',
    'rsvp_answers_pkey',
    'rsvp_answers_submission_question_key',
    'rsvp_answers_workspace_wedding_group_submission_idx',
    'rsvp_answers_workspace_wedding_question_idx'
  ];
  v_idx text;
  v_tbl text;
  v_fn_count int;
BEGIN
  -- 1.1 Verify RLS enabled on every `public` table
  FOR v_rec IN
    SELECT c.relname, c.relrowsecurity
      FROM pg_catalog.pg_class c
      INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
  LOOP
    IF NOT v_rec.relrowsecurity THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC01]: RLS is NOT enabled on public.%', v_rec.relname;
    END IF;
  END LOOP;

  -- 1.2 Verify `anon` holds ZERO privileges on all 4 Phase 7 tables
  FOREACH v_tbl IN ARRAY ARRAY[
    'public.rsvp_questions',
    'public.rsvp_submissions',
    'public.rsvp_attendees',
    'public.rsvp_answers'
  ] LOOP
    IF pg_catalog.has_any_column_privilege('anon', v_tbl, 'SELECT, INSERT, UPDATE')
       OR pg_catalog.has_table_privilege('anon', v_tbl, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
    THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC01]: Role anon must hold zero privileges on %.', v_tbl;
    END IF;
  END LOOP;

  -- 1.3 Verify `authenticated` holds SELECT ONLY on `rsvp_submissions`, `rsvp_attendees`, and `rsvp_answers`
  FOREACH v_tbl IN ARRAY ARRAY[
    'public.rsvp_submissions',
    'public.rsvp_attendees',
    'public.rsvp_answers'
  ] LOOP
    IF NOT pg_catalog.has_table_privilege('authenticated', v_tbl, 'SELECT')
       OR pg_catalog.has_table_privilege('authenticated', v_tbl, 'INSERT')
       OR pg_catalog.has_table_privilege('authenticated', v_tbl, 'UPDATE')
       OR pg_catalog.has_table_privilege('authenticated', v_tbl, 'DELETE')
       OR pg_catalog.has_any_column_privilege('authenticated', v_tbl, 'INSERT, UPDATE')
    THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC02]: Role authenticated must hold SELECT-only privileges on %.', v_tbl;
    END IF;
  END LOOP;

  -- 1.4 Verify expected Phase 7 indexes exist
  FOREACH v_idx IN ARRAY v_expected_indexes LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_indexes i
       WHERE i.schemaname = 'public'
         AND i.indexname = v_idx
    ) THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC01]: Missing expected index public.%', v_idx;
    END IF;
  END LOOP;

  -- 1.5 Audit all functions across `public` and `app_private` (>= 43 functions)
  SELECT count(*)::int
    INTO v_fn_count
    FROM pg_catalog.pg_proc p
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public', 'app_private');

  IF v_fn_count < 43 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC01]: Expected >= 43 functions in public/app_private, found %', v_fn_count;
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
      RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC01]: Function %.% owner is %, expected postgres.',
        v_rec.schema_name, v_rec.fn_name, v_rec.owner_name;
    END IF;

    IF NOT ('search_path=""' = ANY(v_rec.config_arr) OR 'search_path=' = ANY(v_rec.config_arr)) THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC01]: Function %.% is missing fixed empty search_path.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.acl_text = '' OR v_rec.acl_text LIKE '{=X/%' OR v_rec.acl_text LIKE '%,=X/%' THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC01]: Function %.% retains PUBLIC EXECUTE grant.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.fn_name NOT IN (
      'health_check',
      'get_public_wedding_by_slug',
      'resolve_invitation_by_token',
      'submit_household_rsvp'
    ) AND v_rec.anon_exec THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC03]: Function %.% must NOT be executable by anon.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.fn_name IN (
      'normalize_rsvp_question_fields',
      'enforce_rsvp_submission_integrity',
      'normalize_rsvp_attendee_fields',
      'normalize_rsvp_answer_fields'
    ) AND v_rec.auth_exec THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC01]: Trigger function %.% must NOT be executable by authenticated.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Seed Ephemeral Test Actors, Workspaces, Weddings, Households & Questions
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_p7_state (
  key text PRIMARY KEY,
  val text NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON TABLE tmp_p7_state TO authenticated, anon;

DO $$
DECLARE
  v_owner_a constant uuid := '77777777-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_editor_a constant uuid := '77777777-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_viewer_a constant uuid := '77777777-cccc-4ccc-8ccc-ccccccccccc3';
  v_outsider constant uuid := '77777777-dddd-4ddd-8ddd-ddddddddddd4';
  v_ws_a uuid;
  v_ws_b uuid;
  v_wedding_a public.weddings;
  v_wedding_b public.weddings;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner_a, 'p7.owner.a@example.com', '{"full_name":"P7 Owner A"}'::jsonb, now(), now()),
    (v_editor_a, 'p7.editor.a@example.com', '{"full_name":"P7 Editor A"}'::jsonb, now(), now()),
    (v_viewer_a, 'p7.viewer.a@example.com', '{"full_name":"P7 Viewer A"}'::jsonb, now(), now()),
    (v_outsider, 'p7.outsider@example.com', '{"full_name":"P7 Outsider"}'::jsonb, now(), now());

  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_ws_a := (public.create_workspace('P7 Studio Alpha', 'p7-studio-alpha')).id;
  PERFORM public.add_workspace_member_by_email(v_ws_a, 'p7.editor.a@example.com', 'editor');
  PERFORM public.add_workspace_member_by_email(v_ws_a, 'p7.viewer.a@example.com', 'viewer');

  v_wedding_a := public.create_wedding(
    p_workspace_id => v_ws_a,
    p_title => 'Clara & Mateo Celebration',
    p_partner_one_name => 'Clara',
    p_partner_two_name => 'Mateo',
    p_slug => 'p7-clara-mateo',
    p_event_date => DATE '2027-07-17',
    p_venue_name => 'Glass Conservatory',
    p_venue_location => 'Manila',
    p_timezone => 'Asia/Manila',
    p_rsvp_deadline => now() + interval '7 days',
    p_access_mode => 'invite_only'::public.wedding_access_mode,
    p_is_rsvp_open => true,
    p_allow_plus_ones_default => false,
    p_show_guest_dietary_notes => true,
    p_rsvp_confirmation_message => 'Thank you! We cannot wait to celebrate with your household.'
  );

  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  v_ws_b := (public.create_workspace('P7 Studio Beta', 'p7-studio-beta')).id;
  v_wedding_b := public.create_wedding(
    p_workspace_id => v_ws_b,
    p_title => 'Beta Celebration',
    p_partner_one_name => 'Sora',
    p_partner_two_name => 'Kai',
    p_slug => 'p7-beta-celebration'
  );

  INSERT INTO tmp_p7_state (key, val)
  VALUES
    ('ws_a', v_ws_a::text),
    ('ws_b', v_ws_b::text),
    ('wedding_a', v_wedding_a.id::text),
    ('wedding_b', v_wedding_b.id::text);
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Organizer Custom RSVP Question CRUD & RBAC (`P7-AC01`, `P7-AC02`)
-- ----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_editor_a constant uuid := '77777777-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_viewer_a constant uuid := '77777777-cccc-4ccc-8ccc-ccccccccccc3';
  v_outsider constant uuid := '77777777-dddd-4ddd-8ddd-ddddddddddd4';
  v_ws_a uuid := (SELECT val::uuid FROM tmp_p7_state WHERE key = 'ws_a');
  v_wedding_a uuid := (SELECT val::uuid FROM tmp_p7_state WHERE key = 'wedding_a');
  v_q_select uuid;
  v_q_bool uuid;
  v_q_text uuid;
  v_group_1 uuid;
  v_group_2 uuid;
  v_g1 uuid;
  v_g2 uuid;
  v_g3 uuid;
  v_other_guest uuid;
  v_issued_1 jsonb;
  v_blocked boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_editor_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- 3.1 Reject `single_select` with < 2 options or duplicate options
  v_blocked := false;
  BEGIN
    INSERT INTO public.rsvp_questions (wedding_id, workspace_id, label, question_type, options)
    VALUES (v_wedding_a, v_ws_a, 'Broken Select', 'single_select', '["Only One"]'::jsonb);
  EXCEPTION
    WHEN invalid_parameter_value THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC01]: single_select with < 2 options must be rejected.';
  END IF;

  -- 3.2 Create 3 valid custom questions (`single_select`, `boolean`, `short_text`)
  INSERT INTO public.rsvp_questions (
    wedding_id, workspace_id, label, help_text, question_type, options, is_required, sort_order
  )
  VALUES (
    v_wedding_a,
    v_ws_a,
    '  Reception Entrée  ',
    'Choose your preferred main course',
    'single_select',
    '["  Herb-Crusted Salmon  ", "Braised Short Rib", "Truffle Risotto"]'::jsonb,
    true,
    0
  )
  RETURNING id INTO v_q_select;

  INSERT INTO public.rsvp_questions (
    wedding_id, workspace_id, label, question_type, is_required, sort_order
  )
  VALUES (
    v_wedding_a, v_ws_a, 'Will your household ride the hotel shuttle?', 'boolean', true, 1
  )
  RETURNING id INTO v_q_bool;

  INSERT INTO public.rsvp_questions (
    wedding_id, workspace_id, label, question_type, is_required, sort_order
  )
  VALUES (
    v_wedding_a, v_ws_a, 'Song request for the dance floor', 'short_text', false, 2
  )
  RETURNING id INTO v_q_text;

  -- 3.3 Viewer cannot INSERT/UPDATE/DELETE `rsvp_questions`, and Outsider sees 0 rows
  PERFORM set_config('request.jwt.claim.sub', v_viewer_a::text, true);
  v_blocked := false;
  BEGIN
    INSERT INTO public.rsvp_questions (wedding_id, workspace_id, label)
    VALUES (v_wedding_a, v_ws_a, 'Viewer Forbidden Question');
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC02]: Workspace viewer must not be able to INSERT rsvp_questions.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  IF EXISTS (SELECT 1 FROM public.rsvp_questions WHERE workspace_id = v_ws_a) THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC02]: Cross-workspace outsider leaked rsvp_questions!';
  END IF;

  -- 3.4 Editor creates Household 1 (`max_attendees = 2`, 3 named family members -> tests cap enforcement!)
  --     and Household 2 (for cross-household guest injection test), publishes wedding, and issues token
  PERFORM set_config('request.jwt.claim.sub', v_editor_a::text, true);

  INSERT INTO public.guest_groups (wedding_id, workspace_id, display_name, max_attendees)
  VALUES (v_wedding_a, v_ws_a, 'The Rivera Family', 2)
  RETURNING id INTO v_group_1;

  INSERT INTO public.guests (group_id, wedding_id, workspace_id, first_name, last_name, sort_order)
  VALUES (v_group_1, v_wedding_a, v_ws_a, 'Elena', 'Rivera', 0)
  RETURNING id INTO v_g1;

  INSERT INTO public.guests (group_id, wedding_id, workspace_id, first_name, last_name, sort_order)
  VALUES (v_group_1, v_wedding_a, v_ws_a, 'Mateo', 'Rivera', 1)
  RETURNING id INTO v_g2;

  INSERT INTO public.guests (group_id, wedding_id, workspace_id, first_name, last_name, sort_order)
  VALUES (v_group_1, v_wedding_a, v_ws_a, 'Lucas', 'Rivera', 2)
  RETURNING id INTO v_g3;

  INSERT INTO public.guest_groups (wedding_id, workspace_id, display_name, max_attendees)
  VALUES (v_wedding_a, v_ws_a, 'The Lee Household', 2)
  RETURNING id INTO v_group_2;

  INSERT INTO public.guests (group_id, wedding_id, workspace_id, first_name, last_name)
  VALUES (v_group_2, v_wedding_a, v_ws_a, 'Jordan', 'Lee')
  RETURNING id INTO v_other_guest;

  PERFORM public.publish_wedding(v_ws_a, v_wedding_a);
  v_issued_1 := public.issue_household_invitation(v_ws_a, v_wedding_a, v_group_1, NULL);

  INSERT INTO tmp_p7_state (key, val)
  VALUES
    ('q_select', v_q_select::text),
    ('q_bool', v_q_bool::text),
    ('q_text', v_q_text::text),
    ('group_1', v_group_1::text),
    ('g1', v_g1::text),
    ('g2', v_g2::text),
    ('g3', v_g3::text),
    ('other_guest', v_other_guest::text),
    ('token_1', v_issued_1 ->> 'rawToken'),
    ('inv_1', v_issued_1 -> 'invitation' ->> 'id');
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Anonymous Public `/i/:token` Transactional RSVP (`Gate 5` — `P7-AC03`, `P7-AC04`)
-- ----------------------------------------------------------------------------
SET LOCAL ROLE anon;

DO $$
DECLARE
  v_token_1 text := (SELECT val FROM tmp_p7_state WHERE key = 'token_1');
  v_q_select uuid := (SELECT val::uuid FROM tmp_p7_state WHERE key = 'q_select');
  v_q_bool uuid := (SELECT val::uuid FROM tmp_p7_state WHERE key = 'q_bool');
  v_q_text uuid := (SELECT val::uuid FROM tmp_p7_state WHERE key = 'q_text');
  v_g1 uuid := (SELECT val::uuid FROM tmp_p7_state WHERE key = 'g1');
  v_g2 uuid := (SELECT val::uuid FROM tmp_p7_state WHERE key = 'g2');
  v_g3 uuid := (SELECT val::uuid FROM tmp_p7_state WHERE key = 'g3');
  v_other_guest uuid := (SELECT val::uuid FROM tmp_p7_state WHERE key = 'other_guest');
  v_resolved jsonb;
  v_sub_res jsonb;
  v_blocked boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  -- 4.1 Verify upgraded `resolve_invitation_by_token` returns `rsvp` questions & `existingSubmission = null`
  v_resolved := public.resolve_invitation_by_token(v_token_1);
  IF v_resolved ->> 'status' <> 'active'
     OR (v_resolved -> 'rsvp' ->> 'isAcceptingResponses')::boolean IS NOT TRUE
     OR jsonb_array_length(v_resolved -> 'rsvp' -> 'questions') <> 3
     OR jsonb_typeof(v_resolved -> 'rsvp' -> 'existingSubmission') <> 'null'
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC03]: Unexpected resolve_invitation_by_token RSVP envelope: %', v_resolved;
  END IF;

  -- 4.2 Reject malformed token without echoing input
  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp('bad<script>token', '{}'::jsonb);
  EXCEPTION
    WHEN invalid_parameter_value THEN
      IF SQLERRM LIKE '%INVALID_INVITATION_TOKEN%' AND SQLERRM NOT LIKE '%script%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC04]: Malformed token must fail INVALID_INVITATION_TOKEN with zero echo.';
  END IF;

  -- 4.3 Reject household capacity overflow (`3 > max_attendees 2`) -> `HOUSEHOLD_CAPACITY_EXCEEDED`
  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(
      v_token_1,
      jsonb_build_object(
        'overallStatus', 'attending',
        'additionalGuestsCount', 0,
        'householdNote', 'Trying to bring all 3',
        'attendees', jsonb_build_array(
          jsonb_build_object('guestId', v_g1, 'attendanceStatus', 'attending', 'dietaryNotes', ''),
          jsonb_build_object('guestId', v_g2, 'attendanceStatus', 'attending', 'dietaryNotes', ''),
          jsonb_build_object('guestId', v_g3, 'attendanceStatus', 'attending', 'dietaryNotes', '')
        ),
        'answers', jsonb_build_array(
          jsonb_build_object('questionId', v_q_select, 'answerText', 'Herb-Crusted Salmon'),
          jsonb_build_object('questionId', v_q_bool, 'answerText', 'yes')
        )
      )
    );
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%HOUSEHOLD_CAPACITY_EXCEEDED%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC03]: Exceeding max_attendees must fail HOUSEHOLD_CAPACITY_EXCEEDED.';
  END IF;

  -- 4.4 Reject cross-household `guest_id` injection -> `CROSS_HOUSEHOLD_GUEST_DENIED`
  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(
      v_token_1,
      jsonb_build_object(
        'overallStatus', 'attending',
        'attendees', jsonb_build_array(
          jsonb_build_object('guestId', v_g1, 'attendanceStatus', 'attending'),
          jsonb_build_object('guestId', v_g2, 'attendanceStatus', 'declined'),
          jsonb_build_object('guestId', v_other_guest, 'attendanceStatus', 'declined')
        ),
        'answers', jsonb_build_array(
          jsonb_build_object('questionId', v_q_select, 'answerText', 'Herb-Crusted Salmon'),
          jsonb_build_object('questionId', v_q_bool, 'answerText', 'yes')
        )
      )
    );
  EXCEPTION
    WHEN invalid_parameter_value THEN
      IF SQLERRM LIKE '%CROSS_HOUSEHOLD_GUEST_DENIED%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC04]: Cross-household guestId must fail CROSS_HOUSEHOLD_GUEST_DENIED.';
  END IF;

  -- 4.5 Reject missing required custom question answer -> `RSVP_ANSWER_VALIDATION_ERROR`
  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(
      v_token_1,
      jsonb_build_object(
        'overallStatus', 'attending',
        'attendees', jsonb_build_array(
          jsonb_build_object('guestId', v_g1, 'attendanceStatus', 'attending'),
          jsonb_build_object('guestId', v_g2, 'attendanceStatus', 'attending'),
          jsonb_build_object('guestId', v_g3, 'attendanceStatus', 'declined')
        ),
        'answers', jsonb_build_array(
          jsonb_build_object('questionId', v_q_select, 'answerText', 'Herb-Crusted Salmon')
        )
      )
    );
  EXCEPTION
    WHEN invalid_parameter_value THEN
      IF SQLERRM LIKE '%RSVP_ANSWER_VALIDATION_ERROR%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC03]: Missing required question answer must fail RSVP_ANSWER_VALIDATION_ERROR.';
  END IF;

  -- 4.6 Reject `additionalGuestsCount > 0` when `allow_plus_ones_default = false`
  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(
      v_token_1,
      jsonb_build_object(
        'overallStatus', 'attending',
        'additionalGuestsCount', 1,
        'attendees', jsonb_build_array(
          jsonb_build_object('guestId', v_g1, 'attendanceStatus', 'attending'),
          jsonb_build_object('guestId', v_g2, 'attendanceStatus', 'declined'),
          jsonb_build_object('guestId', v_g3, 'attendanceStatus', 'declined')
        ),
        'answers', jsonb_build_array(
          jsonb_build_object('questionId', v_q_select, 'answerText', 'Herb-Crusted Salmon'),
          jsonb_build_object('questionId', v_q_bool, 'answerText', 'yes')
        )
      )
    );
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%PLUS_ONES_NOT_ALLOWED%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC03]: Plus-ones must be blocked when allow_plus_ones_default = false.';
  END IF;

  -- 4.7 Valid attending RSVP (`v1`: 2 of 3 members attending + dietary notes + custom answers)
  v_sub_res := public.submit_household_rsvp(
    v_token_1,
    jsonb_build_object(
      'overallStatus', 'attending',
      'additionalGuestsCount', 0,
      'householdNote', 'So excited to celebrate with you both!',
      'attendees', jsonb_build_array(
        jsonb_build_object('guestId', v_g1, 'attendanceStatus', 'attending', 'dietaryNotes', 'Vegetarian'),
        jsonb_build_object('guestId', v_g2, 'attendanceStatus', 'attending', 'dietaryNotes', 'No shellfish'),
        jsonb_build_object('guestId', v_g3, 'attendanceStatus', 'declined', 'dietaryNotes', 'Ignored when declined')
      ),
      'answers', jsonb_build_array(
        jsonb_build_object('questionId', v_q_select, 'answerText', 'Herb-Crusted Salmon'),
        jsonb_build_object('questionId', v_q_bool, 'answerText', 'yes'),
        jsonb_build_object('questionId', v_q_text, 'answerText', 'September — Earth, Wind & Fire')
      )
    )
  );

  IF (v_sub_res -> 'submission' ->> 'responseVersion')::int <> 1
     OR (v_sub_res -> 'submission' ->> 'attendingCount')::int <> 2
     OR jsonb_array_length(v_sub_res -> 'submission' -> 'attendees') <> 3
     OR jsonb_array_length(v_sub_res -> 'submission' -> 'answers') <> 3
     OR v_sub_res::text LIKE '%' || v_token_1 || '%'
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC03]: Unexpected v1 submission output: %', v_sub_res;
  END IF;

  -- 4.8 Atomic rollback on malformed v2 update (`<script>` in answer) -> preserves v1 untouched!
  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(
      v_token_1,
      jsonb_build_object(
        'overallStatus', 'attending',
        'householdNote', 'Updated note',
        'attendees', jsonb_build_array(
          jsonb_build_object('guestId', v_g1, 'attendanceStatus', 'attending', 'dietaryNotes', ''),
          jsonb_build_object('guestId', v_g2, 'attendanceStatus', 'declined', 'dietaryNotes', ''),
          jsonb_build_object('guestId', v_g3, 'attendanceStatus', 'declined', 'dietaryNotes', '')
        ),
        'answers', jsonb_build_array(
          jsonb_build_object('questionId', v_q_select, 'answerText', 'Braised Short Rib'),
          jsonb_build_object('questionId', v_q_bool, 'answerText', 'no'),
          jsonb_build_object('questionId', v_q_text, 'answerText', '<script>alert(1)</script>')
        )
      )
    );
  EXCEPTION
    WHEN invalid_parameter_value THEN
      IF SQLERRM LIKE '%UNSAFE_RSVP_PAYLOAD%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC04]: Unsafe script answer must fail UNSAFE_RSVP_PAYLOAD.';
  END IF;

  -- Confirm v1 (`responseVersion = 1`, `attendingCount = 2`) remained 100% intact after rollback!
  v_resolved := public.resolve_invitation_by_token(v_token_1);
  IF (v_resolved -> 'rsvp' -> 'existingSubmission' ->> 'responseVersion')::int <> 1
     OR (v_resolved -> 'rsvp' -> 'existingSubmission' ->> 'attendingCount')::int <> 2
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC04]: Failed v2 update did NOT roll back cleanly: %', v_resolved;
  END IF;

  -- 4.9 Valid v2 update (switching household to `declined`) -> increments `responseVersion = 2` & clears answers
  v_sub_res := public.submit_household_rsvp(
    v_token_1,
    jsonb_build_object(
      'overallStatus', 'declined',
      'additionalGuestsCount', 0,
      'householdNote', 'Sending warm wishes from afar!',
      'attendees', jsonb_build_array(
        jsonb_build_object('guestId', v_g1, 'attendanceStatus', 'declined'),
        jsonb_build_object('guestId', v_g2, 'attendanceStatus', 'declined'),
        jsonb_build_object('guestId', v_g3, 'attendanceStatus', 'declined')
      ),
      'answers', '[]'::jsonb
    )
  );

  IF (v_sub_res -> 'submission' ->> 'responseVersion')::int <> 2
     OR (v_sub_res -> 'submission' ->> 'attendingCount')::int <> 0
     OR jsonb_array_length(v_sub_res -> 'submission' -> 'answers') <> 0
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC03]: Unexpected v2 declined submission output: %', v_sub_res;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Deadline Expiry, `is_rsvp_open = false`, Revocation & Duplication Isolation
-- ----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_editor_a constant uuid := '77777777-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_viewer_a constant uuid := '77777777-cccc-4ccc-8ccc-ccccccccccc3';
  v_ws_a uuid := (SELECT val::uuid FROM tmp_p7_state WHERE key = 'ws_a');
  v_wedding_a uuid := (SELECT val::uuid FROM tmp_p7_state WHERE key = 'wedding_a');
  v_token_1 text := (SELECT val FROM tmp_p7_state WHERE key = 'token_1');
  v_inv_1 uuid := (SELECT val::uuid FROM tmp_p7_state WHERE key = 'inv_1');
  v_g1 uuid := (SELECT val::uuid FROM tmp_p7_state WHERE key = 'g1');
  v_g2 uuid := (SELECT val::uuid FROM tmp_p7_state WHERE key = 'g2');
  v_g3 uuid := (SELECT val::uuid FROM tmp_p7_state WHERE key = 'g3');
  v_dup_wedding public.weddings;
  v_blocked boolean;
BEGIN
  -- 5.1 Viewer can SELECT `rsvp_submissions` and `rsvp_attendees` in workspace
  PERFORM set_config('request.jwt.claim.sub', v_viewer_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  IF (SELECT count(*)::int FROM public.rsvp_submissions WHERE wedding_id = v_wedding_a) <> 1
     OR (SELECT count(*)::int FROM public.rsvp_attendees WHERE wedding_id = v_wedding_a) <> 3
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC02]: Workspace viewer must be able to read rsvp_submissions and rsvp_attendees.';
  END IF;

  -- 5.2 Editor closes RSVPs (`is_rsvp_open = false`) -> `submit_household_rsvp` fails `RSVP_CLOSED`
  PERFORM set_config('request.jwt.claim.sub', v_editor_a::text, true);

  UPDATE public.wedding_settings
     SET is_rsvp_open = false
   WHERE workspace_id = v_ws_a
     AND wedding_id = v_wedding_a;

  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(
      v_token_1,
      jsonb_build_object(
        'overallStatus', 'declined',
        'attendees', jsonb_build_array(
          jsonb_build_object('guestId', v_g1, 'attendanceStatus', 'declined'),
          jsonb_build_object('guestId', v_g2, 'attendanceStatus', 'declined'),
          jsonb_build_object('guestId', v_g3, 'attendanceStatus', 'declined')
        )
      )
    );
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%RSVP_CLOSED%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC03]: Closed RSVPs must reject submissions with RSVP_CLOSED.';
  END IF;

  -- 5.3 Re-open RSVPs but set `rsvp_deadline` in the past -> `RSVP_DEADLINE_PASSED`
  UPDATE public.wedding_settings
     SET is_rsvp_open = true,
         rsvp_deadline = now() - interval '10 minutes'
   WHERE workspace_id = v_ws_a
     AND wedding_id = v_wedding_a;

  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(
      v_token_1,
      jsonb_build_object(
        'overallStatus', 'declined',
        'attendees', jsonb_build_array(
          jsonb_build_object('guestId', v_g1, 'attendanceStatus', 'declined'),
          jsonb_build_object('guestId', v_g2, 'attendanceStatus', 'declined'),
          jsonb_build_object('guestId', v_g3, 'attendanceStatus', 'declined')
        )
      )
    );
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%RSVP_DEADLINE_PASSED%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC03]: Expired deadline must reject submissions with RSVP_DEADLINE_PASSED.';
  END IF;

  -- 5.4 Revoke token -> `INVITATION_UNAVAILABLE`
  PERFORM public.revoke_household_invitation(v_ws_a, v_wedding_a, v_inv_1);

  v_blocked := false;
  BEGIN
    PERFORM public.submit_household_rsvp(v_token_1, '{}'::jsonb);
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%INVITATION_UNAVAILABLE%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC03]: Revoked invitation must reject submissions with INVITATION_UNAVAILABLE.';
  END IF;

  -- 5.5 Verify `duplicate_wedding` clones ZERO `rsvp_submissions`, `rsvp_attendees`, or `rsvp_answers` (`P7-AC13`)
  v_dup_wedding := public.duplicate_wedding(
    v_ws_a,
    v_wedding_a,
    'Duplicated Clara & Mateo',
    'p7-duplicated-clara-mateo'
  );

  IF EXISTS (SELECT 1 FROM public.rsvp_submissions WHERE wedding_id = v_dup_wedding.id)
     OR EXISTS (SELECT 1 FROM public.rsvp_attendees WHERE wedding_id = v_dup_wedding.id)
     OR EXISTS (SELECT 1 FROM public.rsvp_answers WHERE wedding_id = v_dup_wedding.id)
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P7-AC13]: duplicate_wedding must never clone RSVP submission records.';
  END IF;
END;
$$;

RESET ROLE;

SELECT 'ALL_PHASE7_DATABASE_VERIFICATIONS_PASSED' AS verification_result;

ROLLBACK;
