-- ============================================================================
-- Phase 6: Guest & Invitation Management (Gate 5 Part 1)
-- ============================================================================
-- Security, Cryptographic Token & Multi-Tenant Isolation Invariants:
--   1. `public.guest_groups`, `public.guests`, and `public.invitations` bind via
--      strict composite foreign keys (`(workspace_id, wedding_id)` and
--      `(workspace_id, wedding_id, group_id)`) so cross-wedding and cross-workspace
--      linkage is structurally impossible, and `guests` exposes
--      `UNIQUE (workspace_id, wedding_id, group_id, id)` ready for Phase 7 RSVPs.
--   2. `anon` holds ZERO privileges on `guest_groups`, `guests`, and `invitations`.
--      `authenticated` holds workspace-scoped RLS (`editor`+ write, `viewer` read)
--      on `guest_groups` and `guests`, and column-scoped `SELECT` on `invitations`
--      EXCLUDING `token_hash` so SHA-256 digests are never readable via PostgREST.
--   3. `public.issue_household_invitation` generates 32 CSPRNG bytes (256-bit
--      entropy) encoded as 43-char URL-safe base64url, revokes any prior active
--      token for that household, persists ONLY the 64-char SHA-256 hex digest in
--      `invitations.token_hash`, and returns the raw token ONCE in the RPC payload.
--   4. `public.resolve_invitation_by_token(p_token)` (`STABLE`, `SECURITY DEFINER`)
--      validates SHA-256 token hashes server-side, unlocks both `public` and
--      `invite_only` published wedding snapshots for valid non-expired active
--      household tokens, strips internal UUIDs / organizer notes / contact PII,
--      and never echoes raw `:token` values.
--   5. `public.import_wedding_guests` executes multi-household CSV imports inside
--      a single PostgreSQL transaction, rolling back 100% atomically on any
--      invalid household or guest item.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Domain enums
CREATE TYPE public.guest_side AS ENUM (
  'partner_one',
  'partner_two',
  'mutual',
  'other'
);

CREATE TYPE public.invitation_status AS ENUM (
  'active',
  'revoked'
);

CREATE TYPE public.invitation_delivery_status AS ENUM (
  'not_shared',
  'shared'
);

-- 2. Tables & structural constraints
CREATE TABLE public.guest_groups (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  wedding_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  display_name text NOT NULL,
  max_attendees integer NOT NULL DEFAULT 1,
  notes text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT guest_groups_workspace_wedding_fkey
    FOREIGN KEY (workspace_id, wedding_id)
    REFERENCES public.weddings(workspace_id, id)
    ON DELETE CASCADE,
  CONSTRAINT guest_groups_workspace_wedding_id_key
    UNIQUE (workspace_id, wedding_id, id),
  CONSTRAINT guest_groups_display_name_chk CHECK (
    display_name = pg_catalog.btrim(display_name)
    AND pg_catalog.char_length(display_name) BETWEEN 1 AND 120
  ),
  CONSTRAINT guest_groups_max_attendees_chk CHECK (
    max_attendees BETWEEN 1 AND 50
  ),
  CONSTRAINT guest_groups_notes_chk CHECK (
    notes = pg_catalog.btrim(notes)
    AND pg_catalog.char_length(notes) <= 500
  ),
  CONSTRAINT guest_groups_sort_order_chk CHECK (sort_order >= 0)
);

CREATE TABLE public.guests (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL,
  wedding_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  side public.guest_side NOT NULL DEFAULT 'mutual'::public.guest_side,
  is_child boolean NOT NULL DEFAULT false,
  dietary_notes text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT guests_workspace_wedding_group_fkey
    FOREIGN KEY (workspace_id, wedding_id, group_id)
    REFERENCES public.guest_groups(workspace_id, wedding_id, id)
    ON DELETE CASCADE,
  CONSTRAINT guests_workspace_wedding_group_id_key
    UNIQUE (workspace_id, wedding_id, group_id, id),
  CONSTRAINT guests_first_name_chk CHECK (
    first_name = pg_catalog.btrim(first_name)
    AND pg_catalog.char_length(first_name) BETWEEN 1 AND 80
  ),
  CONSTRAINT guests_last_name_chk CHECK (
    last_name = pg_catalog.btrim(last_name)
    AND pg_catalog.char_length(last_name) <= 80
  ),
  CONSTRAINT guests_email_chk CHECK (
    email = pg_catalog.lower(pg_catalog.btrim(email))
    AND pg_catalog.char_length(email) <= 320
    AND (
      email = ''
      OR (
        pg_catalog.char_length(email) >= 3
        AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
      )
    )
  ),
  CONSTRAINT guests_phone_chk CHECK (
    phone = pg_catalog.btrim(phone)
    AND pg_catalog.char_length(phone) <= 40
  ),
  CONSTRAINT guests_dietary_notes_chk CHECK (
    dietary_notes = pg_catalog.btrim(dietary_notes)
    AND pg_catalog.char_length(dietary_notes) <= 300
  ),
  CONSTRAINT guests_sort_order_chk CHECK (sort_order >= 0)
);

CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL,
  wedding_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  token_hash text NOT NULL,
  status public.invitation_status NOT NULL DEFAULT 'active'::public.invitation_status,
  delivery_status public.invitation_delivery_status NOT NULL DEFAULT 'not_shared'::public.invitation_delivery_status,
  expires_at timestamptz,
  revoked_at timestamptz,
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT invitations_workspace_wedding_group_fkey
    FOREIGN KEY (workspace_id, wedding_id, group_id)
    REFERENCES public.guest_groups(workspace_id, wedding_id, id)
    ON DELETE CASCADE,
  CONSTRAINT invitations_token_hash_key
    UNIQUE (token_hash),
  CONSTRAINT invitations_token_hash_format_chk CHECK (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT invitations_revoked_state_chk CHECK (
    (status = 'active'::public.invitation_status AND revoked_at IS NULL)
    OR (status = 'revoked'::public.invitation_status AND revoked_at IS NOT NULL)
  )
);

-- 3. Indexes aligned in exact leading-column order with all FKs (`0` advisor lints)
CREATE INDEX guest_groups_workspace_wedding_sort_idx
  ON public.guest_groups (workspace_id, wedding_id, sort_order ASC, created_at ASC);

CREATE INDEX guest_groups_created_by_idx
  ON public.guest_groups (created_by);

CREATE INDEX guests_workspace_wedding_sort_idx
  ON public.guests (workspace_id, wedding_id, sort_order ASC, created_at ASC);

CREATE UNIQUE INDEX invitations_one_active_per_group_idx
  ON public.invitations (group_id)
  WHERE status = 'active'::public.invitation_status;

CREATE INDEX invitations_workspace_wedding_group_created_idx
  ON public.invitations (workspace_id, wedding_id, group_id, created_at DESC);

CREATE INDEX invitations_issued_by_idx
  ON public.invitations (issued_by);

-- 4. Self-contained row normalization & immutability triggers (`app_private`)
CREATE OR REPLACE FUNCTION app_private.normalize_guest_group_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_combined text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.wedding_id IS DISTINCT FROM OLD.wedding_id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL)
    THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Household identity, wedding linkage, and provenance metadata are immutable.'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    IF NEW.created_by IS NULL THEN
      NEW.created_by := (SELECT auth.uid());
    END IF;
  END IF;

  NEW.display_name := pg_catalog.btrim(COALESCE(NEW.display_name, ''));
  NEW.notes := pg_catalog.btrim(COALESCE(NEW.notes, ''));
  NEW.max_attendees := COALESCE(NEW.max_attendees, 1);
  NEW.sort_order := COALESCE(NEW.sort_order, 0);

  IF pg_catalog.char_length(NEW.display_name) < 1 OR pg_catalog.char_length(NEW.display_name) > 120 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Household display name must be between 1 and 120 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.max_attendees < 1 OR NEW.max_attendees > 50 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Household max_attendees must be between 1 and 50.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(NEW.notes) > 500 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Household notes must be 500 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.sort_order < 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Household sort_order must be zero or positive.'
      USING ERRCODE = '22023';
  END IF;

  v_combined := pg_catalog.lower(NEW.display_name || ' ' || NEW.notes);
  IF pg_catalog.strpos(v_combined, '<script') > 0
     OR pg_catalog.strpos(v_combined, 'javascript:') > 0
     OR pg_catalog.strpos(v_combined, 'vbscript:') > 0
     OR pg_catalog.strpos(v_combined, 'data:text/html') > 0
  THEN
    RAISE EXCEPTION 'UNSAFE_GUEST_PAYLOAD: Unsafe script or URI scheme detected in household fields.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.normalize_guest_group_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.normalize_guest_group_fields()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guest_groups_normalize_fields
  BEFORE INSERT OR UPDATE ON public.guest_groups
  FOR EACH ROW
  EXECUTE FUNCTION app_private.normalize_guest_group_fields();

