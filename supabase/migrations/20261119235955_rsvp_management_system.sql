-- ============================================================================
-- Phase 7: RSVP Management System (Completing Mandatory Quality Gate 5)
-- ============================================================================
-- Security, Transactional Serialization & Multi-Tenant Integrity Invariants:
--   1. `public.rsvp_questions`, `public.rsvp_submissions`, `public.rsvp_attendees`,
--      and `public.rsvp_answers` bind via strict composite foreign keys
--      (`(workspace_id, wedding_id)`, `(workspace_id, wedding_id, group_id)`,
--      `(workspace_id, wedding_id, group_id, submission_id)`, and
--      `(workspace_id, wedding_id, group_id, guest_id)`) so cross-wedding and
--      cross-household RSVP records are structurally impossible in PostgreSQL.
--   2. `anon` holds ZERO table privileges across all 4 `rsvp_*` tables.
--      `authenticated` holds workspace-scoped RLS (`editor`+ CRUD on
--      `rsvp_questions`, and `SELECT`-only on `rsvp_submissions`, `rsvp_attendees`,
--      and `rsvp_answers`).
--   3. `public.submit_household_rsvp(p_token, p_payload)` (`VOLATILE`,
--      `SECURITY DEFINER`) hashes `p_token` with SHA-256 server-side, locks
--      `public.guest_groups` (`FOR UPDATE`) in strict top-down lock order
--      (`guest_groups -> invitations -> rsvp_submissions`) to serialize concurrent
--      submissions and organizer token rotations/revocations deadlock-free,
--      enforces `is_rsvp_open`, `rsvp_deadline > now()`, exact household member
--      coverage, `attending_count <= max_attendees`, and custom question rules,
--      and commits or rolls back 100% atomically inside one transaction.
--   4. `public.resolve_invitation_by_token(p_token)` (`STABLE`, `SECURITY DEFINER`)
--      is upgraded to return live RSVP availability, deadline, custom questions,
--      and any existing household RSVP submission without echoing `p_token` or
--      exposing internal UUIDs (`workspace_id`, `wedding_id`).
-- ============================================================================

-- 1. Domain enums
CREATE TYPE public.rsvp_question_type AS ENUM (
  'short_text',
  'single_select',
  'boolean'
);

CREATE TYPE public.rsvp_attendance_status AS ENUM (
  'attending',
  'declined'
);

-- 2. Tables & structural constraints
CREATE TABLE public.rsvp_questions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  wedding_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  label text NOT NULL,
  help_text text NOT NULL DEFAULT '',
  question_type public.rsvp_question_type NOT NULL DEFAULT 'short_text'::public.rsvp_question_type,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT rsvp_questions_workspace_wedding_fkey
    FOREIGN KEY (workspace_id, wedding_id)
    REFERENCES public.weddings(workspace_id, id)
    ON DELETE CASCADE,
  CONSTRAINT rsvp_questions_workspace_wedding_id_key
    UNIQUE (workspace_id, wedding_id, id),
  CONSTRAINT rsvp_questions_label_chk CHECK (
    label = pg_catalog.btrim(label)
    AND pg_catalog.char_length(label) BETWEEN 1 AND 160
  ),
  CONSTRAINT rsvp_questions_help_text_chk CHECK (
    help_text = pg_catalog.btrim(help_text)
    AND pg_catalog.char_length(help_text) <= 240
  ),
  CONSTRAINT rsvp_questions_options_array_chk CHECK (
    pg_catalog.jsonb_typeof(options) = 'array'
    AND pg_catalog.octet_length(options::text) <= 4096
  ),
  CONSTRAINT rsvp_questions_sort_order_chk CHECK (
    sort_order BETWEEN 0 AND 50
  )
);

CREATE TABLE public.rsvp_submissions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL,
  wedding_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  invitation_id uuid REFERENCES public.invitations(id) ON DELETE SET NULL,
  overall_status public.rsvp_attendance_status NOT NULL,
  attending_count integer NOT NULL,
  additional_guests_count integer NOT NULL DEFAULT 0,
  household_note text NOT NULL DEFAULT '',
  response_version integer NOT NULL DEFAULT 1,
  submitted_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT rsvp_submissions_workspace_wedding_group_fkey
    FOREIGN KEY (workspace_id, wedding_id, group_id)
    REFERENCES public.guest_groups(workspace_id, wedding_id, id)
    ON DELETE CASCADE,
  CONSTRAINT rsvp_submissions_group_id_key
    UNIQUE (group_id),
  CONSTRAINT rsvp_submissions_workspace_wedding_group_id_key
    UNIQUE (workspace_id, wedding_id, group_id, id),
  CONSTRAINT rsvp_submissions_counts_chk CHECK (
    attending_count BETWEEN 0 AND 50
    AND additional_guests_count BETWEEN 0 AND 50
    AND additional_guests_count <= attending_count
    AND (
      (overall_status = 'attending'::public.rsvp_attendance_status AND attending_count >= 1)
      OR (
        overall_status = 'declined'::public.rsvp_attendance_status
        AND attending_count = 0
        AND additional_guests_count = 0
      )
    )
  ),
  CONSTRAINT rsvp_submissions_household_note_chk CHECK (
    household_note = pg_catalog.btrim(household_note)
    AND pg_catalog.char_length(household_note) <= 500
  ),
  CONSTRAINT rsvp_submissions_response_version_chk CHECK (
    response_version >= 1
  )
);

CREATE TABLE public.rsvp_attendees (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  submission_id uuid NOT NULL,
  group_id uuid NOT NULL,
  guest_id uuid NOT NULL,
  wedding_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  attendance_status public.rsvp_attendance_status NOT NULL,
  dietary_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT rsvp_attendees_submission_fkey
    FOREIGN KEY (workspace_id, wedding_id, group_id, submission_id)
    REFERENCES public.rsvp_submissions(workspace_id, wedding_id, group_id, id)
    ON DELETE CASCADE,
  CONSTRAINT rsvp_attendees_guest_fkey
    FOREIGN KEY (workspace_id, wedding_id, group_id, guest_id)
    REFERENCES public.guests(workspace_id, wedding_id, group_id, id)
    ON DELETE CASCADE,
  CONSTRAINT rsvp_attendees_submission_guest_key
    UNIQUE (submission_id, guest_id),
  CONSTRAINT rsvp_attendees_dietary_notes_chk CHECK (
    dietary_notes = pg_catalog.btrim(dietary_notes)
    AND pg_catalog.char_length(dietary_notes) <= 300
  )
);

