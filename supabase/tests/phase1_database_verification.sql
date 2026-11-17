-- ============================================================================
-- Phase 1 Executable PostgreSQL Security, RLS, RBAC & Invariant Test Suite
-- ============================================================================
-- Execution model:
--   Runs inside a single `BEGIN; ... ROLLBACK;` transaction so zero test rows
--   persist after execution. Any failed check raises an unhandled exception
--   with prefix `ASSERTION_FAILED:` and aborts the script with non-zero exit.
--
-- Covers:
--   - P1-AC01: Constraints, indexes, triggers, and schema completeness
--   - P1-AC02: `auth.users` profile sync, normalization & null/invalid email rejection
--   - P1-AC03: Atomic `create_workspace`, auto-slug retry, explicit slug 23505, direct INSERT denial
--   - P1-AC04: Multi-user cross-workspace RLS isolation (`anon`, User A, User B, User C, User D)
--   - P1-AC05: RBAC hierarchy (`owner`, `admin`, `editor`, `viewer`) & immutable membership identity
--   - P1-AC11: Sole-owner `auth.users` deletion block + success after transfer / workspace delete
--   - P1-AC13: Complete `pg_proc` / `pg_namespace` / `pg_class` owner, search_path & privilege audit
--   - P1-AC15: Self-only `public.profiles` RLS & `list_workspace_members` co-member email masking
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Catalog, Schema, Table, Column & Function Security Audit (P1-AC01, P1-AC13)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_rec record;
  v_expected_indexes text[] := ARRAY[
    'profiles_pkey',
    'profiles_email_idx',
    'workspaces_pkey',
    'workspaces_slug_key',
    'workspaces_created_by_idx',
    'workspace_members_pkey',
    'workspace_members_workspace_user_key',
    'workspace_members_user_id_idx',
    'workspace_members_workspace_id_role_idx',
    'workspace_members_invited_by_idx'
  ];
  v_idx text;
  v_fn_count int;
