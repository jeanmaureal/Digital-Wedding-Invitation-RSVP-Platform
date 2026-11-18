-- ============================================================================
-- Phase 2 Executable PostgreSQL Security, RLS, RBAC, Timezone & Isolation Suite
-- ============================================================================
-- Execution model:
--   Runs inside a single `BEGIN; ... ROLLBACK;` transaction so zero test rows
--   persist after execution. Any failed check raises an unhandled exception
--   with prefix `ASSERTION_FAILED:` and aborts with a non-zero exit code.
--
-- Covers:
--   - P2-AC01 & P2-AC08: Constraints, indexes, triggers, and full 21-function catalog audit
--   - P2-AC02: Composite FK `(wedding_id, workspace_id)` & 1:1 `wedding_settings` parity
--   - P2-AC03: Atomic `create_wedding` & `duplicate_wedding`, slug rules, archive sync,
--              and `PUBLISHING_REQUIRES_SNAPSHOT` Phase 2 lifecycle guard
--   - P2-AC04: Multi-tenant cross-workspace RLS isolation (`anon`, User A, User B, User C)
--   - P2-AC05: Workspace RBAC (`owner`, `admin`, `editor`, `viewer`) including editor DELETE block
--   - P2-AC06: Canonical IANA timezone validation & UTC `timestamptz` deadline round-trip
--   - P2-AC07: FK `ON DELETE SET NULL` cleanup on `duplicated_from_wedding_id` & `created_by`
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Catalog, Privilege, Index & 21-Function Security Audit (P2-AC01, P2-AC08)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_rec record;
  v_expected_indexes text[] := ARRAY[
    'weddings_pkey',
    'weddings_slug_key',
    'weddings_workspace_id_id_key',
    'weddings_workspace_id_updated_at_idx',
    'weddings_created_by_idx',
    'weddings_duplicated_from_wedding_id_idx',
    'wedding_settings_pkey',
    'wedding_settings_workspace_id_wedding_id_idx'
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
      RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC04]: RLS is NOT enabled on public.%', v_rec.relname;
    END IF;
  END LOOP;

  -- 1.2 Verify `anon` holds zero privileges on `weddings` and `wedding_settings`
  IF pg_catalog.has_any_column_privilege('anon', 'public.weddings', 'SELECT, INSERT, UPDATE')
     OR pg_catalog.has_table_privilege('anon', 'public.weddings', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     OR pg_catalog.has_any_column_privilege('anon', 'public.wedding_settings', 'SELECT, INSERT, UPDATE')
     OR pg_catalog.has_table_privilege('anon', 'public.wedding_settings', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC04]: Role anon must hold zero privileges on weddings and wedding_settings.';
  END IF;

  -- 1.3 Verify exact table/column privileges for `authenticated` on `public.weddings`
  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.weddings', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.weddings', 'INSERT')
     OR NOT pg_catalog.has_table_privilege('authenticated', 'public.weddings', 'DELETE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.weddings', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.weddings', 'title', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.weddings', 'slug', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.weddings', 'status', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.weddings', 'id', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.weddings', 'workspace_id', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.weddings', 'archived_at', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.weddings', 'duplicated_from_wedding_id', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.weddings', 'created_by', 'UPDATE')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC02]: Unexpected privileges for authenticated on public.weddings.';
  END IF;

  -- 1.4 Verify exact table/column privileges for `authenticated` on `public.wedding_settings`
  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.wedding_settings', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.wedding_settings', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.wedding_settings', 'DELETE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.wedding_settings', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.wedding_settings', 'timezone', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.wedding_settings', 'rsvp_deadline', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.wedding_settings', 'access_mode', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.wedding_settings', 'wedding_id', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.wedding_settings', 'workspace_id', 'UPDATE')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC02]: Unexpected privileges for authenticated on public.wedding_settings.';
  END IF;

  -- 1.5 Verify expected Phase 2 indexes exist
  FOREACH v_idx IN ARRAY v_expected_indexes LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_indexes i
       WHERE i.schemaname = 'public'
         AND i.indexname = v_idx
    ) THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC01]: Missing expected index public.%', v_idx;
    END IF;
  END LOOP;

  -- 1.6 Inspect ALL functions across `public` and `app_private` (Phases 0, 1, and 2 = 21 functions)
  SELECT count(*)::int
    INTO v_fn_count
    FROM pg_catalog.pg_proc p
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public', 'app_private');

  IF v_fn_count < 21 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC08]: Expected >= 21 functions in public/app_private, found %', v_fn_count;
  END IF;

  FOR v_rec IN
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname AS fn_name,
      p.proowner::regrole::text AS owner_name,
      p.prosecdef AS is_secdef,
      COALESCE(p.proconfig, ARRAY[]::text[]) AS config_arr,
      COALESCE(p.proacl::text, '') AS acl_text,
      pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
      pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
    FROM pg_catalog.pg_proc p
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'app_private')
  LOOP
    IF v_rec.owner_name <> 'postgres' THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC08]: Function %.% owner is %, expected postgres.',
        v_rec.schema_name, v_rec.fn_name, v_rec.owner_name;
    END IF;

    IF NOT ('search_path=""' = ANY(v_rec.config_arr) OR 'search_path=' = ANY(v_rec.config_arr)) THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC08]: Function %.% is missing fixed empty search_path.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.acl_text = '' OR v_rec.acl_text LIKE '{=X/%' OR v_rec.acl_text LIKE '%,=X/%' THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC08]: Function %.% retains PUBLIC EXECUTE grant (acl=%).',
        v_rec.schema_name, v_rec.fn_name, v_rec.acl_text;
    END IF;

    IF v_rec.fn_name IN ('create_wedding', 'duplicate_wedding') AND NOT v_rec.is_secdef THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC08]: Function %.% must be SECURITY DEFINER.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.fn_name = 'health_check' AND v_rec.schema_name = 'public' THEN
      IF NOT v_rec.anon_exec OR NOT v_rec.auth_exec THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC08]: public.health_check must remain callable by anon & authenticated.';
      END IF;
    ELSE
      IF v_rec.anon_exec THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC08]: Function %.% must NOT be executable by anon.',
          v_rec.schema_name, v_rec.fn_name;
      END IF;
    END IF;

    IF v_rec.fn_name IN (
      'is_reserved_wedding_slug',
      'assert_valid_iana_timezone',
      'derive_wedding_base_slug',
      'normalize_wedding_fields',
      'normalize_wedding_settings_fields'
    ) AND v_rec.auth_exec THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC08]: Internal helper/trigger %.% must NOT be executable by authenticated.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- Seed Test Actors & Workspaces in Temp State
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_p2_state (
  key text PRIMARY KEY,
  val uuid NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON TABLE tmp_p2_state TO authenticated;

DO $$
DECLARE
  v_user_a constant uuid := '22222222-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_user_b constant uuid := '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_user_c constant uuid := '22222222-cccc-4ccc-8ccc-ccccccccccc3';
  v_user_editor constant uuid := '22222222-dddd-4ddd-8ddd-ddddddddddd4';
  v_user_viewer constant uuid := '22222222-eeee-4eee-8eee-eeeeeeeeeee5';
  v_user_admin constant uuid := '22222222-ffff-4fff-8fff-fffffffffff6';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_user_a, 'p2.owner.a@example.com', '{"full_name":"Owner A"}'::jsonb, now(), now()),
    (v_user_b, 'p2.owner.b@example.com', '{"full_name":"Owner B"}'::jsonb, now(), now()),
    (v_user_c, 'p2.multi.c@example.com', '{"full_name":"Multi Member C"}'::jsonb, now(), now()),
    (v_user_editor, 'p2.editor.a@example.com', '{"full_name":"Editor A"}'::jsonb, now(), now()),
    (v_user_viewer, 'p2.viewer.a@example.com', '{"full_name":"Viewer A"}'::jsonb, now(), now()),
    (v_user_admin, 'p2.admin.a@example.com', '{"full_name":"Admin A"}'::jsonb, now(), now());

  INSERT INTO tmp_p2_state (key, val) VALUES
    ('user_a', v_user_a),
    ('user_b', v_user_b),
    ('user_c', v_user_c),
    ('user_editor', v_user_editor),
    ('user_viewer', v_user_viewer),
    ('user_admin', v_user_admin);
