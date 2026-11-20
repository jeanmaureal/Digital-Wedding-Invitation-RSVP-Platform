-- ============================================================================
-- Phase 8: Publishing, Versioning & Atomic Snapshot Rollback (Gate 6 Part 1)
-- ============================================================================
-- Security, Immutability & Isolation Invariants:
--   1. `public.list_wedding_published_versions(p_workspace_id, p_wedding_id)`
--      (`STABLE`, `SECURITY DEFINER`, `SET search_path = ''`) returns ordered
--      immutable snapshots (`version_number DESC`) to authenticated workspace
--      members (`owner | admin | editor | viewer`) with display-name attribution
--      from `public.profiles.full_name` and ZERO co-member email or cross-tenant
--      leakage (`P8-AC01`).
--   2. `public.rollback_wedding_published_version(p_workspace_id, p_wedding_id,
--      p_target_version_number)` (`VOLATILE`, `SECURITY DEFINER`,
--      `SET search_path = ''`) enforces `owner | admin | editor` RBAC, locks
--      `public.weddings` (`FOR UPDATE`), rejects `archived` weddings
--      (`ARCHIVED_WEDDING_CANNOT_PUBLISH`) and unknown version numbers
--      (`PUBLISHED_VERSION_NOT_FOUND`), deactivates any prior active row before
--      activating `v_target` (`is_active = true`), and transitions `'draft'`
--      weddings back to `'published'` (`P8-AC02`).
--   3. `app_private.enforce_published_version_immutability()` remains strictly
--      enforced (`P0001 IMMUTABLE_PUBLISHED_SNAPSHOT`): `content_snapshot`,
--      `version_number`, `access_mode`, `published_at`, and `published_by`
--      never mutate on rollback, and draft builder / guest / token / RSVP
--      tables remain 100% untouched (`P8-AC03`, `P8-AC04`).
-- ============================================================================

-- 1. Workspace-Scoped Publication History RPC (`STABLE`, `authenticated` only)
CREATE OR REPLACE FUNCTION public.list_wedding_published_versions(
  p_workspace_id uuid,
  p_wedding_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_versions_json jsonb;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required to inspect publication history.'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL OR p_wedding_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace ID and wedding ID are required.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
    FROM public.workspace_members wm
   WHERE wm.workspace_id = p_workspace_id
     AND wm.user_id = v_caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED: You do not have access to this workspace.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
    FROM public.weddings w
   WHERE w.workspace_id = p_workspace_id
     AND w.id = p_wedding_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WEDDING_NOT_FOUND: Wedding project not found in this workspace.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', sub.id,
        'weddingId', sub.wedding_id,
        'workspaceId', sub.workspace_id,
        'versionNumber', sub.version_number,
        'schemaVersion', sub.schema_version,
        'accessMode', sub.access_mode,
        'isActive', sub.is_active,
        'publishedAt', pg_catalog.to_char(
          sub.published_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'publishedBy', sub.published_by,
        'publishedByName', sub.published_by_name,
        'contentSnapshot', sub.content_snapshot
      )
    ),
    '[]'::jsonb
  )
  INTO v_versions_json
  FROM (
    SELECT
      pv.id,
      pv.wedding_id,
      pv.workspace_id,
      pv.version_number,
      pv.schema_version,
      pv.access_mode::text AS access_mode,
      pv.is_active,
      pv.published_at,
      pv.published_by,
      CASE
        WHEN pv.published_by IS NULL THEN 'Former Organizer'
        ELSE COALESCE(NULLIF(pg_catalog.btrim(p.full_name), ''), 'Workspace Organizer')
      END AS published_by_name,
      pv.content_snapshot
    FROM public.published_versions pv
    LEFT JOIN public.profiles p
      ON p.id = pv.published_by
    WHERE pv.workspace_id = p_workspace_id
      AND pv.wedding_id = p_wedding_id
    ORDER BY pv.version_number DESC
    LIMIT 50
  ) sub;

  RETURN v_versions_json;
END;
$$;

ALTER FUNCTION public.list_wedding_published_versions(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_wedding_published_versions(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_wedding_published_versions(uuid, uuid)
  TO authenticated;

-- 2. Atomic Immutable Snapshot Rollback RPC (`VOLATILE`, `editor`+ only)
CREATE OR REPLACE FUNCTION public.rollback_wedding_published_version(
  p_workspace_id uuid,
  p_wedding_id uuid,
  p_target_version_number integer
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
  v_target public.published_versions;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required to roll back a published website version.'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL
     OR p_wedding_id IS NULL
     OR p_target_version_number IS NULL
     OR p_target_version_number < 1
  THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace ID, wedding ID, and a version number >= 1 are required.'
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
    RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: Only workspace owners, admins, and editors can roll back published website versions.'
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
    RAISE EXCEPTION 'ARCHIVED_WEDDING_CANNOT_PUBLISH: Restore this archived wedding project to Draft before activating a published snapshot.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
    INTO v_target
    FROM public.published_versions pv
   WHERE pv.workspace_id = p_workspace_id
     AND pv.wedding_id = p_wedding_id
     AND pv.version_number = p_target_version_number
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PUBLISHED_VERSION_NOT_FOUND: Published snapshot v% does not exist for this wedding project.', p_target_version_number
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.published_versions pv
     SET is_active = false
   WHERE pv.workspace_id = p_workspace_id
     AND pv.wedding_id = p_wedding_id
     AND pv.is_active = true
     AND pv.id <> v_target.id;

  IF NOT v_target.is_active THEN
    UPDATE public.published_versions pv
       SET is_active = true
     WHERE pv.id = v_target.id
     RETURNING * INTO v_target;
  END IF;

  IF v_wedding.status <> 'published'::public.wedding_status THEN
    UPDATE public.weddings w
       SET status = 'published'::public.wedding_status
     WHERE w.workspace_id = p_workspace_id
       AND w.id = p_wedding_id;
  END IF;

  RETURN v_target;
END;
$$;

ALTER FUNCTION public.rollback_wedding_published_version(uuid, uuid, integer)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rollback_wedding_published_version(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_wedding_published_version(uuid, uuid, integer)
  TO authenticated;
