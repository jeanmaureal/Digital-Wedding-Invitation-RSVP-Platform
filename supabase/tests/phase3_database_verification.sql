-- ============================================================================
-- Phase 3 Executable PostgreSQL Design Schema, Seeding, Duplication, RLS & RBAC Suite
-- ============================================================================
-- Execution model:
--   Runs inside a single `BEGIN; ... ROLLBACK;` transaction so zero test rows
--   persist after execution. Any failed check raises an unhandled exception
--   with prefix `ASSERTION_FAILED:` and aborts with a non-zero exit code.
--
-- Covers:
--   - P3-AC01 & P3-AC05: Constraints, indexes, triggers, and full function catalog audit
--   - P3-AC02: Composite FK `(workspace_id, wedding_id)` & 1:1 `wedding_themes` + 7-section parity
--   - P3-AC03: Automatic starter seeding in `create_wedding`, full theme + section cloning in
--              `duplicate_wedding`, and DEFERRABLE `sort_order` uniqueness swap safety
--   - P3-AC04: Multi-tenant RLS isolation (`anon`, User A, User B) & RBAC (`viewer` vs `editor` vs `owner`)
--   - P3-AC06: PostgreSQL JSONB object, byte-cap, and unsafe-payload trigger guards
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Catalog, Privilege, Index & Function Security Audit (P3-AC01, P3-AC05)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_rec record;
  v_expected_indexes text[] := ARRAY[
    'wedding_themes_pkey',
    'wedding_themes_workspace_id_wedding_id_idx',
    'wedding_sections_pkey',
    'wedding_sections_wedding_section_type_key',
    'wedding_sections_wedding_sort_order_key',
    'wedding_sections_workspace_id_wedding_id_sort_idx'
  ];
  v_idx text;
  v_fn_count int;
