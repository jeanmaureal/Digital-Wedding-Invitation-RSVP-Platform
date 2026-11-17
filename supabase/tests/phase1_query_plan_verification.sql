-- ============================================================================
-- Phase 1 Representative Volume Query Plan Verification (`EXPLAIN ANALYZE`)
-- ============================================================================
-- Seeds 150 organizers, 200 workspaces, and 600 memberships inside a rolled-back
-- transaction, runs `ANALYZE`, and captures real execution plans under `authenticated`
-- RLS to confirm selective index usage and absence of pathological sequential scans.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE tmp_plan_captures (
  scenario text NOT NULL,
  plan_json jsonb NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT ON TABLE tmp_plan_captures TO authenticated;

DO $$
DECLARE
  v_i int;
  v_uid uuid;
  v_ws_id uuid;
  v_target_user constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_target_ws constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES (v_target_user, 'plan.probe@example.com', '{"full_name":"Plan Probe"}'::jsonb, now(), now());

  INSERT INTO public.workspaces (id, name, slug, created_by)
  VALUES (v_target_ws, 'Plan Probe Workspace', 'plan-probe-workspace', v_target_user);

  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
  VALUES (v_target_ws, v_target_user, 'owner', v_target_user);

  FOR v_i IN 1..150 LOOP
    v_uid := ('00000000-0000-4000-8000-' || lpad(to_hex(v_i), 12, '0'))::uuid;
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (
      v_uid,
      'bench.user.' || v_i::text || '@example.com',
      jsonb_build_object('full_name', 'Bench User ' || v_i::text),
      now(),
      now()
    );
  END LOOP;

  FOR v_i IN 1..200 LOOP
    v_ws_id := ('00000000-1111-4000-8000-' || lpad(to_hex(v_i), 12, '0'))::uuid;
    v_uid := ('00000000-0000-4000-8000-' || lpad(to_hex(((v_i - 1) % 150) + 1), 12, '0'))::uuid;

    INSERT INTO public.workspaces (id, name, slug, created_by)
    VALUES (v_ws_id, 'Bench Workspace ' || v_i::text, 'bench-workspace-' || v_i::text, v_uid);

    INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
    VALUES
      (v_ws_id, v_uid, 'owner', v_uid),
      (
        v_ws_id,
        ('00000000-0000-4000-8000-' || lpad(to_hex((v_i % 150) + 1), 12, '0'))::uuid,
        'editor',
        v_uid
      ),
      (
        v_ws_id,
        ('00000000-0000-4000-8000-' || lpad(to_hex(((v_i + 1) % 150) + 1), 12, '0'))::uuid,
        'viewer',
        v_uid
      );
  END LOOP;
END;
$$;

ANALYZE public.profiles;
ANALYZE public.workspaces;
ANALYZE public.workspace_members;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

DO $$
DECLARE
  v_plan jsonb;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM public.workspaces'
    INTO v_plan;
  INSERT INTO tmp_plan_captures VALUES ('rls_select_workspaces', v_plan);

  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM public.workspace_members WHERE workspace_id = ''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'''
    INTO v_plan;
  INSERT INTO tmp_plan_captures VALUES ('rls_select_workspace_members_by_workspace', v_plan);

  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM public.list_workspace_members(''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'')'
    INTO v_plan;
  INSERT INTO tmp_plan_captures VALUES ('rpc_list_workspace_members', v_plan);

  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM public.profiles'
    INTO v_plan;
  INSERT INTO tmp_plan_captures VALUES ('rls_select_own_profile', v_plan);
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_plan jsonb;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM public.profiles WHERE email = ''bench.user.75@example.com'''
    INTO v_plan;
  INSERT INTO tmp_plan_captures VALUES ('lookup_profile_by_email', v_plan);
END;
$$;

SELECT scenario, plan_json FROM tmp_plan_captures ORDER BY scenario;

ROLLBACK;
