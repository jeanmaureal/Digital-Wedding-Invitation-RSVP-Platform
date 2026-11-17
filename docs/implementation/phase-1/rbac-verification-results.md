# Phase 1 RBAC & Email Privacy Verification Results (`P1-AC05`, `P1-AC15`)

- **Overall Status:** `PASSED` _(verified live on `wedding-platform-dev` / `tfwmbpvbfavugvokdych` via `supabase/tests/phase1_database_verification.sql`)_
- **Verification Script:** `supabase/tests/phase1_database_verification.sql` (Section 5)

| Test Case                                                                                              | Expected Database Behavior                                               |  Status  |
| :----------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------- | :------: |
| `viewer` & `editor` cannot edit workspace settings, delete workspace, or mutate members                | `0` rows affected / `42501 INSUFFICIENT_WORKSPACE_ROLE`                  | `PASSED` |
| `admin` updates workspace settings and manages `editor`/`viewer` members                               | Succeeds cleanly                                                         | `PASSED` |
| `admin` blocked from adding/promoting/demoting/removing `owner` or `admin` and from deleting workspace | `42501 INSUFFICIENT_WORKSPACE_ROLE` / `0` rows deleted                   | `PASSED` |
| Sole `owner` blocked from self-demotion and self-removal                                               | `P0001 LAST_WORKSPACE_OWNER_REQUIRED`                                    | `PASSED` |
| Unregistered email passed to `add_workspace_member_by_email`                                           | `P0002 ORGANIZER_NOT_REGISTERED` (pending invitations deferred)          | `PASSED` |
| Direct `UPDATE` of `workspace_members.user_id` or `workspace_id` (even by privileged role)             | `P0001 IMMUTABLE_MEMBERSHIP_IDENTITY`                                    | `PASSED` |
| `list_workspace_members` email visibility for `owner` and `admin`                                      | All co-member `email` values returned                                    | `PASSED` |
| `list_workspace_members` email visibility for `editor` and `viewer`                                    | Caller's own `email` returned; all other co-member `email` values `NULL` | `PASSED` |