BEGIN
  -- 1.1 Verify RLS is enabled on every table in `public`
  FOR v_rec IN
    SELECT c.relname, c.relrowsecurity
      FROM pg_catalog.pg_class c
      INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
  LOOP
    IF NOT v_rec.relrowsecurity THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC04]: RLS is NOT enabled on public.%', v_rec.relname;
    END IF;
  END LOOP;

  -- 1.2 Verify `anon` holds zero privileges on `wedding_themes` and `wedding_sections`
  IF pg_catalog.has_any_column_privilege('anon', 'public.wedding_themes', 'SELECT, INSERT, UPDATE')
     OR pg_catalog.has_table_privilege('anon', 'public.wedding_themes', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     OR pg_catalog.has_any_column_privilege('anon', 'public.wedding_sections', 'SELECT, INSERT, UPDATE')
     OR pg_catalog.has_table_privilege('anon', 'public.wedding_sections', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC04]: Role anon must hold zero privileges on wedding_themes and wedding_sections.';
  END IF;

  -- 1.3 Verify exact column-scoped privileges for `authenticated` on `public.wedding_themes`
  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.wedding_themes', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.wedding_themes', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.wedding_themes', 'DELETE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.wedding_themes', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.wedding_themes', 'preset_id', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.wedding_themes', 'schema_version', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.wedding_themes', 'token_overrides', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.wedding_themes', 'wedding_id', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.wedding_themes', 'workspace_id', 'UPDATE')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC02]: Unexpected privileges for authenticated on public.wedding_themes.';
  END IF;

  -- 1.4 Verify exact column-scoped privileges for `authenticated` on `public.wedding_sections`
  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.wedding_sections', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.wedding_sections', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.wedding_sections', 'DELETE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.wedding_sections', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.wedding_sections', 'sort_order', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.wedding_sections', 'is_visible', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.wedding_sections', 'schema_version', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.wedding_sections', 'content', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.wedding_sections', 'id', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.wedding_sections', 'wedding_id', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.wedding_sections', 'workspace_id', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.wedding_sections', 'section_type', 'UPDATE')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC02]: Unexpected privileges for authenticated on public.wedding_sections.';
  END IF;

  -- 1.5 Verify expected Phase 3 indexes exist
  FOREACH v_idx IN ARRAY v_expected_indexes LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_indexes i
       WHERE i.schemaname = 'public'
         AND i.indexname = v_idx
    ) THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC01]: Missing expected index public.%', v_idx;
    END IF;
  END LOOP;

  -- 1.6 Verify zero overload ambiguity on `public.create_wedding` & `public.duplicate_wedding`
  IF (SELECT count(*)::int FROM pg_catalog.pg_proc p INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'create_wedding') <> 1 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC03]: Expected exactly 1 overload of public.create_wedding.';
  END IF;

  IF (SELECT count(*)::int FROM pg_catalog.pg_proc p INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'duplicate_wedding') <> 1 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC03]: Expected exactly 1 overload of public.duplicate_wedding.';
  END IF;

  -- 1.7 Inspect ALL functions across `public` and `app_private` (>= 24 functions)
  SELECT count(*)::int
    INTO v_fn_count
    FROM pg_catalog.pg_proc p
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public', 'app_private');

  IF v_fn_count < 24 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC05]: Expected >= 24 functions in public/app_private, found %', v_fn_count;
  END IF;

  FOR v_rec IN
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname AS fn_name,
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
      RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC05]: Function %.% owner is %, expected postgres.',
        v_rec.schema_name, v_rec.fn_name, v_rec.owner_name;
    END IF;

    IF NOT ('search_path=""' = ANY(v_rec.config_arr) OR 'search_path=' = ANY(v_rec.config_arr)) THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC05]: Function %.% is missing fixed empty search_path.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.acl_text = '' OR v_rec.acl_text LIKE '{=X/%' OR v_rec.acl_text LIKE '%,=X/%' THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC05]: Function %.% retains PUBLIC EXECUTE grant.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.fn_name <> 'health_check' AND v_rec.anon_exec THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC05]: Function %.% must NOT be executable by anon.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.fn_name IN (
      'seed_wedding_design_defaults',
      'normalize_wedding_theme_fields',
      'normalize_wedding_section_fields'
    ) AND v_rec.auth_exec THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC05]: Internal helper/trigger %.% must NOT be executable by authenticated.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- Seed Test Actors & Workspaces
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_p3_state (
  key text PRIMARY KEY,
  val uuid NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON TABLE tmp_p3_state TO authenticated;

DO $$
DECLARE
  v_owner_a constant uuid := '33333333-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_editor_a constant uuid := '33333333-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_viewer_a constant uuid := '33333333-cccc-4ccc-8ccc-ccccccccccc3';
  v_outsider constant uuid := '33333333-dddd-4ddd-8ddd-ddddddddddd4';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner_a, 'p3.owner.a@example.com', '{"full_name":"P3 Owner A"}'::jsonb, now(), now()),
    (v_editor_a, 'p3.editor.a@example.com', '{"full_name":"P3 Editor A"}'::jsonb, now(), now()),
    (v_viewer_a, 'p3.viewer.a@example.com', '{"full_name":"P3 Viewer A"}'::jsonb, now(), now()),
    (v_outsider, 'p3.outsider@example.com', '{"full_name":"P3 Outsider"}'::jsonb, now(), now());

  INSERT INTO tmp_p3_state (key, val) VALUES
    ('owner_a', v_owner_a),
    ('editor_a', v_editor_a),
    ('viewer_a', v_viewer_a),
    ('outsider', v_outsider);
END;
$$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}';

DO $$
DECLARE
  v_ws_a public.workspaces;
BEGIN
  v_ws_a := public.create_workspace('Atelier P3 Alpha', 'atelier-p3-alpha');
  INSERT INTO tmp_p3_state (key, val) VALUES ('ws_a', v_ws_a.id);

  PERFORM public.add_workspace_member_by_email(v_ws_a.id, 'p3.editor.a@example.com', 'editor');
  PERFORM public.add_workspace_member_by_email(v_ws_a.id, 'p3.viewer.a@example.com', 'viewer');
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Starter Seeding, Theme Update, Section Update, DEFERRABLE Sort & Duplication (P3-AC02, P3-AC03, P3-AC06)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_ws_a uuid := (SELECT val FROM tmp_p3_state WHERE key = 'ws_a');
  v_w1 public.weddings;
  v_dup public.weddings;
  v_theme public.wedding_themes;
  v_dup_theme public.wedding_themes;
  v_hero_section public.wedding_sections;
  v_dress_section public.wedding_sections;
  v_dup_hero public.wedding_sections;
  v_sec_count int;
  v_caught text;
