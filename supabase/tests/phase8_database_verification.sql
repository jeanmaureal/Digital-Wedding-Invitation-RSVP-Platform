-- ============================================================================
-- Phase 8 Executable PostgreSQL Versioning, Rollback & Isolation Verification
-- ============================================================================
-- Execution model:
--   Runs inside a single `BEGIN; ... ROLLBACK;` transaction so zero test rows
--   persist after execution. Any failed check raises `ASSERTION_FAILED:`.
--
-- Covers:
--   - P8-AC01: `list_wedding_published_versions` returns ordered `vN .. v1`
--     snapshots to `owner | admin | editor | viewer` with `publishedByName`
--     attribution, zero co-member email leakage, and blocks `anon`/outsiders.
--   - P8-AC02: `rollback_wedding_published_version` enforces `editor`+ RBAC
--     (blocking `viewer`, outsiders, and `anon`), rejects `archived` weddings
--     (`ARCHIVED_WEDDING_CANNOT_PUBLISH`) and unknown versions
--     (`PUBLISHED_VERSION_NOT_FOUND`), activates target `vX`, and restores
--     unpublished `'draft'` weddings back to `'published'`.
--   - P8-AC03: Historical snapshot payloads & metadata (`content_snapshot`,
--     `version_number`, `access_mode`, `published_at`, `published_by`) remain
--     100% immutable across rollback + republish (`v3` allocated monotonically).
--   - P8-AC04 & P8-AC05: Draft builder rows (`wedding_themes`, `wedding_sections`)
--     and operational records (`guest_groups`, `guests`, `invitations`, `rsvp_*`)
--     remain 100% untouched, while `/w/:slug` (`get_public_wedding_by_slug`)
--     and `/i/:token` (`resolve_invitation_by_token`) immediately serve `v1`
--     and fail closed when `wedding_settings.access_mode = 'invite_only'`.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Catalog, Privilege & Function Hardening Audit (`P8-AC01`..`P8-AC03`)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_rec record;
  v_fn_count int;
