-- ============================================================================
-- Phase 5: Public Wedding Website & Immutable Published Snapshots (Gate 4)
-- ============================================================================
-- Security, Immutability & Isolation Invariants:
--   1. `public.published_versions` stores sequential, immutable `InvitationDocument`
--      snapshots (`version_number >= 1`, `schema_version = 1`, `content_snapshot`
--      JSON object <= 256 KB) bound via composite FK `(workspace_id, wedding_id)
--      -> public.weddings(workspace_id, id) ON DELETE CASCADE`.
--   2. Active snapshot state uses `is_active boolean` with partial unique index
--      `published_versions_one_active_per_wedding_idx (wedding_id) WHERE is_active`
--      so at most one version is active per wedding with zero cyclic foreign keys.
--   3. `anon` holds zero table privileges on `published_versions`, `weddings`,
--      `wedding_settings`, `wedding_themes`, and `wedding_sections`. `authenticated`
--      holds workspace-scoped `SELECT` only on `published_versions`; all snapshot
--      writes flow exclusively through `publish_wedding` and `unpublish_wedding`.
--   4. `app_private.enforce_published_version_immutability()` blocks mutating any
--      snapshot column other than `is_active` (`P0001 IMMUTABLE_PUBLISHED_SNAPSHOT`),
--      preserving `ON DELETE SET NULL` on `published_by` if an `auth.users` row is deleted.
--   5. `app_private.normalize_wedding_fields()` unlocks `status = 'published'` if and
--      only if an `is_active = true` `published_versions` row exists for the wedding,
--      continuing to raise `P0001 PUBLISHING_REQUIRES_SNAPSHOT` on direct draft updates.
--   6. `public.get_public_wedding_by_slug(p_slug)` (`STABLE`, `SECURITY DEFINER`)
--      serves active `public` snapshots without internal UUIDs, returns `invite_only`
--      with zero snapshot leakage when `wedding_settings.access_mode = 'invite_only'`,
--      and returns `unavailable` for draft, archived, unpublished, or unknown slugs.
-- ============================================================================

-- 1. `public.published_versions` table & constraints
CREATE TABLE public.published_versions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  wedding_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  version_number integer NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  access_mode public.wedding_access_mode NOT NULL DEFAULT 'public'::public.wedding_access_mode,
  is_active boolean NOT NULL DEFAULT false,
  content_snapshot jsonb NOT NULL,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT published_versions_workspace_wedding_fkey
    FOREIGN KEY (workspace_id, wedding_id)
    REFERENCES public.weddings(workspace_id, id)
    ON DELETE CASCADE,
  CONSTRAINT published_versions_wedding_version_number_key
    UNIQUE (wedding_id, version_number),
  CONSTRAINT published_versions_version_number_chk CHECK (version_number >= 1),
  CONSTRAINT published_versions_schema_version_chk CHECK (schema_version = 1),
  CONSTRAINT published_versions_snapshot_object_chk CHECK (
    pg_catalog.jsonb_typeof(content_snapshot) = 'object'
    AND pg_catalog.octet_length(content_snapshot::text) <= 262144
  )
);

-- 2. Indexes aligned in exact leading-column order with FKs (`0` advisor lints)
CREATE INDEX published_versions_workspace_id_wedding_id_version_idx
  ON public.published_versions (workspace_id, wedding_id, version_number DESC);

CREATE UNIQUE INDEX published_versions_one_active_per_wedding_idx
  ON public.published_versions (wedding_id)
  WHERE is_active = true;

CREATE INDEX published_versions_published_by_idx
  ON public.published_versions (published_by);

-- 3. Self-contained snapshot immutability & payload-safety trigger (`app_private`)
CREATE OR REPLACE FUNCTION app_private.enforce_published_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_serialized text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.wedding_id IS DISTINCT FROM OLD.wedding_id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
       OR NEW.access_mode IS DISTINCT FROM OLD.access_mode
       OR NEW.content_snapshot IS DISTINCT FROM OLD.content_snapshot
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR (NEW.published_by IS DISTINCT FROM OLD.published_by AND NEW.published_by IS NOT NULL)
    THEN
      RAISE EXCEPTION 'IMMUTABLE_PUBLISHED_SNAPSHOT: Published version snapshots are immutable once created.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.schema_version IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Unsupported published snapshot schema_version.'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.version_number IS NULL OR NEW.version_number < 1 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Published snapshot version_number must be >= 1.'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.content_snapshot IS NULL OR pg_catalog.jsonb_typeof(NEW.content_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Published content_snapshot must be a JSON object.'
      USING ERRCODE = '22023';
  END IF;

  v_serialized := pg_catalog.lower(NEW.content_snapshot::text);
  IF pg_catalog.octet_length(v_serialized) > 262144 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Published content_snapshot exceeds maximum size.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.strpos(v_serialized, '<script') > 0
     OR pg_catalog.strpos(v_serialized, 'javascript:') > 0
     OR pg_catalog.strpos(v_serialized, 'vbscript:') > 0
     OR pg_catalog.strpos(v_serialized, 'data:text/html') > 0
  THEN
    RAISE EXCEPTION 'UNSAFE_DESIGN_PAYLOAD: Unsafe script or URI scheme detected in published snapshot.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.enforce_published_version_immutability() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.enforce_published_version_immutability()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER published_versions_enforce_immutability
  BEFORE INSERT OR UPDATE ON public.published_versions
  FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_published_version_immutability();

