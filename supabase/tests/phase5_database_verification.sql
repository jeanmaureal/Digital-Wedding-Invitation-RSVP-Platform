-- ============================================================================
-- Phase 5 Executable PostgreSQL Publishing, Snapshot Immutability & Gate 4 Suite
-- ============================================================================
-- Execution model:
--   Runs inside a single `BEGIN; ... ROLLBACK;` transaction so zero test rows
--   persist after execution. Any failed check raises an unhandled exception
--   with prefix `ASSERTION_FAILED:` and aborts with a non-zero exit code.
--
-- Covers:
--   - P5-AC01 & P5-AC02: `published_versions` constraints, indexes, RLS, zero `anon`
--     table privileges, `PUBLISHING_REQUIRES_SNAPSHOT` guard, and strict snapshot
--     immutability (`IMMUTABLE_PUBLISHED_SNAPSHOT`), including `ON DELETE SET NULL`
--     safety on `published_by`.
--   - P5-AC03: `publish_wedding` (`v1`, `v2`), `unpublish_wedding`, archived-wedding
--     guard (`ARCHIVED_WEDDING_CANNOT_PUBLISH`), 0-visible-sections guard
--     (`NO_VISIBLE_SECTIONS_TO_PUBLISH`), and RBAC (`viewer`, outsider, `anon`).
--   - P5-AC04 & P5-AC05 (Gate 4): `get_public_wedding_by_slug` serves active `public`
--     snapshots without internal UUIDs, isolates post-publish draft mutations until
--     republished, enforces `invite_only` privacy immediately, and hides unpublished
--     or archived weddings (`unavailable`).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Catalog, Table Privilege, Index & Function Security Audit (P5-AC01, P5-AC04)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_rec record;
  v_expected_indexes text[] := ARRAY[
    'published_versions_pkey',
    'published_versions_wedding_version_number_key',
    'published_versions_workspace_id_wedding_id_version_idx',
    'published_versions_one_active_per_wedding_idx',
    'published_versions_published_by_idx'
  ];
  v_idx text;
  v_fn_count int;