CREATE TRIGGER guest_groups_set_updated_at
  BEFORE UPDATE ON public.guest_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION app_private.normalize_guest_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_combined text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.wedding_id IS DISTINCT FROM OLD.wedding_id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Guest identity, household linkage, and wedding ownership are immutable.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  NEW.first_name := pg_catalog.btrim(COALESCE(NEW.first_name, ''));
  NEW.last_name := pg_catalog.btrim(COALESCE(NEW.last_name, ''));
  NEW.email := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.email, '')));
  NEW.phone := pg_catalog.btrim(COALESCE(NEW.phone, ''));
  NEW.dietary_notes := pg_catalog.btrim(COALESCE(NEW.dietary_notes, ''));
  NEW.side := COALESCE(NEW.side, 'mutual'::public.guest_side);
  NEW.is_child := COALESCE(NEW.is_child, false);
  NEW.sort_order := COALESCE(NEW.sort_order, 0);

  IF pg_catalog.char_length(NEW.first_name) < 1 OR pg_catalog.char_length(NEW.first_name) > 80 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Guest first name must be between 1 and 80 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(NEW.last_name) > 80 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Guest last name must be 80 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.email <> '' AND (
    pg_catalog.char_length(NEW.email) < 3
    OR pg_catalog.char_length(NEW.email) > 320
    OR NEW.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ) THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Guest email address format is invalid.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(NEW.phone) > 40 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Guest phone number must be 40 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(NEW.dietary_notes) > 300 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Guest dietary notes must be 300 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.sort_order < 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Guest sort_order must be zero or positive.'
      USING ERRCODE = '22023';
  END IF;

  v_combined := pg_catalog.lower(
    NEW.first_name || ' ' || NEW.last_name || ' ' || NEW.email || ' ' || NEW.phone || ' ' || NEW.dietary_notes
  );
  IF pg_catalog.strpos(v_combined, '<script') > 0
     OR pg_catalog.strpos(v_combined, 'javascript:') > 0
     OR pg_catalog.strpos(v_combined, 'vbscript:') > 0
     OR pg_catalog.strpos(v_combined, 'data:text/html') > 0
  THEN
    RAISE EXCEPTION 'UNSAFE_GUEST_PAYLOAD: Unsafe script or URI scheme detected in guest fields.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.normalize_guest_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.normalize_guest_fields()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guests_normalize_fields
  BEFORE INSERT OR UPDATE ON public.guests
  FOR EACH ROW
  EXECUTE FUNCTION app_private.normalize_guest_fields();

CREATE TRIGGER guests_set_updated_at
  BEFORE UPDATE ON public.guests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION app_private.enforce_invitation_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.wedding_id IS DISTINCT FROM OLD.wedding_id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (NEW.issued_by IS DISTINCT FROM OLD.issued_by AND NEW.issued_by IS NOT NULL)
    THEN
      RAISE EXCEPTION 'IMMUTABLE_INVITATION_IDENTITY: Invitation identity, household linkage, and SHA-256 token hash are immutable.'
        USING ERRCODE = 'P0001';
    END IF;

    IF OLD.status = 'revoked'::public.invitation_status
       AND NEW.status = 'active'::public.invitation_status
    THEN
      RAISE EXCEPTION 'REVOKED_INVITATION_CANNOT_REACTIVATE: Revoked invitation links cannot be reactivated; issue a rotated link instead.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  NEW.token_hash := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.token_hash, '')));
  IF NEW.token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Invitation token_hash must be a 64-character lowercase SHA-256 hex digest.'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.status = 'revoked'::public.invitation_status THEN
    NEW.revoked_at := COALESCE(NEW.revoked_at, pg_catalog.now());
  ELSE
    NEW.revoked_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.enforce_invitation_integrity() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.enforce_invitation_integrity()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER invitations_enforce_integrity
  BEFORE INSERT OR UPDATE ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_invitation_integrity();

CREATE TRIGGER invitations_set_updated_at
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 5. Explicit privileges & RLS
ALTER TABLE public.guest_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.guest_groups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.invitations FROM PUBLIC, anon, authenticated;

-- `public.guest_groups` privileges & policies
GRANT SELECT, INSERT, DELETE ON TABLE public.guest_groups TO authenticated;
GRANT UPDATE (display_name, max_attendees, notes, sort_order)
  ON TABLE public.guest_groups TO authenticated;

CREATE POLICY guest_groups_select_workspace_member
  ON public.guest_groups
  FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT app_private.user_workspace_ids()));