BEGIN
  -- 1.1 Verify `postgres` role has `rolbypassrls` and required `auth.users` privileges
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = 'postgres' AND r.rolbypassrls = true
  ) THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC13]: Expected role postgres to have rolbypassrls = true.';
  END IF;

  IF NOT pg_catalog.has_table_privilege('postgres', 'auth.users', 'SELECT, UPDATE, TRIGGER, REFERENCES') THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC13]: Role postgres lacks required privileges on auth.users.';
  END IF;

  -- 1.2 Verify schema CREATE / USAGE lockdown on `public` and `app_private`
  IF pg_catalog.has_schema_privilege('anon', 'public', 'CREATE')
     OR pg_catalog.has_schema_privilege('authenticated', 'public', 'CREATE')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC13]: Untrusted API role retains CREATE on schema public.';
  END IF;

  IF pg_catalog.has_schema_privilege('anon', 'app_private', 'USAGE')
     OR pg_catalog.has_schema_privilege('anon', 'app_private', 'CREATE')
     OR pg_catalog.has_schema_privilege('authenticated', 'app_private', 'CREATE')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC13]: Invalid schema privileges detected on app_private.';
  END IF;

  IF NOT pg_catalog.has_schema_privilege('authenticated', 'app_private', 'USAGE') THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC13]: Role authenticated requires USAGE on app_private for RLS helpers.';
  END IF;

  -- 1.3 Verify RLS is enabled on every table in `public`
  FOR v_rec IN
    SELECT c.relname, c.relrowsecurity
      FROM pg_catalog.pg_class c
      INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
  LOOP
    IF NOT v_rec.relrowsecurity THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC04]: RLS is NOT enabled on public.%', v_rec.relname;
    END IF;
  END LOOP;

  -- 1.4 Verify `anon` has zero table privileges on Phase 1 tables
  IF pg_catalog.has_any_column_privilege('anon', 'public.profiles', 'SELECT, INSERT, UPDATE')
     OR pg_catalog.has_table_privilege('anon', 'public.profiles', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     OR pg_catalog.has_any_column_privilege('anon', 'public.workspaces', 'SELECT, INSERT, UPDATE')
     OR pg_catalog.has_table_privilege('anon', 'public.workspaces', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     OR pg_catalog.has_any_column_privilege('anon', 'public.workspace_members', 'SELECT, INSERT, UPDATE')
     OR pg_catalog.has_table_privilege('anon', 'public.workspace_members', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC04]: Role anon must hold zero privileges on organizer tables.';
  END IF;

  -- 1.5 Verify exact `authenticated` table & column privileges
  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'DELETE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC02]: Unexpected privileges for authenticated on public.profiles.';
  END IF;

  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.workspaces', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.workspaces', 'INSERT')
     OR NOT pg_catalog.has_table_privilege('authenticated', 'public.workspaces', 'DELETE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.workspaces', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.workspaces', 'name', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.workspaces', 'slug', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.workspaces', 'created_by', 'UPDATE')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC03]: Unexpected privileges for authenticated on public.workspaces.';
  END IF;

  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.workspace_members', 'SELECT')
     OR pg_catalog.has_any_column_privilege('authenticated', 'public.workspace_members', 'INSERT, UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.workspace_members', 'INSERT, UPDATE, DELETE')
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC05]: Unexpected privileges for authenticated on public.workspace_members.';
  END IF;

  -- 1.6 Verify expected indexes exist
  FOREACH v_idx IN ARRAY v_expected_indexes LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_indexes i
       WHERE i.schemaname = 'public'
         AND i.indexname = v_idx
    ) THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC01]: Missing expected index public.%', v_idx;
    END IF;
  END LOOP;

  -- 1.7 Inspect ALL functions in `public` and `app_private` (including Phase 0 functions)
  SELECT count(*)::int
    INTO v_fn_count
    FROM pg_catalog.pg_proc p
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public', 'app_private');

  IF v_fn_count < 14 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC13]: Expected >= 14 functions in public/app_private, found %', v_fn_count;
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
      RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC13]: Function %.% owner is %, expected postgres.',
        v_rec.schema_name, v_rec.fn_name, v_rec.owner_name;
    END IF;

    IF NOT ('search_path=""' = ANY(v_rec.config_arr) OR 'search_path=' = ANY(v_rec.config_arr)) THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC13]: Function %.% is missing fixed empty search_path (proconfig=%).',
        v_rec.schema_name, v_rec.fn_name, v_rec.config_arr;
    END IF;

    -- Check for PUBLIC grant (`{=X/` or `,=X/` in proacl, or empty proacl default PUBLIC grant)
    IF v_rec.acl_text = '' OR v_rec.acl_text LIKE '{=X/%' OR v_rec.acl_text LIKE '%,=X/%' THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC13]: Function %.% retains PUBLIC EXECUTE grant (acl=%).',
        v_rec.schema_name, v_rec.fn_name, v_rec.acl_text;
    END IF;

    -- Check SECURITY DEFINER expectations
    IF v_rec.fn_name IN (
      'handle_new_user',
      'handle_auth_user_updated',
      'prevent_sole_workspace_owner_user_delete',
      'user_workspace_ids',
      'user_workspace_ids_with_roles',
      'create_workspace',
      'list_workspace_members',
      'add_workspace_member_by_email',
      'update_workspace_member_role',
      'remove_workspace_member'
    ) AND NOT v_rec.is_secdef THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC13]: Function %.% must be SECURITY DEFINER.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    -- Check `anon` EXECUTE (permitted ONLY on `public.health_check`)
    IF v_rec.fn_name = 'health_check' AND v_rec.schema_name = 'public' THEN
      IF NOT v_rec.anon_exec OR NOT v_rec.auth_exec THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC13]: public.health_check must remain callable by anon & authenticated.';
      END IF;
    ELSE
      IF v_rec.anon_exec THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC13]: Function %.% must NOT be executable by anon.',
          v_rec.schema_name, v_rec.fn_name;
      END IF;
    END IF;

    -- Check trigger functions have ZERO API execution grants (`authenticated` = false)
    IF v_rec.fn_name IN (
      'set_updated_at',
      'normalize_profile_fields',
      'normalize_workspace_fields',
      'enforce_workspace_member_immutable_identity',
      'handle_new_user',
      'handle_auth_user_updated',
      'prevent_sole_workspace_owner_user_delete'
    ) AND v_rec.auth_exec THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC13]: Trigger function %.% must NOT be executable by authenticated.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Seed Test Users & Verify Profile Sync + Null/Invalid Email Guard (P1-AC02)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_user_a constant uuid := '11111111-1111-4111-8111-111111111111';
  v_user_b constant uuid := '22222222-2222-4222-8222-222222222222';
  v_user_c constant uuid := '33333333-3333-4333-8333-333333333333';
  v_user_d constant uuid := '44444444-4444-4444-8444-444444444444';
  v_user_e constant uuid := '55555555-5555-4555-8555-555555555555';
  v_user_bad constant uuid := '99999999-9999-4999-8999-999999999999';
  v_profile public.profiles;
