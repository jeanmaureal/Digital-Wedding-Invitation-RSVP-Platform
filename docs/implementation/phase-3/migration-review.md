# Phase 3 Migration Review (`TG1-A`..`TG1-E`)

- **Migration File Applied to `wedding-platform-dev` (`tfwmbpvbfavugvokdych`):**
  1. `supabase/migrations/20261119124511_invitation_design_system.sql` — `wedding_theme_preset` & `wedding_section_type` enums, `public.wedding_themes` (1:1 composite FK `(workspace_id, wedding_id)`), `public.wedding_sections` (7-section ordered draft stack with `DEFERRABLE` `sort_order` uniqueness), self-contained row normalization & unsafe-payload triggers, RLS policies, existing-wedding backfill, and atomic seeding/cloning inside `create_wedding` & `duplicate_wedding`.
- **Executable SQL Suite:** `supabase/tests/phase3_database_verification.sql`
- **Executable Query-Plan Suite:** `supabase/tests/phase3_query_plan_verification.sql`
- **Static Review Status (`TG1-B/C`):** `PASSED`
- **Live PostgreSQL Execution Status (`TG1-E`):** `PASSED`

---

## Verified Database Invariants

| Requirement                                                         | Implementation                                                                                                                                                                                                                                                                                              | Static Status | Live DB Status |
| :------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----------: | :------------: |
| 1:1 `wedding_themes` + 7-section `wedding_sections` composite FKs   | Both tables enforce `FOREIGN KEY (workspace_id, wedding_id) REFERENCES public.weddings(workspace_id, id) ON DELETE CASCADE` matched by leading index columns `(workspace_id, wedding_id)`.                                                                                                                  |   `PASSED`    |    `PASSED`    |
| Automatic seeding & duplication without function-overload ambiguity | `create_wedding` preserves its exact 18-arg signature while calling `app_private.seed_wedding_design_defaults(...)`; `duplicate_wedding` clones both `wedding_themes` and `wedding_sections` (updating `hero` couple headline when overridden).                                                             |   `PASSED`    |    `PASSED`    |
| Self-contained `SECURITY INVOKER` row triggers & payload guards     | `normalize_wedding_theme_fields()` and `normalize_wedding_section_fields()` enforce immutable identity columns, JSONB object types, byte caps, and block `<script` / `javascript:` / `data:text/html` strings (`22023 UNSAFE_DESIGN_PAYLOAD`) with zero helper `EXECUTE` grants needed for `authenticated`. |   `PASSED`    |    `PASSED`    |
| Workspace RBAC & `anon` isolation                                   | `anon` holds zero privileges; `viewer` holds read-only `SELECT`; `owner`/`admin`/`editor` hold column-scoped `UPDATE` on `wedding_themes` and `wedding_sections`.                                                                                                                                           |   `PASSED`    |    `PASSED`    |