END;
$$;

-- User A creates Workspace A and adds Admin, Editor, Viewer, and Multi-Member C
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}';

DO $$
DECLARE
  v_ws_a public.workspaces;
BEGIN
  v_ws_a := public.create_workspace('Atelier Lumiere', 'atelier-lumiere-p2');
  INSERT INTO tmp_p2_state (key, val) VALUES ('ws_a', v_ws_a.id);

  PERFORM public.add_workspace_member_by_email(v_ws_a.id, 'p2.admin.a@example.com', 'admin');
  PERFORM public.add_workspace_member_by_email(v_ws_a.id, 'p2.editor.a@example.com', 'editor');
  PERFORM public.add_workspace_member_by_email(v_ws_a.id, 'p2.viewer.a@example.com', 'viewer');
  PERFORM public.add_workspace_member_by_email(v_ws_a.id, 'p2.multi.c@example.com', 'editor');
END;
$$;

-- User B creates Workspace B and adds Multi-Member C as editor
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2","role":"authenticated"}';

DO $$
DECLARE
  v_ws_b public.workspaces;
BEGIN
  v_ws_b := public.create_workspace('Harbor Events', 'harbor-events-p2');
  INSERT INTO tmp_p2_state (key, val) VALUES ('ws_b', v_ws_b.id);

  PERFORM public.add_workspace_member_by_email(v_ws_b.id, 'p2.multi.c@example.com', 'editor');
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Creation, 1:1 Settings, Slugs, Lifecycle & Timezone Validation (P2-AC02, P2-AC03, P2-AC06)
-- ----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}';

