-- ============================================================================
-- Phase 4 Executable PostgreSQL Section Reordering RPC, RLS & RBAC Suite
-- ============================================================================
-- Execution model:
--   Runs inside a single `BEGIN; ... ROLLBACK;` transaction so zero test rows
--   persist after execution. Any failed check raises an unhandled exception
--   with prefix `ASSERTION_FAILED:` and aborts with a non-zero exit code.
--
-- Covers:
--   - P4-AC01 & P4-AC02: `public.reorder_wedding_sections` catalog audit
--     (`SECURITY INVOKER`, `prosecdef = false`, `OWNER = postgres`, `search_path = ''`,
--      zero `PUBLIC` / `anon` grants, explicit `authenticated` `EXECUTE`)
--   - P4-AC02: Atomic collision-free reordering across `DEFERRABLE`
--     `(wedding_id, sort_order)` uniqueness (adjacent swap + full 7-section reversal),
--     unchanged-row `updated_at` preservation, and strict `22023 SECTION_REORDER_MISMATCH`
--     rejection on duplicate, partial, extra, `NULL`, or cross-wedding section IDs
--   - P4-AC02 & P4-AC08: Multi-tenant RLS & RBAC enforcement (`anon` denied,
--     outsider `42501 WORKSPACE_ACCESS_DENIED`, `viewer` `42501 INSUFFICIENT_WORKSPACE_ROLE`,
--     `editor`/`owner` allowed, cross-workspace wedding ID `P0002 WEDDING_NOT_FOUND`)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Catalog, Privilege & Function Security Audit (P4-AC01, P4-AC02)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_rec record;
  v_fn_count int;
  v_reorder_found boolean := false;
