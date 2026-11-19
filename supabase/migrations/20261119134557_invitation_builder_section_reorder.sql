-- ============================================================================
-- Phase 4: Invitation Builder Atomic Section Reordering RPC
-- ============================================================================
-- Security, Schema & Integrity Invariants:
--   1. `public.reorder_wedding_sections` is `SECURITY INVOKER` (`prosecdef = false`)
--      with `SET search_path = ''` and `OWNER TO postgres`, adding zero
--      `SECURITY DEFINER` surface in `public` while inheriting `public.wedding_sections`
--      RLS policies (`wedding_sections_select_workspace_member`,
--      `wedding_sections_update_owner_admin_editor`) and column-scoped `UPDATE` grants.
--   2. Locks all `public.wedding_sections` rows for `(p_workspace_id, p_wedding_id)`
--      in deterministic `ORDER BY id ASC FOR UPDATE` to prevent deadlocks across
--      concurrent reorders, raising `P0002 WEDDING_NOT_FOUND` when no rows exist in
--      the target workspace.
--   3. Rejects `NULL` arrays/elements, duplicate IDs, partial/extra lists, or
--      cross-wedding section IDs with `22023 SECTION_REORDER_MISMATCH`.
--   4. Defers `public.wedding_sections_wedding_sort_order_key` inside the single
--      transaction so multi-section swaps and full reversals assign contiguous
--      `0 .. N-1` `sort_order` values without `23505` unique collisions, updating
--      only moved rows so untouched rows preserve `updated_at`, then restores
--      `IMMEDIATE` validation before returning ordered rows.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reorder_wedding_sections(
  p_workspace_id uuid,
  p_wedding_id uuid,
  p_ordered_section_ids uuid[]
)
RETURNS SETOF public.wedding_sections
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role public.workspace_role;
  v_input_count integer;
  v_distinct_input_count integer;
  v_existing_count integer;
  v_matched_count integer;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required to reorder wedding sections.'
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
    RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: Only workspace owners, admins, and editors can reorder wedding sections.'
      USING ERRCODE = '42501';
  END IF;

  v_input_count := COALESCE(pg_catalog.cardinality(p_ordered_section_ids), 0);
  IF p_ordered_section_ids IS NULL OR v_input_count = 0 OR v_input_count > 51 THEN
    RAISE EXCEPTION 'SECTION_REORDER_MISMATCH: Ordered section list must include every section of this wedding exactly once.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.array_position(p_ordered_section_ids, NULL::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'SECTION_REORDER_MISMATCH: Ordered section list cannot contain NULL section IDs.'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(DISTINCT u.section_id)::integer
    INTO v_distinct_input_count
    FROM pg_catalog.unnest(p_ordered_section_ids) AS u(section_id);

  IF v_distinct_input_count <> v_input_count THEN
    RAISE EXCEPTION 'SECTION_REORDER_MISMATCH: Ordered section list contains duplicate section IDs.'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE locked.id = ANY(p_ordered_section_ids))::integer
  INTO v_existing_count, v_matched_count
  FROM (
    SELECT ws.id
      FROM public.wedding_sections ws
     WHERE ws.workspace_id = p_workspace_id
       AND ws.wedding_id = p_wedding_id
     ORDER BY ws.id ASC
     FOR UPDATE
  ) AS locked;

  IF v_existing_count = 0 THEN
    RAISE EXCEPTION 'WEDDING_NOT_FOUND: Wedding project not found in this workspace.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_existing_count <> v_input_count OR v_matched_count <> v_existing_count THEN
    RAISE EXCEPTION 'SECTION_REORDER_MISMATCH: Ordered section list must include every section of this wedding exactly once.'
      USING ERRCODE = '22023';
  END IF;

  SET CONSTRAINTS public.wedding_sections_wedding_sort_order_key DEFERRED;

  UPDATE public.wedding_sections ws
     SET sort_order = (ord.pos - 1)::integer
    FROM pg_catalog.unnest(p_ordered_section_ids) WITH ORDINALITY AS ord(section_id, pos)
   WHERE ws.workspace_id = p_workspace_id
     AND ws.wedding_id = p_wedding_id
     AND ws.id = ord.section_id
     AND ws.sort_order IS DISTINCT FROM (ord.pos - 1)::integer;

  SET CONSTRAINTS public.wedding_sections_wedding_sort_order_key IMMEDIATE;

  RETURN QUERY
  SELECT ws.*
    FROM public.wedding_sections ws
   WHERE ws.workspace_id = p_workspace_id
     AND ws.wedding_id = p_wedding_id
   ORDER BY ws.sort_order ASC;
END;
$$;

ALTER FUNCTION public.reorder_wedding_sections(uuid, uuid, uuid[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.reorder_wedding_sections(uuid, uuid, uuid[])
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reorder_wedding_sections(uuid, uuid, uuid[])
  TO authenticated;