DO $$
DECLARE
  v_ws_a uuid := (SELECT val FROM tmp_p2_state WHERE key = 'ws_a');
  v_w1 public.weddings;
  v_w2 public.weddings;
  v_dup public.weddings;
  v_settings public.wedding_settings;
  v_caught text;
BEGIN
  -- 2.1 Create Wedding 1 with explicit slug, IANA timezone (`Asia/Manila`), and UTC RSVP deadline
  v_w1 := public.create_wedding(
    p_workspace_id := v_ws_a,
    p_title := '  Elena & Mateo Celebration  ',
    p_partner_one_name := '  Elena  ',
    p_partner_two_name := '  Mateo  ',
    p_slug := '  ELENA-AND-MATEO-2027  ',
    p_event_date := DATE '2027-06-19',
    p_venue_name := '  San Agustin Church  ',
    p_venue_location := '  Intramuros, Manila  ',
    p_timezone := 'Asia/Manila',
    p_rsvp_deadline := TIMESTAMPTZ '2027-05-15T15:59:00Z',
    p_access_mode := 'invite_only',
    p_is_rsvp_open := true,
    p_allow_plus_ones_default := true,
    p_show_guest_dietary_notes := true,
    p_primary_locale := 'en-PH',
    p_contact_email := '  RSVP.ELENA@EXAMPLE.COM  ',
    p_dress_code := '  Formal Filipiniana  ',
    p_rsvp_confirmation_message := '  Salamat! We cannot wait to celebrate with you.  '
  );

  INSERT INTO tmp_p2_state (key, val) VALUES ('w_a1', v_w1.id);

  IF v_w1.title <> 'Elena & Mateo Celebration'
     OR v_w1.partner_one_name <> 'Elena'
     OR v_w1.partner_two_name <> 'Mateo'
     OR v_w1.slug <> 'elena-and-mateo-2027'
     OR v_w1.status <> 'draft'
     OR v_w1.archived_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC03]: Unexpected normalized fields on created wedding: %', v_w1;
  END IF;

  SELECT *
    INTO v_settings
    FROM public.wedding_settings ws
   WHERE ws.wedding_id = v_w1.id;

  IF NOT FOUND
     OR v_settings.workspace_id <> v_ws_a
     OR v_settings.timezone <> 'Asia/Manila'
     OR v_settings.rsvp_deadline <> TIMESTAMPTZ '2027-05-15T15:59:00Z'
     OR v_settings.access_mode <> 'invite_only'
     OR v_settings.allow_plus_ones_default <> true
     OR v_settings.contact_email <> 'rsvp.elena@example.com'
     OR v_settings.dress_code <> 'Formal Filipiniana'
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC02/AC06]: Unexpected 1:1 wedding_settings row: %', v_settings;
  END IF;

  -- 2.2 Explicit slug collision raises `23505 WEDDING_SLUG_TAKEN`
  v_caught := NULL;
  BEGIN
    PERFORM public.create_wedding(
      p_workspace_id := v_ws_a,
      p_title := 'Another Elena & Mateo',
      p_partner_one_name := 'Elena',
      p_partner_two_name := 'Mateo',
      p_slug := 'elena-and-mateo-2027'
    );
  EXCEPTION
    WHEN SQLSTATE '23505' THEN
      v_caught := SQLERRM;
  END;
  IF v_caught IS NULL OR v_caught NOT LIKE '%WEDDING_SLUG_TAKEN%' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC03]: Expected 23505 WEDDING_SLUG_TAKEN, got %', v_caught;
  END IF;

  -- 2.3 Reserved slug raises `22023 RESERVED_WEDDING_SLUG`
  v_caught := NULL;
  BEGIN
    PERFORM public.create_wedding(
      p_workspace_id := v_ws_a,
      p_title := 'Reserved Slug Test',
      p_partner_one_name := 'Ava',
      p_partner_two_name := 'Liam',
      p_slug := 'settings'
    );
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      v_caught := SQLERRM;
  END;
  IF v_caught IS NULL OR v_caught NOT LIKE '%RESERVED_WEDDING_SLUG%' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC03]: Expected RESERVED_WEDDING_SLUG, got %', v_caught;
  END IF;

  -- 2.4 Auto-slug generation + collision retry suffix
  v_w2 := public.create_wedding(
    p_workspace_id := v_ws_a,
    p_title := 'Sofia & Lucas Garden Vows',
    p_partner_one_name := 'Sofia',
    p_partner_two_name := 'Lucas',
    p_slug := NULL,
    p_timezone := 'America/Argentina/Buenos_Aires'
  );
  IF v_w2.slug <> 'sofia-lucas' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC03]: Expected base auto-slug sofia-lucas, got %', v_w2.slug;
  END IF;
  INSERT INTO tmp_p2_state (key, val) VALUES ('w_a2', v_w2.id);

  -- Second auto-slug with identical partner names allocates a 6-char hex suffix
  v_dup := public.create_wedding(
    p_workspace_id := v_ws_a,
    p_title := 'Sofia & Lucas Evening Gala',
    p_partner_one_name := 'Sofia',
    p_partner_two_name := 'Lucas',
    p_slug := NULL,
    p_timezone := 'UTC'
  );
  IF v_dup.slug !~ '^sofia-lucas-[a-f0-9]{6}$' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC03]: Expected suffixed auto-slug, got %', v_dup.slug;
  END IF;

  -- 2.5 Reject invalid / offset / abbreviation timezones (`22023 INVALID_TIMEZONE`)
  FOREACH v_caught IN ARRAY ARRAY['Invalid/Zone', 'GMT+8', '+08:00', 'EST', 'localtime'] LOOP
    BEGIN
      UPDATE public.wedding_settings
         SET timezone = v_caught
       WHERE wedding_id = v_w1.id;
      RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC06]: Invalid timezone "%" was unexpectedly accepted!', v_caught;
    EXCEPTION
      WHEN SQLSTATE '22023' THEN
        IF SQLERRM NOT LIKE '%INVALID_TIMEZONE%' THEN
          RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC06]: Expected INVALID_TIMEZONE for "%", got %', v_caught, SQLERRM;
        END IF;
    END;
  END LOOP;

  -- 2.6 Lifecycle: `draft -> archived -> draft` synchronizes `archived_at`; `published` blocked in Phase 2
  UPDATE public.weddings
     SET status = 'archived'
   WHERE id = v_w1.id
  RETURNING * INTO v_w1;

  IF v_w1.status <> 'archived' OR v_w1.archived_at IS NULL THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC03]: Archiving wedding failed to populate archived_at.';
  END IF;

  -- Duplicate an archived wedding -> duplicate starts fresh in `draft` with `rsvp_deadline = NULL`
  v_dup := public.duplicate_wedding(
    p_workspace_id := v_ws_a,
    p_source_wedding_id := v_w1.id,
    p_title := 'Copy of Elena & Mateo Celebration',
    p_slug := NULL,
    p_partner_one_name := 'Clara',
    p_partner_two_name := 'Julian',
    p_event_date := DATE '2027-10-09'
  );
  INSERT INTO tmp_p2_state (key, val) VALUES ('w_a_dup', v_dup.id);

  IF v_dup.status <> 'draft'
     OR v_dup.archived_at IS NOT NULL
     OR v_dup.duplicated_from_wedding_id <> v_w1.id
     OR v_dup.partner_one_name <> 'Clara'
     OR v_dup.partner_two_name <> 'Julian'
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC03]: Unexpected duplicated wedding fields: %', v_dup;
  END IF;

  SELECT *
    INTO v_settings
    FROM public.wedding_settings ws
   WHERE ws.wedding_id = v_dup.id;

  IF v_settings.timezone <> 'Asia/Manila'
     OR v_settings.access_mode <> 'invite_only'
     OR v_settings.rsvp_deadline IS NOT NULL
     OR v_settings.is_rsvp_open <> true
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC03]: Duplicated wedding_settings did not clone/reset cleanly: %', v_settings;
  END IF;

  -- Restore archived source wedding back to `draft`
  UPDATE public.weddings
     SET status = 'draft'
   WHERE id = v_w1.id
  RETURNING * INTO v_w1;

  IF v_w1.status <> 'draft' OR v_w1.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC03]: Restoring wedding to draft failed to clear archived_at.';
  END IF;

  -- Transition to `published` is blocked in Phase 2 (`P0001 PUBLISHING_REQUIRES_SNAPSHOT`)
  v_caught := NULL;
  BEGIN
    UPDATE public.weddings
       SET status = 'published'
     WHERE id = v_w1.id;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      v_caught := SQLERRM;
  END;
  IF v_caught IS NULL OR v_caught NOT LIKE '%PUBLISHING_REQUIRES_SNAPSHOT%' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC03]: Expected PUBLISHING_REQUIRES_SNAPSHOT, got %', v_caught;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Composite FK Cross-Workspace Linkage Impossible Even for Superuser (P2-AC02)
