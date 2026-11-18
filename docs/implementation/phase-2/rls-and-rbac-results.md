# Phase 2 Multi-Tenant RLS & Workspace RBAC Verification (`P2-AC02`–`P2-AC06`)

- **Overall Status:** `PASSED` _(verified live on `wedding-platform-dev` / `tfwmbpvbfavugvokdych` — `ALL_PHASE2_DATABASE_VERIFICATIONS_PASSED`)_
- **Verification Script:** `supabase/tests/phase2_database_verification.sql` (Sections 2–6)

| Scenario                                                                                                                                                   | Observed Outcome                                                                    |  Status  |
| :--------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------- | :------: |
| Composite FK `(workspace_id, wedding_id)` rejects cross-workspace settings linkage                                                                         | Rejected with `23503 foreign_key_violation`                                         | `PASSED` |
| `anon` `SELECT` on `public.weddings` & `public.wedding_settings`                                                                                           | Denied (`42501 insufficient_privilege`)                                             | `PASSED` |
| Cross-workspace `SELECT`, `UPDATE`, `DELETE`, and `create_wedding` (`User B` -> `Workspace A`)                                                             | `0` rows / `42501 WORKSPACE_ACCESS_DENIED`                                          | `PASSED` |
| Multi-workspace member (`User C`) attempting cross-workspace `duplicate_wedding(Workspace B, Wedding A)`                                                   | Rejected (`P0002 WEDDING_NOT_FOUND`)                                                | `PASSED` |
| Removing `User C` from `Workspace A` revokes `Workspace A` weddings immediately while preserving `Workspace B`                                             | `0` rows in `A`, `1` row in `B`                                                     | `PASSED` |
| `viewer` role RBAC (`SELECT` allowed; `create_wedding`, `duplicate_wedding`, `UPDATE`, `DELETE` denied)                                                    | `42501 INSUFFICIENT_WORKSPACE_ROLE` / `0` rows affected                             | `PASSED` |
| `editor` role RBAC (create, duplicate, update details/settings, archive/restore allowed; permanent `DELETE` denied)                                        | Mutations succeeded; `DELETE` affected `0` rows                                     | `PASSED` |
| `admin` & `owner` permanent `DELETE` cascades to `wedding_settings`                                                                                        | `1` row deleted; `0` orphan settings rows                                           | `PASSED` |
| IANA timezone validation (`Asia/Manila`, `America/Argentina/Buenos_Aires`, `UTC` accepted; `Invalid/Zone`, `GMT+8`, `+08:00`, `EST`, `localtime` rejected) | `22023 INVALID_TIMEZONE` raised on all invalid inputs                               | `PASSED` |
| FK `ON DELETE SET NULL` cleanup on `duplicated_from_wedding_id` & `created_by`                                                                             | Transitions to `NULL` succeeded cleanly on source-wedding and former-owner deletion | `PASSED` |
