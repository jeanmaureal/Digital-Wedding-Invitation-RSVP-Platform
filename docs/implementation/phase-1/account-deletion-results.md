# Phase 1 Account-Deletion Protection Results (`P1-AC11`)

- **Overall Status:** `PASSED` _(verified live on `wedding-platform-dev` / `tfwmbpvbfavugvokdych`)_
- **Verification Scripts:** `supabase/tests/phase1_database_verification.sql` (Section 6) & `scripts/verify-phase1-concurrency.mjs` + parallel SQL delete race harness

| Scenario                                                                                                   | Expected & Observed Outcome                                                                                  |  Status  |
| :--------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------- | :------: |
| Delete `auth.users` row for sole `'owner'` of existing `Workspace A`                                       | Rejected with `SQLSTATE P0001` (`SOLE_WORKSPACE_OWNER_DELETE_BLOCKED`)                                       | `PASSED` |
| Promote co-member to `'owner'` of `Workspace A`, then delete original owner's `auth.users` row             | Deletion succeeded (`created_by` / `invited_by` set to `NULL` cleanly); `Workspace A` retained `1` `'owner'` | `PASSED` |
| Delete sole-owned `Workspace B` first, then delete owner's `auth.users` row                                | Deletion succeeded; `profiles` and memberships cascade-deleted cleanly                                       | `PASSED` |
| Concurrent `add_workspace_member_by_email(..., 'owner')` while target's `auth.users` deletion is in flight | Serialized via `auth.users` `FOR UPDATE` / `FOR KEY SHARE`; `3/3` parallel rounds preserved `>= 1` `'owner'` | `PASSED` |