-- ----------------------------------------------------------------------------
RESET ROLE;

DO $$
DECLARE
  v_ws_b uuid := (SELECT val FROM tmp_p2_state WHERE key = 'ws_b');
  v_w_a1 uuid := (SELECT val FROM tmp_p2_state WHERE key = 'w_a1');
  v_caught text := NULL;
BEGIN
  -- Attempt to bypass application logic as superuser by inserting/repointing settings
  -- for Workspace A's wedding with Workspace B's workspace_id -> rejected by trigger/FK!
  BEGIN
    INSERT INTO public.weddings (id, workspace_id, title, partner_one_name, partner_two_name, slug)
    VALUES ('33333333-3333-4333-8333-333333333333', v_ws_b, 'Harbor Vows', 'Nora', 'Theo', 'harbor-vows-2027');

    INSERT INTO public.wedding_settings (wedding_id, workspace_id, timezone)
    VALUES ('33333333-3333-4333-8333-333333333333', (SELECT val FROM tmp_p2_state WHERE key = 'ws_a'), 'UTC');
  EXCEPTION
    WHEN foreign_key_violation THEN
      v_caught := SQLERRM;
  END;

  IF v_caught IS NULL THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC02]: Composite FK failed to reject mismatched (wedding_id, workspace_id)!';
  END IF;

  DELETE FROM public.weddings WHERE id = '33333333-3333-4333-8333-333333333333';
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Multi-Tenant Cross-Workspace RLS Isolation & `anon` Zero Access (P2-AC04)
-- ----------------------------------------------------------------------------
-- User B creates a wedding in Workspace B
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2","role":"authenticated"}';