BEGIN
  -- 2.1 Reject NULL email on `auth.users` insert
  BEGIN
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (v_user_bad, NULL, '{}'::jsonb, now(), now());
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC02]: Expected NULL auth.users.email insert to be rejected.';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      IF SQLERRM NOT LIKE 'PROFILE_EMAIL_REQUIRED:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC02]: Unexpected error message on NULL email: %', SQLERRM;
      END IF;
  END;

  -- 2.2 Reject blank/malformed email on `auth.users` insert
  BEGIN
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (v_user_bad, '   ', '{}'::jsonb, now(), now());
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC02]: Expected blank auth.users.email insert to be rejected.';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      NULL;
  END;

  -- 2.3 Insert valid test organizers with mixed-case / whitespace-padded fields
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_user_a, '  Alice.Owner@Example.COM  ', '{"full_name":"  Alice Monroe  ","role":"owner"}'::jsonb, now(), now()),
    (v_user_b, 'Bob.Owner@Example.com', '{"full_name":"Bob Sterling"}'::jsonb, now(), now()),
    (v_user_c, 'Clara.Member@Example.com', '{"full_name":"Clara Chen"}'::jsonb, now(), now()),
    (v_user_d, 'David.Admin@Example.com', '{"full_name":"David Park"}'::jsonb, now(), now()),
    (v_user_e, 'Eva.Viewer@Example.com', '{"full_name":"Eva Rossi"}'::jsonb, now(), now());

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_a;
  IF v_profile.email <> 'alice.owner@example.com' OR v_profile.full_name <> 'Alice Monroe' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC02]: Profile normalization failed: email=%, full_name=%',
      v_profile.email, v_profile.full_name;
  END IF;

  -- 2.4 Verify `auth.users` email update syncs & rejects NULL update
  UPDATE auth.users SET email = '  ALICE.UPDATED@Example.COM ' WHERE id = v_user_a;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_a;
  IF v_profile.email <> 'alice.updated@example.com' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC02]: Email update trigger failed: %', v_profile.email;
  END IF;

  BEGIN
    UPDATE auth.users SET email = NULL WHERE id = v_user_a;
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC02]: Expected NULL email update on auth.users to fail.';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      NULL;
  END;

  -- Restore User A email for predictable downstream tests
  UPDATE auth.users SET email = 'alice.owner@example.com' WHERE id = v_user_a;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. `anon` Denial, Self-Only `profiles` RLS & Column Protection (P1-AC02, P1-AC04)
-- ----------------------------------------------------------------------------
SAVEPOINT sp_anon_check;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{"role":"anon"}';

DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.profiles LIMIT 1;
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC04]: anon was able to SELECT from public.profiles.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM 1 FROM public.workspaces LIMIT 1;
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC04]: anon was able to SELECT from public.workspaces.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.create_workspace('Anon Attempt', NULL);
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC04]: anon was able to EXECUTE create_workspace.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

ROLLBACK TO SAVEPOINT sp_anon_check;
RESET ROLE;

-- Verify authenticated profile self-only visibility & column-level UPDATE protection
SAVEPOINT sp_profile_rls;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_visible_profiles int;
  v_updated_name text;
BEGIN
  SELECT count(*)::int INTO v_visible_profiles FROM public.profiles;
  IF v_visible_profiles <> 1 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC15]: Expected User A to see exactly 1 profile row, saw %.', v_visible_profiles;
  END IF;

  UPDATE public.profiles
     SET full_name = '  Alice Updated Monroe  '
   WHERE id = '11111111-1111-4111-8111-111111111111'
   RETURNING full_name INTO v_updated_name;

  IF v_updated_name <> 'Alice Updated Monroe' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC02]: Expected trimmed full_name update, got %.', v_updated_name;
  END IF;

  BEGIN
    EXECUTE $sql$
      UPDATE public.profiles
         SET email = 'spoofed@example.com'
       WHERE id = '11111111-1111-4111-8111-111111111111'
    $sql$;
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC02]: Authenticated user mutated profiles.email.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;