CREATE TABLE public.rsvp_answers (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  submission_id uuid NOT NULL,
  group_id uuid NOT NULL,
  question_id uuid NOT NULL,
  wedding_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  answer_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT rsvp_answers_submission_fkey
    FOREIGN KEY (workspace_id, wedding_id, group_id, submission_id)
    REFERENCES public.rsvp_submissions(workspace_id, wedding_id, group_id, id)
    ON DELETE CASCADE,
  CONSTRAINT rsvp_answers_question_fkey
    FOREIGN KEY (workspace_id, wedding_id, question_id)
    REFERENCES public.rsvp_questions(workspace_id, wedding_id, id)
    ON DELETE CASCADE,
  CONSTRAINT rsvp_answers_submission_question_key
    UNIQUE (submission_id, question_id),
  CONSTRAINT rsvp_answers_answer_text_chk CHECK (
    answer_text = pg_catalog.btrim(answer_text)
    AND pg_catalog.char_length(answer_text) <= 500
  )
);

-- 3. Indexes aligned in exact leading-column order with all FKs (`0` advisor lints)
CREATE INDEX rsvp_questions_workspace_wedding_sort_idx
  ON public.rsvp_questions (workspace_id, wedding_id, sort_order ASC, created_at ASC);

CREATE INDEX rsvp_submissions_workspace_wedding_updated_idx
  ON public.rsvp_submissions (workspace_id, wedding_id, updated_at DESC);

CREATE INDEX rsvp_submissions_invitation_id_idx
  ON public.rsvp_submissions (invitation_id);

CREATE INDEX rsvp_attendees_workspace_wedding_group_submission_idx
  ON public.rsvp_attendees (workspace_id, wedding_id, group_id, submission_id);

CREATE INDEX rsvp_attendees_workspace_wedding_group_guest_idx
  ON public.rsvp_attendees (workspace_id, wedding_id, group_id, guest_id);

CREATE INDEX rsvp_answers_workspace_wedding_group_submission_idx
  ON public.rsvp_answers (workspace_id, wedding_id, group_id, submission_id);

CREATE INDEX rsvp_answers_workspace_wedding_question_idx
  ON public.rsvp_answers (workspace_id, wedding_id, question_id);