DO $$
DECLARE
  v_ws_a uuid := (SELECT val FROM tmp_p2_state WHERE key = 'ws_a');
  v_ws_b uuid := (SELECT val FROM tmp_p2_state WHERE key = 'ws_b');
  v_w_a1 uuid := (SELECT val FROM tmp_p2_state WHERE key = 'w_a1');
  v_w_b1 public.weddings;
  v_visible_count int;
  v_updated_count int;
  v_caught text;
BEGIN
  v_w_b1 := public.create_wedding(
    p_workspace_id := v_ws_b,
    p_title := 'Harbor Sunset Wedding',
    p_partner_one_name := 'Maya',
    p_partner_two_name := 'Noah',
    p_slug := 'maya-and-noah-harbor',
    p_timezone := 'America/New_York'
  );
  INSERT INTO tmp_p2_state (key, val) VALUES ('w_b1', v_w_b1.id);

  -- Cross-workspace slug uniqueness holds globally (`23505 WEDDING_SLUG_TAKEN` without leaking Workspace A data)
  v_caught := NULL;
  BEGIN
    PERFORM public.create_wedding(
      p_workspace_id := v_ws_b,
      p_title := 'Cross Workspace Collision',
      p_partner_one_name := 'Elena',
      p_partner_two_name := 'Mateo',
      p_slug := 'elena-and-mateo-2027'
    );
  EXCEPTION
    WHEN SQLSTATE '23505' THEN
      v_caught := SQLERRM;
  END;
  IF v_caught IS NULL OR v_caught NOT LIKE '%WEDDING_SLUG_TAKEN%' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC03]: Expected global WEDDING_SLUG_TAKEN, got %', v_caught;
  END IF;

  -- User B sees ONLY Workspace B's 1 wedding & 1 settings row
  SELECT count(*)::int INTO v_visible_count FROM public.weddings;
  IF v_visible_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC04]: User B expected 1 visible wedding, saw %', v_visible_count;
  END IF;

  SELECT count(*)::int INTO v_visible_count FROM public.wedding_settings;
  IF v_visible_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC04]: User B expected 1 visible wedding_settings row, saw %', v_visible_count;
  END IF;

  -- User B cannot UPDATE or DELETE Workspace A's wedding or settings
  UPDATE public.weddings SET title = 'Hijacked' WHERE id = v_w_a1;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC04]: User B updated Workspace A wedding!';
  END IF;

  DELETE FROM public.weddings WHERE id = v_w_a1;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC04]: User B deleted Workspace A wedding!';
  END IF;

  -- User B cannot create or duplicate inside Workspace A
  v_caught := NULL;
  BEGIN
    PERFORM public.create_wedding(v_ws_a, 'Unauthorized', 'A', 'B');
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_caught := SQLERRM;
  END;
  IF v_caught IS NULL OR v_caught NOT LIKE '%WORKSPACE_ACCESS_DENIED%' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC04]: Expected WORKSPACE_ACCESS_DENIED for User B on Workspace A.';
  END IF;
