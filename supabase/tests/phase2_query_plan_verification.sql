-- ============================================================================
-- Phase 2 Representative Volume Query Plan Verification (`EXPLAIN ANALYZE`)
-- ============================================================================
-- Seeds 100 organizers, 120 workspaces, and 600 weddings + 600 `wedding_settings`
-- inside a rolled-back transaction, runs `ANALYZE`, and captures real execution
-- plans under `authenticated` RLS to confirm selective index scans and absence
-- of pathological sequential scans across multi-wedding queries (`P2-AC08`).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE tmp_phase2_plan_captures (
  scenario text NOT NULL,
  plan_json jsonb NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT ON TABLE tmp_phase2_plan_captures TO authenticated;

DO $$
DECLARE
  v_i int;
  v_j int;
  v_uid uuid;
  v_ws_id uuid;
  v_wedding_id uuid;
  v_target_user constant uuid := 'aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa';
  v_target_ws constant uuid := 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb';
  v_target_wedding constant uuid := 'cccccccc-2222-4ccc-8ccc-cccccccccccc';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES (v_target_user, 'p2.plan.probe@example.com', '{"full_name":"P2 Plan Probe"}'::jsonb, now(), now());

  INSERT INTO public.workspaces (id, name, slug, created_by)
  VALUES (v_target_ws, 'P2 Plan Probe Studio', 'p2-plan-probe-studio', v_target_user);

  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
  VALUES (v_target_ws, v_target_user, 'owner', v_target_user);

  INSERT INTO public.weddings (
    id, workspace_id, title, partner_one_name, partner_two_name, slug, status, created_by
  )
  VALUES (
    v_target_wedding,
    v_target_ws,
    'Probe Target Wedding',
    'Aria',
    'Ezra',
    'probe-target-wedding-p2',
    'draft',
    v_target_user
  );

  INSERT INTO public.wedding_settings (wedding_id, workspace_id, timezone)
  VALUES (v_target_wedding, v_target_ws, 'Asia/Manila');

  FOR v_i IN 1..100 LOOP
    v_uid := ('00000000-2222-4000-8000-' || lpad(to_hex(v_i), 12, '0'))::uuid;
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (
      v_uid,
      'p2.bench.user.' || v_i::text || '@example.com',
      jsonb_build_object('full_name', 'P2 Bench User ' || v_i::text),
      now(),
      now()
    );
  END LOOP;

  FOR v_i IN 1..120 LOOP
    v_ws_id := ('00000000-3333-4000-8000-' || lpad(to_hex(v_i), 12, '0'))::uuid;
    v_uid := ('00000000-2222-4000-8000-' || lpad(to_hex(((v_i - 1) % 100) + 1), 12, '0'))::uuid;

    INSERT INTO public.workspaces (id, name, slug, created_by)
    VALUES (v_ws_id, 'P2 Bench Studio ' || v_i::text, 'p2-bench-studio-' || v_i::text, v_uid);

    INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
    VALUES (v_ws_id, v_uid, 'owner', v_uid);

    FOR v_j IN 1..5 LOOP
      v_wedding_id := (
        '00000000-4444-4000-'
        || lpad(to_hex(v_j), 4, '0')
        || '-'
        || lpad(to_hex(v_i), 12, '0')
      )::uuid;

      INSERT INTO public.weddings (
        id,
        workspace_id,
        title,
        partner_one_name,
        partner_two_name,
        slug,
        status,
        archived_at,
        created_by
      )
      VALUES (
        v_wedding_id,
        v_ws_id,
        'Bench Wedding ' || v_i::text || '-' || v_j::text,
        'PartnerA' || v_j::text,
        'PartnerB' || v_j::text,
        'p2-bench-wedding-' || v_i::text || '-' || v_j::text,
        CASE WHEN v_j = 5 THEN 'archived'::public.wedding_status ELSE 'draft'::public.wedding_status END,
        CASE WHEN v_j = 5 THEN now() ELSE NULL END,
        v_uid
      );

      INSERT INTO public.wedding_settings (wedding_id, workspace_id, timezone)
      VALUES (v_wedding_id, v_ws_id, 'UTC');
    END LOOP;
  END LOOP;
END;
$$;

ANALYZE public.workspaces;
ANALYZE public.workspace_members;
ANALYZE public.weddings;
ANALYZE public.wedding_settings;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

DO $$
DECLARE
  v_plan jsonb;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM public.weddings WHERE workspace_id = ''bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb'' ORDER BY updated_at DESC, id DESC'
    INTO v_plan;
  INSERT INTO tmp_phase2_plan_captures VALUES ('rls_list_workspace_weddings', v_plan);

  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM public.weddings WHERE workspace_id = ''bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb'' AND status = ''draft'' ORDER BY updated_at DESC, id DESC'
    INTO v_plan;
  INSERT INTO tmp_phase2_plan_captures VALUES ('rls_list_workspace_weddings_by_status', v_plan);

  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM public.weddings WHERE workspace_id = ''bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb'' AND id = ''cccccccc-2222-4ccc-8ccc-cccccccccccc'''
    INTO v_plan;
  INSERT INTO tmp_phase2_plan_captures VALUES ('rls_get_single_wedding_scoped', v_plan);

  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM public.wedding_settings WHERE workspace_id = ''bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb'''
    INTO v_plan;
  INSERT INTO tmp_phase2_plan_captures VALUES ('rls_list_workspace_wedding_settings', v_plan);

  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM public.wedding_settings WHERE workspace_id = ''bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb'' AND wedding_id = ''cccccccc-2222-4ccc-8ccc-cccccccccccc'''
    INTO v_plan;
  INSERT INTO tmp_phase2_plan_captures VALUES ('rls_get_single_wedding_settings_scoped', v_plan);
END;
$$;

RESET ROLE;

SELECT scenario, plan_json FROM tmp_phase2_plan_captures ORDER BY scenario;

ROLLBACK;