-- ----------------------------------------------------------------------------
-- 4. Atomic Workspace Creation, Slug Collisions & Multi-User Isolation (P1-AC03, P1-AC04)
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_phase1_ids (
  ws_a_id uuid,
  ws_b_id uuid,
  ws_c_id uuid
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON TABLE tmp_phase1_ids TO authenticated;

-- 4.1 User A creates Workspace A; verify direct INSERT is denied
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_ws_a public.workspaces;
  v_owner_role public.workspace_role;
BEGIN
  BEGIN
    EXECUTE $sql$
      INSERT INTO public.workspaces (name, slug) VALUES ('Direct Bypass', 'direct-bypass')
    $sql$;
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC03]: Direct INSERT into public.workspaces succeeded.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  v_ws_a := public.create_workspace('  John & Jane Studio  ', NULL);
  IF v_ws_a.name <> 'John & Jane Studio' OR v_ws_a.slug <> 'john-jane-studio' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC03]: Unexpected Workspace A fields: name=%, slug=%',
      v_ws_a.name, v_ws_a.slug;
  END IF;

  SELECT wm.role INTO v_owner_role
    FROM public.workspace_members wm
   WHERE wm.workspace_id = v_ws_a.id
     AND wm.user_id = '11111111-1111-4111-8111-111111111111';

  IF v_owner_role <> 'owner' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC03]: Creator was not assigned owner role.';
  END IF;

  INSERT INTO tmp_phase1_ids (ws_a_id) VALUES (v_ws_a.id);
END;
$$;

-- 4.2 User B creates Workspace B with auto-slug collision (`John & Jane Studio`) and tests explicit collision
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

DO $$
DECLARE
  v_ws_b public.workspaces;
BEGIN
  -- Explicit duplicate slug must fail with 23505 WORKSPACE_SLUG_TAKEN (never silently modified)
  BEGIN
    PERFORM public.create_workspace('Explicit Collision', 'john-jane-studio');
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC03]: Explicit slug collision did not fail.';
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM NOT LIKE 'WORKSPACE_SLUG_TAKEN:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC03]: Expected WORKSPACE_SLUG_TAKEN prefix, got %', SQLERRM;
      END IF;
  END;

  -- Auto-generated slug collision must succeed with `-<6-hex>` suffix
  v_ws_b := public.create_workspace('John & Jane Studio', NULL);
  IF v_ws_b.slug !~ '^john-jane-studio-[a-f0-9]{6}$' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC03]: Auto-collision slug format unexpected: %', v_ws_b.slug;
  END IF;

  UPDATE tmp_phase1_ids SET ws_b_id = v_ws_b.id;
END;
$$;

-- 4.3 User D creates unrelated Workspace C
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';

DO $$
DECLARE
  v_ws_c public.workspaces;
BEGIN
  v_ws_c := public.create_workspace('Unrelated Workspace C', 'unrelated-workspace-c');
  UPDATE tmp_phase1_ids SET ws_c_id = v_ws_c.id;
END;
$$;

-- 4.4 Add User C (`Clara`) to BOTH Workspace A (as editor) and Workspace B (as viewer)
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
DO $$
DECLARE
  v_ids record;
BEGIN
  SELECT * INTO v_ids FROM tmp_phase1_ids;
  PERFORM public.add_workspace_member_by_email(v_ids.ws_a_id, '  CLARA.MEMBER@example.com ', 'editor');
END;
$$;

SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
DO $$
DECLARE
  v_ids record;
BEGIN
  SELECT * INTO v_ids FROM tmp_phase1_ids;
  PERFORM public.add_workspace_member_by_email(v_ids.ws_b_id, 'clara.member@example.com', 'viewer');
END;
$$;

-- 4.5 Verify 6-point cross-workspace RLS matrix (P1-AC04)
-- Check 1: User A sees ONLY Workspace A (cannot read/update/delete B or C)
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
DO $$
DECLARE
  v_ids record;
  v_seen uuid[];
  v_rows int;