END;
$$;

-- Multi-Workspace User C cannot duplicate a wedding across workspaces (`Workspace A -> Workspace B`)
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-cccc-4ccc-8ccc-ccccccccccc3","role":"authenticated"}';

DO $$
DECLARE
  v_ws_a uuid := (SELECT val FROM tmp_p2_state WHERE key = 'ws_a');
  v_ws_b uuid := (SELECT val FROM tmp_p2_state WHERE key = 'ws_b');
  v_w_a1 uuid := (SELECT val FROM tmp_p2_state WHERE key = 'w_a1');
  v_caught text := NULL;
BEGIN
  IF (SELECT count(*)::int FROM public.weddings WHERE workspace_id = v_ws_a) <> 4
     OR (SELECT count(*)::int FROM public.weddings WHERE workspace_id = v_ws_b) <> 1
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC04]: User C expected visibility into both joined workspaces.';
  END IF;

  BEGIN
    PERFORM public.duplicate_wedding(
      p_workspace_id := v_ws_b,
      p_source_wedding_id := v_w_a1,
      p_title := 'Cross Workspace Exfiltration Attempt'
    );
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN
      v_caught := SQLERRM;
  END;

  IF v_caught IS NULL OR v_caught NOT LIKE '%WEDDING_NOT_FOUND%' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC04]: Expected P0002 WEDDING_NOT_FOUND on cross-workspace duplicate, got %', v_caught;
  END IF;