BEGIN
  -- 1.1 Verify RLS enabled on every `public` table including `published_versions`
  FOR v_rec IN
    SELECT c.relname, c.relrowsecurity
      FROM pg_catalog.pg_class c
      INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
  LOOP
    IF NOT v_rec.relrowsecurity THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC01]: RLS is NOT enabled on public.%', v_rec.relname;
    END IF;
  END LOOP;

  -- 1.2 Verify `anon` holds ZERO privileges on `published_versions` and all organizer tables
  IF pg_catalog.has_any_column_privilege('anon', 'public.published_versions', 'SELECT, INSERT, UPDATE')
     OR pg_catalog.has_table_privilege('anon', 'public.published_versions', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC04]: Role anon must hold zero privileges on public.published_versions.';
  END IF;

  -- 1.3 Verify `authenticated` holds SELECT ONLY on `public.published_versions` (zero direct INSERT/UPDATE/DELETE)
  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.published_versions', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.published_versions', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.published_versions', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.published_versions', 'DELETE')
     OR pg_catalog.has_any_column_privilege('authenticated', 'public.published_versions', 'INSERT, UPDATE')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC02]: Role authenticated must hold SELECT-only table privileges on public.published_versions.';
  END IF;

  -- 1.4 Verify expected Phase 5 indexes exist
  FOREACH v_idx IN ARRAY v_expected_indexes LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_indexes i
       WHERE i.schemaname = 'public'
         AND i.indexname = v_idx
    ) THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC01]: Missing expected index public.%', v_idx;
    END IF;
  END LOOP;

  -- 1.5 Audit all functions across `public` and `app_private` (>= 30 functions)
  SELECT count(*)::int
    INTO v_fn_count
    FROM pg_catalog.pg_proc p
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public', 'app_private');

  IF v_fn_count < 30 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC01]: Expected >= 30 functions in public/app_private, found %', v_fn_count;
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
      RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC01]: Function %.% owner is %, expected postgres.',
        v_rec.schema_name, v_rec.fn_name, v_rec.owner_name;
    END IF;

    IF NOT ('search_path=""' = ANY(v_rec.config_arr) OR 'search_path=' = ANY(v_rec.config_arr)) THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC01]: Function %.% is missing fixed empty search_path.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.acl_text = '' OR v_rec.acl_text LIKE '{=X/%' OR v_rec.acl_text LIKE '%,=X/%' THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC01]: Function %.% retains PUBLIC EXECUTE grant.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    -- Only `health_check` and `get_public_wedding_by_slug` may be executable by `anon`
    IF v_rec.fn_name NOT IN ('health_check', 'get_public_wedding_by_slug') AND v_rec.anon_exec THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC04]: Function %.% must NOT be executable by anon.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.fn_name = 'get_public_wedding_by_slug' THEN
      IF v_rec.volatility <> 's' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC04]: get_public_wedding_by_slug must be STABLE (read-only).';
      END IF;
      IF NOT v_rec.anon_exec OR NOT v_rec.auth_exec THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC04]: get_public_wedding_by_slug must be executable by anon and authenticated.';
      END IF;
    END IF;

    IF v_rec.fn_name IN (
      'enforce_published_version_immutability',
      'deactivate_snapshots_on_wedding_unpublish'
    ) AND v_rec.auth_exec THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC02]: Trigger function %.% must NOT be executable by authenticated.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- Seed Ephemeral Test Actors, Workspaces & Weddings
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_p5_state (
  key text PRIMARY KEY,
  val uuid NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON TABLE tmp_p5_state TO authenticated;

DO $$
DECLARE
  v_owner_a constant uuid := '55555555-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_editor_a constant uuid := '55555555-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_viewer_a constant uuid := '55555555-cccc-4ccc-8ccc-ccccccccccc3';
  v_outsider constant uuid := '55555555-dddd-4ddd-8ddd-ddddddddddd4';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner_a, 'p5.owner.a@example.com', '{"full_name":"P5 Owner A"}'::jsonb, now(), now()),
    (v_editor_a, 'p5.editor.a@example.com', '{"full_name":"P5 Editor A"}'::jsonb, now(), now()),
    (v_viewer_a, 'p5.viewer.a@example.com', '{"full_name":"P5 Viewer A"}'::jsonb, now(), now()),
    (v_outsider, 'p5.outsider@example.com', '{"full_name":"P5 Outsider"}'::jsonb, now(), now());

  INSERT INTO tmp_p5_state (key, val) VALUES
    ('owner_a', v_owner_a),
    ('editor_a', v_editor_a),
    ('viewer_a', v_viewer_a),
    ('outsider', v_outsider);
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_owner_a uuid := (SELECT val FROM tmp_p5_state WHERE key = 'owner_a');
  v_ws_a public.workspaces;
  v_wedding public.weddings;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);

  v_ws_a := public.create_workspace('P5 Studio A', 'p5-studio-a');
  PERFORM public.add_workspace_member_by_email(v_ws_a.id, 'p5.editor.a@example.com', 'editor');
  PERFORM public.add_workspace_member_by_email(v_ws_a.id, 'p5.viewer.a@example.com', 'viewer');

  v_wedding := public.create_wedding(
    v_ws_a.id,
    'Elena & Mateo Celebration',
    'Elena',
    'Mateo',
    'p5-elena-mateo',
    DATE '2027-06-19',
    'Villa Aurelia',
    'Tagaytay',
    'Asia/Manila'
  );

  INSERT INTO tmp_p5_state (key, val) VALUES
    ('ws_a', v_ws_a.id),
    ('wedding_a', v_wedding.id);
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. RBAC, Guards & Unpublished Isolation (`anon`, `viewer`, Outsider, Direct Update)
-- ----------------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE anon;

DO $$
DECLARE
  v_res jsonb;
BEGIN
  -- 2.1 `anon` denied `publish_wedding` & `unpublish_wedding`
  BEGIN
    PERFORM public.publish_wedding(
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid
    );
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC03]: Role anon must not execute publish_wedding.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.unpublish_wedding(
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid
    );
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC03]: Role anon must not execute unpublish_wedding.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- 2.2 `anon` gets `invalid_slug` on malformed input (without echoing raw input) & `unavailable` on draft wedding
  v_res := public.get_public_wedding_by_slug('INVALID_SLUG!!');
  IF v_res ->> 'status' <> 'invalid_slug' OR v_res::text LIKE '%INVALID_SLUG%' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC05]: Unexpected malformed slug response: %', v_res;
  END IF;

  v_res := public.get_public_wedding_by_slug('p5-elena-mateo');
  IF v_res IS DISTINCT FROM '{"status":"unavailable"}'::jsonb THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC04]: Draft wedding must return unavailable to anon, got %', v_res;
  END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_owner_a uuid := (SELECT val FROM tmp_p5_state WHERE key = 'owner_a');
  v_viewer_a uuid := (SELECT val FROM tmp_p5_state WHERE key = 'viewer_a');
  v_outsider uuid := (SELECT val FROM tmp_p5_state WHERE key = 'outsider');
  v_ws_a uuid := (SELECT val FROM tmp_p5_state WHERE key = 'ws_a');
  v_wedding_a uuid := (SELECT val FROM tmp_p5_state WHERE key = 'wedding_a');