BEGIN
  v_w1 := public.create_wedding(
    p_workspace_id := v_ws_a,
    p_title := 'Elena & Mateo Garden Gala',
    p_partner_one_name := 'Elena',
    p_partner_two_name := 'Mateo',
    p_slug := 'elena-mateo-p3-gala',
    p_event_date := DATE '2027-06-19',
    p_venue_name := 'Villa Botanica',
    p_venue_location := 'Tagaytay Highlands',
    p_timezone := 'Asia/Manila',
    p_dress_code := 'Garden Formal'
  );
  INSERT INTO tmp_p3_state (key, val) VALUES ('w1', v_w1.id);

  -- 2.1 Verify 1:1 `wedding_themes` row seeded with `'editorial_ivory'`
  SELECT * INTO v_theme FROM public.wedding_themes WHERE wedding_id = v_w1.id;
  IF NOT FOUND
     OR v_theme.workspace_id <> v_ws_a
     OR v_theme.preset_id <> 'editorial_ivory'
     OR v_theme.schema_version <> 1
     OR v_theme.token_overrides <> '{}'::jsonb
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC03]: Unexpected seeded wedding_themes row: %', v_theme;
  END IF;

  -- 2.2 Verify all 7 registered `wedding_sections` seeded in deterministic order `0..6`
  SELECT count(*)::int INTO v_sec_count FROM public.wedding_sections WHERE wedding_id = v_w1.id;
  IF v_sec_count <> 7 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC03]: Expected 7 seeded wedding_sections, found %', v_sec_count;
  END IF;

  SELECT * INTO v_hero_section
    FROM public.wedding_sections
   WHERE wedding_id = v_w1.id AND section_type = 'hero';

  IF v_hero_section.sort_order <> 0
     OR v_hero_section.is_visible <> true
     OR (v_hero_section.content ->> 'coupleHeadline') <> 'Elena & Mateo'
     OR (v_hero_section.content ->> 'locationSummary') <> 'Tagaytay Highlands'
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC03]: Unexpected seeded hero section: %', v_hero_section;
  END IF;

  SELECT * INTO v_dress_section
    FROM public.wedding_sections
   WHERE wedding_id = v_w1.id AND section_type = 'dress_code';

  IF v_dress_section.is_visible <> true
     OR (v_dress_section.content ->> 'dressCodeTitle') <> 'Garden Formal'
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC03]: Expected dress_code section visible with custom dressCodeTitle: %', v_dress_section;
  END IF;

  -- 2.3 Update theme preset to `'celestial_midnight'` + validated token override
  UPDATE public.wedding_themes
     SET preset_id = 'celestial_midnight',
         token_overrides = '{"primaryAccentHex":"#C8A45D","cornerStyle":"arch"}'::jsonb
   WHERE wedding_id = v_w1.id
  RETURNING * INTO v_theme;

  IF v_theme.preset_id <> 'celestial_midnight' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC04]: Theme preset update failed.';
  END IF;

  -- 2.4 Reject non-object JSONB or `<script` / `javascript:` payloads in PostgreSQL trigger (`22023`)
  v_caught := NULL;
  BEGIN
    UPDATE public.wedding_themes
       SET token_overrides = '["not-an-object"]'::jsonb
     WHERE wedding_id = v_w1.id;
  EXCEPTION
    WHEN SQLSTATE '22023' OR check_violation THEN
      v_caught := SQLERRM;
  END;
  IF v_caught IS NULL THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC06]: Expected non-object token_overrides rejection.';
  END IF;

  v_caught := NULL;
  BEGIN
    UPDATE public.wedding_sections
       SET content = '{"heading":"Bad","mapUrl":"javascript:alert(1)"}'::jsonb
     WHERE id = v_hero_section.id;
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      v_caught := SQLERRM;
  END;
  IF v_caught IS NULL OR v_caught NOT LIKE '%UNSAFE_DESIGN_PAYLOAD%' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC06]: Expected UNSAFE_DESIGN_PAYLOAD on javascript: URI, got %', v_caught;
  END IF;

  -- 2.5 Verify `duplicate_wedding` clones both `wedding_themes` (`celestial_midnight` + overrides) AND `wedding_sections`
  v_dup := public.duplicate_wedding(
    p_workspace_id := v_ws_a,
    p_source_wedding_id := v_w1.id,
    p_title := 'Clara & Julian Midnight Vows',
    p_slug := 'clara-julian-p3-vows',
    p_partner_one_name := 'Clara',
    p_partner_two_name := 'Julian'
  );

  SELECT * INTO v_dup_theme FROM public.wedding_themes WHERE wedding_id = v_dup.id;
  IF v_dup_theme.preset_id <> 'celestial_midnight'
     OR (v_dup_theme.token_overrides ->> 'primaryAccentHex') <> '#C8A45D'
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC03]: duplicate_wedding failed to clone wedding_themes: %', v_dup_theme;
  END IF;

  SELECT * INTO v_dup_hero
    FROM public.wedding_sections
   WHERE wedding_id = v_dup.id AND section_type = 'hero';

  IF (SELECT count(*)::int FROM public.wedding_sections WHERE wedding_id = v_dup.id) <> 7
     OR (v_dup_hero.content ->> 'coupleHeadline') <> 'Clara & Julian'
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC03]: duplicate_wedding failed to clone/refresh wedding_sections: %', v_dup_hero;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. RBAC & Cross-Workspace Isolation (`editor`, `viewer`, `outsider`, `anon`) (P3-AC04)
-- ----------------------------------------------------------------------------
-- 3.1 `editor` CAN update `wedding_themes` and `wedding_sections`
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-bbbb-4bbb-8bbb-bbbbbbbbbbb2","role":"authenticated"}';
DO $$
DECLARE
  v_w1 uuid := (SELECT val FROM tmp_p3_state WHERE key = 'w1');
  v_rows int;
