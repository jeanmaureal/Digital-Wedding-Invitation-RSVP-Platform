# Phase 6 Static Migration Review (`20261119153501_guests_and_invitations.sql`)

## 1. Scope & Files Reviewed

- **Migration:** `supabase/migrations/20261119153501_guests_and_invitations.sql`
- **Executable Verification Suite:** `supabase/tests/phase6_database_verification.sql`
- **Representative Query Plan Suite:** `supabase/tests/phase6_query_plan_verification.sql`

---

## 2. Security, Schema & Postgres Best-Practices Checklist (`TG1-C`)

| Check | Status | Verification Notes |
| :--- | :---: | :--- |
| Composite Multi-Tenant FKs | Reviewed | `guest_groups (workspace_id, wedding_id) -> weddings(workspace_id, id) ON DELETE CASCADE`; `guests` & `invitations (workspace_id, wedding_id, group_id) -> guest_groups(workspace_id, wedding_id, id) ON DELETE CASCADE`; `guests` exposes `UNIQUE (workspace_id, wedding_id, group_id, id)` for Phase 7 RSVPs. |
| Exact Leading-Column FK Indexes (`0001` & `0009`) | Reviewed | Every composite FK and `auth.users` FK (`created_by`, `issued_by`) has an exact leading-column B-tree index with zero redundant prefix indexes. |
| Zero Plaintext Token Storage & Column-Level Digest Isolation | Reviewed | `issue_household_invitation` generates `32` CSPRNG bytes (`256-bit` entropy -> 43-char base64url), stores only `encode(sha256(...), 'hex')` in `invitations.token_hash`, revokes prior active tokens, and excludes `token_hash` from all `SELECT` grants. |
| RLS & Explicit Role Grants (`TO authenticated`, `0` `anon` table grants) | Reviewed | `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL` on `guest_groups`, `guests`, and `invitations`; `anon` has zero table grants; `viewer` holds read-only access while `owner`/`admin`/`editor` hold write policies. |
| Self-Contained Row Triggers & `ON DELETE SET NULL` Safety | Reviewed | `normalize_guest_group_fields()`, `normalize_guest_fields()`, and `enforce_invitation_integrity()` inline validation with `SET search_path = ''`, reject `<script`/`javascript:` payloads, prevent reactivating revoked tokens, and allow `created_by`/`issued_by` to transition to `NULL` on user deletion. |
| Hardened `SECURITY DEFINER` RPCs | Reviewed | `import_wedding_guests`, `issue_household_invitation`, `revoke_household_invitation`, `update_household_invitation`, and `STABLE` `resolve_invitation_by_token` set `OWNER TO postgres`, `SET search_path = ''`, schema-qualify all references, and revoke `PUBLIC` execution. |
| Non-Echoing Public `/i/:token` Resolution | Reviewed | `resolve_invitation_by_token` returns uniform `unavailable` for unknown, revoked, expired, or unpublished tokens, unlocks both `public` and `invite_only` published weddings for valid household tokens, strips internal UUIDs / organizer `notes` / guest `email` & `phone`, and never echoes `p_token`. |