BEGIN
  SELECT count(*)::int
    INTO v_fn_count
    FROM pg_catalog.pg_proc p
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public', 'app_private');

  IF v_fn_count < 45 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC01]: Expected >= 45 functions in public/app_private, found %', v_fn_count;
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
      RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC01]: Function %.% owner is %, expected postgres.',
        v_rec.schema_name, v_rec.fn_name, v_rec.owner_name;
    END IF;

    IF NOT ('search_path=""' = ANY(v_rec.config_arr) OR 'search_path=' = ANY(v_rec.config_arr)) THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC01]: Function %.% is missing fixed empty search_path.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.acl_text = '' OR v_rec.acl_text LIKE '{=X/%' OR v_rec.acl_text LIKE '%,=X/%' THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC01]: Function %.% retains PUBLIC EXECUTE grant.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.fn_name NOT IN (
      'health_check',
      'get_public_wedding_by_slug',
      'resolve_invitation_by_token',
      'submit_household_rsvp'
    ) AND v_rec.anon_exec THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC01]: Function %.% must NOT be executable by anon.',
        v_rec.schema_name, v_rec.fn_name;
    END IF;

    IF v_rec.fn_name = 'list_wedding_published_versions' AND v_rec.volatility <> 's' THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC01]: list_wedding_published_versions must be STABLE.';
    END IF;

    IF v_rec.fn_name = 'rollback_wedding_published_version' AND v_rec.volatility <> 'v' THEN
      RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC02]: rollback_wedding_published_version must be VOLATILE.';
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Seed Ephemeral Organizers, Workspaces, Wedding, Guests & RSVP (`P8-AC04`)
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_p8_state (
  key text PRIMARY KEY,
  val text NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON TABLE tmp_p8_state TO authenticated, anon;

DO $$
DECLARE
  v_owner_a constant uuid := '88888888-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_editor_a constant uuid := '88888888-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_viewer_a constant uuid := '88888888-cccc-4ccc-8ccc-ccccccccccc3';
  v_outsider constant uuid := '88888888-dddd-4ddd-8ddd-ddddddddddd4';
  v_ws_a uuid;
  v_ws_b uuid;
  v_wedding_a public.weddings;
  v_wedding_b public.weddings;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner_a, 'p8.owner.secret@example.com', '{"full_name":"Elena Vance"}'::jsonb, now(), now()),
    (v_editor_a, 'p8.editor.secret@example.com', '{"full_name":"Marco Silva"}'::jsonb, now(), now()),
    (v_viewer_a, 'p8.viewer.secret@example.com', '{"full_name":"Nadia Cho"}'::jsonb, now(), now()),
    (v_outsider, 'p8.outsider@example.com', '{"full_name":"Outsider Organizer"}'::jsonb, now(), now());

  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_ws_a := (public.create_workspace('P8 Atelier Alpha', 'p8-atelier-alpha')).id;
  PERFORM public.add_workspace_member_by_email(v_ws_a, 'p8.editor.secret@example.com', 'editor');
  PERFORM public.add_workspace_member_by_email(v_ws_a, 'p8.viewer.secret@example.com', 'viewer');

  v_wedding_a := public.create_wedding(
    p_workspace_id => v_ws_a,
    p_title => 'Aurelia & Julian Celebration',
    p_partner_one_name => 'Aurelia',
    p_partner_two_name => 'Julian',
    p_slug => 'p8-aurelia-julian',
    p_event_date => DATE '2027-09-18',
    p_venue_name => 'Villa Botanica',
    p_venue_location => 'Tagaytay',
    p_timezone => 'Asia/Manila',
    p_rsvp_deadline => now() + interval '14 days',
    p_access_mode => 'public'::public.wedding_access_mode,
    p_is_rsvp_open => true,
    p_allow_plus_ones_default => true
  );

  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  v_ws_b := (public.create_workspace('P8 Atelier Beta', 'p8-atelier-beta')).id;
  v_wedding_b := public.create_wedding(
    p_workspace_id => v_ws_b,
    p_title => 'Beta Project',
    p_partner_one_name => 'Rin',
    p_partner_two_name => 'Taro',
    p_slug => 'p8-beta-project'
  );

  INSERT INTO tmp_p8_state (key, val)
  VALUES
    ('ws_a', v_ws_a::text),
    ('ws_b', v_ws_b::text),
    ('wedding_a', v_wedding_a.id::text),
    ('wedding_b', v_wedding_b.id::text);
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Publish v1, Submit Live RSVP, Edit Draft, Publish v2 & Verify History
-- ----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_owner_a constant uuid := '88888888-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_editor_a constant uuid := '88888888-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_viewer_a constant uuid := '88888888-cccc-4ccc-8ccc-ccccccccccc3';
  v_outsider constant uuid := '88888888-dddd-4ddd-8ddd-ddddddddddd4';
  v_ws_a uuid := (SELECT val::uuid FROM tmp_p8_state WHERE key = 'ws_a');
  v_wedding_a uuid := (SELECT val::uuid FROM tmp_p8_state WHERE key = 'wedding_a');
  v_v1 public.published_versions;
  v_v2 public.published_versions;
  v_group_id uuid;
  v_guest_id uuid;
  v_question_id uuid;
  v_issued jsonb;
  v_raw_token text;
  v_history jsonb;
  v_blocked boolean;
