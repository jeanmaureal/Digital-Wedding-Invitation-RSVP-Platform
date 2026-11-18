-- ============================================================================
-- Phase 2 Follow-Up: Self-Contained Trigger Validation & Composite FK Index Alignment
-- ============================================================================
-- Observed during `TG1-E` live verification & Supabase advisor inspection:
--   1. `app_private.normalize_wedding_fields()` and `app_private.normalize_wedding_settings_fields()`
--      run as `SECURITY INVOKER` row triggers when `authenticated` executes `UPDATE`
--      on `public.weddings` or `public.wedding_settings`. Because nested helper
--      functions in `app_private` (`is_reserved_wedding_slug`, `assert_valid_iana_timezone`)
--      revoke `EXECUTE` from `authenticated`, calling them from `SECURITY INVOKER`
--      triggers raised `42501 permission denied`. Inlining the pure slug and IANA
--      timezone checks inside the trigger bodies preserves zero helper `EXECUTE`
--      grants while allowing authorized row updates.
--   2. Aligning the composite FK column order on `public.wedding_settings` to
--      `FOREIGN KEY (workspace_id, wedding_id) REFERENCES public.weddings(workspace_id, id)`
--      matches `wedding_settings_workspace_id_wedding_id_idx (workspace_id, wedding_id)`
--      in exact leading-column order (`0001_unindexed_foreign_keys` = 0 findings),
--      and removes redundant `weddings_workspace_id_status_idx` (since `EXPLAIN ANALYZE`
--      confirmed `weddings_workspace_id_updated_at_idx` serves status-filtered queries
--      without a Sort node).
-- ============================================================================

-- 1. Align composite unique/FK column order `(workspace_id, id)` <-> `(workspace_id, wedding_id)`
ALTER TABLE public.wedding_settings
  DROP CONSTRAINT wedding_settings_wedding_workspace_fkey;

ALTER TABLE public.weddings
  DROP CONSTRAINT weddings_id_workspace_id_key;

ALTER TABLE public.weddings
  ADD CONSTRAINT weddings_workspace_id_id_key UNIQUE (workspace_id, id);

ALTER TABLE public.wedding_settings
  ADD CONSTRAINT wedding_settings_workspace_wedding_fkey
    FOREIGN KEY (workspace_id, wedding_id)
    REFERENCES public.weddings(workspace_id, id)
    ON DELETE CASCADE;

DROP INDEX IF EXISTS public.weddings_workspace_id_status_idx;

-- 2. Self-contained `normalize_wedding_fields` trigger function
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
    RAISE EXCEPTION 'PUBLISHING_REQUIRES_SNAPSHOT: Weddings cannot transition to published until an immutable snapshot is created.'
      USING ERRCODE = 'P0001';
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

-- 3. Self-contained `normalize_wedding_settings_fields` trigger function
CREATE OR REPLACE FUNCTION app_private.normalize_wedding_settings_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz text;
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
    v_tz := pg_catalog.btrim(COALESCE(NEW.timezone, ''));

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

    NEW.timezone := v_tz;
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