END;
$$;

-- Remove User C from Workspace A -> instant revocation of Workspace A weddings while Workspace B remains accessible
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}';
SELECT public.remove_workspace_member(
  (SELECT val FROM tmp_p2_state WHERE key = 'ws_a'),
  (SELECT val FROM tmp_p2_state WHERE key = 'user_c')
);

SET LOCAL "request.jwt.claims" = '{"sub":"22222222-cccc-4ccc-8ccc-ccccccccccc3","role":"authenticated"}';
DO $$
DECLARE
  v_ws_a uuid := (SELECT val FROM tmp_p2_state WHERE key = 'ws_a');
  v_ws_b uuid := (SELECT val FROM tmp_p2_state WHERE key = 'ws_b');
BEGIN
  IF (SELECT count(*)::int FROM public.weddings WHERE workspace_id = v_ws_a) <> 0
     OR (SELECT count(*)::int FROM public.wedding_settings WHERE workspace_id = v_ws_a) <> 0
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC04]: Removed member User C still sees Workspace A weddings!';
  END IF;

  IF (SELECT count(*)::int FROM public.weddings WHERE workspace_id = v_ws_b) <> 1 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC04]: User C lost access to Workspace B weddings!';
  END IF;
END;
$$;

-- Verify `anon` cannot read or call organizer RPCs
RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{"role":"anon"}';

DO $$
DECLARE
  v_caught text := NULL;
BEGIN
  BEGIN
    PERFORM 1 FROM public.weddings LIMIT 1;
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC04]: Role anon was allowed to SELECT from public.weddings!';
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_caught := SQLERRM;
  END;
  IF v_caught IS NULL THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC04]: Expected permission denied for anon on public.weddings.';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Workspace RBAC Matrix: `viewer` vs `editor` vs `admin` vs `owner` (P2-AC05)
-- ----------------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;

-- 5.1 `viewer` is strictly read-only
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-eeee-4eee-8eee-eeeeeeeeeee5","role":"authenticated"}';
DO $$
DECLARE
  v_ws_a uuid := (SELECT val FROM tmp_p2_state WHERE key = 'ws_a');
  v_w_a1 uuid := (SELECT val FROM tmp_p2_state WHERE key = 'w_a1');
  v_rows int;
  v_caught text;
BEGIN
  IF (SELECT count(*)::int FROM public.weddings WHERE workspace_id = v_ws_a) <> 4 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC05]: Viewer could not read workspace weddings.';
  END IF;

  v_caught := NULL;
  BEGIN
    PERFORM public.create_wedding(v_ws_a, 'Viewer Wedding', 'A', 'B');
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_caught := SQLERRM;
  END;
  IF v_caught IS NULL OR v_caught NOT LIKE '%INSUFFICIENT_WORKSPACE_ROLE%' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC05]: Viewer create_wedding was not blocked cleanly (%).', v_caught;
  END IF;

  v_caught := NULL;
  BEGIN
    PERFORM public.duplicate_wedding(v_ws_a, v_w_a1, 'Viewer Duplicate');
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_caught := SQLERRM;
  END;
  IF v_caught IS NULL OR v_caught NOT LIKE '%INSUFFICIENT_WORKSPACE_ROLE%' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC05]: Viewer duplicate_wedding was not blocked cleanly (%).', v_caught;
  END IF;

  UPDATE public.weddings SET title = 'Viewer Edit' WHERE id = v_w_a1;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC05]: Viewer updated public.weddings!';
  END IF;

  UPDATE public.wedding_settings SET dress_code = 'Casual' WHERE wedding_id = v_w_a1;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC05]: Viewer updated public.wedding_settings!';
  END IF;

  DELETE FROM public.weddings WHERE id = v_w_a1;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC05]: Viewer deleted public.weddings!';
  END IF;
