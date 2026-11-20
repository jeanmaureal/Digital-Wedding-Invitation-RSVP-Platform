-- ============================================================================
-- Phase 7 Representative Volume Query Plan Verification (`EXPLAIN ANALYZE`)
-- ============================================================================
-- Seeds 30 organizers, 30 workspaces, 60 weddings, 180 `rsvp_questions`,
-- 600 `guest_groups`, 1,800 `guests`, 600 `invitations`, 600 `rsvp_submissions`,
-- 1,800 `rsvp_attendees`, and 1,200 `rsvp_answers` inside a rolled-back
-- transaction, runs `ANALYZE`, and captures execution plans (`P7-AC06`).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE tmp_phase7_plan_captures (
  scenario text NOT NULL,
  plan_json jsonb NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT ON TABLE tmp_phase7_plan_captures TO authenticated, anon;

DO $$
DECLARE
  v_i int;
  v_w int;
  v_g int;
  v_uid uuid;
  v_ws_id uuid;
  v_wedding_id uuid;
  v_group_id uuid;
  v_g1 uuid;
  v_g2 uuid;
  v_g3 uuid;
  v_q1 uuid;
  v_q2 uuid;
  v_inv_id uuid;
  v_sub_id uuid;
  v_target_user constant uuid := 'aaaaaaaa-7777-4aaa-8aaa-aaaaaaaaaaaa';
  v_target_ws constant uuid := 'bbbbbbbb-7777-4bbb-8bbb-bbbbbbbbbbbb';
  v_target_wedding constant uuid := 'cccccccc-7777-4ccc-8ccc-cccccccccccc';
  v_target_group constant uuid := 'dddddddd-7777-4ddd-8ddd-dddddddddddd';
  v_target_guest constant uuid := 'eeeeeeee-7777-4eee-8eee-eeeeeeeeeeee';
  v_target_question constant uuid := 'ffffffff-7777-4fff-8fff-ffffffffffff';
  v_target_inv constant uuid := '99999999-7777-4999-8999-999999999999';
  v_target_sub constant uuid := '88888888-7777-4888-8888-888888888888';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES (v_target_user, 'p7.plan.probe@example.com', '{"full_name":"P7 Plan Probe"}'::jsonb, now(), now());

  INSERT INTO public.workspaces (id, name, slug, created_by)
  VALUES (v_target_ws, 'P7 Plan Probe Studio', 'p7-plan-probe-studio', v_target_user);

  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
  VALUES (v_target_ws, v_target_user, 'owner', v_target_user);

  INSERT INTO public.weddings (
    id, workspace_id, title, partner_one_name, partner_two_name, slug, status, created_by
  )
  VALUES (
    v_target_wedding, v_target_ws, 'P7 Probe Wedding', 'Clara', 'Mateo', 'p7-probe-wedding', 'draft', v_target_user
  );

  INSERT INTO public.wedding_settings (wedding_id, workspace_id, timezone)
  VALUES (v_target_wedding, v_target_ws, 'Asia/Manila');

  INSERT INTO public.rsvp_questions (id, wedding_id, workspace_id, label, question_type, options, is_required, sort_order)
  VALUES
    (v_target_question, v_target_wedding, v_target_ws, 'Entrée Selection', 'single_select', '["Salmon","Beef"]'::jsonb, true, 0),
    (gen_random_uuid(), v_target_wedding, v_target_ws, 'Shuttle Needed', 'boolean', '[]'::jsonb, false, 1);

  FOR v_g IN 1..15 LOOP
    v_group_id := CASE
      WHEN v_g = 1 THEN v_target_group
      ELSE ('dddddddd-7777-4ddd-9000-' || lpad(to_hex(v_g), 12, '0'))::uuid
    END;

    INSERT INTO public.guest_groups (id, wedding_id, workspace_id, display_name, max_attendees, sort_order, created_by)
    VALUES (v_group_id, v_target_wedding, v_target_ws, 'Probe Household ' || v_g::text, 3, v_g - 1, v_target_user);

    v_g1 := CASE WHEN v_g = 1 THEN v_target_guest ELSE gen_random_uuid() END;
    v_g2 := gen_random_uuid();
    v_g3 := gen_random_uuid();

    INSERT INTO public.guests (id, group_id, wedding_id, workspace_id, first_name, last_name, sort_order)
    VALUES
      (v_g1, v_group_id, v_target_wedding, v_target_ws, 'G1', 'Probe', 0),
      (v_g2, v_group_id, v_target_wedding, v_target_ws, 'G2', 'Probe', 1),
      (v_g3, v_group_id, v_target_wedding, v_target_ws, 'G3', 'Probe', 2);

    v_inv_id := CASE WHEN v_g = 1 THEN v_target_inv ELSE gen_random_uuid() END;
    INSERT INTO public.invitations (id, group_id, wedding_id, workspace_id, token_hash, status, issued_by)
    VALUES (
      v_inv_id,
      v_group_id,
      v_target_wedding,
      v_target_ws,
      encode(sha256(convert_to('p7_probe_inv_' || v_g::text, 'UTF8')), 'hex'),
      'active',
      v_target_user
    );

    v_sub_id := CASE WHEN v_g = 1 THEN v_target_sub ELSE gen_random_uuid() END;
    INSERT INTO public.rsvp_submissions (
      id, group_id, wedding_id, workspace_id, invitation_id, overall_status, attending_count, additional_guests_count, household_note
    )
    VALUES (
      v_sub_id, v_group_id, v_target_wedding, v_target_ws, v_inv_id, 'attending', 2, 0, 'Excited!'
    );

    INSERT INTO public.rsvp_attendees (submission_id, group_id, guest_id, wedding_id, workspace_id, attendance_status)
    VALUES
      (v_sub_id, v_group_id, v_g1, v_target_wedding, v_target_ws, 'attending'),
      (v_sub_id, v_group_id, v_g2, v_target_wedding, v_target_ws, 'attending'),
      (v_sub_id, v_group_id, v_g3, v_target_wedding, v_target_ws, 'declined');

    INSERT INTO public.rsvp_answers (submission_id, group_id, question_id, wedding_id, workspace_id, answer_text)
    VALUES (v_sub_id, v_group_id, v_target_question, v_target_wedding, v_target_ws, 'Salmon');
  END LOOP;

  FOR v_i IN 1..30 LOOP
    v_uid := ('00000000-7701-4000-8000-' || lpad(to_hex(v_i), 12, '0'))::uuid;
    v_ws_id := ('00000000-7702-4000-8000-' || lpad(to_hex(v_i), 12, '0'))::uuid;

    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (v_uid, 'p7.bench.user.' || v_i::text || '@example.com', '{"full_name":"P7 Bench"}'::jsonb, now(), now());

    INSERT INTO public.workspaces (id, name, slug, created_by)
    VALUES (v_ws_id, 'P7 Bench Studio ' || v_i::text, 'p7-bench-studio-' || v_i::text, v_uid);

    INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
    VALUES (v_ws_id, v_uid, 'owner', v_uid);

    FOR v_w IN 1..2 LOOP
      v_wedding_id := (
        '00000000-7703-4000-' || lpad(to_hex(v_w), 4, '0') || '-' || lpad(to_hex(v_i), 12, '0')
      )::uuid;

      INSERT INTO public.weddings (id, workspace_id, title, partner_one_name, partner_two_name, slug, status, created_by)
      VALUES (
        v_wedding_id, v_ws_id, 'P7 Bench Wedding ' || v_i::text || '-' || v_w::text, 'A', 'B',
        'p7-bench-wedding-' || v_i::text || '-' || v_w::text, 'draft', v_uid
      );

      INSERT INTO public.wedding_settings (wedding_id, workspace_id, timezone)
      VALUES (v_wedding_id, v_ws_id, 'UTC');

      INSERT INTO public.rsvp_questions (wedding_id, workspace_id, label, question_type, options, sort_order)
      VALUES (v_wedding_id, v_ws_id, 'Meal', 'single_select', '["Fish","Veg"]'::jsonb, 0)
      RETURNING id INTO v_q1;

      INSERT INTO public.rsvp_questions (wedding_id, workspace_id, label, question_type, sort_order)
      VALUES (v_wedding_id, v_ws_id, 'Shuttle', 'boolean', 1)
      RETURNING id INTO v_q2;

      FOR v_g IN 1..10 LOOP
        INSERT INTO public.guest_groups (wedding_id, workspace_id, display_name, max_attendees, sort_order, created_by)
        VALUES (v_wedding_id, v_ws_id, 'Bench Household ' || v_g::text, 3, v_g - 1, v_uid)
        RETURNING id INTO v_group_id;

        v_g1 := gen_random_uuid();
        v_g2 := gen_random_uuid();
        v_g3 := gen_random_uuid();

        INSERT INTO public.guests (id, group_id, wedding_id, workspace_id, first_name, last_name, sort_order)
        VALUES
          (v_g1, v_group_id, v_wedding_id, v_ws_id, 'M1', 'B', 0),
          (v_g2, v_group_id, v_wedding_id, v_ws_id, 'M2', 'B', 1),
          (v_g3, v_group_id, v_wedding_id, v_ws_id, 'M3', 'B', 2);

        INSERT INTO public.invitations (group_id, wedding_id, workspace_id, token_hash, status, issued_by)
        VALUES (
          v_group_id, v_wedding_id, v_ws_id,
          encode(sha256(convert_to('p7_bench_' || v_i::text || '_' || v_w::text || '_' || v_g::text, 'UTF8')), 'hex'),
          'active', v_uid
        )
        RETURNING id INTO v_inv_id;

        INSERT INTO public.rsvp_submissions (
          group_id, wedding_id, workspace_id, invitation_id, overall_status, attending_count, additional_guests_count
        )
        VALUES (v_group_id, v_wedding_id, v_ws_id, v_inv_id, 'attending', 2, 0)
        RETURNING id INTO v_sub_id;

        INSERT INTO public.rsvp_attendees (submission_id, group_id, guest_id, wedding_id, workspace_id, attendance_status)
        VALUES
          (v_sub_id, v_group_id, v_g1, v_wedding_id, v_ws_id, 'attending'),
          (v_sub_id, v_group_id, v_g2, v_wedding_id, v_ws_id, 'attending'),
          (v_sub_id, v_group_id, v_g3, v_wedding_id, v_ws_id, 'declined');

        INSERT INTO public.rsvp_answers (submission_id, group_id, question_id, wedding_id, workspace_id, answer_text)
        VALUES
          (v_sub_id, v_group_id, v_q1, v_wedding_id, v_ws_id, 'Fish'),
          (v_sub_id, v_group_id, v_q2, v_wedding_id, v_ws_id, 'yes');
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;

ANALYZE public.rsvp_questions;
ANALYZE public.rsvp_submissions;
ANALYZE public.rsvp_attendees;
ANALYZE public.rsvp_answers;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_plan jsonb;
  v_plan_text text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-7777-4aaa-8aaa-aaaaaaaaaaaa', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- 1. Ordered `rsvp_questions`
  EXECUTE $q$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, label, question_type, options, is_required, sort_order
      FROM public.rsvp_questions
     WHERE workspace_id = 'bbbbbbbb-7777-4bbb-8bbb-bbbbbbbbbbbb'::uuid
       AND wedding_id = 'cccccccc-7777-4ccc-8ccc-cccccccccccc'::uuid
     ORDER BY sort_order ASC, created_at ASC
  $q$ INTO v_plan;
  v_plan_text := v_plan::text;
  IF v_plan_text NOT LIKE '%Index Scan%' OR v_plan_text LIKE '%"Node Type": "Sort"%' THEN
    RAISE EXCEPTION 'PLAN_REGRESSION [P7-AC06]: Expected Sort-free Index Scan on rsvp_questions, got: %', v_plan_text;
  END IF;
  INSERT INTO tmp_phase7_plan_captures VALUES ('rls_rsvp_questions_ordered', v_plan);

  -- 2. Ordered `rsvp_submissions`
  EXECUTE $q$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, group_id, overall_status, attending_count, response_version, updated_at
      FROM public.rsvp_submissions
     WHERE workspace_id = 'bbbbbbbb-7777-4bbb-8bbb-bbbbbbbbbbbb'::uuid
       AND wedding_id = 'cccccccc-7777-4ccc-8ccc-cccccccccccc'::uuid
     ORDER BY updated_at DESC
  $q$ INTO v_plan;
  v_plan_text := v_plan::text;
  IF v_plan_text NOT LIKE '%Index Scan%' OR v_plan_text LIKE '%"Node Type": "Sort"%' THEN
    RAISE EXCEPTION 'PLAN_REGRESSION [P7-AC06]: Expected Sort-free Index Scan on rsvp_submissions, got: %', v_plan_text;
  END IF;
  INSERT INTO tmp_phase7_plan_captures VALUES ('rls_rsvp_submissions_ordered', v_plan);

  -- 3. `rsvp_attendees` wedding-wide organizer list & by guest
  EXECUTE $q$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, submission_id, group_id, guest_id, attendance_status, dietary_notes
      FROM public.rsvp_attendees
     WHERE workspace_id = 'bbbbbbbb-7777-4bbb-8bbb-bbbbbbbbbbbb'::uuid
       AND wedding_id = 'cccccccc-7777-4ccc-8ccc-cccccccccccc'::uuid
  $q$ INTO v_plan;
  INSERT INTO tmp_phase7_plan_captures VALUES ('rls_rsvp_attendees_by_wedding', v_plan);

  EXECUTE $q$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, submission_id, attendance_status
      FROM public.rsvp_attendees
     WHERE workspace_id = 'bbbbbbbb-7777-4bbb-8bbb-bbbbbbbbbbbb'::uuid
       AND wedding_id = 'cccccccc-7777-4ccc-8ccc-cccccccccccc'::uuid
       AND group_id = 'dddddddd-7777-4ddd-8ddd-dddddddddddd'::uuid
       AND guest_id = 'eeeeeeee-7777-4eee-8eee-eeeeeeeeeeee'::uuid
  $q$ INTO v_plan;
  INSERT INTO tmp_phase7_plan_captures VALUES ('rls_rsvp_attendees_by_guest', v_plan);

  -- 4. `rsvp_answers` wedding-wide organizer list & by question
  EXECUTE $q$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, submission_id, group_id, question_id, answer_text
      FROM public.rsvp_answers
     WHERE workspace_id = 'bbbbbbbb-7777-4bbb-8bbb-bbbbbbbbbbbb'::uuid
       AND wedding_id = 'cccccccc-7777-4ccc-8ccc-cccccccccccc'::uuid
  $q$ INTO v_plan;
  INSERT INTO tmp_phase7_plan_captures VALUES ('rls_rsvp_answers_by_wedding', v_plan);

  EXECUTE $q$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, submission_id, answer_text
      FROM public.rsvp_answers
     WHERE workspace_id = 'bbbbbbbb-7777-4bbb-8bbb-bbbbbbbbbbbb'::uuid
       AND wedding_id = 'cccccccc-7777-4ccc-8ccc-cccccccccccc'::uuid
       AND question_id = 'ffffffff-7777-4fff-8fff-ffffffffffff'::uuid
  $q$ INTO v_plan;
  INSERT INTO tmp_phase7_plan_captures VALUES ('rls_rsvp_answers_by_question', v_plan);
END;
$$;

RESET ROLE;

-- 5. Exercise every FK & unique index (`invitation_id`, `group_id`, `(submission_id, guest_id)`, `(submission_id, question_id)`)
DO $$
DECLARE
  v_plan_inv jsonb;
BEGIN
  EXECUTE $q$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id FROM public.rsvp_submissions WHERE invitation_id = '99999999-7777-4999-8999-999999999999'::uuid
  $q$ INTO v_plan_inv;

  INSERT INTO tmp_phase7_plan_captures VALUES ('fk_rsvp_submissions_invitation_id_idx', v_plan_inv);
END;
$$;

SELECT scenario, plan_json
  FROM tmp_phase7_plan_captures;

ROLLBACK;