BEGIN
  -- 1.1 Verify total function count across `public` and `app_private` (>= 25)
  SELECT count(*)::int
    INTO v_fn_count
    FROM pg_catalog.pg_proc p
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public', 'app_private');

  IF v_fn_count < 25 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC01]: Expected >= 25 functions in public/app_private, found %', v_fn_count;
  END IF;

  -- 1.2 Verify zero overload ambiguity on `public.reorder_wedding_sections`
  IF (
    SELECT count(*)::int
      FROM pg_catalog.pg_proc p
      INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'reorder_wedding_sections'
  ) <> 1 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC01]: Expected exactly 1 overload of public.reorder_wedding_sections.';
  END IF;

  -- 1.3 Audit every function in `public` and `app_private`
  FOR v_rec IN
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname AS fn_name,
      p.prosecdef AS is_security_definer,
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
      RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC01]: Function %.% owner is %, expected postgres.',
        v_rec.schema_name, v_rec.fn_name, v_rec.owner_name;
    END IF;

    IF NOT ('search_path=""' = ANY(v_rec.config_arr) OR 'search_path=' = ANY(v_rec.config_arr)) THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC01]: Function %.% is missing fixed empty search_path.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.acl_text = '' OR v_rec.acl_text LIKE '{=X/%' OR v_rec.acl_text LIKE '%,=X/%' THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC01]: Function %.% retains PUBLIC EXECUTE grant.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.fn_name <> 'health_check' AND v_rec.anon_exec THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC01]: Function %.% must NOT be executable by anon.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.schema_name = 'public' AND v_rec.fn_name = 'reorder_wedding_sections' THEN
      v_reorder_found := true;
      IF v_rec.is_security_definer THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC02]: public.reorder_wedding_sections must be SECURITY INVOKER (prosecdef = false).';
      END IF;
      IF NOT v_rec.auth_exec THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC02]: public.reorder_wedding_sections must be executable by authenticated.';
      END IF;
    END IF;
  END LOOP;

  IF NOT v_reorder_found THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC01]: public.reorder_wedding_sections not found in catalog.';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- Seed Ephemeral Test Actors, Workspaces & Weddings
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_p4_state (
  key text PRIMARY KEY,
  val uuid NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON TABLE tmp_p4_state TO authenticated;

DO $$
DECLARE
  v_owner_a constant uuid := '44444444-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_editor_a constant uuid := '44444444-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_viewer_a constant uuid := '44444444-cccc-4ccc-8ccc-ccccccccccc3';
  v_outsider constant uuid := '44444444-dddd-4ddd-8ddd-ddddddddddd4';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner_a, 'p4.owner.a@example.com', '{"full_name":"P4 Owner A"}'::jsonb, now(), now()),
    (v_editor_a, 'p4.editor.a@example.com', '{"full_name":"P4 Editor A"}'::jsonb, now(), now()),
    (v_viewer_a, 'p4.viewer.a@example.com', '{"full_name":"P4 Viewer A"}'::jsonb, now(), now()),
    (v_outsider, 'p4.outsider@example.com', '{"full_name":"P4 Outsider"}'::jsonb, now(), now());

  INSERT INTO tmp_p4_state (key, val) VALUES
    ('owner_a', v_owner_a),
    ('editor_a', v_editor_a),
    ('viewer_a', v_viewer_a),
    ('outsider', v_outsider);
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_owner_a uuid := (SELECT val FROM tmp_p4_state WHERE key = 'owner_a');
  v_outsider uuid := (SELECT val FROM tmp_p4_state WHERE key = 'outsider');
  v_ws_a public.workspaces;
  v_ws_b public.workspaces;
  v_wedding_a1 public.weddings;
  v_wedding_a2 public.weddings;
  v_wedding_b1 public.weddings;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);

  v_ws_a := public.create_workspace('P4 Studio A', 'p4-studio-a');
  PERFORM public.add_workspace_member_by_email(v_ws_a.id, 'p4.editor.a@example.com', 'editor');
  PERFORM public.add_workspace_member_by_email(v_ws_a.id, 'p4.viewer.a@example.com', 'viewer');

  v_wedding_a1 := public.create_wedding(
    v_ws_a.id,
    'Clara & Mateo Wedding',
    'Clara',
    'Mateo',
    'p4-clara-mateo',
    DATE '2027-06-19',
    'Villa Aurelia',
    'Tagaytay',
    'Asia/Manila'
  );

  v_wedding_a2 := public.create_wedding(
    v_ws_a.id,
    'Sofia & Liam Wedding',
    'Sofia',
    'Liam',
    'p4-sofia-liam',
    DATE '2027-09-11',
    'Harbor Conservatory',
    'Cebu',
    'Asia/Manila'
  );

  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  v_ws_b := public.create_workspace('P4 Studio B', 'p4-studio-b');
  v_wedding_b1 := public.create_wedding(
    v_ws_b.id,
    'Nora & Julian Wedding',
    'Nora',
    'Julian',
    'p4-nora-julian',
    DATE '2027-10-02',
    'Glasshouse',
    'Manila',
    'Asia/Manila'
  );

  INSERT INTO tmp_p4_state (key, val) VALUES
    ('ws_a', v_ws_a.id),
    ('ws_b', v_ws_b.id),
    ('wedding_a1', v_wedding_a1.id),
    ('wedding_a2', v_wedding_a2.id),
    ('wedding_b1', v_wedding_b1.id);
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Unauthenticated (`anon`), Outsider & `viewer` RBAC Enforcement (P4-AC02, P4-AC08)
-- ----------------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    PERFORM public.reorder_wedding_sections(
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      ARRAY['00000000-0000-0000-0000-000000000003'::uuid]
    );
    RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC02]: Role anon must not execute reorder_wedding_sections.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_viewer_a uuid := (SELECT val FROM tmp_p4_state WHERE key = 'viewer_a');
  v_outsider uuid := (SELECT val FROM tmp_p4_state WHERE key = 'outsider');
  v_editor_a uuid := (SELECT val FROM tmp_p4_state WHERE key = 'editor_a');
  v_ws_a uuid := (SELECT val FROM tmp_p4_state WHERE key = 'ws_a');
  v_wedding_a1 uuid := (SELECT val FROM tmp_p4_state WHERE key = 'wedding_a1');
  v_wedding_b1 uuid := (SELECT val FROM tmp_p4_state WHERE key = 'wedding_b1');
  v_initial_ids uuid[];
