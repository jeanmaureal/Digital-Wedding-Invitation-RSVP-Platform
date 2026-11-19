# Phase 5 Query Plan (`EXPLAIN ANALYZE`) & Supabase Advisor Results (`TG1-E`)

**Date:** 2026-11-19  
**Target Database:** `wedding-platform-dev` (`tfwmbpvbfavugvokdych`)  
**Benchmark Suite:** `supabase/tests/phase5_query_plan_verification.sql` (61 users, 81 workspaces, 321 weddings, 963 `published_versions`)

---

## 1. Representative-Volume Query Plans (`P5-AC06`)

| Query Scenario                                                                                                  | Plan Summary                                                                                                                                                                                              | Execution Time | Shared Buffer Hits | `Seq Scan` / `Sort` |
| :-------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------: | :----------------: | :-----------------: |
| **`public_slug_active_snapshot_lookup`** (`/w/:slug` active snapshot resolution)                                | `Nested Loop` -> `Index Scan` on `weddings_slug_key` (`0.012 ms`) -> `Index Scan` on `published_versions_one_active_per_wedding_idx` (`0.004 ms`) -> `Index Scan` on `wedding_settings_pkey` (`0.002 ms`) | **`0.061 ms`** |        `9`         |    **`0` / `0`**    |
| **`rls_list_published_versions_ordered_scoped`** (Organizer workspace version lookup under `authenticated` RLS) | `Index Scan` on `published_versions_workspace_id_wedding_id_version_idx` + `hashed SubPlan` (`app_private.user_workspace_ids()`)                                                                          | **`0.460 ms`** |        `86`        |    **`0` / `0`**    |

---

## 2. Supabase Advisors (`P5-AC01`)

- **Performance Advisors (`get_advisors` `type: "performance"`):** **`0` lints** (`{"result":{"lints":[]}}`).
- **Security Advisors (`get_advisors` `type: "security"`):** **`0` errors**.
  - `0028_anon_security_definer_function_executable` (`1` `WARN`: `public.get_public_wedding_by_slug`, [remediation guide](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)) — **`WAIVED WITH JUSTIFICATION`**: Intentionally callable by unauthenticated `/w/:slug` visitors; strictly `STABLE` (PostgreSQL forbids any DML), `OWNER TO postgres`, `SET search_path = ''`, strips internal UUIDs, and enforces `invite_only` and `unavailable` boundaries so `anon` retains zero direct table privileges on `weddings` or `published_versions`.
  - `0029_authenticated_security_definer_function_executable` (`10` `WARN`s: our intentional `authenticated` RPCs including `publish_wedding`, `unpublish_wedding`, and `get_public_wedding_by_slug`, [remediation guide](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)) — **`WAIVED WITH JUSTIFICATION`**.