CREATE POLICY guest_groups_insert_editor_plus
  ON public.guest_groups
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

CREATE POLICY guest_groups_update_editor_plus
  ON public.guest_groups
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

CREATE POLICY guest_groups_delete_editor_plus
  ON public.guest_groups
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

-- `public.guests` privileges & policies
GRANT SELECT, INSERT, DELETE ON TABLE public.guests TO authenticated;
GRANT UPDATE (first_name, last_name, email, phone, side, is_child, dietary_notes, sort_order)
  ON TABLE public.guests TO authenticated;

CREATE POLICY guests_select_workspace_member
  ON public.guests
  FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT app_private.user_workspace_ids()));

CREATE POLICY guests_insert_editor_plus
  ON public.guests
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

CREATE POLICY guests_update_editor_plus
  ON public.guests
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

CREATE POLICY guests_delete_editor_plus
  ON public.guests
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

-- `public.invitations` column-scoped SELECT (excluding `token_hash`!) & RLS
GRANT SELECT (
  id,
  group_id,
  wedding_id,
  workspace_id,
  status,
  delivery_status,
  expires_at,
  revoked_at,
  issued_by,
  created_at,
  updated_at
) ON TABLE public.invitations TO authenticated;

CREATE POLICY invitations_select_workspace_member
  ON public.invitations
  FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT app_private.user_workspace_ids()));

-- 6. Operational RPCs (`public`)

