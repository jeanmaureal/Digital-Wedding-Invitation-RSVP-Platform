-- ============================================================================
-- Phase 1 Query Planner Tuning: Accurate `ROWS` Estimates on Set-Returning Helpers
-- ============================================================================
-- Observed via `EXPLAIN (ANALYZE, BUFFERS)` (`supabase/tests/phase1_query_plan_verification.sql`):
--   PostgreSQL defaults set-returning functions (`RETURNS SETOF` / `RETURNS TABLE`)
--   to `ROWS 1000`, over-estimating the number of workspaces an organizer belongs
--   to and biasing `SELECT * FROM public.workspaces` toward sequential scans on
--   mid-sized tables. Setting realistic `ROWS` estimates directs the planner to
--   selective `Index Scan` plans on `workspaces_pkey`.
-- ============================================================================

ALTER FUNCTION app_private.user_workspace_ids() ROWS 5;
ALTER FUNCTION app_private.user_workspace_ids_with_roles(public.workspace_role[]) ROWS 5;
ALTER FUNCTION public.list_workspace_members(uuid) ROWS 10;
