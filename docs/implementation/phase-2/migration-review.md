# Phase 2 Migration Review (`TG1-A`..`TG1-E`)

- **Migration Files Applied to `wedding-platform-dev` (`tfwmbpvbfavugvokdych`):**
  1. `supabase/migrations/20261118005848_weddings_and_settings.sql` — `wedding_status` & `wedding_access_mode` enums, `public.weddings`, `public.wedding_settings`, IANA timezone validation, lifecycle & immutability triggers, RLS policies, and atomic `create_wedding` / `duplicate_wedding` RPCs.
  2. `supabase/migrations/20261118015735_fix_wedding_trigger_helpers_and_fk_index.sql` — Inlines reserved-slug and IANA timezone checks inside `SECURITY INVOKER` triggers (`normalize_wedding_fields`, `normalize_wedding_settings_fields`) so `authenticated` `UPDATE`s require zero helper `EXECUTE` grants, aligns composite FK column order `(workspace_id, wedding_id) -> weddings(workspace_id, id)` (`0001_unindexed_foreign_keys = 0`), and removes redundant `weddings_workspace_id_status_idx`.
- **Executable SQL Suite:** `supabase/tests/phase2_database_verification.sql`
- **Executable Query-Plan Suite:** `supabase/tests/phase2_query_plan_verification.sql`
- **Executable Multi-Connection Concurrency Suite:** `scripts/verify-phase2-concurrency.mjs`
- **Static Review Status (`TG1-B/C`):** `PASSED`
- **Live PostgreSQL Execution Status (`TG1-E`):** `PASSED`

---

## Verified Database Invariants

| Requirement                                                                  | Implementation Across Phase 2 Migrations                                                                                                                                                                                                                                           | Static Status | Live DB Status |
| :--------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----------: | :------------: |
| 1:1 `weddings` ↔ `wedding_settings` & composite workspace FK                 | `wedding_settings` uses `wedding_id PRIMARY KEY` + `FOREIGN KEY (workspace_id, wedding_id) REFERENCES weddings(workspace_id, id) ON DELETE CASCADE`; direct `INSERT` & `DELETE` on `wedding_settings` are revoked from `authenticated`.                                            |   `PASSED`    |    `PASSED`    |
| Phase 2 lifecycle guard (`draft <-> archived`, `published` blocked)          | `app_private.normalize_wedding_fields()` synchronizes `archived_at` automatically and rejects `status = 'published'` (`P0001 PUBLISHING_REQUIRES_SNAPSHOT`) until Phase 5/8 immutable snapshots.                                                                                   |   `PASSED`    |    `PASSED`    |
| Canonical IANA timezone enforcement                                          | `normalize_wedding_settings_fields()` and `assert_valid_iana_timezone()` validate canonical `'UTC'` or `'Region/City'` format and confirm membership in `pg_catalog.pg_timezone_names` (`22023 INVALID_TIMEZONE`).                                                                 |   `PASSED`    |    `PASSED`    |
| Same-workspace duplication & slug collision retries                          | `public.create_wedding` and `public.duplicate_wedding` lock `workspaces` (`FOR KEY SHARE`) + `auth.users` (`FOR KEY SHARE`), verify `owner`/`admin`/`editor` role, retry auto-slug collisions up to 8 attempts, and block cross-workspace duplication (`P0002 WEDDING_NOT_FOUND`). |   `PASSED`    |    `PASSED`    |
| FK `ON DELETE SET NULL` trigger safety                                       | `normalize_wedding_fields()` blocks non-null reassignment of `created_by` and `duplicated_from_wedding_id` while permitting transitions to `NULL` on creator or source-wedding deletion.                                                                                           |   `PASSED`    |    `PASSED`    |
| Function hardening (`OWNER TO postgres`, `search_path = ''`, minimal grants) | All 21 functions across `public` and `app_private` enforce `OWNER TO postgres`, `SET search_path = ''`, and `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.                                                                                                                     |   `PASSED`    |    `PASSED`    |
