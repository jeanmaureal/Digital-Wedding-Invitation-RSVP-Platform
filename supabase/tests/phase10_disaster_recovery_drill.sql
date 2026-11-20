-- ============================================================================
-- Phase 10 Disaster-Recovery & Logical Re-Hydration Verification Drill (Gate 6)
-- ============================================================================
-- Self-contained `BEGIN ... ROLLBACK;` drill (`0` persistent state mutated).
-- Verifies:
--   1. Complete logical JSON export of a live multi-household wedding (theme,
--      sections, published v1 & v2 snapshots, households, guests, custom RSVP
--      questions, and submitted RSVP attendees + answers) with `invitations.token_hash`
--      strictly excluded.
--   2. Catastrophic deletion simulation (`DELETE FROM public.weddings`) cascading
--      across all dependent tables and taking `/w/:slug` offline (`'unavailable'`).
--   3. Full FK-topological re-hydration (`jsonb_populate_recordset`) with
--      `rsvp_submissions.invitation_id = NULL` + fresh invitation link rotation.
--   4. 100% post-restore parity across row counts, public `/w/:slug` snapshot JSON,
--      organizer publication history, attendance metrics, custom answers, and
--      post-restore guest RSVP update continuity.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE tmp_p10_dr (
  item_id text PRIMARY KEY,
  item_json jsonb NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  v_owner_id constant uuid := 'aaaaaaaa-1010-4010-8010-000000000001';
  v_ws_id uuid;
  v_wed public.weddings;
  v_grp_1 uuid;
  v_grp_2 uuid;
  v_guest_1 uuid;
  v_guest_2 uuid;
  v_guest_3 uuid;
  v_q_meal uuid;
  v_q_note uuid;
  v_issued_1 jsonb;
  v_reissued_1 jsonb;

  v_pre_public_slug jsonb;
  v_post_public_slug jsonb;
  v_deleted_slug jsonb;
  v_resolved_after_restore jsonb;

  v_pre_counts jsonb;
  v_post_counts jsonb;
  v_pre_metrics jsonb;
  v_post_metrics jsonb;
  v_backup jsonb;
  v_remaining_after_delete int;
BEGIN
  -- 1. Seed ephemeral organizer, workspace, published wedding, guests & RSVPs
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES (
    v_owner_id,
    'p10.dr.owner@example.com',
    '{"full_name":"Phase 10 DR Operator"}'::jsonb,
    now(),
    now()
  );

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_ws_id := (public.create_workspace('Phase 10 DR Studio', 'p10-dr-studio')).id;

  v_wed := public.create_wedding(
    p_workspace_id => v_ws_id,
    p_title => 'Elena & Marco Archipelago Celebration',
    p_partner_one_name => 'Elena',
    p_partner_two_name => 'Marco',
    p_slug => 'p10-elena-marco-dr-drill',
    p_event_date => DATE '2027-11-20',
    p_venue_name => 'Balesin Pavilion',
    p_venue_location => 'Quezon',
    p_timezone => 'Asia/Manila',
    p_rsvp_deadline => now() + interval '30 days',
    p_access_mode => 'public'::public.wedding_access_mode,
    p_is_rsvp_open => true,
    p_allow_plus_ones_default => true
  );

  -- Publish v1, customize theme, and publish v2
  PERFORM public.publish_wedding(v_ws_id, v_wed.id);
  UPDATE public.wedding_themes
     SET preset_id = 'garden_sage'
   WHERE workspace_id = v_ws_id AND wedding_id = v_wed.id;
  PERFORM public.publish_wedding(v_ws_id, v_wed.id);

  -- Seed 2 households & 3 guests
  INSERT INTO public.guest_groups (workspace_id, wedding_id, display_name, max_attendees, notes, sort_order)
  VALUES (v_ws_id, v_wed.id, 'Santos Family', 3, 'VIP Garden Table', 0)
  RETURNING id INTO v_grp_1;

  INSERT INTO public.guest_groups (workspace_id, wedding_id, display_name, max_attendees, notes, sort_order)
  VALUES (v_ws_id, v_wed.id, 'Dela Cruz Couple', 2, 'Terrace Table', 1)
  RETURNING id INTO v_grp_2;

  INSERT INTO public.guests (workspace_id, wedding_id, group_id, first_name, last_name, side, sort_order)
  VALUES (v_ws_id, v_wed.id, v_grp_1, 'Rafael', 'Santos', 'partner_one', 0)
  RETURNING id INTO v_guest_1;

  INSERT INTO public.guests (workspace_id, wedding_id, group_id, first_name, last_name, side, sort_order)
  VALUES (v_ws_id, v_wed.id, v_grp_1, 'Sofia', 'Santos', 'partner_one', 1)
  RETURNING id INTO v_guest_2;

  INSERT INTO public.guests (workspace_id, wedding_id, group_id, first_name, last_name, side, sort_order)
  VALUES (v_ws_id, v_wed.id, v_grp_2, 'Gabriel', 'Dela Cruz', 'partner_two', 0)
  RETURNING id INTO v_guest_3;

  -- Seed custom RSVP questions
  INSERT INTO public.rsvp_questions (workspace_id, wedding_id, label, question_type, options, is_required, sort_order)
  VALUES (v_ws_id, v_wed.id, 'Plated Entree', 'single_select', '["Seabass","Mushroom Risotto"]'::jsonb, true, 0)
  RETURNING id INTO v_q_meal;

  INSERT INTO public.rsvp_questions (workspace_id, wedding_id, label, question_type, is_required, sort_order)
  VALUES (v_ws_id, v_wed.id, 'Shuttle Stop', 'short_text', false, 1)
  RETURNING id INTO v_q_note;

  -- Issue household invitation & submit multi-member RSVP with +1 guest and custom answers
  v_issued_1 := public.issue_household_invitation(v_ws_id, v_wed.id, v_grp_1);

  PERFORM public.submit_household_rsvp(
    v_issued_1 ->> 'rawToken',
    jsonb_build_object(
      'overallStatus', 'attending',
      'additionalGuestsCount', 1,
      'householdNote', 'Arriving on Friday afternoon ferry',
      'attendees', jsonb_build_array(
        jsonb_build_object('guestId', v_guest_1, 'attendanceStatus', 'attending', 'dietaryNotes', 'No shellfish'),
        jsonb_build_object('guestId', v_guest_2, 'attendanceStatus', 'declined', 'dietaryNotes', '')
      ),
      'answers', jsonb_build_array(
        jsonb_build_object('questionId', v_q_meal, 'answerText', 'Seabass'),
        jsonb_build_object('questionId', v_q_note, 'answerText', 'Makati Pickup')
      )
    )
  );

  -- 2. Capture pre-incident logical backup bundle (excluding `invitations.token_hash`),
  --    public website snapshot, row counts, and RSVP analytics summary
  SELECT public.get_public_wedding_by_slug('p10-elena-marco-dr-drill')
    INTO v_pre_public_slug;

  IF v_pre_public_slug ->> 'status' <> 'published' THEN
    RAISE EXCEPTION 'DR_DRILL_FAILED: Expected pre-incident status=published, got %', v_pre_public_slug;
  END IF;

  SELECT jsonb_build_object(
    'weddings', (SELECT jsonb_agg(to_jsonb(t)) FROM public.weddings t WHERE t.id = v_wed.id),
    'wedding_settings', (SELECT jsonb_agg(to_jsonb(t)) FROM public.wedding_settings t WHERE t.wedding_id = v_wed.id),
    'wedding_themes', (SELECT jsonb_agg(to_jsonb(t)) FROM public.wedding_themes t WHERE t.wedding_id = v_wed.id),
    'wedding_sections', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sort_order, t.id) FROM public.wedding_sections t WHERE t.wedding_id = v_wed.id),
    'published_versions', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.version_number) FROM public.published_versions t WHERE t.wedding_id = v_wed.id),
    'guest_groups', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sort_order, t.id) FROM public.guest_groups t WHERE t.wedding_id = v_wed.id),
    'guests', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sort_order, t.id) FROM public.guests t WHERE t.wedding_id = v_wed.id),
    'invitations', (SELECT jsonb_agg((to_jsonb(t) - 'token_hash') ORDER BY t.created_at, t.id) FROM public.invitations t WHERE t.wedding_id = v_wed.id),
    'rsvp_questions', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sort_order, t.id) FROM public.rsvp_questions t WHERE t.wedding_id = v_wed.id),
    'rsvp_submissions', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.group_id) FROM public.rsvp_submissions t WHERE t.wedding_id = v_wed.id),
    'rsvp_attendees', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.submission_id, t.id) FROM public.rsvp_attendees t WHERE t.wedding_id = v_wed.id),
    'rsvp_answers', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.submission_id, t.question_id) FROM public.rsvp_answers t WHERE t.wedding_id = v_wed.id)
  ) INTO v_backup;

  IF strpos(v_backup::text, 'token_hash') > 0 THEN
    RAISE EXCEPTION 'DR_DRILL_FAILED: Backup payload must never contain token_hash.';
  END IF;

  SELECT jsonb_build_object(
    'wedding_sections', (SELECT count(*)::int FROM public.wedding_sections WHERE wedding_id = v_wed.id),
    'published_versions', (SELECT count(*)::int FROM public.published_versions WHERE wedding_id = v_wed.id),
    'guest_groups', (SELECT count(*)::int FROM public.guest_groups WHERE wedding_id = v_wed.id),
    'guests', (SELECT count(*)::int FROM public.guests WHERE wedding_id = v_wed.id),
    'rsvp_questions', (SELECT count(*)::int FROM public.rsvp_questions WHERE wedding_id = v_wed.id),
    'rsvp_submissions', (SELECT count(*)::int FROM public.rsvp_submissions WHERE wedding_id = v_wed.id),
    'rsvp_attendees', (SELECT count(*)::int FROM public.rsvp_attendees WHERE wedding_id = v_wed.id),
    'rsvp_answers', (SELECT count(*)::int FROM public.rsvp_answers WHERE wedding_id = v_wed.id)
  ) INTO v_pre_counts;

  SELECT jsonb_build_object(
    'responded_households', (SELECT count(*)::int FROM public.rsvp_submissions WHERE wedding_id = v_wed.id),
    'named_attending', (SELECT count(*)::int FROM public.rsvp_attendees WHERE wedding_id = v_wed.id AND attendance_status = 'attending'),
    'named_declined', (SELECT count(*)::int FROM public.rsvp_attendees WHERE wedding_id = v_wed.id AND attendance_status = 'declined'),
    'plus_ones', (SELECT COALESCE(sum(additional_guests_count), 0)::int FROM public.rsvp_submissions WHERE wedding_id = v_wed.id AND overall_status = 'attending'),
    'answers', (SELECT jsonb_agg(jsonb_build_object('q', question_id, 'a', answer_text) ORDER BY question_id) FROM public.rsvp_answers WHERE wedding_id = v_wed.id)
  ) INTO v_pre_metrics;

  -- 3. Simulate accidental wedding deletion (cascading across all child tables)
  DELETE FROM public.weddings WHERE id = v_wed.id;

  SELECT (
    (SELECT count(*) FROM public.weddings WHERE id = v_wed.id) +
    (SELECT count(*) FROM public.published_versions WHERE wedding_id = v_wed.id) +
    (SELECT count(*) FROM public.guest_groups WHERE wedding_id = v_wed.id) +
    (SELECT count(*) FROM public.rsvp_submissions WHERE wedding_id = v_wed.id)
  )::int INTO v_remaining_after_delete;

  IF v_remaining_after_delete <> 0 THEN
    RAISE EXCEPTION 'DR_DRILL_FAILED: Expected 0 remaining wedding rows after cascade delete, got %', v_remaining_after_delete;
  END IF;

  SELECT public.get_public_wedding_by_slug('p10-elena-marco-dr-drill')
    INTO v_deleted_slug;

  IF v_deleted_slug ->> 'status' <> 'unavailable' THEN
    RAISE EXCEPTION 'DR_DRILL_FAILED: Deleted wedding slug must return unavailable, got %', v_deleted_slug;
  END IF;

  -- 4. Re-hydrate relational graph in strict FK & trigger-safe topological order:
  --    Insert published weddings as 'draft' first so `normalize_wedding_fields()`
  --    (`PUBLISHING_REQUIRES_SNAPSHOT`) allows child `published_versions` insertion,
  --    then promote `weddings.status` back to `'published'` once `is_active = true` exists.
  INSERT INTO public.weddings (
    id, workspace_id, title, partner_one_name, partner_two_name, slug, event_date,
    venue_name, venue_location, status, archived_at, duplicated_from_wedding_id,
    created_by, created_at, updated_at
  )
  SELECT
    w.id,
    w.workspace_id,
    w.title,
    w.partner_one_name,
    w.partner_two_name,
    w.slug,
    w.event_date,
    w.venue_name,
    w.venue_location,
    CASE
      WHEN w.status = 'published'::public.wedding_status THEN 'draft'::public.wedding_status
      ELSE w.status
    END,
    w.archived_at,
    w.duplicated_from_wedding_id,
    w.created_by,
    w.created_at,
    w.updated_at
  FROM jsonb_populate_recordset(NULL::public.weddings, v_backup -> 'weddings') AS w;

  INSERT INTO public.wedding_settings
  SELECT * FROM jsonb_populate_recordset(NULL::public.wedding_settings, v_backup -> 'wedding_settings');

  INSERT INTO public.wedding_themes
  SELECT * FROM jsonb_populate_recordset(NULL::public.wedding_themes, v_backup -> 'wedding_themes');

  INSERT INTO public.wedding_sections
  SELECT * FROM jsonb_populate_recordset(NULL::public.wedding_sections, v_backup -> 'wedding_sections');

  INSERT INTO public.published_versions
  SELECT * FROM jsonb_populate_recordset(NULL::public.published_versions, v_backup -> 'published_versions');

  UPDATE public.weddings AS target
     SET status = 'published'::public.wedding_status
    FROM jsonb_populate_recordset(NULL::public.weddings, v_backup -> 'weddings') AS src
   WHERE target.id = src.id
     AND src.status = 'published'::public.wedding_status;

  INSERT INTO public.guest_groups
  SELECT * FROM jsonb_populate_recordset(NULL::public.guest_groups, v_backup -> 'guest_groups');

  INSERT INTO public.guests
  SELECT * FROM jsonb_populate_recordset(NULL::public.guests, v_backup -> 'guests');

  INSERT INTO public.rsvp_questions
  SELECT * FROM jsonb_populate_recordset(NULL::public.rsvp_questions, v_backup -> 'rsvp_questions');

  -- Restore RSVP submissions with `invitation_id = NULL` (since `invitations.token_hash` is never exported)
  INSERT INTO public.rsvp_submissions (
    id, workspace_id, wedding_id, group_id, invitation_id, overall_status,
    attending_count, additional_guests_count, household_note, response_version,
    submitted_at, updated_at
  )
  SELECT
    r.id, r.workspace_id, r.wedding_id, r.group_id, NULL, r.overall_status,
    r.attending_count, r.additional_guests_count, r.household_note, r.response_version,
    r.submitted_at, r.updated_at
  FROM jsonb_populate_recordset(NULL::public.rsvp_submissions, v_backup -> 'rsvp_submissions') AS r;

  INSERT INTO public.rsvp_attendees
  SELECT * FROM jsonb_populate_recordset(NULL::public.rsvp_attendees, v_backup -> 'rsvp_attendees');

  INSERT INTO public.rsvp_answers
  SELECT * FROM jsonb_populate_recordset(NULL::public.rsvp_answers, v_backup -> 'rsvp_answers');

  -- Re-issue fresh household invitation link for Group 1 as authenticated organizer
  v_reissued_1 := public.issue_household_invitation(v_ws_id, v_wed.id, v_grp_1);

  -- 5. Verify 100% post-restore parity across public website, row counts, RSVP metrics, & guest update flow
  SELECT public.get_public_wedding_by_slug('p10-elena-marco-dr-drill')
    INTO v_post_public_slug;

  IF v_post_public_slug IS DISTINCT FROM v_pre_public_slug THEN
    RAISE EXCEPTION 'DR_DRILL_FAILED: Post-restore public website snapshot differs from pre-incident snapshot.';
  END IF;

  SELECT jsonb_build_object(
    'wedding_sections', (SELECT count(*)::int FROM public.wedding_sections WHERE wedding_id = v_wed.id),
    'published_versions', (SELECT count(*)::int FROM public.published_versions WHERE wedding_id = v_wed.id),
    'guest_groups', (SELECT count(*)::int FROM public.guest_groups WHERE wedding_id = v_wed.id),
    'guests', (SELECT count(*)::int FROM public.guests WHERE wedding_id = v_wed.id),
    'rsvp_questions', (SELECT count(*)::int FROM public.rsvp_questions WHERE wedding_id = v_wed.id),
    'rsvp_submissions', (SELECT count(*)::int FROM public.rsvp_submissions WHERE wedding_id = v_wed.id),
    'rsvp_attendees', (SELECT count(*)::int FROM public.rsvp_attendees WHERE wedding_id = v_wed.id),
    'rsvp_answers', (SELECT count(*)::int FROM public.rsvp_answers WHERE wedding_id = v_wed.id)
  ) INTO v_post_counts;

  IF v_post_counts IS DISTINCT FROM v_pre_counts THEN
    RAISE EXCEPTION 'DR_DRILL_FAILED: Post-restore row counts (%) differ from pre-incident counts (%).',
      v_post_counts, v_pre_counts;
  END IF;

  SELECT jsonb_build_object(
    'responded_households', (SELECT count(*)::int FROM public.rsvp_submissions WHERE wedding_id = v_wed.id),
    'named_attending', (SELECT count(*)::int FROM public.rsvp_attendees WHERE wedding_id = v_wed.id AND attendance_status = 'attending'),
    'named_declined', (SELECT count(*)::int FROM public.rsvp_attendees WHERE wedding_id = v_wed.id AND attendance_status = 'declined'),
    'plus_ones', (SELECT COALESCE(sum(additional_guests_count), 0)::int FROM public.rsvp_submissions WHERE wedding_id = v_wed.id AND overall_status = 'attending'),
    'answers', (SELECT jsonb_agg(jsonb_build_object('q', question_id, 'a', answer_text) ORDER BY question_id) FROM public.rsvp_answers WHERE wedding_id = v_wed.id)
  ) INTO v_post_metrics;

  IF v_post_metrics IS DISTINCT FROM v_pre_metrics THEN
    RAISE EXCEPTION 'DR_DRILL_FAILED: Post-restore RSVP metrics (%) differ from pre-incident metrics (%).',
      v_post_metrics, v_pre_metrics;
  END IF;

  -- Confirm newly rotated link resolves active AND includes restored existing submission!
  v_resolved_after_restore := public.resolve_invitation_by_token(v_reissued_1 ->> 'rawToken');
  IF v_resolved_after_restore ->> 'status' <> 'active'
     OR (v_resolved_after_restore -> 'rsvp' -> 'existingSubmission' ->> 'responseVersion')::int <> 1
  THEN
    RAISE EXCEPTION 'DR_DRILL_FAILED: Re-issued invitation did not bind to restored RSVP submission: %',
      v_resolved_after_restore;
  END IF;

  INSERT INTO tmp_p10_dr (item_id, item_json)
  VALUES ('result', jsonb_build_object(
    'status', 'ALL_PHASE10_DISASTER_RECOVERY_VERIFICATIONS_PASSED',
    'restored_counts', v_post_counts,
    'restored_metrics', v_post_metrics
  ));
END;
$$;

SELECT item_json AS dr_verification_result FROM tmp_p10_dr WHERE item_id = 'result';

ROLLBACK;