BEGIN
  SELECT * INTO v_ids FROM tmp_phase1_ids;
  SELECT array_agg(id) INTO v_seen FROM public.workspaces;
  IF v_seen IS DISTINCT FROM ARRAY[v_ids.ws_a_id] THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC04]: User A expected only Workspace A, saw %', v_seen;
  END IF;

  UPDATE public.workspaces SET name = 'Tampered B' WHERE id = v_ids.ws_b_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC04]: User A updated Workspace B.';
  END IF;

  DELETE FROM public.workspaces WHERE id = v_ids.ws_b_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC04]: User A deleted Workspace B.';
  END IF;
END;
$$;

-- Check 2: User B sees ONLY Workspace B
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
DO $$
DECLARE
  v_ids record;
  v_seen uuid[];
BEGIN
  SELECT * INTO v_ids FROM tmp_phase1_ids;
  SELECT array_agg(id) INTO v_seen FROM public.workspaces;
  IF v_seen IS DISTINCT FROM ARRAY[v_ids.ws_b_id] THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC04]: User B expected only Workspace B, saw %', v_seen;
  END IF;
END;
$$;

-- Check 3 & 4: User C sees Workspace A & B, and CANNOT see unrelated Workspace C
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
DO $$
DECLARE
  v_ids record;
  v_count int;
BEGIN
  SELECT * INTO v_ids FROM tmp_phase1_ids;
  SELECT count(*)::int INTO v_count
    FROM public.workspaces
   WHERE id IN (v_ids.ws_a_id, v_ids.ws_b_id);
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC04]: User C should see both Workspace A and B.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.workspaces WHERE id = v_ids.ws_c_id) THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC04]: User C accessed unrelated Workspace C.';
  END IF;
END;
$$;

-- Check 5 & 6: Remove User C from Workspace A -> immediately loses A while retaining B
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
DO $$
DECLARE
  v_ids record;
BEGIN
  SELECT * INTO v_ids FROM tmp_phase1_ids;
  PERFORM public.remove_workspace_member(v_ids.ws_a_id, '33333333-3333-4333-8333-333333333333');
END;
$$;

SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
DO $$
DECLARE
  v_ids record;
  v_seen uuid[];
BEGIN
  SELECT * INTO v_ids FROM tmp_phase1_ids;
  SELECT array_agg(id) INTO v_seen FROM public.workspaces;
  IF v_seen IS DISTINCT FROM ARRAY[v_ids.ws_b_id] THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC04]: After removal from A, User C expected only Workspace B, saw %', v_seen;
  END IF;

  BEGIN
    PERFORM 1 FROM public.list_workspace_members(v_ids.ws_a_id);
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC04]: Removed User C still listed members of Workspace A.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. RBAC Hierarchy, Email Privacy & Immutable Membership Identity (P1-AC05, P1-AC15)
-- ----------------------------------------------------------------------------
-- Populate Workspace A with all 4 roles:
--   User A = owner, User D = admin, User C = editor, User E = viewer
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
DO $$
DECLARE
  v_ids record;
BEGIN
  SELECT * INTO v_ids FROM tmp_phase1_ids;
  PERFORM public.add_workspace_member_by_email(v_ids.ws_a_id, 'david.admin@example.com', 'admin');
  PERFORM public.add_workspace_member_by_email(v_ids.ws_a_id, 'clara.member@example.com', 'editor');
  PERFORM public.add_workspace_member_by_email(v_ids.ws_a_id, 'eva.viewer@example.com', 'viewer');

  -- Unregistered email must fail with P0002 ORGANIZER_NOT_REGISTERED
  BEGIN
    PERFORM public.add_workspace_member_by_email(v_ids.ws_a_id, 'unregistered@example.com', 'viewer');
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC05]: Unregistered organizer email did not fail.';
  EXCEPTION
    WHEN sqlstate 'P0002' THEN
      IF SQLERRM NOT LIKE 'ORGANIZER_NOT_REGISTERED:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC05]: Expected ORGANIZER_NOT_REGISTERED, got %', SQLERRM;
      END IF;
  END;

  -- Sole owner cannot demote or remove self
  BEGIN
    PERFORM public.update_workspace_member_role(v_ids.ws_a_id, '11111111-1111-4111-8111-111111111111', 'admin');
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC05]: Sole owner demoted self.';
  EXCEPTION
    WHEN sqlstate 'P0001' THEN
      IF SQLERRM NOT LIKE 'LAST_WORKSPACE_OWNER_REQUIRED:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC05]: Expected LAST_WORKSPACE_OWNER_REQUIRED, got %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM public.remove_workspace_member(v_ids.ws_a_id, '11111111-1111-4111-8111-111111111111');
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC05]: Sole owner removed self.';
  EXCEPTION
    WHEN sqlstate 'P0001' THEN NULL;
  END;
