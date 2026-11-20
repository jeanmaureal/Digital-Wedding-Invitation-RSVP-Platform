# Phase 8 Query Plan & Supabase Advisors Verification

## 1. Representative Volume `EXPLAIN (ANALYZE, BUFFERS)` (`P8-AC12`)

- **Script:** [phase8_query_plan_verification.sql](../../../../supabase/tests/phase8_query_plan_verification.sql)
- **Seeded Volume (Rolled Back):** `151` organizers, `51` workspaces, `101` weddings, and `1,020` immutable `published_versions` rows (`ANALYZE` executed prior to plan capture).
- **Result (`exit code 0`):**
  - `scenario`: `publication_history_ordered_lookup`
  - `root_node`: `Limit`
  - `execution_time_ms`: **`0.093 ms`**
  - **Index Verification:** Uses `published_versions_workspace_id_wedding_id_version_idx` (`(workspace_id, wedding_id, version_number DESC)`) + `profiles_pkey` with **`0` `Sort` nodes** and **`0` `Seq Scan` nodes**.

## 2. Supabase Security & Performance Advisors (`get_advisors`)

- **Security Advisors (`type = "security"`):**
  - **`0` errors.**
  - Advisory notices match documented architecture: `3` intentional `anon`-callable `SECURITY DEFINER` RPCs (`get_public_wedding_by_slug`, `resolve_invitation_by_token`, `submit_household_rsvp`), `18` intentional `authenticated`-only hardened `SECURITY DEFINER` RPCs (including `list_wedding_published_versions` and `rollback_wedding_published_version`), and Free-tier `auth_leaked_password_protection` notice.
- **Performance Advisors (`type = "performance"`):**
  - **`0` errors** and **`0` warnings** (`1` `INFO` notice on composite FK index `rsvp_attendees_workspace_wedding_group_submission_idx`, intentionally retained to prevent unindexed FK cascade locks).