-- 4. Self-contained row normalization & integrity triggers (`app_private`)
CREATE OR REPLACE FUNCTION app_private.normalize_rsvp_question_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_opt jsonb;
  v_opt_text text;
  v_normalized_opts jsonb := '[]'::jsonb;
  v_seen text[] := ARRAY[]::text[];
  v_opt_count integer := 0;
  v_combined text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.wedding_id IS DISTINCT FROM OLD.wedding_id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: RSVP question identity and wedding linkage are immutable.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  NEW.label := pg_catalog.btrim(COALESCE(NEW.label, ''));
  NEW.help_text := pg_catalog.btrim(COALESCE(NEW.help_text, ''));
  NEW.question_type := COALESCE(NEW.question_type, 'short_text'::public.rsvp_question_type);
  NEW.is_required := COALESCE(NEW.is_required, false);
  NEW.sort_order := COALESCE(NEW.sort_order, 0);

  IF pg_catalog.char_length(NEW.label) < 1 OR pg_catalog.char_length(NEW.label) > 160 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: RSVP question label must be between 1 and 160 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(NEW.help_text) > 240 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: RSVP question help text must be 240 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.sort_order < 0 OR NEW.sort_order > 50 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: RSVP question sort_order must be between 0 and 50.'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.question_type = 'single_select'::public.rsvp_question_type THEN
    IF NEW.options IS NULL OR pg_catalog.jsonb_typeof(NEW.options) <> 'array' THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Single-select RSVP questions require an options array.'
        USING ERRCODE = '22023';
    END IF;

    FOR v_opt IN SELECT value FROM pg_catalog.jsonb_array_elements(NEW.options) LOOP
      IF pg_catalog.jsonb_typeof(v_opt) <> 'string' THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Each RSVP question option must be a string.'
          USING ERRCODE = '22023';
      END IF;

      v_opt_text := pg_catalog.btrim(v_opt #>> '{}');
      IF pg_catalog.char_length(v_opt_text) < 1 OR pg_catalog.char_length(v_opt_text) > 80 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Each RSVP question option must be between 1 and 80 characters.'
          USING ERRCODE = '22023';
      END IF;

      IF pg_catalog.lower(v_opt_text) = ANY (v_seen) THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Single-select RSVP question options must be distinct.'
          USING ERRCODE = '22023';
      END IF;

      v_seen := pg_catalog.array_append(v_seen, pg_catalog.lower(v_opt_text));
      v_normalized_opts := v_normalized_opts || pg_catalog.to_jsonb(v_opt_text);
      v_opt_count := v_opt_count + 1;
    END LOOP;

    IF v_opt_count < 2 OR v_opt_count > 10 THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Single-select RSVP questions must define between 2 and 10 options.'
        USING ERRCODE = '22023';
    END IF;

    NEW.options := v_normalized_opts;
  ELSE
    NEW.options := '[]'::jsonb;
  END IF;

  v_combined := pg_catalog.lower(NEW.label || ' ' || NEW.help_text || ' ' || NEW.options::text);
  IF pg_catalog.strpos(v_combined, '<script') > 0
     OR pg_catalog.strpos(v_combined, 'javascript:') > 0
     OR pg_catalog.strpos(v_combined, 'vbscript:') > 0
     OR pg_catalog.strpos(v_combined, 'data:text/html') > 0
  THEN
    RAISE EXCEPTION 'UNSAFE_RSVP_PAYLOAD: Unsafe script or URI scheme detected in RSVP question fields.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.normalize_rsvp_question_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.normalize_rsvp_question_fields()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER rsvp_questions_normalize_fields
  BEFORE INSERT OR UPDATE ON public.rsvp_questions
  FOR EACH ROW
  EXECUTE FUNCTION app_private.normalize_rsvp_question_fields();

CREATE TRIGGER rsvp_questions_set_updated_at
  BEFORE UPDATE ON public.rsvp_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION app_private.enforce_rsvp_submission_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_lower text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.wedding_id IS DISTINCT FROM OLD.wedding_id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    THEN
      RAISE EXCEPTION 'IMMUTABLE_RSVP_SUBMISSION_IDENTITY: RSVP submission identity and household linkage are immutable.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  NEW.household_note := pg_catalog.btrim(COALESCE(NEW.household_note, ''));
  IF pg_catalog.char_length(NEW.household_note) > 500 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Household RSVP note must be 500 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  v_lower := pg_catalog.lower(NEW.household_note);
  IF pg_catalog.strpos(v_lower, '<script') > 0
     OR pg_catalog.strpos(v_lower, 'javascript:') > 0
     OR pg_catalog.strpos(v_lower, 'vbscript:') > 0
     OR pg_catalog.strpos(v_lower, 'data:text/html') > 0
  THEN
    RAISE EXCEPTION 'UNSAFE_RSVP_PAYLOAD: Unsafe script or URI scheme detected in household RSVP note.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.enforce_rsvp_submission_integrity() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.enforce_rsvp_submission_integrity()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER rsvp_submissions_enforce_integrity
  BEFORE INSERT OR UPDATE ON public.rsvp_submissions
  FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_rsvp_submission_integrity();

CREATE TRIGGER rsvp_submissions_set_updated_at
  BEFORE UPDATE ON public.rsvp_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION app_private.normalize_rsvp_attendee_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_lower text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.submission_id IS DISTINCT FROM OLD.submission_id
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.guest_id IS DISTINCT FROM OLD.guest_id
       OR NEW.wedding_id IS DISTINCT FROM OLD.wedding_id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: RSVP attendee identity and guest linkage are immutable.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  NEW.dietary_notes := pg_catalog.btrim(COALESCE(NEW.dietary_notes, ''));
  IF pg_catalog.char_length(NEW.dietary_notes) > 300 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: RSVP attendee dietary notes must be 300 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  v_lower := pg_catalog.lower(NEW.dietary_notes);
  IF pg_catalog.strpos(v_lower, '<script') > 0
     OR pg_catalog.strpos(v_lower, 'javascript:') > 0
     OR pg_catalog.strpos(v_lower, 'vbscript:') > 0
     OR pg_catalog.strpos(v_lower, 'data:text/html') > 0
  THEN
    RAISE EXCEPTION 'UNSAFE_RSVP_PAYLOAD: Unsafe script or URI scheme detected in attendee dietary notes.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.normalize_rsvp_attendee_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.normalize_rsvp_attendee_fields()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER rsvp_attendees_normalize_fields
  BEFORE INSERT OR UPDATE ON public.rsvp_attendees
  FOR EACH ROW
  EXECUTE FUNCTION app_private.normalize_rsvp_attendee_fields();

CREATE TRIGGER rsvp_attendees_set_updated_at
  BEFORE UPDATE ON public.rsvp_attendees
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION app_private.normalize_rsvp_answer_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_lower text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.submission_id IS DISTINCT FROM OLD.submission_id
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.question_id IS DISTINCT FROM OLD.question_id
       OR NEW.wedding_id IS DISTINCT FROM OLD.wedding_id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: RSVP answer identity and question linkage are immutable.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  NEW.answer_text := pg_catalog.btrim(COALESCE(NEW.answer_text, ''));
  IF pg_catalog.char_length(NEW.answer_text) > 500 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: RSVP answer text must be 500 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  v_lower := pg_catalog.lower(NEW.answer_text);
  IF pg_catalog.strpos(v_lower, '<script') > 0
     OR pg_catalog.strpos(v_lower, 'javascript:') > 0
     OR pg_catalog.strpos(v_lower, 'vbscript:') > 0
     OR pg_catalog.strpos(v_lower, 'data:text/html') > 0
  THEN
    RAISE EXCEPTION 'UNSAFE_RSVP_PAYLOAD: Unsafe script or URI scheme detected in RSVP answer.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.normalize_rsvp_answer_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.normalize_rsvp_answer_fields()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER rsvp_answers_normalize_fields
  BEFORE INSERT OR UPDATE ON public.rsvp_answers
  FOR EACH ROW
  EXECUTE FUNCTION app_private.normalize_rsvp_answer_fields();

CREATE TRIGGER rsvp_answers_set_updated_at
  BEFORE UPDATE ON public.rsvp_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 5. Explicit privileges & RLS (`0` `anon` table grants)
ALTER TABLE public.rsvp_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rsvp_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rsvp_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rsvp_answers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rsvp_questions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.rsvp_submissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.rsvp_attendees FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.rsvp_answers FROM PUBLIC, anon, authenticated;

-- `public.rsvp_questions`: workspace member SELECT, `editor`+ INSERT/UPDATE/DELETE
GRANT SELECT, INSERT, DELETE ON TABLE public.rsvp_questions TO authenticated;
GRANT UPDATE (label, help_text, question_type, options, is_required, sort_order)
  ON TABLE public.rsvp_questions TO authenticated;

CREATE POLICY rsvp_questions_select_workspace_member
  ON public.rsvp_questions
  FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT app_private.user_workspace_ids()));

CREATE POLICY rsvp_questions_insert_editor_plus
  ON public.rsvp_questions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT app_private.user_workspace_ids_with_roles(
        ARRAY[
          'owner'::public.workspace_role,
          'admin'::public.workspace_role,
          'editor'::public.workspace_role
        ]
      )
    )
  );

