# Phase 1 Multi-Tenant RLS Isolation Results (`P1-AC04`)

- **Overall Status:** `PASSED` _(verified live on `wedding-platform-dev` / `tfwmbpvbfavugvokdych` via `supabase/tests/phase1_database_verification.sql`)_
- **Verification Script:** `supabase/tests/phase1_database_verification.sql` (Sections 3 & 4)

| Scenario                                                                                                       | Actors & Workspaces                         |  Status  |
| :------------------------------------------------------------------------------------------------------------- | :------------------------------------------ | :------: |
| `anon` blocked from reading/mutating `profiles`, `workspaces`, `workspace_members`, and Phase 1 RPCs           | `anon`                                      | `PASSED` |
| `User A` accesses `Workspace A` only; `SELECT` / `UPDATE` / `DELETE` on `Workspace B` & `C` return `0` rows    | `User A` (`owner` of `A`)                   | `PASSED` |
| `User B` accesses `Workspace B` only; `SELECT` on `Workspace A` & `C` returns `0` rows                         | `User B` (`owner` of `B`)                   | `PASSED` |
| `User C` accesses both `Workspace A` & `Workspace B`, and cannot access unrelated `Workspace C`                | `User C` (`editor` in `A`, `viewer` in `B`) | `PASSED` |
| Removing `User C` from `Workspace A` immediately revokes `Workspace A` table & `list_workspace_members` access | `User A` removes `User C` from `A`          | `PASSED` |
| `User C` retains full membership access to `Workspace B` after removal from `Workspace A`                      | `User C` in `B`                             | `PASSED` |
