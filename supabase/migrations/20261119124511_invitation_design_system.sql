-- ============================================================================
-- Phase 3: Invitation Design System & Rendering Engine Foundation
-- ============================================================================
-- Security, Schema & Integrity Invariants:
--   1. Zero `anon` privileges on `public.wedding_themes` and `public.wedding_sections`.
--   2. Every `public.weddings` row maintains a strict 1:1 `public.wedding_themes` row
--      and all 7 registered `public.wedding_sections` draft rows, bound via composite
--      foreign keys `(workspace_id, wedding_id) -> weddings(workspace_id, id) ON DELETE CASCADE`
--      so cross-workspace linkage is structurally impossible.
--   3. `public.create_wedding` preserves its exact 18-parameter signature (zero
--      PostgREST overload ambiguity) while atomically seeding `wedding_themes` and
--      personalized starter `wedding_sections`; `public.duplicate_wedding` clones
--      both `wedding_themes` and `wedding_sections` into the duplicated draft project.
--   4. Self-contained `SECURITY INVOKER` row triggers enforce immutable identity
--      columns, `schema_version = 1`, JSONB object structure, byte-size caps, and
--      defense-in-depth rejection of `<script`, `javascript:`, or `data:text/html`
--      payloads (`22023 UNSAFE_DESIGN_PAYLOAD`).
-- ============================================================================

-- 1. Design system enums
CREATE TYPE public.wedding_theme_preset AS ENUM (
  'editorial_ivory',
  'garden_sage',
  'celestial_midnight',
  'terracotta_atelier'
);

CREATE TYPE public.wedding_section_type AS ENUM (
  'hero',
  'our_story',
  'event_schedule',
  'venue_travel',
  'dress_code',
  'faq_notes',
  'rsvp_banner'
);

-- 2. Tables & structural constraints
CREATE TABLE public.wedding_themes (
  wedding_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  preset_id public.wedding_theme_preset NOT NULL DEFAULT 'editorial_ivory'::public.wedding_theme_preset,
  schema_version integer NOT NULL DEFAULT 1,
  token_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT wedding_themes_workspace_wedding_fkey
    FOREIGN KEY (workspace_id, wedding_id)
    REFERENCES public.weddings(workspace_id, id)
    ON DELETE CASCADE,
  CONSTRAINT wedding_themes_schema_version_chk CHECK (schema_version = 1),
  CONSTRAINT wedding_themes_token_overrides_object_chk CHECK (
    pg_catalog.jsonb_typeof(token_overrides) = 'object'
    AND pg_catalog.octet_length(token_overrides::text) <= 4096
  )
);

CREATE TABLE public.wedding_sections (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  wedding_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  section_type public.wedding_section_type NOT NULL,
  sort_order integer NOT NULL,
  is_visible boolean NOT NULL DEFAULT true,
  schema_version integer NOT NULL DEFAULT 1,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT wedding_sections_workspace_wedding_fkey
    FOREIGN KEY (workspace_id, wedding_id)
    REFERENCES public.weddings(workspace_id, id)
    ON DELETE CASCADE,
  CONSTRAINT wedding_sections_wedding_section_type_key
    UNIQUE (wedding_id, section_type),
  CONSTRAINT wedding_sections_wedding_sort_order_key
    UNIQUE (wedding_id, sort_order)
    DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT wedding_sections_sort_order_bounds_chk CHECK (
    sort_order BETWEEN 0 AND 50
  ),
  CONSTRAINT wedding_sections_schema_version_chk CHECK (schema_version = 1),
  CONSTRAINT wedding_sections_content_object_chk CHECK (
    pg_catalog.jsonb_typeof(content) = 'object'
    AND pg_catalog.octet_length(content::text) <= 32768
  )
);

-- 3. Indexes aligned in exact leading-column order with `(workspace_id, wedding_id)` FKs
CREATE INDEX wedding_themes_workspace_id_wedding_id_idx
  ON public.wedding_themes (workspace_id, wedding_id);

CREATE INDEX wedding_sections_workspace_id_wedding_id_sort_idx
  ON public.wedding_sections (workspace_id, wedding_id, sort_order ASC);