END;
$$;

-- 5.2 `editor` can create, duplicate, update details/settings & archive, but CANNOT permanently DELETE
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-dddd-4ddd-8ddd-ddddddddddd4","role":"authenticated"}';
DO $$
DECLARE
  v_ws_a uuid := (SELECT val FROM tmp_p2_state WHERE key = 'ws_a');
  v_editor_w public.weddings;
  v_rows int;
BEGIN
  v_editor_w := public.create_wedding(
    p_workspace_id := v_ws_a,
    p_title := 'Editor Managed Wedding',
    p_partner_one_name := 'Hannah',
    p_partner_two_name := 'Owen',
    p_timezone := 'Europe/London'
  );
  INSERT INTO tmp_p2_state (key, val) VALUES ('w_editor', v_editor_w.id);

  UPDATE public.weddings SET venue_name = 'Kew Gardens', status = 'archived' WHERE id = v_editor_w.id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC05]: Editor failed to update/archive wedding.';
  END IF;

  UPDATE public.wedding_settings SET allow_plus_ones_default = true WHERE wedding_id = v_editor_w.id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC05]: Editor failed to update wedding_settings.';
  END IF;

  -- Editor permanent DELETE must affect 0 rows
  DELETE FROM public.weddings WHERE id = v_editor_w.id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC05]: Editor must NOT be able to permanently delete a wedding!';
  END IF;
END;
$$;

-- 5.3 `admin` CAN permanently delete a wedding, cascading to `wedding_settings`
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-ffff-4fff-8fff-fffffffffff6","role":"authenticated"}';
DO $$
DECLARE
  v_w_editor uuid := (SELECT val FROM tmp_p2_state WHERE key = 'w_editor');
  v_rows int;
BEGIN
  DELETE FROM public.weddings WHERE id = v_w_editor;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC05]: Workspace admin failed to delete wedding.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.wedding_settings WHERE wedding_id = v_w_editor) THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC02]: Deleting wedding did not cascade to wedding_settings.';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. FK `ON DELETE SET NULL` Cleanup on Provenance & Creator Columns (P2-AC07)
-- ----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}';
DO $$
DECLARE
  v_ws_a uuid := (SELECT val FROM tmp_p2_state WHERE key = 'ws_a');
  v_user_admin uuid := (SELECT val FROM tmp_p2_state WHERE key = 'user_admin');
  v_w_a1 uuid := (SELECT val FROM tmp_p2_state WHERE key = 'w_a1');
  v_w_dup uuid := (SELECT val FROM tmp_p2_state WHERE key = 'w_a_dup');
BEGIN
  -- 6.1 Delete source wedding `w_a1` -> `w_a_dup.duplicated_from_wedding_id` cleanly becomes NULL
  DELETE FROM public.weddings WHERE id = v_w_a1;

  IF (SELECT duplicated_from_wedding_id FROM public.weddings WHERE id = v_w_dup) IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC07]: Expected duplicated_from_wedding_id to become NULL on source deletion.';
  END IF;

  -- 6.2 Promote `user_admin` to co-owner so `user_a` can delete their auth.users account
  PERFORM public.update_workspace_member_role(v_ws_a, v_user_admin, 'owner');
END;
$$;

RESET ROLE;
DO $$
DECLARE
  v_user_a uuid := (SELECT val FROM tmp_p2_state WHERE key = 'user_a');
  v_w_dup uuid := (SELECT val FROM tmp_p2_state WHERE key = 'w_a_dup');
BEGIN
  DELETE FROM auth.users WHERE id = v_user_a;

  IF (SELECT created_by FROM public.weddings WHERE id = v_w_dup) IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P2-AC07]: Expected weddings.created_by to become NULL after creator account deletion.';
  END IF;
END;
$$;

SELECT 'ALL_PHASE2_DATABASE_VERIFICATIONS_PASSED' AS verification_result;

ROLLBACK;