BEGIN
  -- 2.3 Direct `UPDATE public.weddings SET status = 'published'` without snapshot still fails
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);

  BEGIN
    UPDATE public.weddings
       SET status = 'published'::public.wedding_status
     WHERE id = v_wedding_a;
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC02]: Direct status=published without active snapshot must fail.';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'PUBLISHING_REQUIRES_SNAPSHOT:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC02]: Expected PUBLISHING_REQUIRES_SNAPSHOT, got %', SQLERRM;
      END IF;
  END;

  -- 2.4 `viewer` blocked from `publish_wedding`
  PERFORM set_config('request.jwt.claim.sub', v_viewer_a::text, true);
  BEGIN
    PERFORM public.publish_wedding(v_ws_a, v_wedding_a);
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC03]: Viewer must not publish weddings.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE 'INSUFFICIENT_WORKSPACE_ROLE:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC03]: Expected INSUFFICIENT_WORKSPACE_ROLE, got %', SQLERRM;
      END IF;
  END;

  -- 2.5 Outsider blocked from `publish_wedding`
  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  BEGIN
    PERFORM public.publish_wedding(v_ws_a, v_wedding_a);
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC03]: Outsider must not publish weddings.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE 'WORKSPACE_ACCESS_DENIED:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC03]: Expected WORKSPACE_ACCESS_DENIED, got %', SQLERRM;
      END IF;
  END;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Publish v1 -> Draft Isolation -> Republish v2 -> Invite-Only -> Unpublish & Archive
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_editor_a uuid := (SELECT val FROM tmp_p5_state WHERE key = 'editor_a');
  v_ws_a uuid := (SELECT val FROM tmp_p5_state WHERE key = 'ws_a');
  v_wedding_a uuid := (SELECT val FROM tmp_p5_state WHERE key = 'wedding_a');
  v_pub_v1 public.published_versions;
  v_pub_v2 public.published_versions;
  v_public_res jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_editor_a::text, true);

  -- 3.1 Guard: 0 visible sections cannot publish
  UPDATE public.wedding_sections
     SET is_visible = false
   WHERE workspace_id = v_ws_a
     AND wedding_id = v_wedding_a;

  BEGIN
    PERFORM public.publish_wedding(v_ws_a, v_wedding_a);
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC03]: Publishing with 0 visible sections must fail.';
  EXCEPTION
    WHEN invalid_parameter_value THEN
      IF SQLERRM NOT LIKE 'NO_VISIBLE_SECTIONS_TO_PUBLISH:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC03]: Expected NO_VISIBLE_SECTIONS_TO_PUBLISH, got %', SQLERRM;
      END IF;
  END;

  -- Re-enable hero & story -> publish v1
  UPDATE public.wedding_sections
     SET is_visible = true
   WHERE workspace_id = v_ws_a
     AND wedding_id = v_wedding_a
     AND section_type IN ('hero'::public.wedding_section_type, 'our_story'::public.wedding_section_type);

  v_pub_v1 := public.publish_wedding(v_ws_a, v_wedding_a);
  IF v_pub_v1.version_number <> 1 OR NOT v_pub_v1.is_active THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC03]: Expected v1 active, got version=% active=%',
      v_pub_v1.version_number, v_pub_v1.is_active;
  END IF;

  INSERT INTO tmp_p5_state (key, val) VALUES ('pub_v1', v_pub_v1.id);

  -- 3.2 Mutate draft wedding title & hero headline AFTER publishing v1 (without republishing)
  UPDATE public.weddings
     SET title = 'Elena & Mateo Draft v2 Unreleased'
   WHERE id = v_wedding_a;

  UPDATE public.wedding_sections
     SET content = jsonb_set(content, '{coupleHeadline}', '"Unreleased Draft Headline"'::jsonb)
   WHERE workspace_id = v_ws_a
     AND wedding_id = v_wedding_a
     AND section_type = 'hero'::public.wedding_section_type;

  -- Public lookup MUST still serve v1 ("Elena & Mateo Celebration") and zero internal UUIDs
  v_public_res := public.get_public_wedding_by_slug('p5-elena-mateo');
  IF v_public_res ->> 'status' <> 'published'
     OR (v_public_res ->> 'versionNumber')::int <> 1
     OR v_public_res #>> '{snapshot,wedding,title}' <> 'Elena & Mateo Celebration'
     OR v_public_res ? 'workspace_id'
     OR v_public_res ? 'wedding_id'
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC04]: Draft edits leaked or unexpected v1 payload: %', v_public_res;
  END IF;

  -- 3.3 Republish -> creates v2, deactivates v1, serves new draft content
  v_pub_v2 := public.publish_wedding(v_ws_a, v_wedding_a);
  IF v_pub_v2.version_number <> 2 OR NOT v_pub_v2.is_active THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC03]: Expected v2 active, got %', v_pub_v2.version_number;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.published_versions pv WHERE pv.id = v_pub_v1.id AND pv.is_active = true
  ) THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC02]: v1 must be marked is_active = false when v2 publishes.';
  END IF;

  v_public_res := public.get_public_wedding_by_slug('p5-elena-mateo');
  IF (v_public_res ->> 'versionNumber')::int <> 2
     OR v_public_res #>> '{snapshot,wedding,title}' <> 'Elena & Mateo Draft v2 Unreleased'
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC04]: Expected v2 snapshot after republish, got %', v_public_res;
  END IF;

  -- 3.4 Switch live `wedding_settings.access_mode` to `invite_only` -> immediate privacy lock!
  UPDATE public.wedding_settings
     SET access_mode = 'invite_only'::public.wedding_access_mode
   WHERE workspace_id = v_ws_a
     AND wedding_id = v_wedding_a;

  v_public_res := public.get_public_wedding_by_slug('p5-elena-mateo');
  IF v_public_res IS DISTINCT FROM '{"status":"invite_only"}'::jsonb THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC05]: invite_only wedding must return invite_only without snapshot, got %', v_public_res;
  END IF;

  -- Restore `public` access_mode -> unpublish -> returns `unavailable` while keeping v1 + v2 history
  UPDATE public.wedding_settings
     SET access_mode = 'public'::public.wedding_access_mode
   WHERE workspace_id = v_ws_a
     AND wedding_id = v_wedding_a;

  PERFORM public.unpublish_wedding(v_ws_a, v_wedding_a);
  v_public_res := public.get_public_wedding_by_slug('p5-elena-mateo');
  IF v_public_res IS DISTINCT FROM '{"status":"unavailable"}'::jsonb THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC05]: Unpublished wedding must return unavailable, got %', v_public_res;
  END IF;

  IF (SELECT count(*)::int FROM public.published_versions pv WHERE pv.wedding_id = v_wedding_a) <> 2 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC02]: Unpublishing must preserve historical published_versions rows.';
  END IF;

  -- 3.5 Republish v3 -> archive wedding -> auto-deactivates active snapshot & blocks publishing while archived
  PERFORM public.publish_wedding(v_ws_a, v_wedding_a);
  UPDATE public.weddings
     SET status = 'archived'::public.wedding_status
   WHERE id = v_wedding_a;

  IF EXISTS (
    SELECT 1 FROM public.published_versions pv WHERE pv.wedding_id = v_wedding_a AND pv.is_active = true
  ) THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC02]: Archiving a published wedding must deactivate active snapshots.';
  END IF;

  BEGIN
    PERFORM public.publish_wedding(v_ws_a, v_wedding_a);
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC03]: Archived wedding must not publish.';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'ARCHIVED_WEDDING_CANNOT_PUBLISH:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC03]: Expected ARCHIVED_WEDDING_CANNOT_PUBLISH, got %', SQLERRM;
      END IF;
  END;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Superuser Snapshot Immutability & `ON DELETE SET NULL` Verification (P5-AC02)