-- 4. Self-contained row normalization & unsafe-payload triggers (`app_private`)
CREATE OR REPLACE FUNCTION app_private.normalize_wedding_theme_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_serialized text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.wedding_id IS DISTINCT FROM OLD.wedding_id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Wedding theme identity and workspace linkage are immutable.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NEW.schema_version IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Unsupported wedding theme schema_version.'
      USING ERRCODE = '22023';
  END IF;

  NEW.token_overrides := COALESCE(NEW.token_overrides, '{}'::jsonb);
  IF pg_catalog.jsonb_typeof(NEW.token_overrides) <> 'object' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Theme token_overrides must be a JSON object.'
      USING ERRCODE = '22023';
  END IF;

  v_serialized := pg_catalog.lower(NEW.token_overrides::text);
  IF pg_catalog.octet_length(v_serialized) > 4096 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Theme token_overrides exceeds maximum size.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.strpos(v_serialized, '<script') > 0
     OR pg_catalog.strpos(v_serialized, 'javascript:') > 0
     OR pg_catalog.strpos(v_serialized, 'data:text/html') > 0
     OR pg_catalog.strpos(v_serialized, 'expression(') > 0
     OR pg_catalog.strpos(v_serialized, 'url(') > 0
  THEN
    RAISE EXCEPTION 'UNSAFE_DESIGN_PAYLOAD: Potentially unsafe script or CSS expression detected in theme tokens.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.normalize_wedding_theme_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.normalize_wedding_theme_fields() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER wedding_themes_normalize_fields
  BEFORE INSERT OR UPDATE ON public.wedding_themes
  FOR EACH ROW
  EXECUTE FUNCTION app_private.normalize_wedding_theme_fields();

CREATE TRIGGER wedding_themes_set_updated_at
  BEFORE UPDATE ON public.wedding_themes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION app_private.normalize_wedding_section_fields()
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
       OR NEW.section_type IS DISTINCT FROM OLD.section_type
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Wedding section identity, type, and workspace linkage are immutable.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NEW.schema_version IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Unsupported wedding section schema_version.'
      USING ERRCODE = '22023';
  END IF;

  NEW.content := COALESCE(NEW.content, '{}'::jsonb);
  IF pg_catalog.jsonb_typeof(NEW.content) <> 'object' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Wedding section content must be a JSON object.'
      USING ERRCODE = '22023';
  END IF;

  v_serialized := pg_catalog.lower(NEW.content::text);
  IF pg_catalog.octet_length(v_serialized) > 32768 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Wedding section content exceeds maximum size.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.strpos(v_serialized, '<script') > 0
     OR pg_catalog.strpos(v_serialized, 'javascript:') > 0
     OR pg_catalog.strpos(v_serialized, 'vbscript:') > 0
     OR pg_catalog.strpos(v_serialized, 'data:text/html') > 0
  THEN
    RAISE EXCEPTION 'UNSAFE_DESIGN_PAYLOAD: Unsafe script or URI scheme detected in section content.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.normalize_wedding_section_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.normalize_wedding_section_fields() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER wedding_sections_normalize_fields
  BEFORE INSERT OR UPDATE ON public.wedding_sections
  FOR EACH ROW
  EXECUTE FUNCTION app_private.normalize_wedding_section_fields();

CREATE TRIGGER wedding_sections_set_updated_at
  BEFORE UPDATE ON public.wedding_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 5. Internal starter-seeding helper (`app_private`, invoked by `postgres`-owned RPCs & backfill)