BEGIN
  -- 3.1 Owner customizes Hero section & publishes v1
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  UPDATE public.wedding_sections
     SET content = jsonb_set(content, '{headline}', '"V1 Garden Ceremony"')
   WHERE workspace_id = v_ws_a
     AND wedding_id = v_wedding_a
     AND section_type = 'hero';

  v_v1 := public.publish_wedding(v_ws_a, v_wedding_a);
  IF v_v1.version_number <> 1 OR NOT v_v1.is_active THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC01]: Expected v1 active, got v% active=%',
      v_v1.version_number, v_v1.is_active;
  END IF;

  -- 3.2 Seed operational guest group, guest, custom question, and invitation token
  INSERT INTO public.guest_groups (wedding_id, workspace_id, display_name, max_attendees, notes)
  VALUES (v_wedding_a, v_ws_a, 'The Santos Household', 2, 'VIP table')
  RETURNING id INTO v_group_id;

  INSERT INTO public.guests (group_id, wedding_id, workspace_id, first_name, last_name, side, is_child, dietary_notes)
  VALUES (v_group_id, v_wedding_a, v_ws_a, 'Sofia', 'Santos', 'partner_one', false, 'Gluten-free')
  RETURNING id INTO v_guest_id;

  INSERT INTO public.rsvp_questions (wedding_id, workspace_id, label, question_type, options, is_required, sort_order)
  VALUES (v_wedding_a, v_ws_a, 'Main Course', 'single_select', '["Sea Bass","Risotto"]'::jsonb, true, 0)
  RETURNING id INTO v_question_id;

  v_issued := public.issue_household_invitation(v_ws_a, v_wedding_a, v_group_id);
  v_raw_token := v_issued ->> 'rawToken';

  -- 3.3 Submit guest RSVP against v1
  PERFORM public.submit_household_rsvp(
    v_raw_token,
    jsonb_build_object(
      'overallStatus', 'attending',
      'additionalGuestsCount', 1,
      'householdNote', 'Cannot wait!',
      'attendees', jsonb_build_array(
        jsonb_build_object(
          'guestId', v_guest_id,
          'attendanceStatus', 'attending',
          'dietaryNotes', 'Celiac-safe'
        )
      ),
      'answers', jsonb_build_array(
        jsonb_build_object(
          'questionId', v_question_id,
          'answerText', 'Risotto'
        )
      )
    )
  );

  -- 3.4 Editor updates draft Hero + Theme and publishes v2
  PERFORM set_config('request.jwt.claim.sub', v_editor_a::text, true);

  UPDATE public.wedding_themes
     SET preset_id = 'celestial_midnight'
   WHERE workspace_id = v_ws_a
     AND wedding_id = v_wedding_a;

  UPDATE public.wedding_sections
     SET content = jsonb_set(content, '{headline}', '"V2 Midnight Reception"')
   WHERE workspace_id = v_ws_a
     AND wedding_id = v_wedding_a
     AND section_type = 'hero';

  v_v2 := public.publish_wedding(v_ws_a, v_wedding_a);
  IF v_v2.version_number <> 2 OR NOT v_v2.is_active THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC01]: Expected v2 active, got v%', v_v2.version_number;
  END IF;

  -- 3.5 Viewer can read publication history (`v2`, `v1`) with display names and ZERO email leakage (`P8-AC01`)
  PERFORM set_config('request.jwt.claim.sub', v_viewer_a::text, true);

  v_history := public.list_wedding_published_versions(v_ws_a, v_wedding_a);
  IF jsonb_array_length(v_history) <> 2 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC01]: Expected 2 versions in history, got %', jsonb_array_length(v_history);
  END IF;

  IF (v_history -> 0 ->> 'versionNumber')::int <> 2
     OR (v_history -> 0 ->> 'publishedByName') <> 'Marco Silva'
     OR (v_history -> 0 ->> 'isActive')::boolean IS NOT TRUE
     OR (v_history -> 1 ->> 'versionNumber')::int <> 1
     OR (v_history -> 1 ->> 'publishedByName') <> 'Elena Vance'
     OR (v_history -> 1 ->> 'isActive')::boolean IS NOT FALSE
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC01]: Unexpected history ordering or attribution: %', v_history;
  END IF;

  IF strpos(lower(v_history::text), '@example.com') > 0 THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC01]: Publication history leaked organizer email address!';
  END IF;

  -- 3.6 Viewer is blocked from calling `rollback_wedding_published_version` (`P8-AC02`)
  v_blocked := false;
  BEGIN
    PERFORM public.rollback_wedding_published_version(v_ws_a, v_wedding_a, 1);
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC02]: Viewer must be blocked from rolling back versions.';
  END IF;

  -- 3.7 Outsider is blocked from reading history or rolling back (`P8-AC01`, `P8-AC02`)
  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);

  v_blocked := false;
  BEGIN
    PERFORM public.list_wedding_published_versions(v_ws_a, v_wedding_a);
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC01]: Cross-workspace outsider must be blocked from listing versions.';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.rollback_wedding_published_version(v_ws_a, v_wedding_a, 1);
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC02]: Cross-workspace outsider must be blocked from rolling back versions.';
  END IF;

  INSERT INTO tmp_p8_state (key, val)
  VALUES
    ('raw_token', v_raw_token),
    ('v1_snapshot', v_v1.content_snapshot::text),
    ('v1_published_at', v_v1.published_at::text),
    ('v2_snapshot', v_v2.content_snapshot::text);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Execute Rollback (`v2 -> v1`), Unpublish/Restore, Archived Guard & Republish (`v3`)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_editor_a constant uuid := '88888888-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_ws_a uuid := (SELECT val::uuid FROM tmp_p8_state WHERE key = 'ws_a');
  v_wedding_a uuid := (SELECT val::uuid FROM tmp_p8_state WHERE key = 'wedding_a');
  v_raw_token text := (SELECT val FROM tmp_p8_state WHERE key = 'raw_token');
  v_orig_v1_snapshot text := (SELECT val FROM tmp_p8_state WHERE key = 'v1_snapshot');
  v_orig_v1_published_at text := (SELECT val FROM tmp_p8_state WHERE key = 'v1_published_at');
  v_orig_v2_snapshot text := (SELECT val FROM tmp_p8_state WHERE key = 'v2_snapshot');
  v_rolled_back public.published_versions;
  v_v2_after public.published_versions;
  v_v3 public.published_versions;
  v_public_res jsonb;
  v_token_res jsonb;
  v_draft_theme text;
  v_draft_hero text;
  v_rsvp_count int;
  v_blocked boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_editor_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- 4.1 Reject non-existent target version (`P8-AC02`)
  v_blocked := false;
  BEGIN
    PERFORM public.rollback_wedding_published_version(v_ws_a, v_wedding_a, 99);
  EXCEPTION
    WHEN no_data_found THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC02]: Non-existent version rollback must raise P0002.';
  END IF;

  -- 4.2 Roll back from v2 to v1 (`P8-AC02`, `P8-AC03`)
  v_rolled_back := public.rollback_wedding_published_version(v_ws_a, v_wedding_a, 1);

  IF v_rolled_back.version_number <> 1 OR NOT v_rolled_back.is_active THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC02]: Expected v1 active after rollback.';
  END IF;

  IF v_rolled_back.content_snapshot::text <> v_orig_v1_snapshot
     OR v_rolled_back.published_at::text <> v_orig_v1_published_at
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC03]: v1 snapshot or published_at mutated during rollback!';
  END IF;

  SELECT *
    INTO v_v2_after
    FROM public.published_versions
   WHERE workspace_id = v_ws_a
     AND wedding_id = v_wedding_a
     AND version_number = 2;

  IF v_v2_after.is_active OR v_v2_after.content_snapshot::text <> v_orig_v2_snapshot THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC03]: v2 must be deactivated with immutable snapshot preserved.';
  END IF;

  -- 4.3 Draft builder AND operational RSVP data remain 100% untouched (`P8-AC04`)
  SELECT preset_id::text
    INTO v_draft_theme
    FROM public.wedding_themes
   WHERE workspace_id = v_ws_a
     AND wedding_id = v_wedding_a;

  SELECT content ->> 'headline'
    INTO v_draft_hero
    FROM public.wedding_sections
   WHERE workspace_id = v_ws_a
     AND wedding_id = v_wedding_a
     AND section_type = 'hero';

  SELECT attending_count
    INTO v_rsvp_count
    FROM public.rsvp_submissions
   WHERE workspace_id = v_ws_a
     AND wedding_id = v_wedding_a;

  IF v_draft_theme <> 'celestial_midnight'
     OR v_draft_hero <> 'V2 Midnight Reception'
     OR v_rsvp_count <> 2
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC04]: Draft or RSVP records were unexpectedly altered during rollback!';
  END IF;

  -- 4.4 Public `/w/:slug` and `/i/:token` immediately serve v1 (`P8-AC05`)
  v_public_res := public.get_public_wedding_by_slug('p8-aurelia-julian');
  v_token_res := public.resolve_invitation_by_token(v_raw_token);

  IF (v_public_res ->> 'status') <> 'published'
     OR (v_public_res ->> 'versionNumber')::int <> 1
     OR (v_public_res #>> '{snapshot,theme,presetId}') <> 'editorial_ivory'
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC05]: Public /w/:slug did not serve rolled-back v1: %', v_public_res;
  END IF;

  IF (v_token_res ->> 'status') <> 'active'
     OR (v_token_res ->> 'versionNumber')::int <> 1
     OR (v_token_res #>> '{existingSubmission,attendingCount}')::int <> 2
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC05]: /i/:token did not serve rolled-back v1 with preserved RSVP: %', v_token_res;
  END IF;

  -- 4.5 Switching live `wedding_settings.access_mode` to `invite_only` still gates `/w/:slug` (`P8-AC05`)
  UPDATE public.wedding_settings
     SET access_mode = 'invite_only'
   WHERE workspace_id = v_ws_a
     AND wedding_id = v_wedding_a;

  v_public_res := public.get_public_wedding_by_slug('p8-aurelia-julian');
  IF (v_public_res ->> 'status') <> 'invite_only' THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC05]: Live invite_only setting must gate rolled-back v1 on /w/:slug.';
  END IF;

  UPDATE public.wedding_settings
     SET access_mode = 'public'
   WHERE workspace_id = v_ws_a
     AND wedding_id = v_wedding_a;

  -- 4.6 Unpublish to Draft, then Restore v2 via `rollback_wedding_published_version` (`P8-AC02`)
  PERFORM public.unpublish_wedding(v_ws_a, v_wedding_a);
  v_rolled_back := public.rollback_wedding_published_version(v_ws_a, v_wedding_a, 2);

  IF v_rolled_back.version_number <> 2
     OR NOT v_rolled_back.is_active
     OR (public.get_public_wedding_by_slug('p8-aurelia-julian') ->> 'versionNumber')::int <> 2
  THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC02]: Restoring v2 from Draft must reactivate website.';
  END IF;

  -- 4.7 Archived wedding rejects rollback (`P8-AC02`)
  UPDATE public.weddings
     SET status = 'archived'
   WHERE workspace_id = v_ws_a
     AND id = v_wedding_a;

  v_blocked := false;
  BEGIN
    PERFORM public.rollback_wedding_published_version(v_ws_a, v_wedding_a, 1);
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%ARCHIVED_WEDDING_CANNOT_PUBLISH%' THEN
        v_blocked := true;
      END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC02]: Archived wedding must reject version rollback.';
  END IF;

  -- 4.8 Restore to Draft, roll back to v1, then publish new draft as monotonic v3 (`P8-AC03`)
  UPDATE public.weddings
     SET status = 'draft'
   WHERE workspace_id = v_ws_a
     AND id = v_wedding_a;

  PERFORM public.rollback_wedding_published_version(v_ws_a, v_wedding_a, 1);
  v_v3 := public.publish_wedding(v_ws_a, v_wedding_a);

  IF v_v3.version_number <> 3 OR NOT v_v3.is_active THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC03]: Republishing after rollback to v1 must allocate v3, got v%',
      v_v3.version_number;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Verify `anon` Cannot Execute Versioning RPCs (`P8-AC01`, `P8-AC02`)
-- ----------------------------------------------------------------------------
SET LOCAL ROLE anon;

DO $$
DECLARE
  v_ws_a uuid := (SELECT val::uuid FROM tmp_p8_state WHERE key = 'ws_a');
  v_wedding_a uuid := (SELECT val::uuid FROM tmp_p8_state WHERE key = 'wedding_a');
  v_blocked boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  v_blocked := false;
  BEGIN
    PERFORM public.list_wedding_published_versions(v_ws_a, v_wedding_a);
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC01]: anon must be denied EXECUTE on list_wedding_published_versions.';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.rollback_wedding_published_version(v_ws_a, v_wedding_a, 1);
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ASSERTION_FAILED [P8-AC02]: anon must be denied EXECUTE on rollback_wedding_published_version.';
  END IF;
END;
$$;

RESET ROLE;

SELECT 'ALL_PHASE8_DATABASE_VERIFICATIONS_PASSED' AS verification_result;

ROLLBACK;
