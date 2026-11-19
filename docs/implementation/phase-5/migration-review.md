# Phase 5 Migration Static Review (`TG1-C`)

**Migration File:** `supabase/migrations/20261119145142_public_wedding_publishing.sql`  
**Verification Suites:** `supabase/tests/phase5_database_verification.sql`, `supabase/tests/phase5_query_plan_verification.sql`  
**Target Remote Project:** `wedding-platform-dev` (`tfwmbpvbfavugvokdych`)

---

## 1. Security, Immutability & Index Checklist (`docs/security-baseline.md` §2–§3)

| Check                                                       | Status | Review Notes                                                                                                                                                                                                                                                                                                |
| :---------------------------------------------------------- | :----: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Immutable Prior Migrations**                              |  PASS  | Prior migrations (`20261111142432`..`20261119134557`) remain untouched.                                                                                                                                                                                                                                     |
| **RLS & Table Grants (`published_versions`)**               |  PASS  | `ENABLE ROW LEVEL SECURITY`; `anon` holds zero table privileges; `authenticated` holds workspace-scoped `SELECT` only (`0` direct `INSERT`/`UPDATE`/`DELETE`).                                                                                                                                              |
| **Snapshot Immutability Trigger**                           |  PASS  | `app_private.enforce_published_version_immutability()` blocks mutating any snapshot column except `is_active` (`P0001 IMMUTABLE_PUBLISHED_SNAPSHOT`), while permitting `published_by -> NULL` on `auth.users ON DELETE SET NULL` and rejecting `<script`, `javascript:`, `vbscript:`, and `data:text/html`. |
| **Lifecycle Guard (`normalize_wedding_fields`)**            |  PASS  | Unlocks `status = 'published'` only when an `is_active = true` `published_versions` row exists; auto-deactivates active snapshots on `status <> 'published'`.                                                                                                                                               |
| **FK Index Alignment (`0` Splinter Lints)**                 |  PASS  | `(workspace_id, wedding_id, version_number DESC)` covers composite FK `(workspace_id, wedding_id)` + version ordering; `(published_by)` covers `auth.users(id)` FK; partial unique index `(wedding_id) WHERE is_active = true` enforces `<= 1` active snapshot.                                             |
| **Hardened RPCs (`OWNER TO postgres`, `search_path = ''`)** |  PASS  | `publish_wedding` & `unpublish_wedding` (`authenticated` `owner`/`admin`/`editor` only); `get_public_wedding_by_slug` (`STABLE` read-only, `anon` + `authenticated`, strips internal UUIDs, enforces `invite_only` and `unavailable` states).                                                               |

---

## 2. Explicit Remote Migration Approval Gate (`TG1-D`)

Awaiting user approval before running `npx supabase db push --remote --yes`, executing `phase5_database_verification.sql` and `phase5_query_plan_verification.sql`, running Supabase security/performance advisors, and regenerating `src/types/database.types.ts`.
