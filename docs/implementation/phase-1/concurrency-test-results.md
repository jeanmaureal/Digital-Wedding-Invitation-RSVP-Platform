# Phase 1 Concurrency & Lock-Serialization Results (`P1-AC03`, `P1-AC11`, `P1-AC12`)

- **Overall Status:** `PASSED` _(verified live across parallel independent connections against `wedding-platform-dev` / `tfwmbpvbfavugvokdych`)_
- **Isolation Level Assumed & Enforced:** PostgreSQL `READ COMMITTED`

## Locking Protocol Design

1. **Workspace Membership Mutations (`add_workspace_member_by_email`, `update_workspace_member_role`, `remove_workspace_member`):**
   - Lock `public.workspaces` (`FOR UPDATE`) first -> re-read caller role -> lock target `public.workspace_members` (`FOR UPDATE`) -> acquire `FOR KEY SHARE` on target `auth.users` row (when adding/updating) -> enforce last-owner invariant -> mutate.
   - Matches `DELETE FROM public.workspaces` cascade lock order (`workspaces` -> `workspace_members`).
2. **Account Deletion (`app_private.prevent_sole_workspace_owner_user_delete()`):**
   - Acquires `FOR UPDATE` on `auth.users(OLD.id)` first -> locks owned `public.workspaces` in `ORDER BY w.id ASC FOR UPDATE` -> rechecks sole-owner status in a separate subsequent `READ COMMITTED` statement.
   - If a concurrent membership RPC locked `workspaces` first and then awaits `FOR KEY SHARE` on `auth.users` while `DELETE` holds `auth.users` and awaits `workspaces`, PostgreSQL's deadlock detector (`40P01`) aborts one transaction cleanly rather than committing an ownerless workspace.

| Multi-Connection Test                                                                                 | Harness & Observed Evidence                                                                                                                                     |  Status  |
| :---------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------: |
| 6 simultaneous `create_workspace('Concurrent Studio ...', NULL)` auto-slug collisions                 | `scripts/verify-phase1-concurrency.mjs` — `6/6` calls succeeded with 1 base slug + 5 distinct 6-char hex suffixes; `0` unhandled `23505` errors                 | `PASSED` |
| 5 rounds of simultaneous dual-owner demotion (`Owner A` -> `admin`) + self-removal (`Owner B` leaves) | `scripts/verify-phase1-concurrency.mjs` — `5/5` rounds resulted in exactly `1` commit + `1` `LAST_WORKSPACE_OWNER_REQUIRED` rejection and `1` surviving `owner` | `PASSED` |
| 3 rounds of concurrent `auth.users` deletion vs `add_workspace_member_by_email` + owner self-demotion | Parallel PostgREST + Supabase CLI SQL sessions — `3/3` rounds blocked sole-owner deletion and preserved `>= 1` surviving `owner`; post-test `auth.users = 0`    | `PASSED` |