-- ----------------------------------------------------------------------------
RESET ROLE;

DO $$
DECLARE
  v_pub_v1 uuid := (SELECT val FROM tmp_p5_state WHERE key = 'pub_v1');
  v_editor_a uuid := (SELECT val FROM tmp_p5_state WHERE key = 'editor_a');
BEGIN
  -- 4.1 Even superuser/table-owner cannot mutate `content_snapshot` or `version_number`
  BEGIN
    UPDATE public.published_versions
       SET content_snapshot = '{"tampered":true}'::jsonb
     WHERE id = v_pub_v1;
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC02]: Mutating published_versions.content_snapshot must fail.';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'IMMUTABLE_PUBLISHED_SNAPSHOT:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC02]: Expected IMMUTABLE_PUBLISHED_SNAPSHOT, got %', SQLERRM;
      END IF;
  END;

  -- 4.2 Deleting the non-owner `editor_a` user cleanly sets `published_by = NULL` on `published_versions`
  DELETE FROM auth.users WHERE id = v_editor_a;

  IF (SELECT pv.published_by FROM public.published_versions pv WHERE pv.id = v_pub_v1) IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P5-AC02]: Expected published_by to become NULL on auth.users deletion.';
  END IF;
END;
$$;

SELECT 'ALL_PHASE5_DATABASE_VERIFICATIONS_PASSED' AS verification_result;

ROLLBACK;