CREATE OR REPLACE FUNCTION app_private.seed_wedding_design_defaults(
  p_workspace_id uuid,
  p_wedding_id uuid,
  p_partner_one_name text,
  p_partner_two_name text,
  p_venue_name text,
  p_venue_location text,
  p_dress_code text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_p1 text := pg_catalog.btrim(COALESCE(p_partner_one_name, ''));
  v_p2 text := pg_catalog.btrim(COALESCE(p_partner_two_name, ''));
  v_venue text := pg_catalog.btrim(COALESCE(p_venue_name, ''));
  v_loc text := pg_catalog.btrim(COALESCE(p_venue_location, ''));
  v_dress text := pg_catalog.btrim(COALESCE(p_dress_code, ''));
  v_location_summary text;
BEGIN
  v_location_summary := CASE
    WHEN v_loc <> '' THEN v_loc
    WHEN v_venue <> '' THEN v_venue
    ELSE ''
  END;

  INSERT INTO public.wedding_themes (
    wedding_id,
    workspace_id,
    preset_id,
    schema_version,
    token_overrides
  )
  VALUES (
    p_wedding_id,
    p_workspace_id,
    'editorial_ivory'::public.wedding_theme_preset,
    1,
    '{}'::jsonb
  )
  ON CONFLICT (wedding_id) DO NOTHING;

  INSERT INTO public.wedding_sections (
    wedding_id,
    workspace_id,
    section_type,
    sort_order,
    is_visible,
    schema_version,
    content
  )
  VALUES
    (
      p_wedding_id,
      p_workspace_id,
      'hero'::public.wedding_section_type,
      0,
      true,
      1,
      pg_catalog.jsonb_build_object(
        'eyebrow', 'Together with their families',
        'coupleHeadline', v_p1 || ' & ' || v_p2,
        'celebrationSubtitle', 'Joyfully invite you to celebrate their wedding',
        'displayDateLabel', '',
        'locationSummary', v_location_summary,
        'primaryCtaLabel', 'Respond to Invitation',
        'showCountdownBadge', true,
        'alignment', 'center'
      )
    ),
    (
      p_wedding_id,
      p_workspace_id,
      'our_story'::public.wedding_section_type,
      1,
      true,
      1,
      pg_catalog.jsonb_build_object(
        'heading', 'Our Story',
        'leadQuote', 'Every chapter brought us closer to this day.',
        'narrative', 'We are so grateful to gather with our dearest family and friends as we begin this next chapter together.',
        'milestones', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'periodLabel', 'First Chapter',
            'title', 'Where It All Began',
            'description', 'A conversation that turned into years of shared adventures.'
          ),
          pg_catalog.jsonb_build_object(
            'periodLabel', 'The Proposal',
            'title', 'A Joyful Yes',
            'description', 'Surrounded by love and looking ahead to forever.'
          )
        )
      )
    ),
    (
      p_wedding_id,
      p_workspace_id,
      'event_schedule'::public.wedding_section_type,
      2,
      true,
      1,
      pg_catalog.jsonb_build_object(
        'heading', 'Order of Events',
        'timezoneNote', 'All times are shown in the celebration timezone.',
        'items', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'timeLabel', '4:00 PM',
            'title', 'Wedding Ceremony',
            'venueName', CASE WHEN v_venue <> '' THEN v_venue ELSE 'Ceremony Venue' END,
            'address', v_loc,
            'notes', 'Please arrive 20 minutes early to be seated.'
          ),
          pg_catalog.jsonb_build_object(
            'timeLabel', '6:00 PM',
            'title', 'Dinner & Reception',
            'venueName', CASE WHEN v_venue <> '' THEN v_venue ELSE 'Reception Pavilion' END,
            'address', v_loc,
            'notes', 'Cocktails, dinner, and dancing to follow.'
          )
        )
      )
    ),
    (
      p_wedding_id,
      p_workspace_id,
      'venue_travel'::public.wedding_section_type,
      3,
      true,
      1,
      pg_catalog.jsonb_build_object(
        'heading', 'Venue & Travel',
        'ceremonyVenueName', v_venue,
        'ceremonyAddress', v_loc,
        'receptionVenueName', v_venue,
        'receptionAddress', v_loc,
        'directionsNote', 'Complimentary guest parking and drop-off access will be available at the main entrance.',
        'mapUrl', NULL,
        'accommodations', pg_catalog.jsonb_build_array()
      )
    ),
    (
      p_wedding_id,
      p_workspace_id,
      'dress_code'::public.wedding_section_type,
      4,
      (v_dress <> ''),
      1,
      pg_catalog.jsonb_build_object(
        'heading', 'Attire & Palette',
        'dressCodeTitle', CASE WHEN v_dress <> '' THEN v_dress ELSE 'Formal Celebration Attire' END,
        'guidance', 'We invite guests to dress comfortably for an evening of celebration.',
        'swatchHexes', pg_catalog.jsonb_build_array('#C8B6A6', '#8D7B68', '#4A403A')
      )
    ),
    (
      p_wedding_id,
      p_workspace_id,
      'faq_notes'::public.wedding_section_type,
      5,
      false,
      1,
      pg_catalog.jsonb_build_object(
        'heading', 'Questions & Guest Notes',
        'items', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'question', 'When should I submit my RSVP?',
            'answer', 'Kindly respond before the RSVP deadline listed on your invitation.'
          ),
          pg_catalog.jsonb_build_object(
            'question', 'Can I bring an additional guest?',
            'answer', 'Attendance is reserved for the guests named on your household invitation.'
          )
        )
      )
    ),
    (
      p_wedding_id,
      p_workspace_id,
      'rsvp_banner'::public.wedding_section_type,
      6,
      true,
      1,
      pg_catalog.jsonb_build_object(
        'heading', 'Kindly Respond',
        'message', 'Please use your personal household invitation link to confirm attendance and share any dietary notes.',
        'buttonLabel', 'Respond to Invitation',
        'showDeadline', true
      )
    )
  ON CONFLICT (wedding_id, section_type) DO NOTHING;
END;
$$;

