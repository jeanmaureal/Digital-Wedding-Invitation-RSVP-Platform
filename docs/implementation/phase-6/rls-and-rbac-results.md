# Phase 6 PostgreSQL RLS, RBAC & Cryptographic Token Verification Results

## 1. Execution Summary

- **Target Project:** `wedding-platform-dev` (`tfwmbpvbfavugvokdych`, region `ap-southeast-1`)
- **Applied Migration:** `20261119153501_guests_and_invitations.sql` (`10/10` migrations synced local ↔ remote)
- **Verification Command:** `npx supabase db query --remote --yes -f supabase/tests/phase6_database_verification.sql`
- **Result:** `PASSED` (`ALL_PHASE6_DATABASE_VERIFICATIONS_PASSED`, exit code `0`, `ROLLBACK` clean)
- **Generated TypeScript Definitions:** `npm run db:types` -> `src/types/database.types.ts` (`30,427` bytes)

---

## 2. Verified Security & Data Integrity Assertions (`P6-AC01`–`P6-AC05`)

| Criterion | Assertion Verified in Live PostgreSQL                                                                                                                                                                                                                                                                                                                                                                                                                     |  Status  |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------: |
| `P6-AC01` | RLS enabled on all `public` tables; `anon` holds `0` privileges on `guest_groups`, `guests`, and `invitations`; composite FKs reject cross-wedding/cross-workspace links; `max_attendees = 0` and `<script>` payloads rejected; `ON DELETE SET NULL` succeeds when deleting non-owner `created_by`/`issued_by` users.                                                                                                                                     | `PASSED` |
| `P6-AC02` | `owner`/`admin`/`editor` can create/update/delete households & guests and run invitation RPCs; `viewer` holds read-only `SELECT` access (excluding `token_hash`); cross-workspace outsiders see `0` rows and fail `HOUSEHOLD_NOT_FOUND`.                                                                                                                                                                                                                  | `PASSED` |
| `P6-AC03` | `issue_household_invitation` returns a 43-char base64url token (`256-bit` CSPRNG entropy), stores **only** the 64-char SHA-256 hex digest in `invitations.token_hash`, revokes prior active tokens on rotation, blocks mutating `token_hash` (`IMMUTABLE_INVITATION_IDENTITY`), and denies `SELECT token_hash` even to authenticated workspace members (`42501`).                                                                                         | `PASSED` |
| `P6-AC04` | `resolve_invitation_by_token` (`STABLE`) returns `invalid_token` on malformed strings without echoing input, returns uniform `unavailable` for draft weddings / unknown tokens / rotated tokens / explicitly revoked tokens / expired tokens (`expires_at <= now()`), and unlocks active snapshots + household summary on both `public` and `invite_only` published weddings while stripping `workspace_id`, `wedding_id`, `notes`, `email`, and `phone`. | `PASSED` |
| `P6-AC05` | `import_wedding_guests` rolls back `100%` atomically (`0` partial rows) when any household/guest item fails validation and commits multi-household batches cleanly; `duplicate_wedding` clones `0` `guest_groups`, `0` `guests`, and `0` `invitations`.                                                                                                                                                                                                   | `PASSED` |
