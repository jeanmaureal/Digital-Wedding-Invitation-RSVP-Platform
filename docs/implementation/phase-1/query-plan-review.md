# Phase 1 Query Plan & Index Review (`P1-AC01`)

- **Overall Status:** `PASSED` _(verified live via `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` over a seeded 150-user / 201-workspace / 600-membership workload on `wedding-platform-dev` after applying `20261112055311_tune_rls_helper_row_estimates.sql`)_
- **Verification Script:** `supabase/tests/phase1_query_plan_verification.sql`

| Planned Workload Query                                                                     | Observed Execution Plan & Timing                                                                                                                                              |  Status  |
| :----------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------: |
| `SELECT * FROM public.workspaces` under `authenticated` RLS (`user_workspace_ids()`)       | Hashed `SubPlan` (`Plan Rows: 5` via `ROWS 5` tuning, `workspace_members_user_id_idx`); 3-page 201-row heap scanned in `0.645 ms` (`workspaces_pkey` available as heap grows) | `PASSED` |
| `SELECT * FROM public.workspace_members WHERE workspace_id = $1` under `authenticated` RLS | `Index Scan` on `workspace_members_workspace_id_role_idx` + hashed `SubPlan` (`Plan Rows: 5`), `0.190 ms` (`Shared Hit Blocks: 6`)                                            | `PASSED` |
| `SELECT * FROM public.list_workspace_members($1)`                                          | `Function Scan` (`Plan Rows: 10`), internal `workspace_members_workspace_user_key` + `workspace_members_workspace_id_role_idx` + `profiles_pkey` joins, `1.934 ms`            | `PASSED` |
| `SELECT * FROM public.profiles` under `authenticated` RLS (`id = (SELECT auth.uid())`)     | `Index Scan` on `profiles_pkey` with single-eval `InitPlan 1` (`(SELECT auth.uid())`), `0.027 ms` (`Shared Hit Blocks: 2`)                                                    | `PASSED` |
| `SELECT id FROM public.profiles WHERE email = $1` (`add_workspace_member_by_email`)        | `Index Scan` on `profiles_email_idx`, `0.020 ms` (`Shared Hit Blocks: 2`)                                                                                                     | `PASSED` |
