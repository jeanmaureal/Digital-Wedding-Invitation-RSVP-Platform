# Phase 1 Migration Review (`TG1-A`..`TG1-E`)

- **Migration Files Applied to `wedding-platform-dev` (`tfwmbpvbfavugvokdych`):**
  1. `supabase/migrations/20261112030812_auth_and_workspaces.sql` — Schema, indexes, triggers, RLS helpers & policies, and 5 RBAC RPCs
  2. `supabase/migrations/20261112054631_fix_fk_set_null_trigger_guards.sql` — Allows PostgreSQL FK `ON DELETE SET NULL` updates (`created_by = NULL` / `invited_by = NULL`) when a former owner transfers ownership and deletes their `auth.users` account while still rejecting any non-null reassignment
  3. `supabase/migrations/20261112055311_tune_rls_helper_row_estimates.sql` — Sets planner `ROWS 5` on `app_private.user_workspace_ids*` and `ROWS 10` on `public.list_workspace_members`
- **Executable SQL Suite:** `supabase/tests/phase1_database_verification.sql`
- **Executable Query-Plan Suite:** `supabase/tests/phase1_query_plan_verification.sql`
- **Executable Multi-Connection Concurrency Suite:** `scripts/verify-phase1-concurrency.mjs`
- **Static Review Status:** `PASSED`
- **Live PostgreSQL Execution Status (`TG1-E`):** `PASSED`

---

## 1. Pre-Migration Read-Only Target Role Verification (`wedding-platform-dev`)

Verified via read-only `pg_roles` / `has_table_privilege` inspection against `tfwmbpvbfavugvokdych`:

| Check                                                                                                             | Observed Value |  Status  |
| :---------------------------------------------------------------------------------------------------------------- | :------------- | :------: |
| Migration execution role (`current_user`)                                                                         | `postgres`     | `PASSED` |
| `postgres.rolbypassrls`                                                                                           | `true`         | `PASSED` |
| `has_schema_privilege('postgres', 'auth', 'USAGE')`                                                               | `true`         | `PASSED` |
| `has_table_privilege('postgres', 'auth.users', 'SELECT, UPDATE')` _(required for `FOR UPDATE` & `FOR KEY SHARE`)_ | `true`         | `PASSED` |
| `has_table_privilege('postgres', 'auth.users', 'TRIGGER, REFERENCES')`                                            | `true`         | `PASSED` |
| Pre-existing & post-verification `auth.users` row count                                                           | `0`            | `PASSED` |

---

## 2. Verified Database Invariants

| Requirement                                                        | Implementation Across Phase 1 Migrations                                                                                                                                                                                                                                                       | Static Status | Live DB Status |
| :----------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----------: | :------------: |
| Account-deletion sole-owner guard + `auth.users` lock coordination | `app_private.prevent_sole_workspace_owner_user_delete()` runs `FOR UPDATE` on `auth.users(OLD.id)`, locks owned `workspaces` `ORDER BY id ASC FOR UPDATE`, and rechecks sole-owner count in a fresh `READ COMMITTED` snapshot; membership RPCs acquire `FOR KEY SHARE` on target `auth.users`. |   `PASSED`    |    `PASSED`    |
| Parent-workspace serialization on all membership mutations         | `add_workspace_member_by_email`, `update_workspace_member_role`, and `remove_workspace_member` lock `public.workspaces` (`FOR UPDATE`) first before reading roles or mutating `workspace_members`.                                                                                             |   `PASSED`    |    `PASSED`    |
| Mandatory valid email & normalization                              | `handle_new_user`, `handle_auth_user_updated`, `normalize_profile_fields`, and `profiles_email_normalized_chk` enforce lowercase trimmed email (`3..320` chars) and reject `NULL`/blank email (`22023 PROFILE_EMAIL_REQUIRED`).                                                                |   `PASSED`    |    `PASSED`    |
| Immutable membership & workspace creator identity                  | `BEFORE UPDATE` triggers block non-null reassignment of `id`, `workspace_id`, `user_id`, `created_by`, `invited_by`, or `created_at` while permitting PostgreSQL FK `ON DELETE SET NULL` (`20261112054631`).                                                                                   |   `PASSED`    |    `PASSED`    |
| Concurrency-safe slug allocation                                   | `create_workspace` raises `23505 WORKSPACE_SLUG_TAKEN` on explicit slug collisions and retries up to 8 attempts with 6-char hex suffixes on auto-generated slug collisions.                                                                                                                    |   `PASSED`    |    `PASSED`    |
| Function ownership, `SECURITY DEFINER`, `search_path`, and grants  | All 14 functions across `public` and `app_private` (including Phase 0 `set_updated_at` and `health_check`) enforce `OWNER TO postgres`, `SET search_path = ''`, and explicit `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.                                                                |   `PASSED`    |    `PASSED`    |
| Self-only `profiles` RLS & `owner`/`admin` email visibility        | `public.profiles` `SELECT` policy is `id = (SELECT auth.uid())`; `list_workspace_members` masks co-member emails to `NULL` for `editor` and `viewer`.                                                                                                                                          |   `PASSED`    |    `PASSED`    |
| Existing-organizer scope                                           | `add_workspace_member_by_email` adds already-registered organizers only (`P0002 ORGANIZER_NOT_REGISTERED`); pending invitations deferred.                                                                                                                                                      |   `PASSED`    |    `PASSED`    |
