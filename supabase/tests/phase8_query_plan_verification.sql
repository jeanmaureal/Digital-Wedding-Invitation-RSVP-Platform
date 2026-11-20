-- ============================================================================
-- Phase 8 Representative Volume Query Plan Verification (`EXPLAIN ANALYZE`)
-- ============================================================================
-- Seeds 150 organizers, 50 workspaces, 100 weddings, and 1,000 immutable
-- `published_versions` rows inside a rolled-back transaction, runs `ANALYZE`,
-- and verifies that publication history retrieval uses
-- `published_versions_workspace_id_wedding_id_version_idx` and `profiles_pkey`
-- with `0` `Sort` nodes and `0` `Seq Scan` nodes (`P8-AC12`).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE tmp_phase8_plan_captures (
  scenario text NOT NULL,
  plan_json jsonb NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT ON TABLE tmp_phase8_plan_captures TO authenticated, anon;

DO $$
DECLARE
  v_i int;
  v_w int;
  v_v int;
  v_uid uuid;
  v_ws_id uuid;
  v_wedding_id uuid;
  v_target_user constant uuid := 'aaaaaaaa-8888-4aaa-8aaa-aaaaaaaaaaaa';
  v_target_ws constant uuid := 'bbbbbbbb-8888-4bbb-8bbb-bbbbbbbbbbbb';
  v_target_wedding constant uuid := 'cccccccc-8888-4ccc-8ccc-cccccccccccc';
  v_sample_snapshot constant jsonb := jsonb_build_object(
    'schemaVersion', 1,
    'wedding', jsonb_build_object(
      'title', 'Probe Wedding',
      'partnerOneName', 'Aurelia',
      'partnerTwoName', 'Julian',
      'slug', 'p8-plan-probe-wedding',
      'eventDate', '2027-09-18',
      'venueName', 'Villa Botanica',
      'venueLocation', 'Tagaytay',
      'timezone', 'Asia/Manila',
      'rsvpDeadline', NULL,
      'isRsvpOpen', true
    ),
    'theme', jsonb_build_object(
      'schemaVersion', 1,
      'presetId', 'editorial_ivory',
      'tokenOverrides', '{}'::jsonb
    ),
    'sections', jsonb_build_array(
      jsonb_build_object(
        'id', '11111111-1111-4111-8111-111111111111',
        'sectionType', 'hero',
        'sortOrder', 0,
        'isVisible', true,
        'schemaVersion', 1,
        'content', jsonb_build_object('headline', 'Probe Headline')
      )
    )
  );
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES (v_target_user, 'p8.plan.probe@example.com', '{"full_name":"P8 Plan Probe"}'::jsonb, now(), now());

  INSERT INTO public.workspaces (id, name, slug, created_by)
  VALUES (v_target_ws, 'P8 Plan Studio', 'p8-plan-studio', v_target_user);

  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
  VALUES (v_target_ws, v_target_user, 'owner', v_target_user);

  INSERT INTO public.weddings (
    id, workspace_id, title, partner_one_name, partner_two_name, slug, status, created_by
  )
  VALUES (
    v_target_wedding, v_target_ws, 'P8 Probe Wedding', 'Aurelia', 'Julian', 'p8-plan-probe-wedding', 'draft', v_target_user
  );

  INSERT INTO public.wedding_settings (wedding_id, workspace_id, timezone)
  VALUES (v_target_wedding, v_target_ws, 'Asia/Manila');

  FOR v_v IN 1..20 LOOP
    INSERT INTO public.published_versions (
      wedding_id, workspace_id, version_number, schema_version, access_mode, is_active, content_snapshot, published_by
    )
    VALUES (
      v_target_wedding, v_target_ws, v_v, 1, 'public', (v_v = 20), v_sample_snapshot, v_target_user
    );
  END LOOP;

  FOR v_i IN 1..150 LOOP
    v_uid := ('00000000-8801-4000-8000-' || lpad(to_hex(v_i), 12, '0'))::uuid;

    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (
      v_uid,
      'p8.bulk.' || v_i::text || '@example.com',
      jsonb_build_object('full_name', 'Bulk Organizer ' || v_i::text),
      now(),
      now()
    );

    IF v_i <= 50 THEN
      v_ws_id := ('00000000-8802-4000-8000-' || lpad(to_hex(v_i), 12, '0'))::uuid;

      INSERT INTO public.workspaces (id, name, slug, created_by)
      VALUES (v_ws_id, 'P8 Bulk Studio ' || v_i::text, 'p8-bulk-studio-' || v_i::text, v_uid);

      INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
      VALUES (v_ws_id, v_uid, 'owner', v_uid);

      FOR v_w IN 1..2 LOOP
        v_wedding_id := gen_random_uuid();
        INSERT INTO public.weddings (
          id, workspace_id, title, partner_one_name, partner_two_name, slug, status, created_by
        )
        VALUES (
          v_wedding_id,
          v_ws_id,
          'Bulk Wedding ' || v_i::text || '-' || v_w::text,
          'Partner A',
          'Partner B',
          'p8-bulk-wedding-' || v_i::text || '-' || v_w::text,
          'draft',
          v_uid
        );

        INSERT INTO public.wedding_settings (wedding_id, workspace_id, timezone)
        VALUES (v_wedding_id, v_ws_id, 'UTC');

        FOR v_v IN 1..10 LOOP
          INSERT INTO public.published_versions (
            wedding_id, workspace_id, version_number, schema_version, access_mode, is_active, content_snapshot, published_by
          )
          VALUES (
            v_wedding_id, v_ws_id, v_v, 1, 'public', (v_v = 10), v_sample_snapshot, v_uid
          );
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

ANALYZE public.published_versions;
ANALYZE public.profiles;
ANALYZE public.weddings;

DO $$
DECLARE
  v_plan jsonb;
  v_plan_text text;
BEGIN
  EXECUTE $q$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT
      pv.id,
      pv.version_number,
      pv.is_active,
      p.full_name
    FROM public.published_versions pv
    LEFT JOIN public.profiles p
      ON p.id = pv.published_by
    WHERE pv.workspace_id = 'bbbbbbbb-8888-4bbb-8bbb-bbbbbbbbbbbb'::uuid
      AND pv.wedding_id = 'cccccccc-8888-4ccc-8ccc-cccccccccccc'::uuid
    ORDER BY pv.version_number DESC
    LIMIT 50
  $q$ INTO v_plan;

  INSERT INTO tmp_phase8_plan_captures (scenario, plan_json)
  VALUES ('publication_history_ordered_lookup', v_plan);

  v_plan_text := v_plan::text;

  IF strpos(v_plan_text, 'published_versions_workspace_id_wedding_id_version_idx') = 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC12]: Expected published_versions_workspace_id_wedding_id_version_idx in plan: %', v_plan_text;
  END IF;

  IF strpos(v_plan_text, '"Node Type": "Sort"') > 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC12]: Unexpected Sort node in publication history query plan: %', v_plan_text;
  END IF;

  IF strpos(v_plan_text, '"Node Type": "Seq Scan"') > 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC12]: Unexpected Seq Scan in publication history query plan: %', v_plan_text;
  END IF;
END;
$$;

SELECT
  scenario,
  plan_json -> 0 -> 'Execution Time' AS execution_time_ms,
  plan_json -> 0 -> 'Plan' ->> 'Node Type' AS root_node
FROM tmp_phase8_plan_captures;

ROLLBACK;