-- 6.1 Atomic transactional CSV household & guest bulk import (`editor`+)
CREATE OR REPLACE FUNCTION public.import_wedding_guests(
  p_workspace_id uuid,
  p_wedding_id uuid,
  p_households jsonb
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
  v_household_count integer;
  v_next_group_sort integer;
  v_imported_groups integer := 0;
  v_imported_guests integer := 0;
  v_household jsonb;
  v_guest jsonb;
  v_guests_arr jsonb;
  v_guest_count integer;
  v_display_name text;
  v_notes text;
  v_max_attendees integer;
  v_group_id uuid;
  v_guest_sort integer;
  v_side_raw text;
  v_side public.guest_side;
  v_is_child boolean;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required to import wedding guests.'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL OR p_wedding_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace ID and wedding ID are required.'
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
    RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: Only workspace owners, admins, and editors can import guests.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
    FROM public.weddings w
   WHERE w.workspace_id = p_workspace_id
     AND w.id = p_wedding_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WEDDING_NOT_FOUND: Wedding project not found in this workspace.'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_households IS NULL
     OR pg_catalog.jsonb_typeof(p_households) <> 'array'
     OR pg_catalog.octet_length(p_households::text) > 262144
  THEN
    RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Import payload must be a JSON array up to 256 KB.'
      USING ERRCODE = '22023';
  END IF;

  v_household_count := pg_catalog.jsonb_array_length(p_households);
  IF v_household_count < 1 OR v_household_count > 200 THEN
    RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Import batch must contain between 1 and 200 households.'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(gg.sort_order), -1) + 1
    INTO v_next_group_sort
    FROM public.guest_groups gg
   WHERE gg.workspace_id = p_workspace_id
     AND gg.wedding_id = p_wedding_id;

  FOR v_household IN SELECT value FROM pg_catalog.jsonb_array_elements(p_households) LOOP
    IF pg_catalog.jsonb_typeof(v_household) <> 'object' THEN
      RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Each household entry must be an object.'
        USING ERRCODE = '22023';
    END IF;

    v_display_name := pg_catalog.btrim(COALESCE(v_household ->> 'displayName', ''));
    v_notes := pg_catalog.btrim(COALESCE(v_household ->> 'notes', ''));
    v_guests_arr := v_household -> 'guests';

    IF v_guests_arr IS NULL OR pg_catalog.jsonb_typeof(v_guests_arr) <> 'array' THEN
      RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Household "%" must include a guests array.', v_display_name
        USING ERRCODE = '22023';
    END IF;

    v_guest_count := pg_catalog.jsonb_array_length(v_guests_arr);
    IF v_guest_count < 1 OR v_guest_count > 50 THEN
      RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Household "%" must contain between 1 and 50 guests.', v_display_name
        USING ERRCODE = '22023';
    END IF;

    IF v_imported_guests + v_guest_count > 500 THEN
      RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Import batch exceeds the 500-guest per-import limit.'
        USING ERRCODE = '22023';
    END IF;

    IF v_household ? 'maxAttendees' AND pg_catalog.jsonb_typeof(v_household -> 'maxAttendees') <> 'null' THEN
      IF pg_catalog.jsonb_typeof(v_household -> 'maxAttendees') <> 'number'
         OR (v_household ->> 'maxAttendees') !~ '^[0-9]+$'
      THEN
        RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Household "%" has a non-integer maxAttendees value.', v_display_name
          USING ERRCODE = '22023';
      END IF;
      v_max_attendees := (v_household ->> 'maxAttendees')::integer;
    ELSE
      v_max_attendees := v_guest_count;
    END IF;

    INSERT INTO public.guest_groups (
      wedding_id,
      workspace_id,
      display_name,
      max_attendees,
      notes,
      sort_order,
      created_by
    )
    VALUES (
      p_wedding_id,
      p_workspace_id,
      v_display_name,
      v_max_attendees,
      v_notes,
      v_next_group_sort,
      v_caller_id
    )
    RETURNING id INTO v_group_id;

    v_next_group_sort := v_next_group_sort + 1;
    v_imported_groups := v_imported_groups + 1;
    v_guest_sort := 0;

    FOR v_guest IN SELECT value FROM pg_catalog.jsonb_array_elements(v_guests_arr) LOOP
      IF pg_catalog.jsonb_typeof(v_guest) <> 'object' THEN
        RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Each guest item in household "%" must be an object.', v_display_name
          USING ERRCODE = '22023';
      END IF;

      v_side_raw := pg_catalog.lower(pg_catalog.btrim(COALESCE(v_guest ->> 'side', 'mutual')));
      IF v_side_raw = '' THEN
        v_side_raw := 'mutual';
      END IF;
      IF v_side_raw NOT IN ('partner_one', 'partner_two', 'mutual', 'other') THEN
        RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Invalid guest side "%" in household "%".', v_side_raw, v_display_name
          USING ERRCODE = '22023';
      END IF;
      v_side := v_side_raw::public.guest_side;

      IF v_guest ? 'isChild' AND pg_catalog.jsonb_typeof(v_guest -> 'isChild') <> 'null' THEN
        IF pg_catalog.jsonb_typeof(v_guest -> 'isChild') <> 'boolean' THEN
          RAISE EXCEPTION 'CSV_IMPORT_VALIDATION_ERROR: Guest isChild flag in household "%" must be boolean.', v_display_name
            USING ERRCODE = '22023';
        END IF;
        v_is_child := (v_guest ->> 'isChild')::boolean;
      ELSE
        v_is_child := false;
      END IF;

      INSERT INTO public.guests (
        group_id,
        wedding_id,
        workspace_id,
        first_name,
        last_name,
        email,
        phone,
        side,
        is_child,
        dietary_notes,
        sort_order
      )
      VALUES (
        v_group_id,
        p_wedding_id,
        p_workspace_id,
        COALESCE(v_guest ->> 'firstName', ''),
        COALESCE(v_guest ->> 'lastName', ''),
        COALESCE(v_guest ->> 'email', ''),
        COALESCE(v_guest ->> 'phone', ''),
        v_side,
        v_is_child,
        COALESCE(v_guest ->> 'dietaryNotes', ''),
        v_guest_sort
      );

      v_guest_sort := v_guest_sort + 1;
      v_imported_guests := v_imported_guests + 1;
    END LOOP;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'importedGroupCount', v_imported_groups,
    'importedGuestCount', v_imported_guests
  );
END;
$$;