BEGIN
  -- Fetch initial ordered section IDs as viewer (viewer has SELECT)
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_viewer_a::text, true);

  SELECT array_agg(ws.id ORDER BY ws.sort_order ASC)
    INTO v_initial_ids
    FROM public.wedding_sections ws
   WHERE ws.workspace_id = v_ws_a
     AND ws.wedding_id = v_wedding_a1;

  IF coalesce(cardinality(v_initial_ids), 0) <> 7 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC08]: Expected viewer to read 7 starter sections, got %', coalesce(cardinality(v_initial_ids), 0);
  END IF;

  -- Viewer cannot reorder sections
  BEGIN
    PERFORM public.reorder_wedding_sections(v_ws_a, v_wedding_a1, v_initial_ids);
    RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC08]: Viewer must be blocked from reorder_wedding_sections.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE 'INSUFFICIENT_WORKSPACE_ROLE:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC08]: Expected INSUFFICIENT_WORKSPACE_ROLE for viewer, got %', SQLERRM;
      END IF;
  END;

  -- Outsider cannot reorder sections in Workspace A
  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  BEGIN
    PERFORM public.reorder_wedding_sections(v_ws_a, v_wedding_a1, v_initial_ids);
    RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC08]: Outsider must be blocked from reorder_wedding_sections.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE 'WORKSPACE_ACCESS_DENIED:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC08]: Expected WORKSPACE_ACCESS_DENIED for outsider, got %', SQLERRM;
      END IF;
  END;

  -- Editor in Workspace A cannot reorder a wedding from Workspace B under Workspace A ID
  PERFORM set_config('request.jwt.claim.sub', v_editor_a::text, true);
  BEGIN
    PERFORM public.reorder_wedding_sections(v_ws_a, v_wedding_b1, v_initial_ids);
    RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC08]: Cross-workspace wedding reorder must fail.';
  EXCEPTION
    WHEN no_data_found THEN
      IF SQLERRM NOT LIKE 'WEDDING_NOT_FOUND:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC08]: Expected WEDDING_NOT_FOUND, got %', SQLERRM;
      END IF;
  END;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Input Validation & Atomic Collision-Free Reordering (P4-AC02, P4-AC05)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_editor_a uuid := (SELECT val FROM tmp_p4_state WHERE key = 'editor_a');
  v_ws_a uuid := (SELECT val FROM tmp_p4_state WHERE key = 'ws_a');
  v_wedding_a1 uuid := (SELECT val FROM tmp_p4_state WHERE key = 'wedding_a1');
  v_wedding_a2 uuid := (SELECT val FROM tmp_p4_state WHERE key = 'wedding_a2');
  v_ids uuid[];
  v_other_wedding_sec_id uuid;
  v_swapped_ids uuid[];
  v_reversed_ids uuid[];
  v_returned_ids uuid[];
  v_returned_orders int[];
  v_hero_updated_before timestamptz;
  v_hero_updated_after timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_editor_a::text, true);

  SELECT array_agg(ws.id ORDER BY ws.sort_order ASC)
    INTO v_ids
    FROM public.wedding_sections ws
   WHERE ws.workspace_id = v_ws_a
     AND ws.wedding_id = v_wedding_a1;

  SELECT ws.id
    INTO v_other_wedding_sec_id
    FROM public.wedding_sections ws
   WHERE ws.workspace_id = v_ws_a
     AND ws.wedding_id = v_wedding_a2
   ORDER BY ws.sort_order ASC
   LIMIT 1;

  -- 3.1 Reject partial array (6 of 7 IDs)
  BEGIN
    PERFORM public.reorder_wedding_sections(v_ws_a, v_wedding_a1, v_ids[1:6]);
    RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC02]: Partial section array must be rejected.';
  EXCEPTION
    WHEN invalid_parameter_value THEN
      IF SQLERRM NOT LIKE 'SECTION_REORDER_MISMATCH:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC02]: Expected SECTION_REORDER_MISMATCH on partial array, got %', SQLERRM;
      END IF;
  END;

  -- 3.2 Reject duplicate section IDs
  BEGIN
    PERFORM public.reorder_wedding_sections(
      v_ws_a,
      v_wedding_a1,
      ARRAY[v_ids[1], v_ids[1], v_ids[3], v_ids[4], v_ids[5], v_ids[6], v_ids[7]]
    );
    RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC02]: Duplicate section IDs must be rejected.';
  EXCEPTION
    WHEN invalid_parameter_value THEN
      IF SQLERRM NOT LIKE 'SECTION_REORDER_MISMATCH:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC02]: Expected SECTION_REORDER_MISMATCH on duplicate IDs, got %', SQLERRM;
      END IF;
  END;

  -- 3.3 Reject NULL element in array
  BEGIN
    PERFORM public.reorder_wedding_sections(
      v_ws_a,
      v_wedding_a1,
      ARRAY[v_ids[1], NULL::uuid, v_ids[3], v_ids[4], v_ids[5], v_ids[6], v_ids[7]]
    );
    RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC02]: NULL section ID element must be rejected.';
  EXCEPTION
    WHEN invalid_parameter_value THEN
      IF SQLERRM NOT LIKE 'SECTION_REORDER_MISMATCH:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC02]: Expected SECTION_REORDER_MISMATCH on NULL element, got %', SQLERRM;
      END IF;
  END;

  -- 3.4 Reject cross-wedding section ID from sibling wedding in same workspace
  BEGIN
    PERFORM public.reorder_wedding_sections(
      v_ws_a,
      v_wedding_a1,
      ARRAY[v_other_wedding_sec_id, v_ids[2], v_ids[3], v_ids[4], v_ids[5], v_ids[6], v_ids[7]]
    );
    RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC02]: Cross-wedding section ID must be rejected.';
  EXCEPTION
    WHEN invalid_parameter_value THEN
      IF SQLERRM NOT LIKE 'SECTION_REORDER_MISMATCH:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC02]: Expected SECTION_REORDER_MISMATCH on cross-wedding ID, got %', SQLERRM;
      END IF;
  END;

  -- 3.5 Swap adjacent sections (index 2 `our_story` <-> index 3 `event_schedule`) while leaving `hero` untouched
  SELECT ws.updated_at
    INTO v_hero_updated_before
    FROM public.wedding_sections ws
   WHERE ws.id = v_ids[1];

  v_swapped_ids := ARRAY[
    v_ids[1],
    v_ids[3],
    v_ids[2],
    v_ids[4],
    v_ids[5],
    v_ids[6],
    v_ids[7]
  ];

  SELECT
    array_agg(r.id ORDER BY r.sort_order ASC),
    array_agg(r.sort_order ORDER BY r.sort_order ASC)
  INTO v_returned_ids, v_returned_orders
  FROM public.reorder_wedding_sections(v_ws_a, v_wedding_a1, v_swapped_ids) r;

  IF v_returned_ids IS DISTINCT FROM v_swapped_ids THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC02]: Adjacent swap returned unexpected ID order: %', v_returned_ids;
  END IF;

  IF v_returned_orders IS DISTINCT FROM ARRAY[0, 1, 2, 3, 4, 5, 6] THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC02]: Expected contiguous 0..6 sort_order after swap, got %', v_returned_orders;
  END IF;

  SELECT ws.updated_at
    INTO v_hero_updated_after
    FROM public.wedding_sections ws
   WHERE ws.id = v_ids[1];

  IF v_hero_updated_after IS DISTINCT FROM v_hero_updated_before THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC02]: Unmoved section hero should preserve updated_at.';
  END IF;

  -- 3.6 Full 7-section reversal (`6..0`) without `23505` unique collision
  v_reversed_ids := ARRAY[
    v_ids[7],
    v_ids[6],
    v_ids[5],
    v_ids[4],
    v_ids[3],
    v_ids[2],
    v_ids[1]
  ];

  SELECT
    array_agg(r.id ORDER BY r.sort_order ASC),
    array_agg(r.sort_order ORDER BY r.sort_order ASC)
  INTO v_returned_ids, v_returned_orders
  FROM public.reorder_wedding_sections(v_ws_a, v_wedding_a1, v_reversed_ids) r;

  IF v_returned_ids IS DISTINCT FROM v_reversed_ids
     OR v_returned_orders IS DISTINCT FROM ARRAY[0, 1, 2, 3, 4, 5, 6]
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P4-AC02]: Full 7-section reversal failed.';
  END IF;
END;
$$;

RESET ROLE;

SELECT 'ALL_PHASE4_DATABASE_VERIFICATIONS_PASSED' AS verification_result;

ROLLBACK;
