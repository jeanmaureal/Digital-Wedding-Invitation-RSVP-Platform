-- ============================================================================
-- Allow Motion Photo / Video Backgrounds & Larger Story Photo Galleries
-- ============================================================================
-- 1. Adds `video/mp4`, `video/webm`, and `video/quicktime` (Live/Motion Photos)
--    to the `wedding-assets` storage bucket allowed MIME types.
-- 2. Increases `wedding_sections.content` byte cap from 32 KiB to 256 KiB and
--    `published_versions.content_snapshot` cap from 256 KiB to 1 MiB so couples
--    can attach unlimited Our Story photographs without hitting JSONB caps.
-- ============================================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'font/ttf',
  'font/otf',
  'font/woff',
  'font/woff2',
  'application/font-sfnt',
  'application/x-font-ttf',
  'application/x-font-truetype',
  'application/x-font-opentype',
  'application/font-woff',
  'application/octet-stream'
]
WHERE id = 'wedding-assets';

-- Raise `wedding_sections.content` limit to 256 KiB
ALTER TABLE public.wedding_sections
  DROP CONSTRAINT IF EXISTS wedding_sections_content_object_chk;

ALTER TABLE public.wedding_sections
  ADD CONSTRAINT wedding_sections_content_object_chk CHECK (
    pg_catalog.jsonb_typeof(content) = 'object'
    AND pg_catalog.octet_length(content::text) <= 262144
  );

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
  IF pg_catalog.octet_length(v_serialized) > 262144 THEN
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

-- Raise `published_versions.content_snapshot` limit to 1 MiB
ALTER TABLE public.published_versions
  DROP CONSTRAINT IF EXISTS published_versions_snapshot_object_chk;

ALTER TABLE public.published_versions
  ADD CONSTRAINT published_versions_snapshot_object_chk CHECK (
    pg_catalog.jsonb_typeof(content_snapshot) = 'object'
    AND pg_catalog.octet_length(content_snapshot::text) <= 1048576
  );

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
  IF pg_catalog.octet_length(v_serialized) > 1048576 THEN
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
