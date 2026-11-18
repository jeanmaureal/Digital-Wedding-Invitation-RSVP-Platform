-- ============================================================================
-- Phase 2: Wedding Project Management & 1:1 Wedding Settings (Gate 2)
-- ============================================================================
-- Security, Isolation & Integrity Invariants:
--   1. Zero `anon` privileges on `public.weddings`, `public.wedding_settings`,
--      or Phase 2 organizer RPCs (`create_wedding`, `duplicate_wedding`).
--   2. Every `public.weddings` row maintains a strict 1:1 `public.wedding_settings`
--      row via RPC-only creation (`INSERT` revoked from `authenticated`) and a
--      composite foreign key `(wedding_id, workspace_id) -> weddings(id, workspace_id)`
--      that makes cross-workspace settings linkage structurally impossible.
--   3. Workspace RBAC enforced in PostgreSQL:
--        - `SELECT`: `owner`, `admin`, `editor`, `viewer`
--        - `create_wedding`, `duplicate_wedding`, `UPDATE` (details, settings,
--          archive/restore): `owner`, `admin`, `editor`
--        - `DELETE` on `public.weddings`: `owner`, `admin` only
--   4. Phase 2 lifecycle guard blocks premature transitions to `'published'`
--      (`P0001 PUBLISHING_REQUIRES_SNAPSHOT`) until immutable `published_versions`
--      snapshots arrive in Phase 5/8, while supporting `'draft' <-> 'archived'`.
--   5. `wedding_settings.timezone` enforces canonical IANA timezone identifiers
--      verified against `pg_catalog.pg_timezone_names` (`22023 INVALID_TIMEZONE`).
--   6. All new functions enforce `OWNER TO postgres`, `SET search_path = ''`,
--      schema-qualified names, and `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.
-- ============================================================================

-- 1. Domain enums
CREATE TYPE public.wedding_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE public.wedding_access_mode AS ENUM ('public', 'invite_only');

-- 2. Tables & structural constraints
CREATE TABLE public.weddings (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  partner_one_name text NOT NULL,
  partner_two_name text NOT NULL,
  slug text NOT NULL,
  event_date date,
  venue_name text NOT NULL DEFAULT '',
  venue_location text NOT NULL DEFAULT '',
  status public.wedding_status NOT NULL DEFAULT 'draft'::public.wedding_status,
  archived_at timestamptz,
  duplicated_from_wedding_id uuid REFERENCES public.weddings(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT weddings_slug_key UNIQUE (slug),
  CONSTRAINT weddings_id_workspace_id_key UNIQUE (id, workspace_id),
  CONSTRAINT weddings_title_chk CHECK (
    title = pg_catalog.btrim(title)
    AND pg_catalog.char_length(title) BETWEEN 2 AND 120
  ),
  CONSTRAINT weddings_partner_one_name_chk CHECK (
    partner_one_name = pg_catalog.btrim(partner_one_name)
    AND pg_catalog.char_length(partner_one_name) BETWEEN 1 AND 80
  ),
  CONSTRAINT weddings_partner_two_name_chk CHECK (
    partner_two_name = pg_catalog.btrim(partner_two_name)
    AND pg_catalog.char_length(partner_two_name) BETWEEN 1 AND 80
  ),
  CONSTRAINT weddings_slug_chk CHECK (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    AND pg_catalog.char_length(slug) BETWEEN 3 AND 80
  ),
  CONSTRAINT weddings_slug_not_reserved_chk CHECK (
    slug <> ALL (
      ARRAY[
        'admin',
        'api',
        'app',
        'assets',
        'auth',
        'forgot-password',
        'health',
        'i',
        'internal',
        'login',
        'logout',
        'null',
        'public',
        'reset-password',
        'settings',
        'signup',
        'static',
        'support',
        'system',
        'undefined',
        'w',
        'webhook',
        'webhooks'
      ]
    )
  ),
  CONSTRAINT weddings_venue_name_chk CHECK (
    venue_name = pg_catalog.btrim(venue_name)
    AND pg_catalog.char_length(venue_name) <= 120
  ),
  CONSTRAINT weddings_venue_location_chk CHECK (
    venue_location = pg_catalog.btrim(venue_location)
    AND pg_catalog.char_length(venue_location) <= 160
  ),
  CONSTRAINT weddings_archived_at_sync_chk CHECK (
    (status = 'archived'::public.wedding_status AND archived_at IS NOT NULL)
    OR (status <> 'archived'::public.wedding_status AND archived_at IS NULL)
  ),
  CONSTRAINT weddings_no_self_duplicate_chk CHECK (
    duplicated_from_wedding_id IS NULL
    OR duplicated_from_wedding_id <> id
  )
);

CREATE TABLE public.wedding_settings (
  wedding_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  rsvp_deadline timestamptz,
  is_rsvp_open boolean NOT NULL DEFAULT true,
  access_mode public.wedding_access_mode NOT NULL DEFAULT 'public'::public.wedding_access_mode,
  allow_plus_ones_default boolean NOT NULL DEFAULT false,
  show_guest_dietary_notes boolean NOT NULL DEFAULT true,
  primary_locale text NOT NULL DEFAULT 'en',
  contact_email text,
  dress_code text NOT NULL DEFAULT '',
  rsvp_confirmation_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT wedding_settings_wedding_workspace_fkey
    FOREIGN KEY (wedding_id, workspace_id)
    REFERENCES public.weddings(id, workspace_id)
    ON DELETE CASCADE,
  CONSTRAINT wedding_settings_timezone_format_chk CHECK (
    timezone = pg_catalog.btrim(timezone)
    AND pg_catalog.char_length(timezone) BETWEEN 3 AND 80
    AND (
      timezone = 'UTC'
      OR (
        timezone ~ '^[A-Za-z0-9_+-]+(?:/[A-Za-z0-9_+-]+)+$'
        AND timezone !~ '^[+-]'
      )
    )
  ),
  CONSTRAINT wedding_settings_primary_locale_chk CHECK (
    primary_locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'
  ),
  CONSTRAINT wedding_settings_contact_email_chk CHECK (
    contact_email IS NULL
    OR (
      contact_email = pg_catalog.lower(pg_catalog.btrim(contact_email))
      AND pg_catalog.char_length(contact_email) BETWEEN 3 AND 320
      AND pg_catalog.strpos(contact_email, '@') > 1
    )
  ),
  CONSTRAINT wedding_settings_dress_code_chk CHECK (
    dress_code = pg_catalog.btrim(dress_code)
    AND pg_catalog.char_length(dress_code) <= 120
  ),
  CONSTRAINT wedding_settings_rsvp_confirmation_message_chk CHECK (
    rsvp_confirmation_message = pg_catalog.btrim(rsvp_confirmation_message)
    AND pg_catalog.char_length(rsvp_confirmation_message) <= 500
  )
);

-- 3. Indexes for foreign keys, dashboard listing, status filtering & RLS predicates
CREATE INDEX weddings_workspace_id_updated_at_idx
  ON public.weddings (workspace_id, updated_at DESC, id DESC);

CREATE INDEX weddings_workspace_id_status_idx
  ON public.weddings (workspace_id, status);

CREATE INDEX weddings_created_by_idx
  ON public.weddings (created_by);

CREATE INDEX weddings_duplicated_from_wedding_id_idx
  ON public.weddings (duplicated_from_wedding_id);

-- Covers both `workspace_id` RLS / list lookups AND the 2-column composite FK `(wedding_id, workspace_id)`.
CREATE INDEX wedding_settings_workspace_id_wedding_id_idx
  ON public.wedding_settings (workspace_id, wedding_id);

-- 4. Private validation & normalization helpers (`app_private`)
CREATE OR REPLACE FUNCTION app_private.is_reserved_wedding_slug(
  p_slug text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(p_slug, '') = ANY (
    ARRAY[
      'admin',
      'api',
      'app',
      'assets',
      'auth',
      'forgot-password',
      'health',
      'i',
      'internal',
      'login',
      'logout',
      'null',
      'public',
      'reset-password',
      'settings',
      'signup',
      'static',
      'support',
      'system',
      'undefined',
      'w',
      'webhook',
      'webhooks'
    ]
  );
$$;

ALTER FUNCTION app_private.is_reserved_wedding_slug(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.is_reserved_wedding_slug(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.assert_valid_iana_timezone(
  p_timezone text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz text;
BEGIN
  v_tz := pg_catalog.btrim(COALESCE(p_timezone, ''));

  IF pg_catalog.char_length(v_tz) < 3
     OR pg_catalog.char_length(v_tz) > 80
     OR NOT (
       v_tz = 'UTC'
       OR (
         v_tz ~ '^[A-Za-z0-9_+-]+(?:/[A-Za-z0-9_+-]+)+$'
         AND v_tz !~ '^[+-]'
       )
     )
  THEN
    RAISE EXCEPTION 'INVALID_TIMEZONE: Choose a valid canonical IANA timezone identifier (for example, Asia/Manila, America/New_York, or UTC).'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_timezone_names tz
     WHERE tz.name = v_tz
  ) THEN
    RAISE EXCEPTION 'INVALID_TIMEZONE: Unrecognized IANA timezone "%".', v_tz
      USING ERRCODE = '22023';
  END IF;

  RETURN v_tz;
END;
$$;

ALTER FUNCTION app_private.assert_valid_iana_timezone(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.assert_valid_iana_timezone(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.derive_wedding_base_slug(
  p_source_text text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_base text;
BEGIN
  v_base := pg_catalog.regexp_replace(
    pg_catalog.lower(COALESCE(p_source_text, '')),
    '[^a-z0-9]+',
    '-',
    'g'
  );
  v_base := pg_catalog.regexp_replace(v_base, '(^-+|-+$)', '', 'g');

  IF pg_catalog.char_length(v_base) < 3 OR app_private.is_reserved_wedding_slug(v_base) THEN
    v_base := 'wedding-celebration';
  END IF;

  v_base := pg_catalog.left(v_base, 71);
  v_base := pg_catalog.regexp_replace(v_base, '-+$', '', 'g');

  IF pg_catalog.char_length(v_base) < 3 OR app_private.is_reserved_wedding_slug(v_base) THEN
    v_base := 'wedding-celebration';
  END IF;

  RETURN v_base;
END;
$$;

ALTER FUNCTION app_private.derive_wedding_base_slug(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.derive_wedding_base_slug(text) FROM PUBLIC, anon, authenticated;

-- 5. Normalization, lifecycle & immutability triggers (`app_private`)
CREATE OR REPLACE FUNCTION app_private.normalize_wedding_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Core tenant and row identity columns are strictly immutable.
    -- `created_by` and `duplicated_from_wedding_id` permit transitions to NULL only
    -- so PostgreSQL FK `ON DELETE SET NULL` succeeds cleanly when a former owner
    -- account or source wedding is deleted.
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL)
       OR (
         NEW.duplicated_from_wedding_id IS DISTINCT FROM OLD.duplicated_from_wedding_id
         AND NEW.duplicated_from_wedding_id IS NOT NULL
       )
    THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Wedding identity, workspace ownership, and provenance metadata are immutable.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Phase 2 lifecycle guard: `published_versions` snapshots arrive in Phase 5/8.
  IF NEW.status = 'published'::public.wedding_status THEN
    RAISE EXCEPTION 'PUBLISHING_REQUIRES_SNAPSHOT: Weddings cannot transition to published until an immutable snapshot is created.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Synchronize `archived_at` automatically with `status`.
  IF NEW.status = 'archived'::public.wedding_status THEN
    IF TG_OP = 'INSERT' OR OLD.status <> 'archived'::public.wedding_status OR NEW.archived_at IS NULL THEN
      NEW.archived_at := COALESCE(NEW.archived_at, pg_catalog.now());
    END IF;
  ELSE
    NEW.archived_at := NULL;
  END IF;

  NEW.title := pg_catalog.btrim(COALESCE(NEW.title, ''));
  NEW.partner_one_name := pg_catalog.btrim(COALESCE(NEW.partner_one_name, ''));
  NEW.partner_two_name := pg_catalog.btrim(COALESCE(NEW.partner_two_name, ''));
  NEW.slug := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.slug, '')));
  NEW.venue_name := pg_catalog.btrim(COALESCE(NEW.venue_name, ''));
  NEW.venue_location := pg_catalog.btrim(COALESCE(NEW.venue_location, ''));

  IF pg_catalog.char_length(NEW.title) < 2 OR pg_catalog.char_length(NEW.title) > 120 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Wedding project title must be between 2 and 120 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(NEW.partner_one_name) < 1 OR pg_catalog.char_length(NEW.partner_one_name) > 80 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Partner 1 name must be between 1 and 80 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(NEW.partner_two_name) < 1 OR pg_catalog.char_length(NEW.partner_two_name) > 80 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Partner 2 name must be between 1 and 80 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(NEW.slug) < 3
     OR pg_catalog.char_length(NEW.slug) > 80
     OR NEW.slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Wedding URL slug must be 3 to 80 lowercase letters, numbers, or single hyphens.'
      USING ERRCODE = '22023';
  END IF;

  IF app_private.is_reserved_wedding_slug(NEW.slug) THEN
    RAISE EXCEPTION 'RESERVED_WEDDING_SLUG: That wedding URL slug is reserved by the platform.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(NEW.venue_name) > 120 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Venue name must be 120 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(NEW.venue_location) > 160 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Venue location must be 160 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.normalize_wedding_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.normalize_wedding_fields() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER weddings_normalize_fields
  BEFORE INSERT OR UPDATE ON public.weddings
  FOR EACH ROW
  EXECUTE FUNCTION app_private.normalize_wedding_fields();

CREATE TRIGGER weddings_set_updated_at
  BEFORE UPDATE ON public.weddings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION app_private.normalize_wedding_settings_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_email text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.wedding_id IS DISTINCT FROM OLD.wedding_id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Wedding settings identity and workspace linkage are immutable.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.timezone IS DISTINCT FROM OLD.timezone THEN
    NEW.timezone := app_private.assert_valid_iana_timezone(NEW.timezone);
  END IF;

  NEW.primary_locale := pg_catalog.btrim(COALESCE(NEW.primary_locale, 'en'));
  IF NEW.primary_locale !~ '^[a-z]{2}(?:-[A-Z]{2})?$' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Primary locale must be an ISO language tag such as "en" or "en-US".'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.contact_email IS NOT NULL THEN
    v_email := pg_catalog.lower(pg_catalog.btrim(NEW.contact_email));
    IF v_email = '' THEN
      NEW.contact_email := NULL;
    ELSIF pg_catalog.char_length(v_email) < 3
          OR pg_catalog.char_length(v_email) > 320
          OR pg_catalog.strpos(v_email, '@') <= 1
    THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Enter a valid guest contact email address.'
        USING ERRCODE = '22023';
    ELSE
      NEW.contact_email := v_email;
    END IF;
  END IF;

  NEW.dress_code := pg_catalog.btrim(COALESCE(NEW.dress_code, ''));
  IF pg_catalog.char_length(NEW.dress_code) > 120 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Dress code must be 120 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  NEW.rsvp_confirmation_message := pg_catalog.btrim(COALESCE(NEW.rsvp_confirmation_message, ''));
  IF pg_catalog.char_length(NEW.rsvp_confirmation_message) > 500 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: RSVP confirmation message must be 500 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.normalize_wedding_settings_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.normalize_wedding_settings_fields() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER wedding_settings_normalize_fields
  BEFORE INSERT OR UPDATE ON public.wedding_settings
  FOR EACH ROW
  EXECUTE FUNCTION app_private.normalize_wedding_settings_fields();

CREATE TRIGGER wedding_settings_set_updated_at
  BEFORE UPDATE ON public.wedding_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 6. Explicit table/column privileges & Row Level Security
ALTER TABLE public.weddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wedding_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.weddings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.wedding_settings FROM PUBLIC, anon, authenticated;

GRANT
  SELECT,
  UPDATE (
    title,
    partner_one_name,
    partner_two_name,
    slug,
    event_date,
    venue_name,
    venue_location,
    status
  ),
  DELETE
ON TABLE public.weddings TO authenticated;

GRANT
  SELECT,
  UPDATE (
    timezone,
    rsvp_deadline,
    is_rsvp_open,
    access_mode,
    allow_plus_ones_default,
    show_guest_dietary_notes,
    primary_locale,
    contact_email,
    dress_code,
    rsvp_confirmation_message
  )
ON TABLE public.wedding_settings TO authenticated;

-- `public.weddings` RLS policies
CREATE POLICY weddings_select_workspace_member
  ON public.weddings
  FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT app_private.user_workspace_ids()));

CREATE POLICY weddings_update_owner_admin_editor
  ON public.weddings
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

CREATE POLICY weddings_delete_owner_or_admin
  ON public.weddings
  FOR DELETE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT app_private.user_workspace_ids_with_roles(
        ARRAY[
          'owner'::public.workspace_role,
          'admin'::public.workspace_role
        ]
      )
    )
  );

-- `public.wedding_settings` RLS policies
CREATE POLICY wedding_settings_select_workspace_member
  ON public.wedding_settings
  FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT app_private.user_workspace_ids()));

CREATE POLICY wedding_settings_update_owner_admin_editor
  ON public.wedding_settings
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

-- 7. Atomic organizer RPCs (`public`)

-- 7.1 `create_wedding`: Atomically creates `'draft'` wedding + 1:1 `wedding_settings`
CREATE OR REPLACE FUNCTION public.create_wedding(
  p_workspace_id uuid,
  p_title text,
  p_partner_one_name text,
  p_partner_two_name text,
  p_slug text DEFAULT NULL,
  p_event_date date DEFAULT NULL,
  p_venue_name text DEFAULT '',
  p_venue_location text DEFAULT '',
  p_timezone text DEFAULT 'UTC',
  p_rsvp_deadline timestamptz DEFAULT NULL,
  p_access_mode public.wedding_access_mode DEFAULT 'public'::public.wedding_access_mode,
  p_is_rsvp_open boolean DEFAULT true,
  p_allow_plus_ones_default boolean DEFAULT false,
  p_show_guest_dietary_notes boolean DEFAULT true,
  p_primary_locale text DEFAULT 'en',
  p_contact_email text DEFAULT NULL,
  p_dress_code text DEFAULT '',
  p_rsvp_confirmation_message text DEFAULT ''
)
RETURNS public.weddings
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role public.workspace_role;
  v_validated_tz text;
  v_explicit_slug text;
  v_base_slug text;
  v_candidate_slug text;
  v_suffix text;
  v_attempt int;
  v_wedding public.weddings;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required to create a wedding project.'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace ID is required.'
      USING ERRCODE = '22023';
  END IF;

  -- Step 1: Lock parent workspace in key-share mode so concurrent workspace deletion
  -- or membership role mutations (`FOR UPDATE`) serialize cleanly while parallel
  -- wedding creations in the same workspace do not block one another.
  PERFORM 1
    FROM public.workspaces w
   WHERE w.id = p_workspace_id
   FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED: You do not have access to this workspace.'
      USING ERRCODE = '42501';
  END IF;

  -- Step 2: Coordinate with concurrent account deletion (`FOR KEY SHARE` vs `FOR UPDATE`).
  PERFORM 1
    FROM auth.users u
   WHERE u.id = v_caller_id
   FOR KEY SHARE;

  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_caller_id) THEN
    RAISE EXCEPTION 'ORGANIZER_NOT_REGISTERED: Organizer profile does not exist.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Step 3: Verify fresh committed workspace role.
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
    RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: Viewers cannot create wedding projects.'
      USING ERRCODE = '42501';
  END IF;

  -- Validate IANA timezone upfront before inserting `public.weddings`.
  v_validated_tz := app_private.assert_valid_iana_timezone(COALESCE(p_timezone, 'UTC'));

  -- Step 4: Insert `public.weddings` with explicit slug or bounded collision-retry auto-slug.
  IF p_slug IS NOT NULL AND pg_catalog.btrim(p_slug) <> '' THEN
    v_explicit_slug := pg_catalog.lower(pg_catalog.btrim(p_slug));
    IF pg_catalog.char_length(v_explicit_slug) < 3
       OR pg_catalog.char_length(v_explicit_slug) > 80
       OR v_explicit_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Wedding URL slug must be 3 to 80 lowercase letters, numbers, or single hyphens.'
        USING ERRCODE = '22023';
    END IF;

    IF app_private.is_reserved_wedding_slug(v_explicit_slug) THEN
      RAISE EXCEPTION 'RESERVED_WEDDING_SLUG: That wedding URL slug is reserved by the platform.'
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      INSERT INTO public.weddings (
        workspace_id,
        title,
        partner_one_name,
        partner_two_name,
        slug,
        event_date,
        venue_name,
        venue_location,
        status,
        created_by
      )
      VALUES (
        p_workspace_id,
        p_title,
        p_partner_one_name,
        p_partner_two_name,
        v_explicit_slug,
        p_event_date,
        COALESCE(p_venue_name, ''),
        COALESCE(p_venue_location, ''),
        'draft'::public.wedding_status,
        v_caller_id
      )
      RETURNING * INTO v_wedding;
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'WEDDING_SLUG_TAKEN: That public wedding URL slug is already in use.'
          USING ERRCODE = '23505';
    END;
  ELSE
    v_base_slug := app_private.derive_wedding_base_slug(
      COALESCE(NULLIF(pg_catalog.btrim(COALESCE(p_partner_one_name, '')), ''), '')
      || '-'
      || COALESCE(NULLIF(pg_catalog.btrim(COALESCE(p_partner_two_name, '')), ''), '')
    );
    IF v_base_slug = 'wedding-celebration' THEN
      v_base_slug := app_private.derive_wedding_base_slug(p_title);
    END IF;

    FOR v_attempt IN 1..8 LOOP
      IF v_attempt = 1 THEN
        v_candidate_slug := v_base_slug;
      ELSE
        v_suffix := pg_catalog.substr(
          pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
          1,
          6
        );
        v_candidate_slug := v_base_slug || '-' || v_suffix;
      END IF;

      BEGIN
        INSERT INTO public.weddings (
          workspace_id,
          title,
          partner_one_name,
          partner_two_name,
          slug,
          event_date,
          venue_name,
          venue_location,
          status,
          created_by
        )
        VALUES (
          p_workspace_id,
          p_title,
          p_partner_one_name,
          p_partner_two_name,
          v_candidate_slug,
          p_event_date,
          COALESCE(p_venue_name, ''),
          COALESCE(p_venue_location, ''),
          'draft'::public.wedding_status,
          v_caller_id
        )
        RETURNING * INTO v_wedding;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          IF v_attempt = 8 THEN
            RAISE EXCEPTION 'WEDDING_SLUG_TAKEN: Unable to allocate a unique wedding URL slug. Please specify a custom slug.'
              USING ERRCODE = '23505';
          END IF;
      END;
    END LOOP;
  END IF;

  -- Step 5: Atomically insert 1:1 `public.wedding_settings` bound via `(wedding_id, workspace_id)`.
  INSERT INTO public.wedding_settings (
    wedding_id,
    workspace_id,
    timezone,
    rsvp_deadline,
    is_rsvp_open,
    access_mode,
    allow_plus_ones_default,
    show_guest_dietary_notes,
    primary_locale,
    contact_email,
    dress_code,
    rsvp_confirmation_message
  )
  VALUES (
    v_wedding.id,
    p_workspace_id,
    v_validated_tz,
    p_rsvp_deadline,
    COALESCE(p_is_rsvp_open, true),
    COALESCE(p_access_mode, 'public'::public.wedding_access_mode),
    COALESCE(p_allow_plus_ones_default, false),
    COALESCE(p_show_guest_dietary_notes, true),
    COALESCE(p_primary_locale, 'en'),
    p_contact_email,
    COALESCE(p_dress_code, ''),
    COALESCE(p_rsvp_confirmation_message, '')
  );

  RETURN v_wedding;
END;
$$;

ALTER FUNCTION public.create_wedding(
  uuid,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  timestamptz,
  public.wedding_access_mode,
  boolean,
  boolean,
  boolean,
  text,
  text,
  text,
  text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_wedding(
  uuid,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  timestamptz,
  public.wedding_access_mode,
  boolean,
  boolean,
  boolean,
  text,
  text,
  text,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_wedding(
  uuid,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  timestamptz,
  public.wedding_access_mode,
  boolean,
  boolean,
  boolean,
  text,
  text,
  text,
  text
) TO authenticated;

-- 7.2 `duplicate_wedding`: Same-workspace atomic configuration clone into a fresh `'draft'`
CREATE OR REPLACE FUNCTION public.duplicate_wedding(
  p_workspace_id uuid,
  p_source_wedding_id uuid,
  p_title text,
  p_slug text DEFAULT NULL,
  p_partner_one_name text DEFAULT NULL,
  p_partner_two_name text DEFAULT NULL,
  p_event_date date DEFAULT NULL
)
RETURNS public.weddings
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role public.workspace_role;
  v_source_wedding public.weddings;
  v_source_settings public.wedding_settings;
  v_partner_one text;
  v_partner_two text;
  v_explicit_slug text;
  v_base_slug text;
  v_candidate_slug text;
  v_suffix text;
  v_attempt int;
  v_new_wedding public.weddings;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required to duplicate a wedding project.'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL OR p_source_wedding_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace ID and source wedding ID are required.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
    FROM public.workspaces w
   WHERE w.id = p_workspace_id
   FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED: You do not have access to this workspace.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
    FROM auth.users u
   WHERE u.id = v_caller_id
   FOR KEY SHARE;

  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_caller_id) THEN
    RAISE EXCEPTION 'ORGANIZER_NOT_REGISTERED: Organizer profile does not exist.'
      USING ERRCODE = 'P0002';
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
    RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: Viewers cannot duplicate wedding projects.'
      USING ERRCODE = '42501';
  END IF;

  -- Enforce strict same-workspace scope (`P2-AC03`, `P2-AC04`).
  SELECT *
    INTO v_source_wedding
    FROM public.weddings w
   WHERE w.id = p_source_wedding_id
     AND w.workspace_id = p_workspace_id
   FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WEDDING_NOT_FOUND: Source wedding project was not found in this workspace.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
    INTO v_source_settings
    FROM public.wedding_settings ws
   WHERE ws.wedding_id = p_source_wedding_id
     AND ws.workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WEDDING_NOT_FOUND: Source wedding settings were not found in this workspace.'
      USING ERRCODE = 'P0002';
  END IF;

  v_partner_one := CASE
    WHEN p_partner_one_name IS NOT NULL AND pg_catalog.btrim(p_partner_one_name) <> ''
      THEN pg_catalog.btrim(p_partner_one_name)
    ELSE v_source_wedding.partner_one_name
  END;

  v_partner_two := CASE
    WHEN p_partner_two_name IS NOT NULL AND pg_catalog.btrim(p_partner_two_name) <> ''
      THEN pg_catalog.btrim(p_partner_two_name)
    ELSE v_source_wedding.partner_two_name
  END;

  IF p_slug IS NOT NULL AND pg_catalog.btrim(p_slug) <> '' THEN
    v_explicit_slug := pg_catalog.lower(pg_catalog.btrim(p_slug));
    IF pg_catalog.char_length(v_explicit_slug) < 3
       OR pg_catalog.char_length(v_explicit_slug) > 80
       OR v_explicit_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Wedding URL slug must be 3 to 80 lowercase letters, numbers, or single hyphens.'
        USING ERRCODE = '22023';
    END IF;

    IF app_private.is_reserved_wedding_slug(v_explicit_slug) THEN
      RAISE EXCEPTION 'RESERVED_WEDDING_SLUG: That wedding URL slug is reserved by the platform.'
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      INSERT INTO public.weddings (
        workspace_id,
        title,
        partner_one_name,
        partner_two_name,
        slug,
        event_date,
        venue_name,
        venue_location,
        status,
        duplicated_from_wedding_id,
        created_by
      )
      VALUES (
        p_workspace_id,
        p_title,
        v_partner_one,
        v_partner_two,
        v_explicit_slug,
        p_event_date,
        v_source_wedding.venue_name,
        v_source_wedding.venue_location,
        'draft'::public.wedding_status,
        v_source_wedding.id,
        v_caller_id
      )
      RETURNING * INTO v_new_wedding;
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'WEDDING_SLUG_TAKEN: That public wedding URL slug is already in use.'
          USING ERRCODE = '23505';
    END;
  ELSE
    v_base_slug := app_private.derive_wedding_base_slug(p_title);

    FOR v_attempt IN 1..8 LOOP
      IF v_attempt = 1 THEN
        v_candidate_slug := v_base_slug;
      ELSE
        v_suffix := pg_catalog.substr(
          pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
          1,
          6
        );
        v_candidate_slug := v_base_slug || '-' || v_suffix;
      END IF;

      BEGIN
        INSERT INTO public.weddings (
          workspace_id,
          title,
          partner_one_name,
          partner_two_name,
          slug,
          event_date,
          venue_name,
          venue_location,
          status,
          duplicated_from_wedding_id,
          created_by
        )
        VALUES (
          p_workspace_id,
          p_title,
          v_partner_one,
          v_partner_two,
          v_candidate_slug,
          p_event_date,
          v_source_wedding.venue_name,
          v_source_wedding.venue_location,
          'draft'::public.wedding_status,
          v_source_wedding.id,
          v_caller_id
        )
        RETURNING * INTO v_new_wedding;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          IF v_attempt = 8 THEN
            RAISE EXCEPTION 'WEDDING_SLUG_TAKEN: Unable to allocate a unique wedding URL slug. Please specify a custom slug.'
              USING ERRCODE = '23505';
          END IF;
      END;
    END LOOP;
  END IF;

  -- Clone configuration settings only (resetting `rsvp_deadline` to NULL and `is_rsvp_open` to true).
  INSERT INTO public.wedding_settings (
    wedding_id,
    workspace_id,
    timezone,
    rsvp_deadline,
    is_rsvp_open,
    access_mode,
    allow_plus_ones_default,
    show_guest_dietary_notes,
    primary_locale,
    contact_email,
    dress_code,
    rsvp_confirmation_message
  )
  VALUES (
    v_new_wedding.id,
    p_workspace_id,
    v_source_settings.timezone,
    NULL,
    true,
    v_source_settings.access_mode,
    v_source_settings.allow_plus_ones_default,
    v_source_settings.show_guest_dietary_notes,
    v_source_settings.primary_locale,
    v_source_settings.contact_email,
    v_source_settings.dress_code,
    v_source_settings.rsvp_confirmation_message
  );

  RETURN v_new_wedding;
END;
$$;

ALTER FUNCTION public.duplicate_wedding(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  date
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.duplicate_wedding(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  date
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.duplicate_wedding(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  date
) TO authenticated;