CREATE POLICY rsvp_questions_update_editor_plus
  ON public.rsvp_questions
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT app_private.user_workspace_ids_with_roles(
        ARRAY[
          'owner'::public.workspace_role,
          'admin'::public.workspace_role,
          'editor'::public.workspace_role
        ]
      )
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT app_private.user_workspace_ids_with_roles(
        ARRAY[
          'owner'::public.workspace_role,
          'admin'::public.workspace_role,
          'editor'::public.workspace_role
        ]
      )
    )
  );

CREATE POLICY rsvp_questions_delete_editor_plus
  ON public.rsvp_questions
  FOR DELETE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT app_private.user_workspace_ids_with_roles(
        ARRAY[
          'owner'::public.workspace_role,
          'admin'::public.workspace_role,
          'editor'::public.workspace_role
        ]
      )
    )
  );

-- `rsvp_submissions`, `rsvp_attendees`, `rsvp_answers`: workspace member SELECT only
GRANT SELECT ON TABLE public.rsvp_submissions TO authenticated;
GRANT SELECT ON TABLE public.rsvp_attendees TO authenticated;
GRANT SELECT ON TABLE public.rsvp_answers TO authenticated;

CREATE POLICY rsvp_submissions_select_workspace_member
  ON public.rsvp_submissions
  FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT app_private.user_workspace_ids()));

CREATE POLICY rsvp_attendees_select_workspace_member
  ON public.rsvp_attendees
  FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT app_private.user_workspace_ids()));

CREATE POLICY rsvp_answers_select_workspace_member
  ON public.rsvp_answers
  FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT app_private.user_workspace_ids()));