BEGIN
  UPDATE public.wedding_themes
     SET preset_id = 'garden_sage'
   WHERE wedding_id = v_w1;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC04]: Editor failed to update wedding_themes.';
  END IF;

  UPDATE public.wedding_sections
     SET is_visible = true
   WHERE wedding_id = v_w1 AND section_type = 'faq_notes';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC04]: Editor failed to update wedding_sections.';
  END IF;
END;
$$;

-- 3.2 `viewer` can `SELECT`, CANNOT `UPDATE` `wedding_themes` or `wedding_sections`
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-cccc-4ccc-8ccc-ccccccccccc3","role":"authenticated"}';
DO $$
DECLARE
  v_w1 uuid := (SELECT val FROM tmp_p3_state WHERE key = 'w1');
  v_rows int;
BEGIN
  IF (SELECT count(*)::int FROM public.wedding_themes WHERE wedding_id = v_w1) <> 1
     OR (SELECT count(*)::int FROM public.wedding_sections WHERE wedding_id = v_w1) <> 7
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC04]: Viewer could not SELECT wedding design rows.';
  END IF;

  UPDATE public.wedding_themes SET preset_id = 'terracotta_atelier' WHERE wedding_id = v_w1;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC04]: Viewer updated wedding_themes!';
  END IF;

  UPDATE public.wedding_sections SET is_visible = false WHERE wedding_id = v_w1;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC04]: Viewer updated wedding_sections!';
  END IF;
END;
$$;

-- 3.3 `outsider` sees `0` rows and can update `0` rows
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-dddd-4ddd-8ddd-ddddddddddd4","role":"authenticated"}';
DO $$
DECLARE
  v_w1 uuid := (SELECT val FROM tmp_p3_state WHERE key = 'w1');
BEGIN
  IF (SELECT count(*)::int FROM public.wedding_themes) <> 0
     OR (SELECT count(*)::int FROM public.wedding_sections) <> 0
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC04]: Outsider saw cross-workspace design rows!';
  END IF;
END;
$$;

-- 3.4 `anon` receives `42501 insufficient_privilege` on `wedding_themes` & `wedding_sections`
RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{"role":"anon"}';
DO $$
DECLARE
  v_caught text := NULL;
BEGIN
  BEGIN
    PERFORM 1 FROM public.wedding_themes LIMIT 1;
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC04]: Role anon selected from wedding_themes!';
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_caught := SQLERRM;
  END;
  IF v_caught IS NULL THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P3-AC04]: Expected permission denied for anon on wedding_themes.';
  END IF;
END;
$$;

RESET ROLE;

SELECT 'ALL_PHASE3_DATABASE_VERIFICATIONS_PASSED' AS verification_result;

ROLLBACK;
