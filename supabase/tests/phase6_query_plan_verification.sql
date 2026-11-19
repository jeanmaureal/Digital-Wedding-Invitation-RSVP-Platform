-- ============================================================================
-- Phase 6 Representative Volume Query Plan Verification (`EXPLAIN ANALYZE`)
-- ============================================================================
-- Seeds 40 organizers, 40 workspaces, 80 weddings, 800 `guest_groups`,
-- 2,400 `guests`, and 1,600 `invitations` (1 revoked + 1 active per household)
-- inside a rolled-back transaction, runs `ANALYZE`, and captures execution
-- plans for SHA-256 token lookup and RLS-scoped organizer queries (`P6-AC06`).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE tmp_phase6_plan_captures (
  scenario text NOT NULL,
  plan_json jsonb NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT ON TABLE tmp_phase6_plan_captures TO authenticated, anon;

DO $$
DECLARE
  v_i int;
  v_w int;
  v_g int;
  v_m int;
  v_uid uuid;
  v_ws_id uuid;
  v_wedding_id uuid;
  v_group_id uuid;
  v_target_user constant uuid := 'aaaaaaaa-6666-4aaa-8aaa-aaaaaaaaaaaa';
  v_target_ws constant uuid := 'bbbbbbbb-6666-4bbb-8bbb-bbbbbbbbbbbb';
  v_target_wedding constant uuid := 'cccccccc-6666-4ccc-8ccc-cccccccccccc';
  v_target_group constant uuid := 'dddddddd-6666-4ddd-8ddd-dddddddddddd';
  v_probe_hash text := encode(sha256(convert_to('p6_probe_active_token_1234567890_abcdefghij', 'UTF8')), 'hex');
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES (v_target_user, 'p6.plan.probe@example.com', '{"full_name":"P6 Plan Probe"}'::jsonb, now(), now());

  INSERT INTO public.workspaces (id, name, slug, created_by)
  VALUES (v_target_ws, 'P6 Plan Probe Studio', 'p6-plan-probe-studio', v_target_user);

  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
  VALUES (v_target_ws, v_target_user, 'owner', v_target_user);

  INSERT INTO public.weddings (
    id, workspace_id, title, partner_one_name, partner_two_name, slug, status, created_by
  )
  VALUES (
    v_target_wedding, v_target_ws, 'P6 Probe Wedding', 'Clara', 'Mateo', 'p6-probe-wedding', 'draft', v_target_user
  );

  INSERT INTO public.wedding_settings (wedding_id, workspace_id, timezone, access_mode)
  VALUES (v_target_wedding, v_target_ws, 'Asia/Manila', 'invite_only');

  INSERT INTO public.published_versions (
    wedding_id, workspace_id, version_number, schema_version, access_mode, is_active, content_snapshot, published_by
  )
  VALUES (
    v_target_wedding,
    v_target_ws,
    1,
    1,
    'invite_only',
    true,
    '{"schemaVersion":1}'::jsonb,
    v_target_user
  );

  UPDATE public.weddings SET status = 'published' WHERE id = v_target_wedding;

  FOR v_g IN 1..15 LOOP
    v_group_id := CASE
      WHEN v_g = 1 THEN v_target_group
      ELSE ('dddddddd-6666-4ddd-9000-' || lpad(to_hex(v_g), 12, '0'))::uuid
    END;

    INSERT INTO public.guest_groups (id, wedding_id, workspace_id, display_name, max_attendees, sort_order, created_by)
    VALUES (v_group_id, v_target_wedding, v_target_ws, 'Probe Household ' || v_g::text, 3, v_g - 1, v_target_user);

    FOR v_m IN 1..3 LOOP
      INSERT INTO public.guests (group_id, wedding_id, workspace_id, first_name, last_name, sort_order)
      VALUES (v_group_id, v_target_wedding, v_target_ws, 'Member' || v_m::text, 'H' || v_g::text, v_m - 1);
    END LOOP;

    INSERT INTO public.invitations (group_id, wedding_id, workspace_id, token_hash, status, revoked_at, issued_by)
    VALUES (
      v_group_id,
      v_target_wedding,
      v_target_ws,
      encode(sha256(convert_to('p6_probe_revoked_' || v_g::text, 'UTF8')), 'hex'),
      'revoked',
      now(),
      v_target_user
    );

    INSERT INTO public.invitations (group_id, wedding_id, workspace_id, token_hash, status, issued_by)
    VALUES (
      v_group_id,
      v_target_wedding,
      v_target_ws,
      CASE
        WHEN v_g = 1 THEN v_probe_hash
        ELSE encode(sha256(convert_to('p6_probe_active_' || v_g::text, 'UTF8')), 'hex')
      END,
      'active',
      v_target_user
    );
  END LOOP;

  FOR v_i IN 1..40 LOOP
    v_uid := ('00000000-6601-4000-8000-' || lpad(to_hex(v_i), 12, '0'))::uuid;
    v_ws_id := ('00000000-6602-4000-8000-' || lpad(to_hex(v_i), 12, '0'))::uuid;

    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (
      v_uid,
      'p6.bench.user.' || v_i::text || '@example.com',
      jsonb_build_object('full_name', 'P6 Bench User ' || v_i::text),
      now(),
      now()
    );

    INSERT INTO public.workspaces (id, name, slug, created_by)
    VALUES (v_ws_id, 'P6 Bench Studio ' || v_i::text, 'p6-bench-studio-' || v_i::text, v_uid);

    INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
    VALUES (v_ws_id, v_uid, 'owner', v_uid);

    FOR v_w IN 1..2 LOOP
      v_wedding_id := (
        '00000000-6603-4000-'
        || lpad(to_hex(v_w), 4, '0')
        || '-'
        || lpad(to_hex(v_i), 12, '0')
      )::uuid;

      INSERT INTO public.weddings (
        id, workspace_id, title, partner_one_name, partner_two_name, slug, status, created_by
      )
      VALUES (
        v_wedding_id,
        v_ws_id,
        'P6 Bench Wedding ' || v_i::text || '-' || v_w::text,
        'PartnerA',
        'PartnerB',
        'p6-bench-wedding-' || v_i::text || '-' || v_w::text,
        'draft',
        v_uid
      );

      INSERT INTO public.wedding_settings (wedding_id, workspace_id, timezone)
      VALUES (v_wedding_id, v_ws_id, 'UTC');

      FOR v_g IN 1..10 LOOP
        INSERT INTO public.guest_groups (wedding_id, workspace_id, display_name, max_attendees, sort_order, created_by)
        VALUES (v_wedding_id, v_ws_id, 'Bench Household ' || v_g::text, 3, v_g - 1, v_uid)
        RETURNING id INTO v_group_id;

        FOR v_m IN 1..3 LOOP
          INSERT INTO public.guests (group_id, wedding_id, workspace_id, first_name, last_name, sort_order)
          VALUES (v_group_id, v_wedding_id, v_ws_id, 'Guest' || v_m::text, 'Bench', v_m - 1);
        END LOOP;

        INSERT INTO public.invitations (group_id, wedding_id, workspace_id, token_hash, status, revoked_at, issued_by)
        VALUES (
          v_group_id,
          v_wedding_id,
          v_ws_id,
          encode(sha256(convert_to('p6_bench_revoked_' || v_i::text || '_' || v_w::text || '_' || v_g::text, 'UTF8')), 'hex'),
          'revoked',
          now(),
          v_uid
        );

        INSERT INTO public.invitations (group_id, wedding_id, workspace_id, token_hash, status, issued_by)
        VALUES (
          v_group_id,
          v_wedding_id,
          v_ws_id,
          encode(sha256(convert_to('p6_bench_active_' || v_i::text || '_' || v_w::text || '_' || v_g::text, 'UTF8')), 'hex'),
          'active',
          v_uid
        );
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;

ANALYZE public.weddings;
ANALYZE public.published_versions;
ANALYZE public.guest_groups;
ANALYZE public.guests;
ANALYZE public.invitations;

-- 1. Superuser plan inspection of unique SHA-256 index lookup inside `resolve_invitation_by_token`
DO $$
DECLARE
  v_plan jsonb;
  v_plan_text text;
BEGIN
  EXECUTE $q$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT inv.id, inv.group_id, inv.wedding_id, inv.workspace_id, inv.status, inv.expires_at
      FROM public.invitations inv
     WHERE inv.token_hash = encode(sha256(convert_to('p6_probe_active_token_1234567890_abcdefghij', 'UTF8')), 'hex')
  $q$ INTO v_plan;

  v_plan_text := v_plan::text;
  IF v_plan_text NOT LIKE '%Index Scan%' AND v_plan_text NOT LIKE '%Index Only Scan%' THEN
    RAISE EXCEPTION 'PLAN_REGRESSION [P6-AC06]: Expected Index Scan on invitations_token_hash_key, got: %', v_plan_text;
  END IF;

  INSERT INTO tmp_phase6_plan_captures (scenario, plan_json)
  VALUES ('public_token_hash_unique_lookup', v_plan);
END;
$$;

-- 2. Anonymous RPC execution plan (`resolve_invitation_by_token`)
SET LOCAL ROLE anon;

DO $$
DECLARE
  v_plan jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  EXECUTE $q$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT public.resolve_invitation_by_token('p6_probe_active_token_1234567890_abcdefghij')
  $q$ INTO v_plan;

  INSERT INTO tmp_phase6_plan_captures (scenario, plan_json)
  VALUES ('anon_rpc_resolve_invitation_by_token', v_plan);
END;
$$;

-- 3. Authenticated RLS query plans (`guest_groups`, `guests`, `invitations` ordered listings)
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_plan jsonb;
  v_plan_text text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-6666-4aaa-8aaa-aaaaaaaaaaaa', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- 3.1 Ordered `guest_groups`
  EXECUTE $q$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT gg.id, gg.display_name, gg.max_attendees, gg.notes, gg.sort_order
      FROM public.guest_groups gg
     WHERE gg.workspace_id = 'bbbbbbbb-6666-4bbb-8bbb-bbbbbbbbbbbb'::uuid
       AND gg.wedding_id = 'cccccccc-6666-4ccc-8ccc-cccccccccccc'::uuid
     ORDER BY gg.sort_order ASC, gg.created_at ASC
  $q$ INTO v_plan;

  v_plan_text := v_plan::text;
  IF v_plan_text NOT LIKE '%Index Scan%' OR v_plan_text LIKE '%"Node Type": "Sort"%' THEN
    RAISE EXCEPTION 'PLAN_REGRESSION [P6-AC06]: Expected Sort-free Index Scan on guest_groups, got: %', v_plan_text;
  END IF;
  INSERT INTO tmp_phase6_plan_captures (scenario, plan_json)
  VALUES ('rls_guest_groups_ordered_list', v_plan);

  -- 3.2 Ordered `guests`
  EXECUTE $q$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT g.id, g.group_id, g.first_name, g.last_name, g.side, g.is_child, g.sort_order
      FROM public.guests g
     WHERE g.workspace_id = 'bbbbbbbb-6666-4bbb-8bbb-bbbbbbbbbbbb'::uuid
       AND g.wedding_id = 'cccccccc-6666-4ccc-8ccc-cccccccccccc'::uuid
     ORDER BY g.sort_order ASC, g.created_at ASC
  $q$ INTO v_plan;

  v_plan_text := v_plan::text;
  IF v_plan_text NOT LIKE '%Index Scan%' OR v_plan_text LIKE '%"Node Type": "Sort"%' THEN
    RAISE EXCEPTION 'PLAN_REGRESSION [P6-AC06]: Expected Sort-free Index Scan on guests, got: %', v_plan_text;
  END IF;
  INSERT INTO tmp_phase6_plan_captures (scenario, plan_json)
  VALUES ('rls_guests_ordered_list', v_plan);

  -- 3.3 Ordered `invitations` (safe columns only — excluding `token_hash`)
  EXECUTE $q$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT inv.id, inv.group_id, inv.status, inv.delivery_status, inv.expires_at, inv.revoked_at, inv.created_at
      FROM public.invitations inv
     WHERE inv.workspace_id = 'bbbbbbbb-6666-4bbb-8bbb-bbbbbbbbbbbb'::uuid
       AND inv.wedding_id = 'cccccccc-6666-4ccc-8ccc-cccccccccccc'::uuid
       AND inv.group_id = 'dddddddd-6666-4ddd-8ddd-dddddddddddd'::uuid
     ORDER BY inv.created_at DESC
  $q$ INTO v_plan;

  v_plan_text := v_plan::text;
  IF v_plan_text NOT LIKE '%Index Scan%' OR v_plan_text LIKE '%"Node Type": "Sort"%' THEN
    RAISE EXCEPTION 'PLAN_REGRESSION [P6-AC06]: Expected Sort-free Index Scan on invitations, got: %', v_plan_text;
  END IF;
  INSERT INTO tmp_phase6_plan_captures (scenario, plan_json)
  VALUES ('rls_invitations_ordered_list', v_plan);
END;
$$;

RESET ROLE;

-- 4. Verify `ON DELETE SET NULL` FK index scan on `guest_groups_created_by_idx` & `invitations_issued_by_idx` at scale
DO $$
DECLARE
  v_plan_1 jsonb;
  v_plan_2 jsonb;
BEGIN
  EXECUTE $q$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id FROM public.guest_groups WHERE created_by = 'aaaaaaaa-6666-4aaa-8aaa-aaaaaaaaaaaa'::uuid
  $q$ INTO v_plan_1;

  EXECUTE $q$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id FROM public.invitations WHERE issued_by = 'aaaaaaaa-6666-4aaa-8aaa-aaaaaaaaaaaa'::uuid
  $q$ INTO v_plan_2;

  INSERT INTO tmp_phase6_plan_captures (scenario, plan_json)
  VALUES
    ('fk_guest_groups_created_by_idx', v_plan_1),
    ('fk_invitations_issued_by_idx', v_plan_2);
END;
$$;

SELECT scenario, plan_json
  FROM tmp_phase6_plan_captures;

ROLLBACK;