END;
$$;

-- 5.1 Test `admin` (User D) permissions & limits
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
DO $$
DECLARE
  v_ids record;
  v_rows int;
BEGIN
  SELECT * INTO v_ids FROM tmp_phase1_ids;

  -- Admin CAN update workspace name
  UPDATE public.workspaces SET name = 'John & Jane Updated by Admin' WHERE id = v_ids.ws_a_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC05]: Admin failed to update workspace name.';
  END IF;

  -- Admin CANNOT delete workspace
  DELETE FROM public.workspaces WHERE id = v_ids.ws_a_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC05]: Admin deleted workspace.';
  END IF;

  -- Admin CAN update editor <-> viewer
  PERFORM public.update_workspace_member_role(v_ids.ws_a_id, '55555555-5555-4555-8555-555555555555', 'editor');
  PERFORM public.update_workspace_member_role(v_ids.ws_a_id, '55555555-5555-4555-8555-555555555555', 'viewer');

  -- Admin CANNOT promote anyone to admin or owner, nor modify an owner/admin
  BEGIN
    PERFORM public.update_workspace_member_role(v_ids.ws_a_id, '33333333-3333-4333-8333-333333333333', 'admin');
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC05]: Admin promoted editor to admin.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.add_workspace_member_by_email(v_ids.ws_a_id, 'bob.owner@example.com', 'owner');
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC05]: Admin added an owner.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.remove_workspace_member(v_ids.ws_a_id, '11111111-1111-4111-8111-111111111111');
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC05]: Admin removed workspace owner.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

-- 5.2 Test `editor` (User C) and `viewer` (User E) limits
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
DO $$
DECLARE
  v_ids record;
  v_rows int;
BEGIN
  SELECT * INTO v_ids FROM tmp_phase1_ids;

  UPDATE public.workspaces SET name = 'Editor Edit Attempt' WHERE id = v_ids.ws_a_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC05]: Editor modified workspace settings.';
  END IF;

  BEGIN
    PERFORM public.update_workspace_member_role(v_ids.ws_a_id, '55555555-5555-4555-8555-555555555555', 'editor');
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC05]: Editor changed member role.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

-- 5.3 Verify `list_workspace_members` Email Privacy Policy across all 4 roles (P1-AC15)
-- Owner (User A): sees all 4 emails
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
DO $$
DECLARE
  v_ids record;
  v_non_null_emails int;
BEGIN
  SELECT * INTO v_ids FROM tmp_phase1_ids;
  SELECT count(email)::int INTO v_non_null_emails FROM public.list_workspace_members(v_ids.ws_a_id);
  IF v_non_null_emails <> 4 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC15]: Owner expected 4 visible emails, got %.', v_non_null_emails;
  END IF;
END;
$$;

-- Admin (User D): sees all 4 emails
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
DO $$
DECLARE
  v_ids record;
  v_non_null_emails int;
BEGIN
  SELECT * INTO v_ids FROM tmp_phase1_ids;
  SELECT count(email)::int INTO v_non_null_emails FROM public.list_workspace_members(v_ids.ws_a_id);
  IF v_non_null_emails <> 4 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC15]: Admin expected 4 visible emails, got %.', v_non_null_emails;
  END IF;
END;
$$;

-- Editor (User C): sees ONLY own email (1 non-null, 3 NULL), while seeing all 4 names
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
DO $$
DECLARE
  v_ids record;
  v_total int;
  v_non_null_emails int;
  v_own_email text;
BEGIN
  SELECT * INTO v_ids FROM tmp_phase1_ids;
  SELECT count(*)::int, count(email)::int
    INTO v_total, v_non_null_emails
    FROM public.list_workspace_members(v_ids.ws_a_id);

  SELECT email INTO v_own_email
    FROM public.list_workspace_members(v_ids.ws_a_id)
   WHERE user_id = '33333333-3333-4333-8333-333333333333';

  IF v_total <> 4 OR v_non_null_emails <> 1 OR v_own_email <> 'clara.member@example.com' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC15]: Editor email masking failed: total=%, non_null=%, own=%',
      v_total, v_non_null_emails, v_own_email;
  END IF;
