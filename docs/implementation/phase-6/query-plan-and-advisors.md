# Phase 6 Query Plan (`EXPLAIN ANALYZE`) & Supabase Advisors Report

## 1. Representative Multi-Tenant Volume Benchmark (`P6-AC06`)

- **Suite:** `supabase/tests/phase6_query_plan_verification.sql` (`41` workspaces, `81` weddings, `815` households, `2,445` guests, `1,630` invitations inside a self-cleaning `ROLLBACK` transaction with `ANALYZE`)
- **Result:** `PASSED` (exit code `0`, `0` `Sort` nodes, `0` `Seq Scan` regressions)

| Scenario                               |          Role           | Index Used                                                                     | Plan Node                            | Execution Time |
| :------------------------------------- | :---------------------: | :----------------------------------------------------------------------------- | :----------------------------------- | :------------: |
| `public_token_hash_unique_lookup`      | `postgres` (inside RPC) | `invitations_token_hash_key`                                                   | `Index Scan` (`3` shared hit blocks) |   `0.038 ms`   |
| `anon_rpc_resolve_invitation_by_token` |         `anon`          | `invitations_token_hash_key` + `published_versions_one_active_per_wedding_idx` | `Result` (STABLE RPC)                |   `6.445 ms`   |
| `rls_guest_groups_ordered_list`        |     `authenticated`     | `guest_groups_workspace_wedding_sort_idx`                                      | `Index Scan` (`0` `Sort` nodes)      |   `0.352 ms`   |
| `rls_guests_ordered_list`              |     `authenticated`     | `guests_workspace_wedding_sort_idx`                                            | `Index Scan` (`0` `Sort` nodes)      |   `0.159 ms`   |
| `rls_invitations_ordered_list`         |     `authenticated`     | `invitations_workspace_wedding_group_created_idx`                              | `Index Scan` (`0` `Sort` nodes)      |   `0.166 ms`   |
| `fk_guest_groups_created_by_idx`       |       `postgres`        | `guest_groups_created_by_idx`                                                  | `Index Scan`                         |   `0.021 ms`   |
| `fk_invitations_issued_by_idx`         |       `postgres`        | `invitations_issued_by_idx`                                                    | `Index Scan`                         |   `0.026 ms`   |

---

## 2. Supabase Security & Performance Advisors (`get_advisors`)

- **Performance Advisors (`type: "performance"`):** **`0` findings** (`{"result":{"lints":[]}}` — `0` unindexed foreign keys, `0` duplicate indexes, `0` unused indexes, `0` RLS `auth_rls_initplan` warnings).
- **Security Advisors (`type: "security"`):** **`0` `ERROR` findings**.
  - Informational `WARN` notices match our documented architecture:
    1. `0028_anon_security_definer_function_executable` (`get_public_wedding_by_slug`, `resolve_invitation_by_token` — both intentionally `STABLE`, hardened `SECURITY DEFINER` read-only endpoints so `anon` holds `0` direct table privileges).
    2. `0029_authenticated_security_definer_function_executable` (`import_wedding_guests`, `issue_household_invitation`, `revoke_household_invitation`, `update_household_invitation`, plus Phase 1–5 organizer RPCs — all enforce explicit `auth.uid()` + `workspace_members` RBAC + `SET search_path = ''`).
    3. `auth_leaked_password_protection` (Supabase Pro-plan Auth setting; tracked for Phase 10 production launch).
