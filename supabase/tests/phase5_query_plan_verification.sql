-- ============================================================================
-- Phase 5 Representative Volume Query Plan Verification (`EXPLAIN ANALYZE`)
-- ============================================================================
-- Seeds 60 organizers, 80 workspaces, 320 weddings, and 960 `published_versions`
-- (3 versions per wedding, 1 active per published wedding) inside a rolled-back
-- transaction, runs `ANALYZE`, and captures execution plans for both public slug
-- resolution and authenticated workspace version lookups (`P5-AC06`).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE tmp_phase5_plan_captures (
  scenario text NOT NULL,
  plan_json jsonb NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT ON TABLE tmp_phase5_plan_captures TO authenticated, anon;

DO $$
DECLARE
  v_i int;
  v_j int;
  v_v int;
  v_uid uuid;
  v_ws_id uuid;
  v_wedding_id uuid;
  v_target_user constant uuid := 'aaaaaaaa-5555-4aaa-8aaa-aaaaaaaaaaaa';
  v_target_ws constant uuid := 'bbbbbbbb-5555-4bbb-8bbb-bbbbbbbbbbbb';
  v_target_wedding constant uuid := 'cccccccc-5555-4ccc-8ccc-cccccccccccc';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES (v_target_user, 'p5.plan.probe@example.com', '{"full_name":"P5 Plan Probe"}'::jsonb, now(), now());

  INSERT INTO public.workspaces (id, name, slug, created_by)
  VALUES (v_target_ws, 'P5 Plan Probe Studio', 'p5-plan-probe-studio', v_target_user);

  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
  VALUES (v_target_ws, v_target_user, 'owner', v_target_user);

  INSERT INTO public.weddings (
    id, workspace_id, title, partner_one_name, partner_two_name, slug, status, created_by
  )
  VALUES (
    v_target_wedding, v_target_ws, 'P5 Probe Wedding', 'Aria', 'Ezra', 'p5-probe-wedding', 'draft', v_target_user
  );

  INSERT INTO public.wedding_settings (wedding_id, workspace_id, timezone)
  VALUES (v_target_wedding, v_target_ws, 'Asia/Manila');

  FOR v_v IN 1..3 LOOP
    INSERT INTO public.published_versions (
      wedding_id, workspace_id, version_number, schema_version, access_mode, is_active, content_snapshot, published_by
    )
    VALUES (
      v_target_wedding,
      v_target_ws,
      v_v,
      1,
      'public',
      (v_v = 3),
      jsonb_build_object('schemaVersion', 1, 'version', v_v),
      v_target_user
    );
  END LOOP;

  UPDATE public.weddings SET status = 'published' WHERE id = v_target_wedding;

  FOR v_i IN 1..60 LOOP
    v_uid := ('00000000-8888-4000-8000-' || lpad(to_hex(v_i), 12, '0'))::uuid;
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (
      v_uid,
      'p5.bench.user.' || v_i::text || '@example.com',
      jsonb_build_object('full_name', 'P5 Bench User ' || v_i::text),
      now(),
      now()
    );
  END LOOP;

  FOR v_i IN 1..80 LOOP
    v_ws_id := ('00000000-9999-4000-8000-' || lpad(to_hex(v_i), 12, '0'))::uuid;
    v_uid := ('00000000-8888-4000-8000-' || lpad(to_hex(((v_i - 1) % 60) + 1), 12, '0'))::uuid;

    INSERT INTO public.workspaces (id, name, slug, created_by)
    VALUES (v_ws_id, 'P5 Bench Studio ' || v_i::text, 'p5-bench-studio-' || v_i::text, v_uid);

    INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
    VALUES (v_ws_id, v_uid, 'owner', v_uid);

    FOR v_j IN 1..4 LOOP
      v_wedding_id := (
        '00000000-aaaa-4000-'
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
        'P5 Bench Wedding ' || v_i::text || '-' || v_j::text,
        'PartnerA' || v_j::text,
        'PartnerB' || v_j::text,
        'p5-bench-wedding-' || v_i::text || '-' || v_j::text,
        'draft',
        v_uid
      );

      INSERT INTO public.wedding_settings (wedding_id, workspace_id, timezone)
      VALUES (v_wedding_id, v_ws_id, 'UTC');

      FOR v_v IN 1..3 LOOP
        INSERT INTO public.published_versions (
          wedding_id, workspace_id, version_number, schema_version, access_mode, is_active, content_snapshot, published_by
        )
        VALUES (
          v_wedding_id,
          v_ws_id,
          v_v,
          1,
          'public',
          (v_v = 3),
          jsonb_build_object('schemaVersion', 1, 'version', v_v),
          v_uid
        );
      END LOOP;

      UPDATE public.weddings SET status = 'published' WHERE id = v_wedding_id;
    END LOOP;
  END LOOP;
END;
$$;

ANALYZE public.workspaces;
ANALYZE public.workspace_members;
ANALYZE public.weddings;
ANALYZE public.wedding_settings;
ANALYZE public.published_versions;

DO $$
DECLARE
  v_plan jsonb;
BEGIN
  -- 1. Public slug + active snapshot join plan (exact query shape inside `get_public_wedding_by_slug`)
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT w.id, w.status, ws.access_mode, pv.version_number, pv.content_snapshot
      FROM public.weddings w
      INNER JOIN public.wedding_settings ws
        ON ws.workspace_id = w.workspace_id AND ws.wedding_id = w.id
      INNER JOIN public.published_versions pv
        ON pv.wedding_id = w.id AND pv.is_active = true
     WHERE w.slug = ''p5-probe-wedding'''
    INTO v_plan;
  INSERT INTO tmp_phase5_plan_captures VALUES ('public_slug_active_snapshot_lookup', v_plan);
END;
$$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaaaaaa-5555-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

DO $$
DECLARE
  v_plan jsonb;
BEGIN
  -- 2. Organizer workspace-scoped active/ordered published versions under RLS
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, wedding_id, workspace_id, version_number, schema_version, access_mode, is_active, published_at, published_by
      FROM public.published_versions
     WHERE workspace_id = ''bbbbbbbb-5555-4bbb-8bbb-bbbbbbbbbbbb''
       AND wedding_id = ''cccccccc-5555-4ccc-8ccc-cccccccccccc''
     ORDER BY version_number DESC'
    INTO v_plan;
  INSERT INTO tmp_phase5_plan_captures VALUES ('rls_list_published_versions_ordered_scoped', v_plan);
END;
$$;

RESET ROLE;

SELECT scenario, plan_json FROM tmp_phase5_plan_captures ORDER BY scenario;

ROLLBACK;