-- 6. Align `revoke_household_invitation` lock order (`guest_groups -> invitations`)
--    so concurrent `revoke_household_invitation` + `submit_household_rsvp` serialize deadlock-free
CREATE OR REPLACE FUNCTION public.revoke_household_invitation(
  p_workspace_id uuid,
  p_wedding_id uuid,
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role public.workspace_role;
  v_group_id uuid;
  v_invitation public.invitations;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required to revoke household invitation links.'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL OR p_wedding_id IS NULL OR p_invitation_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace ID, wedding ID, and invitation ID are required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT wm.role
    INTO v_caller_role
    FROM public.workspace_members wm
   WHERE wm.workspace_id = p_workspace_id
     AND wm.user_id = v_caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED: You do not have access to this workspace.'
      USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN (
    'owner'::public.workspace_role,
    'admin'::public.workspace_role,
    'editor'::public.workspace_role
  ) THEN
    RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: Only workspace owners, admins, and editors can revoke invitation links.'
      USING ERRCODE = '42501';
  END IF;

  SELECT inv.group_id
    INTO v_group_id
    FROM public.invitations inv
   WHERE inv.workspace_id = p_workspace_id
     AND inv.wedding_id = p_wedding_id
     AND inv.id = p_invitation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND: Invitation record not found in this wedding project.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Acquire `guest_groups` lock FIRST (matching `issue_household_invitation` & `submit_household_rsvp`)
  PERFORM 1
    FROM public.guest_groups gg
   WHERE gg.workspace_id = p_workspace_id
     AND gg.wedding_id = p_wedding_id
     AND gg.id = v_group_id
   FOR UPDATE;

  SELECT *
    INTO v_invitation
    FROM public.invitations inv
   WHERE inv.workspace_id = p_workspace_id
     AND inv.wedding_id = p_wedding_id
     AND inv.id = p_invitation_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND: Invitation record not found in this wedding project.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_invitation.status <> 'revoked'::public.invitation_status THEN
    UPDATE public.invitations inv
       SET status = 'revoked'::public.invitation_status,
           revoked_at = pg_catalog.now()
     WHERE inv.id = v_invitation.id
     RETURNING * INTO v_invitation;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_invitation.id,
    'groupId', v_invitation.group_id,
    'weddingId', v_invitation.wedding_id,
    'workspaceId', v_invitation.workspace_id,
    'status', v_invitation.status,
    'deliveryStatus', v_invitation.delivery_status,
    'expiresAt', CASE
      WHEN v_invitation.expires_at IS NULL THEN NULL
      ELSE pg_catalog.to_char(v_invitation.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    END,
    'revokedAt', pg_catalog.to_char(v_invitation.revoked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'issuedBy', v_invitation.issued_by,
    'createdAt', pg_catalog.to_char(v_invitation.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', pg_catalog.to_char(v_invitation.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$$;

ALTER FUNCTION public.revoke_household_invitation(uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.revoke_household_invitation(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_household_invitation(uuid, uuid, uuid)
  TO authenticated;

-- 7. Upgrade `resolve_invitation_by_token` (`STABLE`, `anon` + `authenticated`)
--    to include live RSVP window state, custom questions, and existing household submission
CREATE OR REPLACE FUNCTION public.resolve_invitation_by_token(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text;
  v_token_hash text;
  v_invitation public.invitations;
  v_wedding_status public.wedding_status;
  v_settings public.wedding_settings;
  v_version_number integer;
  v_published_at timestamptz;
  v_snapshot jsonb;
  v_display_name text;
  v_max_attendees integer;
  v_guests_json jsonb;
  v_questions_json jsonb;
  v_submission public.rsvp_submissions;
  v_existing_submission_json jsonb := NULL;
  v_attendees_json jsonb;
  v_answers_json jsonb;
  v_is_accepting boolean;
  v_closed_reason text := NULL;
BEGIN
  v_token := pg_catalog.btrim(COALESCE(p_token, ''));

  IF pg_catalog.char_length(v_token) < 32
     OR pg_catalog.char_length(v_token) > 128
     OR v_token !~ '^[A-Za-z0-9_-]+$'
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'invalid_token');
  END IF;

  v_token_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_token, 'UTF8')),
    'hex'
  );

  SELECT *
    INTO v_invitation
    FROM public.invitations inv
   WHERE inv.token_hash = v_token_hash;

  IF NOT FOUND
     OR v_invitation.status <> 'active'::public.invitation_status
     OR (v_invitation.expires_at IS NOT NULL AND v_invitation.expires_at <= pg_catalog.now())
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT w.status
    INTO v_wedding_status
    FROM public.weddings w
   WHERE w.workspace_id = v_invitation.workspace_id
     AND w.id = v_invitation.wedding_id;

  IF NOT FOUND OR v_wedding_status <> 'published'::public.wedding_status THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT *
    INTO v_settings
    FROM public.wedding_settings ws
   WHERE ws.workspace_id = v_invitation.workspace_id
     AND ws.wedding_id = v_invitation.wedding_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT
    pv.version_number,
    pv.published_at,
    pv.content_snapshot
  INTO
    v_version_number,
    v_published_at,
    v_snapshot
  FROM public.published_versions pv
  WHERE pv.wedding_id = v_invitation.wedding_id
    AND pv.is_active = true;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT
    gg.display_name,
    gg.max_attendees
  INTO
    v_display_name,
    v_max_attendees
  FROM public.guest_groups gg
  WHERE gg.workspace_id = v_invitation.workspace_id
    AND gg.wedding_id = v_invitation.wedding_id
    AND gg.id = v_invitation.group_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', g.id::text,
        'firstName', g.first_name,
        'lastName', g.last_name,
        'isChild', g.is_child,
        'dietaryNotes', g.dietary_notes
      )
      ORDER BY g.sort_order ASC, g.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_guests_json
  FROM public.guests g
  WHERE g.workspace_id = v_invitation.workspace_id
    AND g.wedding_id = v_invitation.wedding_id
    AND g.group_id = v_invitation.group_id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', q.id::text,
        'label', q.label,
        'helpText', q.help_text,
        'questionType', q.question_type::text,
        'options', q.options,
        'isRequired', q.is_required,
        'sortOrder', q.sort_order
      )
      ORDER BY q.sort_order ASC, q.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_questions_json
  FROM public.rsvp_questions q
  WHERE q.workspace_id = v_invitation.workspace_id
    AND q.wedding_id = v_invitation.wedding_id;

  SELECT *
    INTO v_submission
    FROM public.rsvp_submissions rs
   WHERE rs.workspace_id = v_invitation.workspace_id
     AND rs.wedding_id = v_invitation.wedding_id
     AND rs.group_id = v_invitation.group_id;

  IF FOUND THEN
    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'guestId', ra.guest_id::text,
          'attendanceStatus', ra.attendance_status::text,
          'dietaryNotes', ra.dietary_notes
        )
      ),
      '[]'::jsonb
    )
    INTO v_attendees_json
    FROM public.rsvp_attendees ra
    WHERE ra.workspace_id = v_invitation.workspace_id
      AND ra.wedding_id = v_invitation.wedding_id
      AND ra.group_id = v_invitation.group_id
      AND ra.submission_id = v_submission.id;

    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'questionId', ans.question_id::text,
          'answerText', ans.answer_text
        )
      ),
      '[]'::jsonb
    )
    INTO v_answers_json
    FROM public.rsvp_answers ans
    WHERE ans.workspace_id = v_invitation.workspace_id
      AND ans.wedding_id = v_invitation.wedding_id
      AND ans.group_id = v_invitation.group_id
      AND ans.submission_id = v_submission.id;

    v_existing_submission_json := pg_catalog.jsonb_build_object(
      'overallStatus', v_submission.overall_status::text,
      'attendingCount', v_submission.attending_count,
      'additionalGuestsCount', v_submission.additional_guests_count,
      'householdNote', v_submission.household_note,
      'responseVersion', v_submission.response_version,
      'submittedAt', pg_catalog.to_char(v_submission.submitted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'updatedAt', pg_catalog.to_char(v_submission.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'attendees', v_attendees_json,
      'answers', v_answers_json
    );
  END IF;

  IF NOT v_settings.is_rsvp_open THEN
    v_is_accepting := false;
    v_closed_reason := 'rsvp_closed';
  ELSIF v_settings.rsvp_deadline IS NOT NULL AND v_settings.rsvp_deadline <= pg_catalog.now() THEN
    v_is_accepting := false;
    v_closed_reason := 'deadline_passed';
  ELSE
    v_is_accepting := true;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'active',
    'versionNumber', v_version_number,
    'publishedAt', pg_catalog.to_char(v_published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'snapshot', v_snapshot,
    'household', pg_catalog.jsonb_build_object(
      'displayName', v_display_name,
      'maxAttendees', v_max_attendees,
      'expiresAt', CASE
        WHEN v_invitation.expires_at IS NULL THEN NULL
        ELSE pg_catalog.to_char(v_invitation.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      END,
      'guests', v_guests_json
    ),
    'rsvp', pg_catalog.jsonb_build_object(
      'isAcceptingResponses', v_is_accepting,
      'closedReason', v_closed_reason,
      'rsvpDeadline', CASE
        WHEN v_settings.rsvp_deadline IS NULL THEN NULL
        ELSE pg_catalog.to_char(v_settings.rsvp_deadline AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      END,
      'timezone', v_settings.timezone,
      'allowPlusOnes', v_settings.allow_plus_ones_default,
      'showDietaryNotes', v_settings.show_guest_dietary_notes,
      'confirmationMessage', v_settings.rsvp_confirmation_message,
      'questions', v_questions_json,
      'existingSubmission', v_existing_submission_json
    )
  );
END;
$$;

ALTER FUNCTION public.resolve_invitation_by_token(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.resolve_invitation_by_token(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_invitation_by_token(text)
  TO anon, authenticated;

-- 8. Single-Transaction Atomic Household RSVP Submission RPC (`Gate 5`)
CREATE OR REPLACE FUNCTION public.submit_household_rsvp(
  p_token text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text;
  v_token_hash text;
  v_invitation public.invitations;
  v_group public.guest_groups;
  v_wedding_status public.wedding_status;
  v_settings public.wedding_settings;
  v_overall_raw text;
  v_overall_status public.rsvp_attendance_status;
  v_additional_guests integer := 0;
  v_household_note text;
  v_attendees_arr jsonb;
  v_answers_arr jsonb;
  v_household_guest_ids uuid[];
  v_named_guest_count integer;
  v_seen_guest_ids uuid[] := ARRAY[]::uuid[];
  v_att_item jsonb;
  v_guest_id_raw text;
  v_guest_id uuid;
  v_att_status_raw text;
  v_att_status public.rsvp_attendance_status;
  v_dietary text;
  v_named_attending integer := 0;
  v_total_attending integer := 0;
  v_question_rec record;
  v_ans_item jsonb;
  v_seen_question_ids uuid[] := ARRAY[]::uuid[];
  v_question_id_raw text;
  v_question_id uuid;
  v_answer_text text;
  v_submission public.rsvp_submissions;
  v_out_attendees jsonb;
  v_out_answers jsonb;
BEGIN
  -- 1. Validate raw token format (never echoing `p_token` in error messages)
  v_token := pg_catalog.btrim(COALESCE(p_token, ''));
  IF pg_catalog.char_length(v_token) < 32
     OR pg_catalog.char_length(v_token) > 128
     OR v_token !~ '^[A-Za-z0-9_-]+$'
  THEN
    RAISE EXCEPTION 'INVALID_INVITATION_TOKEN: This household invitation link format is invalid.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload IS NULL
     OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR pg_catalog.octet_length(p_payload::text) > 65536
  THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: RSVP submission payload must be a JSON object up to 64 KB.'
      USING ERRCODE = '22023';
  END IF;

  -- 2. Resolve SHA-256 hash -> locate candidate invitation
  v_token_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_token, 'UTF8')),
    'hex'
  );

  SELECT *
    INTO v_invitation
    FROM public.invitations inv
   WHERE inv.token_hash = v_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITATION_UNAVAILABLE: This household invitation link is inactive or unavailable.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Acquire `guest_groups` row lock FIRST (`guest_groups -> invitations -> rsvp_submissions`)
  --    to serialize concurrent double-submits and concurrent token rotations/revocations deadlock-free!
  SELECT *
    INTO v_group
    FROM public.guest_groups gg
   WHERE gg.workspace_id = v_invitation.workspace_id
     AND gg.wedding_id = v_invitation.wedding_id
     AND gg.id = v_invitation.group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITATION_UNAVAILABLE: This household invitation link is inactive or unavailable.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Re-read and lock `invitations` after `guest_groups` lock to guarantee fresh revocation/expiry check
  SELECT *
    INTO v_invitation
    FROM public.invitations inv
   WHERE inv.id = v_invitation.id
   FOR KEY SHARE;

  IF NOT FOUND
     OR v_invitation.status <> 'active'::public.invitation_status
     OR (v_invitation.expires_at IS NOT NULL AND v_invitation.expires_at <= pg_catalog.now())
  THEN
    RAISE EXCEPTION 'INVITATION_UNAVAILABLE: This household invitation link is inactive or has expired.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Verify published wedding + active snapshot + live `is_rsvp_open` & `rsvp_deadline`
  SELECT w.status
    INTO v_wedding_status
    FROM public.weddings w
   WHERE w.workspace_id = v_invitation.workspace_id
     AND w.id = v_invitation.wedding_id
   FOR KEY SHARE;

  IF NOT FOUND
     OR v_wedding_status <> 'published'::public.wedding_status
     OR NOT EXISTS (
       SELECT 1
         FROM public.published_versions pv
        WHERE pv.wedding_id = v_invitation.wedding_id
          AND pv.is_active = true
     )
  THEN
    RAISE EXCEPTION 'INVITATION_UNAVAILABLE: This wedding website is not currently accepting responses.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
    INTO v_settings
    FROM public.wedding_settings ws
   WHERE ws.workspace_id = v_invitation.workspace_id
     AND ws.wedding_id = v_invitation.wedding_id
   FOR KEY SHARE;

  IF NOT FOUND OR NOT v_settings.is_rsvp_open THEN
    RAISE EXCEPTION 'RSVP_CLOSED: Online RSVPs are currently closed for this celebration.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_settings.rsvp_deadline IS NOT NULL AND v_settings.rsvp_deadline <= pg_catalog.now() THEN
    RAISE EXCEPTION 'RSVP_DEADLINE_PASSED: The RSVP deadline for this celebration has passed.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Validate top-level payload fields
  v_overall_raw := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_payload ->> 'overallStatus', '')));
  IF v_overall_raw NOT IN ('attending', 'declined') THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: overallStatus must be attending or declined.'
      USING ERRCODE = '22023';
  END IF;
  v_overall_status := v_overall_raw::public.rsvp_attendance_status;

  IF p_payload ? 'additionalGuestsCount' AND pg_catalog.jsonb_typeof(p_payload -> 'additionalGuestsCount') <> 'null' THEN
    IF pg_catalog.jsonb_typeof(p_payload -> 'additionalGuestsCount') <> 'number'
       OR (p_payload ->> 'additionalGuestsCount') !~ '^[0-9]+$'
    THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: additionalGuestsCount must be a non-negative integer.'
        USING ERRCODE = '22023';
    END IF;
    v_additional_guests := (p_payload ->> 'additionalGuestsCount')::integer;
  END IF;

  v_household_note := pg_catalog.btrim(COALESCE(p_payload ->> 'householdNote', ''));
  v_attendees_arr := COALESCE(p_payload -> 'attendees', '[]'::jsonb);
  v_answers_arr := COALESCE(p_payload -> 'answers', '[]'::jsonb);

  IF pg_catalog.jsonb_typeof(v_attendees_arr) <> 'array'
     OR pg_catalog.jsonb_typeof(v_answers_arr) <> 'array'
  THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: attendees and answers must be JSON arrays.'
      USING ERRCODE = '22023';
  END IF;

  -- 6. Validate exact household member coverage & `max_attendees` cap (`Gate 5`)
  SELECT COALESCE(pg_catalog.array_agg(g.id), ARRAY[]::uuid[])
    INTO v_household_guest_ids
    FROM public.guests g
   WHERE g.workspace_id = v_invitation.workspace_id
     AND g.wedding_id = v_invitation.wedding_id
     AND g.group_id = v_group.id;

  v_named_guest_count := COALESCE(pg_catalog.array_length(v_household_guest_ids, 1), 0);

  FOR v_att_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_attendees_arr) LOOP
    IF pg_catalog.jsonb_typeof(v_att_item) <> 'object' THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Each attendee entry must be an object.'
        USING ERRCODE = '22023';
    END IF;

    v_guest_id_raw := pg_catalog.btrim(COALESCE(v_att_item ->> 'guestId', ''));
    IF v_guest_id_raw !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Invalid guestId UUID in attendees payload.'
        USING ERRCODE = '22023';
    END IF;
    v_guest_id := v_guest_id_raw::uuid;

    IF NOT (v_guest_id = ANY (v_household_guest_ids)) THEN
      RAISE EXCEPTION 'CROSS_HOUSEHOLD_GUEST_DENIED: Submitted guest does not belong to this invited household.'
        USING ERRCODE = '22023';
    END IF;

    IF v_guest_id = ANY (v_seen_guest_ids) THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Duplicate guestId in attendees payload.'
        USING ERRCODE = '22023';
    END IF;
    v_seen_guest_ids := pg_catalog.array_append(v_seen_guest_ids, v_guest_id);

    v_att_status_raw := pg_catalog.lower(pg_catalog.btrim(COALESCE(v_att_item ->> 'attendanceStatus', '')));
    IF v_att_status_raw NOT IN ('attending', 'declined') THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Attendee attendanceStatus must be attending or declined.'
        USING ERRCODE = '22023';
    END IF;
    v_att_status := v_att_status_raw::public.rsvp_attendance_status;

    IF v_overall_status = 'declined'::public.rsvp_attendance_status
       AND v_att_status = 'attending'::public.rsvp_attendance_status
    THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Declining households cannot mark individual guests as attending.'
        USING ERRCODE = '22023';
    END IF;

    IF v_att_status = 'attending'::public.rsvp_attendance_status THEN
      v_named_attending := v_named_attending + 1;
    END IF;
  END LOOP;

  IF COALESCE(pg_catalog.array_length(v_seen_guest_ids, 1), 0) <> v_named_guest_count THEN
    RAISE EXCEPTION 'HOUSEHOLD_MEMBER_MISMATCH: Every named member of this household must be included in the RSVP response.'
      USING ERRCODE = '22023';
  END IF;

  IF v_overall_status = 'declined'::public.rsvp_attendance_status AND v_additional_guests > 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Declining households cannot include additional unnamed guests.'
      USING ERRCODE = '22023';
  END IF;

  -- Enforce `allow_plus_ones_default` when the household already has named members
  IF v_additional_guests > 0
     AND v_named_guest_count > 0
     AND NOT v_settings.allow_plus_ones_default
  THEN
    RAISE EXCEPTION 'PLUS_ONES_NOT_ALLOWED: Additional unnamed plus-one guests are not enabled for this celebration.'
      USING ERRCODE = 'P0001';
  END IF;

  v_total_attending := v_named_attending + v_additional_guests;

  IF v_overall_status = 'attending'::public.rsvp_attendance_status AND v_total_attending < 1 THEN
    RAISE EXCEPTION 'ATTENDING_REQUIRES_AT_LEAST_ONE_GUEST: Select at least one attending household member or switch to Unable to Attend.'
      USING ERRCODE = '22023';
  END IF;

  IF v_total_attending > v_group.max_attendees THEN
    RAISE EXCEPTION 'HOUSEHOLD_CAPACITY_EXCEEDED: Total attending guests (%) exceeds this household limit of %.',
      v_total_attending, v_group.max_attendees
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. Validate custom RSVP question answers
  FOR v_ans_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_answers_arr) LOOP
    IF pg_catalog.jsonb_typeof(v_ans_item) <> 'object' THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Each answer entry must be an object.'
        USING ERRCODE = '22023';
    END IF;

    v_question_id_raw := pg_catalog.btrim(COALESCE(v_ans_item ->> 'questionId', ''));
    IF v_question_id_raw !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION 'INVALID_RSVP_QUESTION: Invalid questionId UUID in answers payload.'
        USING ERRCODE = '22023';
    END IF;
    v_question_id := v_question_id_raw::uuid;

    IF v_question_id = ANY (v_seen_question_ids) THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Duplicate questionId in answers payload.'
        USING ERRCODE = '22023';
    END IF;
    v_seen_question_ids := pg_catalog.array_append(v_seen_question_ids, v_question_id);

    IF NOT EXISTS (
      SELECT 1
        FROM public.rsvp_questions q
       WHERE q.workspace_id = v_invitation.workspace_id
         AND q.wedding_id = v_invitation.wedding_id
         AND q.id = v_question_id
    ) THEN
      RAISE EXCEPTION 'INVALID_RSVP_QUESTION: Submitted RSVP question does not belong to this celebration.'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOR v_question_rec IN
    SELECT q.id, q.label, q.question_type, q.options, q.is_required
      FROM public.rsvp_questions q
     WHERE q.workspace_id = v_invitation.workspace_id
       AND q.wedding_id = v_invitation.wedding_id
     ORDER BY q.sort_order ASC, q.created_at ASC
  LOOP
    v_answer_text := '';
    SELECT pg_catalog.btrim(COALESCE(elem.value ->> 'answerText', ''))
      INTO v_answer_text
      FROM pg_catalog.jsonb_array_elements(v_answers_arr) elem
     WHERE (elem.value ->> 'questionId')::uuid = v_question_rec.id
     LIMIT 1;
    v_answer_text := COALESCE(v_answer_text, '');

    IF v_overall_status = 'attending'::public.rsvp_attendance_status
       AND v_question_rec.is_required
       AND v_answer_text = ''
    THEN
      RAISE EXCEPTION 'RSVP_ANSWER_VALIDATION_ERROR: Required RSVP question "%" must be answered.', v_question_rec.label
        USING ERRCODE = '22023';
    END IF;

    IF v_answer_text <> '' THEN
      IF v_question_rec.question_type = 'boolean'::public.rsvp_question_type
         AND pg_catalog.lower(v_answer_text) NOT IN ('yes', 'no')
      THEN
        RAISE EXCEPTION 'RSVP_ANSWER_VALIDATION_ERROR: Question "%" requires a yes or no answer.', v_question_rec.label
          USING ERRCODE = '22023';
      END IF;

      IF v_question_rec.question_type = 'single_select'::public.rsvp_question_type
         AND NOT EXISTS (
           SELECT 1
             FROM pg_catalog.jsonb_array_elements_text(v_question_rec.options) opt
            WHERE opt = v_answer_text
         )
      THEN
        RAISE EXCEPTION 'RSVP_ANSWER_VALIDATION_ERROR: Selected option for "%" is not among the configured choices.', v_question_rec.label
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  -- 8. Upsert canonical household `rsvp_submissions` row & replace child rows atomically
  INSERT INTO public.rsvp_submissions (
    group_id,
    wedding_id,
    workspace_id,
    invitation_id,
    overall_status,
    attending_count,
    additional_guests_count,
    household_note,
    response_version
  )
  VALUES (
    v_group.id,
    v_invitation.wedding_id,
    v_invitation.workspace_id,
    v_invitation.id,
    v_overall_status,
    v_total_attending,
    v_additional_guests,
    v_household_note,
    1
  )
  ON CONFLICT (group_id) DO UPDATE
    SET invitation_id = EXCLUDED.invitation_id,
        overall_status = EXCLUDED.overall_status,
        attending_count = EXCLUDED.attending_count,
        additional_guests_count = EXCLUDED.additional_guests_count,
        household_note = EXCLUDED.household_note,
        response_version = public.rsvp_submissions.response_version + 1
  RETURNING * INTO v_submission;

  DELETE FROM public.rsvp_attendees ra
   WHERE ra.workspace_id = v_invitation.workspace_id
     AND ra.wedding_id = v_invitation.wedding_id
     AND ra.group_id = v_group.id
     AND ra.submission_id = v_submission.id;

  FOR v_att_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_attendees_arr) LOOP
    v_guest_id := (v_att_item ->> 'guestId')::uuid;
    v_att_status := (pg_catalog.lower(pg_catalog.btrim(v_att_item ->> 'attendanceStatus')))::public.rsvp_attendance_status;
    v_dietary := CASE
      WHEN v_att_status = 'attending'::public.rsvp_attendance_status
           AND v_settings.show_guest_dietary_notes
      THEN pg_catalog.btrim(COALESCE(v_att_item ->> 'dietaryNotes', ''))
      ELSE ''
    END;

    INSERT INTO public.rsvp_attendees (
      submission_id,
      group_id,
      guest_id,
      wedding_id,
      workspace_id,
      attendance_status,
      dietary_notes
    )
    VALUES (
      v_submission.id,
      v_group.id,
      v_guest_id,
      v_invitation.wedding_id,
      v_invitation.workspace_id,
      v_att_status,
      v_dietary
    );
  END LOOP;

  DELETE FROM public.rsvp_answers ans
   WHERE ans.workspace_id = v_invitation.workspace_id
     AND ans.wedding_id = v_invitation.wedding_id
     AND ans.group_id = v_group.id
     AND ans.submission_id = v_submission.id;

  IF v_overall_status = 'attending'::public.rsvp_attendance_status THEN
    FOR v_ans_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_answers_arr) LOOP
      v_question_id := (v_ans_item ->> 'questionId')::uuid;
      v_answer_text := pg_catalog.btrim(COALESCE(v_ans_item ->> 'answerText', ''));

      IF v_answer_text <> '' THEN
        INSERT INTO public.rsvp_answers (
          submission_id,
          group_id,
          question_id,
          wedding_id,
          workspace_id,
          answer_text
        )
        VALUES (
          v_submission.id,
          v_group.id,
          v_question_id,
          v_invitation.wedding_id,
          v_invitation.workspace_id,
          v_answer_text
        );
      END IF;
    END LOOP;
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'guestId', ra.guest_id::text,
        'attendanceStatus', ra.attendance_status::text,
        'dietaryNotes', ra.dietary_notes
      )
    ),
    '[]'::jsonb
  )
  INTO v_out_attendees
  FROM public.rsvp_attendees ra
  WHERE ra.workspace_id = v_invitation.workspace_id
    AND ra.wedding_id = v_invitation.wedding_id
    AND ra.group_id = v_group.id
    AND ra.submission_id = v_submission.id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'questionId', ans.question_id::text,
        'answerText', ans.answer_text
      )
    ),
    '[]'::jsonb
  )
  INTO v_out_answers
  FROM public.rsvp_answers ans
  WHERE ans.workspace_id = v_invitation.workspace_id
    AND ans.wedding_id = v_invitation.wedding_id
    AND ans.group_id = v_group.id
    AND ans.submission_id = v_submission.id;

  RETURN pg_catalog.jsonb_build_object(
    'confirmationMessage', v_settings.rsvp_confirmation_message,
    'submission', pg_catalog.jsonb_build_object(
      'overallStatus', v_submission.overall_status::text,
      'attendingCount', v_submission.attending_count,
      'additionalGuestsCount', v_submission.additional_guests_count,
      'householdNote', v_submission.household_note,
      'responseVersion', v_submission.response_version,
      'submittedAt', pg_catalog.to_char(v_submission.submitted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'updatedAt', pg_catalog.to_char(v_submission.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'attendees', v_out_attendees,
      'answers', v_out_answers
    )
  );
END;
$$;

ALTER FUNCTION public.submit_household_rsvp(text, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_household_rsvp(text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_household_rsvp(text, jsonb)
  TO anon, authenticated;