-- 4. Explicit privileges & RLS on `public.published_versions`
ALTER TABLE public.published_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.published_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.published_versions TO authenticated;

CREATE POLICY published_versions_select_workspace_member
  ON public.published_versions
  FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT app_private.user_workspace_ids()));

-- 5. Upgrade `normalize_wedding_fields` to unlock `status = 'published'` ONLY when
--    an `is_active = true` `published_versions` row exists, and auto-deactivate
--    active snapshots whenever a wedding leaves `'published'` status.
CREATE OR REPLACE FUNCTION app_private.normalize_wedding_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
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

  IF NEW.status = 'published'::public.wedding_status THEN
    IF TG_OP = 'INSERT' OR NOT EXISTS (
      SELECT 1
        FROM public.published_versions pv
       WHERE pv.workspace_id = NEW.workspace_id
         AND pv.wedding_id = NEW.id
         AND pv.is_active = true
    ) THEN
      RAISE EXCEPTION 'PUBLISHING_REQUIRES_SNAPSHOT: Weddings cannot transition to published until an immutable snapshot is created.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

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

  IF NEW.slug = ANY (
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
  ) THEN
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

CREATE OR REPLACE FUNCTION app_private.deactivate_snapshots_on_wedding_unpublish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'published'::public.wedding_status
     AND NEW.status <> 'published'::public.wedding_status
  THEN
    UPDATE public.published_versions pv
       SET is_active = false
     WHERE pv.workspace_id = NEW.workspace_id
       AND pv.wedding_id = NEW.id
       AND pv.is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.deactivate_snapshots_on_wedding_unpublish() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.deactivate_snapshots_on_wedding_unpublish()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER weddings_deactivate_snapshots_on_unpublish
  AFTER UPDATE OF status ON public.weddings
  FOR EACH ROW
  EXECUTE FUNCTION app_private.deactivate_snapshots_on_wedding_unpublish();

-- 6. Atomic Organizer Publish & Unpublish RPCs (`public`)
CREATE OR REPLACE FUNCTION public.publish_wedding(
  p_workspace_id uuid,
  p_wedding_id uuid
)
RETURNS public.published_versions
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role public.workspace_role;
  v_wedding public.weddings;
  v_settings public.wedding_settings;
  v_theme public.wedding_themes;
  v_sections_json jsonb;
  v_total_sections integer;
  v_visible_sections integer;
  v_next_version integer;
  v_snapshot jsonb;
  v_published public.published_versions;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required to publish a wedding website.'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL OR p_wedding_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace ID and wedding ID are required.'
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
    RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: Only workspace owners, admins, and editors can publish wedding websites.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_wedding
    FROM public.weddings w
   WHERE w.workspace_id = p_workspace_id
     AND w.id = p_wedding_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WEDDING_NOT_FOUND: Wedding project not found in this workspace.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_wedding.status = 'archived'::public.wedding_status THEN
    RAISE EXCEPTION 'ARCHIVED_WEDDING_CANNOT_PUBLISH: Restore this archived wedding project to Draft before publishing.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
    INTO v_settings
    FROM public.wedding_settings ws
   WHERE ws.workspace_id = p_workspace_id
     AND ws.wedding_id = p_wedding_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DESIGN_NOT_READY: Wedding settings are missing for this project.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
    INTO v_theme
    FROM public.wedding_themes wt
   WHERE wt.workspace_id = p_workspace_id
     AND wt.wedding_id = p_wedding_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DESIGN_NOT_READY: Wedding theme configuration is missing for this project.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE s.is_visible)::integer,
    COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', s.id::text,
          'sectionType', s.section_type::text,
          'sortOrder', s.sort_order,
          'isVisible', s.is_visible,
          'schemaVersion', s.schema_version,
          'content', s.content
        )
        ORDER BY s.sort_order ASC
      ),
      '[]'::jsonb
    )
  INTO v_total_sections, v_visible_sections, v_sections_json
  FROM public.wedding_sections s
  WHERE s.workspace_id = p_workspace_id
    AND s.wedding_id = p_wedding_id;

  IF v_total_sections = 0 THEN
    RAISE EXCEPTION 'DESIGN_NOT_READY: Wedding sections are missing for this project.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_visible_sections < 1 THEN
    RAISE EXCEPTION 'NO_VISIBLE_SECTIONS_TO_PUBLISH: Enable at least one visible invitation section before publishing.'
      USING ERRCODE = '22023';
  END IF;

  v_snapshot := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'wedding', pg_catalog.jsonb_build_object(
      'title', v_wedding.title,
      'partnerOneName', v_wedding.partner_one_name,
      'partnerTwoName', v_wedding.partner_two_name,
      'slug', v_wedding.slug,
      'eventDate', CASE
        WHEN v_wedding.event_date IS NULL THEN NULL
        ELSE pg_catalog.to_char(v_wedding.event_date, 'YYYY-MM-DD')
      END,
      'venueName', v_wedding.venue_name,
      'venueLocation', v_wedding.venue_location,
      'timezone', v_settings.timezone,
      'rsvpDeadline', CASE
        WHEN v_settings.rsvp_deadline IS NULL THEN NULL
        ELSE pg_catalog.to_char(v_settings.rsvp_deadline AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      END,
      'isRsvpOpen', v_settings.is_rsvp_open
    ),
    'theme', pg_catalog.jsonb_build_object(
      'schemaVersion', v_theme.schema_version,
      'presetId', v_theme.preset_id::text,
      'tokenOverrides', v_theme.token_overrides
    ),
    'sections', v_sections_json
  );

  SELECT COALESCE(max(pv.version_number), 0) + 1
    INTO v_next_version
    FROM public.published_versions pv
   WHERE pv.wedding_id = p_wedding_id;

  UPDATE public.published_versions pv
     SET is_active = false
   WHERE pv.workspace_id = p_workspace_id
     AND pv.wedding_id = p_wedding_id
     AND pv.is_active = true;

  INSERT INTO public.published_versions (
    wedding_id,
    workspace_id,
    version_number,
    schema_version,
    access_mode,
    is_active,
    content_snapshot,
    published_by
  )
  VALUES (
    p_wedding_id,
    p_workspace_id,
    v_next_version,
    1,
    v_settings.access_mode,
    true,
    v_snapshot,
    v_caller_id
  )
  RETURNING * INTO v_published;

  IF v_wedding.status <> 'published'::public.wedding_status THEN
    UPDATE public.weddings w
       SET status = 'published'::public.wedding_status
     WHERE w.workspace_id = p_workspace_id
       AND w.id = p_wedding_id;
  END IF;

  RETURN v_published;
