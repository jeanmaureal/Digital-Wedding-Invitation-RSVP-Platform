# Phase 8 Migration Review — Publishing, Versioning & Atomic Rollback

## Migration Artifact

- **File:** [20261120012113_publishing_versioning_and_rollback.sql](../../../../supabase/migrations/20261120012113_publishing_versioning_and_rollback.sql)
- **Target Project:** `wedding-platform-dev` (`tfwmbpvbfavugvokdych`, region `ap-southeast-1`)
- **Governance Gate (`TG1-D`):** Explicitly approved (`approve migration`) prior to `npx supabase db push --remote --yes`
- **Local ↔ Remote Parity:** `12/12` migrations synced (`20261111142432` through `20261120012113`)
- **Generated Types:** [database.types.ts](../../../../src/types/database.types.ts) (`38,514` bytes via `npm run db:types`)

## Objects Introduced

1. **`public.list_wedding_published_versions(p_workspace_id uuid, p_wedding_id uuid) RETURNS jsonb`**
   - `LANGUAGE plpgsql`, `STABLE`, `SECURITY DEFINER`, `SET search_path = ''`, `OWNER TO postgres`.
   - `REVOKE ALL` from `PUBLIC, anon, authenticated`; `GRANT EXECUTE` to `authenticated` only.
   - Verifies `(SELECT auth.uid())` authentication, workspace membership (`owner | admin | editor | viewer`), and wedding existence inside `p_workspace_id`.
   - Scans `public.published_versions` in `version_number DESC` order (`LIMIT 50`) and joins `public.profiles` (`full_name` only) so workspace members see publisher display names with zero co-member email exposure.

2. **`public.rollback_wedding_published_version(p_workspace_id uuid, p_wedding_id uuid, p_target_version_number integer) RETURNS public.published_versions`**
   - `LANGUAGE plpgsql`, `VOLATILE`, `SECURITY DEFINER`, `SET search_path = ''`, `OWNER TO postgres`.
   - `REVOKE ALL` from `PUBLIC, anon, authenticated`; `GRANT EXECUTE` to `authenticated` only.
   - Enforces `owner | admin | editor` RBAC (`42501 INSUFFICIENT_WORKSPACE_ROLE`), locks `public.workspaces` (`FOR KEY SHARE`) and `public.weddings` (`FOR UPDATE`), rejects `archived` weddings (`P0001 ARCHIVED_WEDDING_CANNOT_PUBLISH`) and missing versions (`P0002 PUBLISHED_VERSION_NOT_FOUND`), deactivates any prior active snapshot before setting `is_active = true` on `v_target`, and restores `'draft'` weddings to `'published'`.
   - Preserves `100%` immutability (`P0001 IMMUTABLE_PUBLISHED_SNAPSHOT`) across historical snapshots and leaves Builder drafts (`wedding_themes`, `wedding_sections`) and operational tables (`guest_groups`, `guests`, `invitations`, `rsvp_*`) untouched.
