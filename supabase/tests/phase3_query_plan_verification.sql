-- ============================================================================
-- Phase 3 Representative Volume Query Plan Verification (`EXPLAIN ANALYZE`)
-- ============================================================================
-- Seeds 80 organizers, 100 workspaces, 400 weddings, 400 `wedding_themes`, and
-- 2,800 `wedding_sections` inside a rolled-back transaction, runs `ANALYZE`,
-- and captures execution plans under `authenticated` RLS (`P3-AC05`).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE tmp_phase3_plan_captures (
  scenario text NOT NULL,
  plan_json jsonb NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT ON TABLE tmp_phase3_plan_captures TO authenticated;

DO $$
DECLARE
  v_i int;
  v_j int;
  v_s int;
  v_uid uuid;
  v_ws_id uuid;
  v_wedding_id uuid;
  v_section_types public.wedding_section_type[] := ARRAY[
    'hero'::public.wedding_section_type,
    'our_story'::public.wedding_section_type,
    'event_schedule'::public.wedding_section_type,
    'venue_travel'::public.wedding_section_type,
    'dress_code'::public.wedding_section_type,
    'faq_notes'::public.wedding_section_type,
    'rsvp_banner'::public.wedding_section_type
  ];
  v_target_user constant uuid := 'aaaaaaaa-3333-4aaa-8aaa-aaaaaaaaaaaa';
  v_target_ws constant uuid := 'bbbbbbbb-3333-4bbb-8bbb-bbbbbbbbbbbb';
  v_target_wedding constant uuid := 'cccccccc-3333-4ccc-8ccc-cccccccccccc';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES (v_target_user, 'p3.plan.probe@example.com', '{"full_name":"P3 Plan Probe"}'::jsonb, now(), now());

  INSERT INTO public.workspaces (id, name, slug, created_by)
  VALUES (v_target_ws, 'P3 Plan Probe Studio', 'p3-plan-probe-studio', v_target_user);

  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
  VALUES (v_target_ws, v_target_user, 'owner', v_target_user);

  INSERT INTO public.weddings (
    id, workspace_id, title, partner_one_name, partner_two_name, slug, status, created_by
  )
  VALUES (
    v_target_wedding, v_target_ws, 'P3 Probe Wedding', 'Aria', 'Ezra', 'p3-probe-wedding', 'draft', v_target_user
  );

  INSERT INTO public.wedding_settings (wedding_id, workspace_id, timezone)
  VALUES (v_target_wedding, v_target_ws, 'Asia/Manila');

  INSERT INTO public.wedding_themes (wedding_id, workspace_id, preset_id)
  VALUES (v_target_wedding, v_target_ws, 'editorial_ivory');

  FOR v_s IN 1..7 LOOP
    INSERT INTO public.wedding_sections (
      wedding_id, workspace_id, section_type, sort_order, is_visible, content
    )
    VALUES (
      v_target_wedding,
      v_target_ws,
      v_section_types[v_s],
      v_s - 1,
      true,
      '{"heading":"Probe"}'::jsonb
    );
  END LOOP;

  FOR v_i IN 1..80 LOOP
    v_uid := ('00000000-5555-4000-8000-' || lpad(to_hex(v_i), 12, '0'))::uuid;
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (
      v_uid,
      'p3.bench.user.' || v_i::text || '@example.com',
      jsonb_build_object('full_name', 'P3 Bench User ' || v_i::text),
      now(),
      now()
    );
  END LOOP;

  FOR v_i IN 1..100 LOOP
    v_ws_id := ('00000000-6666-4000-8000-' || lpad(to_hex(v_i), 12, '0'))::uuid;
    v_uid := ('00000000-5555-4000-8000-' || lpad(to_hex(((v_i - 1) % 80) + 1), 12, '0'))::uuid;

    INSERT INTO public.workspaces (id, name, slug, created_by)
    VALUES (v_ws_id, 'P3 Bench Studio ' || v_i::text, 'p3-bench-studio-' || v_i::text, v_uid);

    INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
    VALUES (v_ws_id, v_uid, 'owner', v_uid);

    FOR v_j IN 1..4 LOOP
      v_wedding_id := (
        '00000000-7777-4000-'
        || lpad(to_hex(v_j), 4, '0')
        || '-'
        || lpad(to_hex(v_i), 12, '0')
      )::uuid;

      INSERT INTO public.weddings (
        id, workspace_id, title, partner_one_name, partner_two_name, slug, status, created_by
      )
      VALUES (
        v_wedding_id,
        v_ws_id,
        'P3 Bench Wedding ' || v_i::text || '-' || v_j::text,
        'PartnerA' || v_j::text,
        'PartnerB' || v_j::text,
        'p3-bench-wedding-' || v_i::text || '-' || v_j::text,
        'draft',
        v_uid
      );

      INSERT INTO public.wedding_settings (wedding_id, workspace_id, timezone)
      VALUES (v_wedding_id, v_ws_id, 'UTC');

      INSERT INTO public.wedding_themes (wedding_id, workspace_id, preset_id)
      VALUES (v_wedding_id, v_ws_id, 'garden_sage');

      FOR v_s IN 1..7 LOOP
        INSERT INTO public.wedding_sections (
          wedding_id, workspace_id, section_type, sort_order, is_visible, content
        )
        VALUES (
          v_wedding_id,
          v_ws_id,
          v_section_types[v_s],
          v_s - 1,
          true,
          '{"heading":"Bench"}'::jsonb
        );
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;

ANALYZE public.workspaces;
ANALYZE public.workspace_members;
ANALYZE public.weddings;
ANALYZE public.wedding_themes;
ANALYZE public.wedding_sections;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaaaaaa-3333-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

DO $$
DECLARE
  v_plan jsonb;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM public.wedding_themes WHERE workspace_id = ''bbbbbbbb-3333-4bbb-8bbb-bbbbbbbbbbbb'' AND wedding_id = ''cccccccc-3333-4ccc-8ccc-cccccccccccc'''
    INTO v_plan;
  INSERT INTO tmp_phase3_plan_captures VALUES ('rls_get_single_wedding_theme_scoped', v_plan);

  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM public.wedding_sections WHERE workspace_id = ''bbbbbbbb-3333-4bbb-8bbb-bbbbbbbbbbbb'' AND wedding_id = ''cccccccc-3333-4ccc-8ccc-cccccccccccc'' ORDER BY sort_order ASC'
    INTO v_plan;
  INSERT INTO tmp_phase3_plan_captures VALUES ('rls_list_wedding_sections_ordered_scoped', v_plan);
END;
$$;

RESET ROLE;

SELECT scenario, plan_json FROM tmp_phase3_plan_captures ORDER BY scenario;

ROLLBACK;