ALTER FUNCTION public.import_wedding_guests(uuid, uuid, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.import_wedding_guests(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_wedding_guests(uuid, uuid, jsonb)
  TO authenticated;

-- 6.2 Issue or rotate a 256-bit household invitation link (`editor`+; returns raw token ONCE)
CREATE OR REPLACE FUNCTION public.issue_household_invitation(
  p_workspace_id uuid,
  p_wedding_id uuid,
  p_group_id uuid,
  p_expires_at timestamptz DEFAULT NULL
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
  v_raw_token text;
  v_token_hash text;
  v_invitation public.invitations;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required to issue household invitation links.'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL OR p_wedding_id IS NULL OR p_group_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace ID, wedding ID, and household group ID are required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_expires_at IS NOT NULL AND p_expires_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'INVALID_INVITATION_EXPIRY: Invitation expiration timestamp must be in the future.'
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
    RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: Only workspace owners, admins, and editors can issue or rotate invitation links.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
    FROM public.guest_groups gg
   WHERE gg.workspace_id = p_workspace_id
     AND gg.wedding_id = p_wedding_id
     AND gg.id = p_group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOUSEHOLD_NOT_FOUND: Household group not found in this wedding project.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Generate 32 CSPRNG bytes (256 bits entropy >> 128 bits minimum), encoded as 43-char base64url.
  v_raw_token := pg_catalog.translate(
    pg_catalog.rtrim(
      pg_catalog.regexp_replace(
        pg_catalog.encode(extensions.gen_random_bytes(32), 'base64'),
        E'[\\r\\n\\s]+',
        '',
        'g'
      ),
      '='
    ),
    '+/',
    '-_'
  );

  v_token_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_raw_token, 'UTF8')),
    'hex'
  );

  -- Revoke any currently active invitation for this household before inserting the rotated hash.
  UPDATE public.invitations inv
     SET status = 'revoked'::public.invitation_status,
         revoked_at = pg_catalog.now()
   WHERE inv.workspace_id = p_workspace_id
     AND inv.wedding_id = p_wedding_id
     AND inv.group_id = p_group_id
     AND inv.status = 'active'::public.invitation_status;

  INSERT INTO public.invitations (
    group_id,
    wedding_id,
    workspace_id,
    token_hash,
    status,
    delivery_status,
    expires_at,
    issued_by
  )
  VALUES (
    p_group_id,
    p_wedding_id,
    p_workspace_id,
    v_token_hash,
    'active'::public.invitation_status,
    'not_shared'::public.invitation_delivery_status,
    p_expires_at,
    v_caller_id
  )
  RETURNING * INTO v_invitation;

  RETURN pg_catalog.jsonb_build_object(
    'rawToken', v_raw_token,
    'invitation', pg_catalog.jsonb_build_object(
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
      'revokedAt', NULL,
      'issuedBy', v_invitation.issued_by,
      'createdAt', pg_catalog.to_char(v_invitation.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'updatedAt', pg_catalog.to_char(v_invitation.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );
END;
$$;

ALTER FUNCTION public.issue_household_invitation(uuid, uuid, uuid, timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.issue_household_invitation(uuid, uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_household_invitation(uuid, uuid, uuid, timestamptz)
  TO authenticated;

-- 6.3 Revoke an active household invitation link (`editor`+)
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

-- 6.4 Update active invitation delivery status & expiration timestamp (`editor`+)
CREATE OR REPLACE FUNCTION public.update_household_invitation(
  p_workspace_id uuid,
  p_wedding_id uuid,
  p_invitation_id uuid,
  p_delivery_status public.invitation_delivery_status,
  p_expires_at timestamptz DEFAULT NULL
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
  v_invitation public.invitations;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required to update household invitations.'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL OR p_wedding_id IS NULL OR p_invitation_id IS NULL OR p_delivery_status IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace ID, wedding ID, invitation ID, and delivery status are required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_expires_at IS NOT NULL AND p_expires_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'INVALID_INVITATION_EXPIRY: Invitation expiration timestamp must be in the future.'
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
    RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: Only workspace owners, admins, and editors can update invitation metadata.'
      USING ERRCODE = '42501';
  END IF;

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

  IF v_invitation.status <> 'active'::public.invitation_status THEN
    RAISE EXCEPTION 'REVOKED_INVITATION_CANNOT_UPDATE: Revoked invitations cannot be modified.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.invitations inv
     SET delivery_status = p_delivery_status,
         expires_at = p_expires_at
   WHERE inv.id = v_invitation.id
   RETURNING * INTO v_invitation;

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
    'revokedAt', NULL,
    'issuedBy', v_invitation.issued_by,
    'createdAt', pg_catalog.to_char(v_invitation.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', pg_catalog.to_char(v_invitation.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$$;

ALTER FUNCTION public.update_household_invitation(
  uuid,
  uuid,
  uuid,
  public.invitation_delivery_status,
  timestamptz
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_household_invitation(
  uuid,
  uuid,
  uuid,
  public.invitation_delivery_status,
  timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_household_invitation(
  uuid,
  uuid,
  uuid,
  public.invitation_delivery_status,
  timestamptz
) TO authenticated;

-- 6.5 Read-only public household invitation resolution by token (`STABLE`, `anon` + `authenticated`)
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
  v_version_number integer;
  v_published_at timestamptz;
  v_snapshot jsonb;
  v_display_name text;
  v_max_attendees integer;
  v_guests_json jsonb;
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
    )
  );
END;
$$;

ALTER FUNCTION public.resolve_invitation_by_token(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.resolve_invitation_by_token(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_invitation_by_token(text)
  TO anon, authenticated;