ALTER FUNCTION app_private.seed_wedding_design_defaults(uuid, uuid, text, text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.seed_wedding_design_defaults(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- Backfill any pre-existing `public.weddings` rows idempotently
DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT
      w.id,
      w.workspace_id,
      w.partner_one_name,
      w.partner_two_name,
      w.venue_name,
      w.venue_location,
      COALESCE(ws.dress_code, '') AS dress_code
    FROM public.weddings w
    LEFT JOIN public.wedding_settings ws
      ON ws.wedding_id = w.id
  LOOP
    PERFORM app_private.seed_wedding_design_defaults(
      v_row.workspace_id,
      v_row.id,
      v_row.partner_one_name,
      v_row.partner_two_name,
      v_row.venue_name,
      v_row.venue_location,
      v_row.dress_code
    );
  END LOOP;
END;
$$;

-- 6. Explicit table/column privileges & Row Level Security
ALTER TABLE public.wedding_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wedding_sections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wedding_themes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.wedding_sections FROM PUBLIC, anon, authenticated;

GRANT
  SELECT,
  UPDATE (preset_id, schema_version, token_overrides)
ON TABLE public.wedding_themes TO authenticated;

GRANT
  SELECT,
  UPDATE (sort_order, is_visible, schema_version, content)
ON TABLE public.wedding_sections TO authenticated;

CREATE POLICY wedding_themes_select_workspace_member
  ON public.wedding_themes
  FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT app_private.user_workspace_ids()));

CREATE POLICY wedding_themes_update_owner_admin_editor
  ON public.wedding_themes
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

CREATE POLICY wedding_sections_select_workspace_member
  ON public.wedding_sections
  FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT app_private.user_workspace_ids()));

CREATE POLICY wedding_sections_update_owner_admin_editor
  ON public.wedding_sections
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

-- 7. Upgrade `public.create_wedding` & `public.duplicate_wedding` (exact signatures preserved)
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
    RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: Viewers cannot create wedding projects.'
      USING ERRCODE = '42501';
  END IF;

  v_validated_tz := app_private.assert_valid_iana_timezone(COALESCE(p_timezone, 'UTC'));

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

  -- Atomically seed Phase 3 `wedding_themes` + 7 registered `wedding_sections`
  PERFORM app_private.seed_wedding_design_defaults(
    p_workspace_id,
    v_wedding.id,
    v_wedding.partner_one_name,
    v_wedding.partner_two_name,
    v_wedding.venue_name,
    v_wedding.venue_location,
    COALESCE(p_dress_code, '')
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
  v_source_theme public.wedding_themes;
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

  SELECT *
    INTO v_source_theme
    FROM public.wedding_themes wt
   WHERE wt.wedding_id = p_source_wedding_id
     AND wt.workspace_id = p_workspace_id;

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

  -- Clone `wedding_themes` & `wedding_sections` (or seed defaults if source predated backfill)
  IF v_source_theme.wedding_id IS NOT NULL THEN
    INSERT INTO public.wedding_themes (
      wedding_id,
      workspace_id,
      preset_id,
      schema_version,
      token_overrides
    )
    VALUES (
      v_new_wedding.id,
      p_workspace_id,
      v_source_theme.preset_id,
      v_source_theme.schema_version,
      v_source_theme.token_overrides
    );
  ELSE
    INSERT INTO public.wedding_themes (wedding_id, workspace_id)
    VALUES (v_new_wedding.id, p_workspace_id);
  END IF;

  INSERT INTO public.wedding_sections (
    wedding_id,
    workspace_id,
    section_type,
    sort_order,
    is_visible,
    schema_version,
    content
  )
  SELECT
    v_new_wedding.id,
    p_workspace_id,
    ws_sec.section_type,
    ws_sec.sort_order,
    ws_sec.is_visible,
    ws_sec.schema_version,
    CASE
      WHEN ws_sec.section_type = 'hero'::public.wedding_section_type
           AND (
             v_new_wedding.partner_one_name IS DISTINCT FROM v_source_wedding.partner_one_name
             OR v_new_wedding.partner_two_name IS DISTINCT FROM v_source_wedding.partner_two_name
           )
        THEN pg_catalog.jsonb_set(
          ws_sec.content,
          ARRAY['coupleHeadline'],
          pg_catalog.to_jsonb(
            v_new_wedding.partner_one_name || ' & ' || v_new_wedding.partner_two_name
          ),
          true
        )
      ELSE ws_sec.content
    END
  FROM public.wedding_sections ws_sec
  WHERE ws_sec.wedding_id = p_source_wedding_id
    AND ws_sec.workspace_id = p_workspace_id
  ORDER BY ws_sec.sort_order ASC;

  IF NOT FOUND THEN
    PERFORM app_private.seed_wedding_design_defaults(
      p_workspace_id,
      v_new_wedding.id,
      v_new_wedding.partner_one_name,
      v_new_wedding.partner_two_name,
      v_new_wedding.venue_name,
      v_new_wedding.venue_location,
      v_source_settings.dress_code
    );
  END IF;

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
