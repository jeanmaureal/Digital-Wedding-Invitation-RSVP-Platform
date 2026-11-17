# Phase 1 Database Security & Privilege Audit (`P1-AC13`)

- **Overall Status:** `PASSED` _(verified live on `wedding-platform-dev` / `tfwmbpvbfavugvokdych` via `supabase/tests/phase1_database_verification.sql`)_
- **Verification Script:** `supabase/tests/phase1_database_verification.sql` (Section 1)

| Audit Check                                                                                                                          | Expected Outcome                                                          |  Status  |
| :----------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ | :------: |
| `REVOKE CREATE ON SCHEMA public` for `PUBLIC`, `anon`, `authenticated`                                                               | `has_schema_privilege(..., 'CREATE') = false`                             | `PASSED` |
| `app_private` unexposed to `anon` and `CREATE` revoked for `authenticated`                                                           | `anon USAGE = false`, `authenticated USAGE = true`, `CREATE = false`      | `PASSED` |
| RLS enabled (`relrowsecurity = true`) on all `public` tables                                                                         | `profiles`, `workspaces`, `workspace_members` all `true`                  | `PASSED` |
| Zero `anon` privileges on `profiles`, `workspaces`, `workspace_members`                                                              | All table & column privileges `false`                                     | `PASSED` |
| Column-scoped `UPDATE (full_name)` on `public.profiles` for `authenticated`                                                          | `UPDATE(full_name) = true`, `UPDATE(email) = false`, `UPDATE(id) = false` | `PASSED` |
| All 14 functions in `public` & `app_private` owned by `postgres` with `SET search_path = ''`                                         | `proowner = postgres`, `'search_path=""' = ANY(proconfig)`                | `PASSED` |
| Zero `PUBLIC` (`=X`) execution grants on any function in `public` or `app_private`                                                   | Verified via `proacl` inspection (`0` functions with `PUBLIC` `EXECUTE`)  | `PASSED` |
| Trigger functions (`set_updated_at`, `normalize_*`, `enforce_*`, `handle_*`, `prevent_*`) non-callable by `anon` and `authenticated` | `has_function_privilege(..., 'EXECUTE') = false`                          | `PASSED` |