END;
$$;

ALTER FUNCTION public.publish_wedding(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.publish_wedding(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_wedding(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unpublish_wedding(
  p_workspace_id uuid,
  p_wedding_id uuid
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
  v_wedding public.weddings;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required to unpublish a wedding website.'
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
    RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: Only workspace owners, admins, and editors can unpublish wedding websites.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_wedding
    FROM public.weddings w
   WHERE w.workspace_id = p_workspace_id
     AND w.id = p_wedding_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WEDDING_NOT_FOUND: Wedding project not found in this workspace.'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.published_versions pv
     SET is_active = false
   WHERE pv.workspace_id = p_workspace_id
     AND pv.wedding_id = p_wedding_id
     AND pv.is_active = true;

  IF v_wedding.status = 'published'::public.wedding_status THEN
    UPDATE public.weddings w
       SET status = 'draft'::public.wedding_status
     WHERE w.workspace_id = p_workspace_id
       AND w.id = p_wedding_id
     RETURNING * INTO v_wedding;
  END IF;

  RETURN v_wedding;
END;
$$;

ALTER FUNCTION public.unpublish_wedding(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.unpublish_wedding(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_wedding(uuid, uuid) TO authenticated;

-- 7. Read-Only Public Snapshot Lookup by Slug (`STABLE`, `anon` + `authenticated`)
CREATE OR REPLACE FUNCTION public.get_public_wedding_by_slug(
  p_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_slug text;
  v_wedding_id uuid;
  v_status public.wedding_status;
  v_live_access_mode public.wedding_access_mode;
  v_version_number integer;
  v_snapshot_access_mode public.wedding_access_mode;
  v_published_at timestamptz;
  v_snapshot jsonb;
BEGIN
  v_slug := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_slug, '')));

  IF pg_catalog.char_length(v_slug) < 3
     OR pg_catalog.char_length(v_slug) > 80
     OR v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'invalid_slug');
  END IF;

  SELECT
    w.id,
    w.status,
    ws.access_mode
  INTO
    v_wedding_id,
    v_status,
    v_live_access_mode
  FROM public.weddings w
  INNER JOIN public.wedding_settings ws
    ON ws.workspace_id = w.workspace_id
   AND ws.wedding_id = w.id
  WHERE w.slug = v_slug;

  IF NOT FOUND OR v_status <> 'published'::public.wedding_status THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT
    pv.version_number,
    pv.access_mode,
    pv.published_at,
    pv.content_snapshot
  INTO
    v_version_number,
    v_snapshot_access_mode,
    v_published_at,
    v_snapshot
  FROM public.published_versions pv
  WHERE pv.wedding_id = v_wedding_id
    AND pv.is_active = true;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unavailable');
  END IF;

  IF v_live_access_mode = 'invite_only'::public.wedding_access_mode
     OR v_snapshot_access_mode = 'invite_only'::public.wedding_access_mode
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'invite_only');
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'published',
    'versionNumber', v_version_number,
    'publishedAt', pg_catalog.to_char(v_published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'snapshot', v_snapshot
  );
END;
$$;

ALTER FUNCTION public.get_public_wedding_by_slug(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_wedding_by_slug(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_wedding_by_slug(text) TO anon, authenticated;
