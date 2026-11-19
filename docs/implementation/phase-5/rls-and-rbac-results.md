# Phase 5 PostgreSQL Publishing, Immutability, RLS & Gate 4 Verification Results (`TG1-E`)

**Date:** 2026-11-19  
**Target Database:** `wedding-platform-dev` (`tfwmbpvbfavugvokdych`, `ap-southeast-1`)  
**Applied Migration:** `20261119145142_public_wedding_publishing.sql`  
**Verification Suite:** `supabase/tests/phase5_database_verification.sql`

---

## 1. Remote Migration & Generated Types Sync (`P5-AC01`)

- `npx supabase db push --remote --yes`: Applied `20261119145142_public_wedding_publishing.sql` cleanly.
- `npx supabase migration list --remote`: All 9 migrations (`20261111142432`..`20261119145142`) synced local ↔ remote.
- `npm run db:types`: Updated `src/types/database.types.ts` (`24,243` bytes), generating typed definitions for `published_versions`, `publish_wedding`, `unpublish_wedding`, and `get_public_wedding_by_slug`.

---

## 2. Executable Database & Gate 4 Verification Matrix (`P5-AC02`–`P5-AC05`)

Executed inside a single rolled-back transaction (`BEGIN; ... ROLLBACK;`) against live PostgreSQL (`[{"verification_result":"ALL_PHASE5_DATABASE_VERIFICATIONS_PASSED"}]`):

| Check                                            | Expected Outcome                                                                                                                                                                                                                                                                 |   Result   |
| :----------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------: |
| **30-Function Catalog Audit**                    | All functions in `public` + `app_private` owned by `postgres`, fixed empty `search_path = ''`, zero `PUBLIC` grants; only `health_check()` and `STABLE` `get_public_wedding_by_slug(text)` executable by `anon`                                                                  | **PASSED** |
| **Table Privileges & RLS**                       | RLS enabled on all `public` tables; `anon` holds `0` privileges on `published_versions`; `authenticated` holds `SELECT` only (`0` direct `INSERT`/`UPDATE`/`DELETE`)                                                                                                             | **PASSED** |
| **Direct `status = 'published'` Guard**          | `UPDATE public.weddings SET status = 'published'` on unpublished draft raises `P0001 PUBLISHING_REQUIRES_SNAPSHOT`                                                                                                                                                               | **PASSED** |
| **RBAC (`anon`, Outsider, `viewer`)**            | `anon` (`42501`), outsider (`42501 WORKSPACE_ACCESS_DENIED`), and `viewer` (`42501 INSUFFICIENT_WORKSPACE_ROLE`) blocked from `publish_wedding` / `unpublish_wedding`                                                                                                            | **PASSED** |
| **Zero-Visible-Sections & Archived Guards**      | `publish_wedding` rejects 0-visible-section drafts (`22023 NO_VISIBLE_SECTIONS_TO_PUBLISH`) and archived weddings (`P0001 ARCHIVED_WEDDING_CANNOT_PUBLISH`)                                                                                                                      | **PASSED** |
| **Gate 4 Draft-vs-Published Isolation**          | Publishing `v1` exposes `v1` via `get_public_wedding_by_slug` (stripping `workspace_id`/`wedding_id`); subsequent draft edits to `weddings` and `wedding_sections` remain 100% hidden until `publish_wedding` creates `v2` (setting `v1.is_active = false`)                      | **PASSED** |
| **`invite_only`, Unpublish & Archive Isolation** | Setting `wedding_settings.access_mode = 'invite_only'` immediately returns `{"status":"invite_only"}` with zero snapshot leakage; `unpublish_wedding` returns `{"status":"unavailable"}` while preserving historical `v1`/`v2` rows; archiving auto-deactivates active snapshots | **PASSED** |
| **Snapshot Immutability & `ON DELETE SET NULL`** | Mutating `content_snapshot` raises `P0001 IMMUTABLE_PUBLISHED_SNAPSHOT` even as table owner; deleting non-owner `published_by` user cleanly sets `published_by = NULL`                                                                                                           | **PASSED** |