END;
$$;

-- Viewer (User E): sees ONLY own email (1 non-null, 3 NULL)
SET LOCAL "request.jwt.claims" = '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
DO $$
DECLARE
  v_ids record;
  v_non_null_emails int;
  v_own_email text;
BEGIN
  SELECT * INTO v_ids FROM tmp_phase1_ids;
  SELECT count(email)::int INTO v_non_null_emails FROM public.list_workspace_members(v_ids.ws_a_id);
  SELECT email INTO v_own_email
    FROM public.list_workspace_members(v_ids.ws_a_id)
   WHERE user_id = '55555555-5555-4555-8555-555555555555';

  IF v_non_null_emails <> 1 OR v_own_email <> 'eva.viewer@example.com' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC15]: Viewer email masking failed: non_null=%, own=%',
      v_non_null_emails, v_own_email;
  END IF;
END;
$$;

RESET ROLE;

-- 5.4 Verify immutable membership identity trigger even under `postgres` (P1-AC05)
DO $$
DECLARE
  v_ids record;
BEGIN
  SELECT * INTO v_ids FROM tmp_phase1_ids;
  BEGIN
    UPDATE public.workspace_members
       SET user_id = '22222222-2222-4222-8222-222222222222'
     WHERE workspace_id = v_ids.ws_a_id
       AND user_id = '55555555-5555-4555-8555-555555555555';
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC05]: Reassigned workspace_members.user_id despite immutability trigger.';
  EXCEPTION
    WHEN sqlstate 'P0001' THEN
      IF SQLERRM NOT LIKE 'IMMUTABLE_MEMBERSHIP_IDENTITY:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC05]: Expected IMMUTABLE_MEMBERSHIP_IDENTITY, got %', SQLERRM;
      END IF;
  END;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Account Deletion Sole-Owner Protection & Recovery Paths (P1-AC11)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_ids record;
  v_remaining_owners int;
BEGIN
  SELECT * INTO v_ids FROM tmp_phase1_ids;

  -- 6.1 Deleting sole owner User A of Workspace A MUST be blocked
  BEGIN
    DELETE FROM auth.users WHERE id = '11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC11]: Deleted sole workspace owner User A from auth.users!';
  EXCEPTION
    WHEN sqlstate 'P0001' THEN
      IF SQLERRM NOT LIKE 'SOLE_WORKSPACE_OWNER_DELETE_BLOCKED:%' THEN
        RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC11]: Expected SOLE_WORKSPACE_OWNER_DELETE_BLOCKED, got %', SQLERRM;
      END IF;
  END;

  -- 6.2 Path A: Promote User D (`admin`) to co-`owner` of Workspace A, then delete User A -> MUST succeed
  UPDATE public.workspace_members
     SET role = 'owner'
   WHERE workspace_id = v_ids.ws_a_id
     AND user_id = '44444444-4444-4444-8444-444444444444';

  -- Note: User D also sole-owns Workspace C; User A now shares ownership of Workspace A with User D!
  DELETE FROM auth.users WHERE id = '11111111-1111-4111-8111-111111111111';

  SELECT count(*)::int INTO v_remaining_owners
    FROM public.workspace_members
   WHERE workspace_id = v_ids.ws_a_id
     AND role = 'owner';

  IF v_remaining_owners <> 1 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC11]: Expected 1 remaining owner on Workspace A after User A deletion, found %.',
      v_remaining_owners;
  END IF;

  -- 6.3 Path B: User B sole-owns Workspace B -> blocked first, then Workspace B deleted -> deletion succeeds
  BEGIN
    DELETE FROM auth.users WHERE id = '22222222-2222-4222-8222-222222222222';
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC11]: Deleted sole owner User B before workspace deletion!';
  EXCEPTION
    WHEN sqlstate 'P0001' THEN NULL;
  END;

  DELETE FROM public.workspaces WHERE id = v_ids.ws_b_id;
  DELETE FROM auth.users WHERE id = '22222222-2222-4222-8222-222222222222';

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = '22222222-2222-4222-8222-222222222222') THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P1-AC11]: Profile for deleted User B was not cascade-cleaned.';
  END IF;
END;
$$;

SELECT 'PHASE_1_DB_VERIFICATION_PASSED' AS verification_status;

ROLLBACK;
