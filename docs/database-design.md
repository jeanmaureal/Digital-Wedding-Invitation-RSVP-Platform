# Database Design Standards

## 1. Multi-Tenant Data Hierarchy

```text
workspaces
 ├── workspace_members (user_id, role: owner | admin | editor | viewer)
 └── weddings (workspace_id, unique slug, status: draft | published | archived)
      ├── wedding_settings (timezone, rsvp_deadline, access_mode, ...)
      ├── wedding_themes & draft sections
      ├── published_versions (immutable content_snapshot, sequential version_number)
      ├── guest_groups (household max_attendees)
      │    └── guests (group_id, wedding_id)
      ├── invitations (hashed token, delivery status, expiry/revocation)
      └── rsvp_submissions -> rsvp_attendees & rsvp_answers
```

Where child entities reference siblings within a wedding (e.g., `guests` -> `guest_groups`, `rsvp_attendees` -> `guests`), composite foreign keys including `wedding_id` should be used where practical so records can never link across different weddings.

---

## 2. PostgreSQL Conventions

- **Primary keys:** `uuid` generated via `gen_random_uuid()`.
- **Timestamps:** Always `timestamptz` (PostgreSQL stores absolute UTC instants). Never use `timestamp without time zone`. Event display times and RSVP deadlines convert using the explicit IANA timezone stored on `wedding_settings.timezone`.
- **`updated_at` maintenance:** Attach `public.set_updated_at()` (`NEW.updated_at = now()`) only to tables that define an `updated_at` column as those tables are created in Phase 1+.
- **Constraints over frontend checks:** Enforce slug uniqueness, valid enum/check statuses, non-negative limits (`max_attendees >= 1`), and foreign-key cascades/restrictions directly in PostgreSQL.
- **Indexing:** Index every foreign key used in RLS predicates or joins (`workspace_id`, `wedding_id`, `user_id`, `group_id`, token hash lookups).

---

## 3. Operational RPCs & Transactional Boundaries

- **Connectivity check (`Phase 0`):** `public.health_check()` is a `VOLATILE`, `SECURITY INVOKER` SQL function with `SET search_path = ''` returning `{ status: 'ok', timestamp: clock_timestamp() }`. Execution is revoked from `PUBLIC` and granted explicitly to `anon` and `authenticated`. Note: a passing `health_check()` confirms RPC reachability only, not migration completeness.
- **Workspace & RBAC mutations (`Phase 1`):**
  - `public.create_workspace(p_name, p_slug)` atomically creates the workspace (retrying auto-generated slug collisions up to 8 attempts or raising `23505 WORKSPACE_SLUG_TAKEN` on explicit slug collisions) and inserts the caller's `'owner'` membership inside one transaction.
  - `public.add_workspace_member_by_email(p_workspace_id, p_email, p_role)` adds **existing registered organizers** only (`P0002 ORGANIZER_NOT_REGISTERED`); tokenized pending workspace invitations (`workspace_invitations` + email delivery) are deferred to a future phase.
  - `public.update_workspace_member_role` and `public.remove_workspace_member` serialize mutations per workspace by locking `public.workspaces` (`SELECT ... FOR UPDATE`) first, acquiring `FOR KEY SHARE` on target `auth.users` rows when adding/updating roles, and enforcing the `P0001 LAST_WORKSPACE_OWNER_REQUIRED` invariant.
  - `app_private.prevent_sole_workspace_owner_user_delete()` (`BEFORE DELETE ON auth.users`) locks `auth.users(OLD.id)` (`FOR UPDATE`), locks owned `public.workspaces` in `ORDER BY id ASC FOR UPDATE`, and rechecks sole-owner status in a fresh `READ COMMITTED` snapshot (`P0001 SOLE_WORKSPACE_OWNER_DELETE_BLOCKED`).
- **Wedding project & 1:1 settings mutations (`Phase 2`):**
  - `public.weddings` (`UNIQUE (workspace_id, id)`, `UNIQUE (slug)`) and `public.wedding_settings` (`wedding_id PRIMARY KEY`, composite `FOREIGN KEY (workspace_id, wedding_id) REFERENCES public.weddings(workspace_id, id) ON DELETE CASCADE`) disallow direct client `INSERT` so 1:1 parity and workspace linkage are structurally guaranteed.
  - `public.create_wedding(...)` and `public.duplicate_wedding(...)` lock `public.workspaces` (`FOR KEY SHARE`) and `auth.users` (`FOR KEY SHARE`), verify `owner`/`admin`/`editor` membership, retry auto-generated slug collisions up to 8 attempts (`23505 WEDDING_SLUG_TAKEN` on explicit collisions, `22023 RESERVED_WEDDING_SLUG` on reserved words), validate canonical IANA timezones against `pg_catalog.pg_timezone_names` (`22023 INVALID_TIMEZONE`), and restrict project duplication strictly within the same workspace (`P0002 WEDDING_NOT_FOUND`).
  - Phase 2 blocks premature `'published'` transitions (`P0001 PUBLISHING_REQUIRES_SNAPSHOT`) until immutable `published_versions` snapshots arrive in Phase 5/8, while supporting `'draft' <-> 'archived'` with automatic `archived_at` synchronization and restricting permanent `DELETE` on `public.weddings` to `owner` and `admin`.
- **Invitation design system & draft sections (`Phases 3–4`):**
  - `public.wedding_themes` (1:1 per wedding; `preset_id: editorial_ivory | garden_sage | celestial_midnight | terracotta_atelier`, `schema_version = 1`, `token_overrides jsonb`) and `public.wedding_sections` (7 ordered sections per wedding with `DEFERRABLE` `(wedding_id, sort_order)` uniqueness and `content jsonb`) bind via composite `FOREIGN KEY (workspace_id, wedding_id) REFERENCES public.weddings(workspace_id, id) ON DELETE CASCADE`.
  - `public.create_wedding` seeds the 1:1 theme + all 7 starter sections atomically, and `public.duplicate_wedding` clones both theme and sections into the duplicated draft project.
  - `public.reorder_wedding_sections(p_workspace_id, p_wedding_id, p_ordered_section_ids)` (`SECURITY INVOKER`) locks all section rows for the target wedding in deterministic `ORDER BY id ASC FOR UPDATE`, validates exact 1-to-1 section UUID membership (`22023 SECTION_REORDER_MISMATCH`), defers `public.wedding_sections_wedding_sort_order_key` inside the single transaction to update moved `sort_order` values collision-free, and restores `IMMEDIATE` validation before returning.
- **Public wedding website & immutable snapshots (`Phase 5`):**
  - `public.published_versions` stores sequential, immutable `InvitationDocument` JSONB snapshots (`UNIQUE (wedding_id, version_number)`, partial unique index `(wedding_id) WHERE is_active = true`, `enforce_published_version_immutability()` trigger).
  - `public.publish_wedding` (`editor`+) locks `public.weddings` (`FOR UPDATE`), verifies `>= 1` visible section, deactivates any prior active snapshot, inserts `v(N+1)` (`is_active = true`), and sets `weddings.status = 'published'`; `public.unpublish_wedding` returns the project to `'draft'` while preserving snapshot history.
  - `public.get_public_wedding_by_slug(p_slug)` (`STABLE`, `SECURITY DEFINER`) resolves active `public` snapshots without exposing internal UUIDs or granting `anon` direct `SELECT` privileges on `weddings` or `published_versions`, returning `invite_only` or `unavailable` otherwise.
- **Guest directory, CSV import & hashed household tokens (`Phase 6`):**
  - `public.guest_groups` (`UNIQUE (workspace_id, wedding_id, id)`), `public.guests` (`UNIQUE (workspace_id, wedding_id, group_id, id)`), and `public.invitations` (`UNIQUE (token_hash)`, partial unique index `(group_id) WHERE status = 'active'`) bind via composite foreign keys with `0` `anon` table privileges and column-scoped `SELECT` on `invitations` excluding `token_hash`.
  - `public.import_wedding_guests` (`editor`+) executes multi-household CSV imports inside a single PostgreSQL transaction, rolling back `100%` atomically if any item fails validation; `public.duplicate_wedding` never clones `guest_groups`, `guests`, or `invitations`.
  - `public.issue_household_invitation` (`editor`+) generates `256-bit` (`32`-byte CSPRNG base64url) tokens, revokes any prior active token for the household, persists only the SHA-256 hex digest in `invitations.token_hash`, and returns the raw token once; `public.revoke_household_invitation` and `public.update_household_invitation` manage lifecycle metadata; `public.resolve_invitation_by_token(p_token)` (`STABLE`, `SECURITY DEFINER`) unlocks active published snapshots (both `public` and `invite_only`) for valid non-expired household tokens without echoing raw tokens or exposing internal UUIDs/notes/contact PII.
- **Guest RSVP submission & custom questions (`Phase 7` / `Gate 5`):**
  - `public.rsvp_questions` (`editor`+ CRUD, `viewer` read), `public.rsvp_submissions` (`UNIQUE (group_id)`), `public.rsvp_attendees` (composite FKs to both `rsvp_submissions` and `guests`), and `public.rsvp_answers` (composite FKs to both `rsvp_submissions` and `rsvp_questions`) hold `0` `anon` table privileges (`authenticated` holds `SELECT`-only on response tables).
  - `public.submit_household_rsvp(p_token, p_payload)` (`VOLATILE`, `SECURITY DEFINER`) validates SHA-256 token hashes server-side, acquires `FOR UPDATE` on `public.guest_groups` in strict top-down lock order (`guest_groups -> invitations -> rsvp_submissions`) to serialize concurrent updates and revocations deadlock-free, enforces live `is_rsvp_open`, `rsvp_deadline > now()`, exact household membership, `attending_count <= max_attendees`, and custom question rules, and commits or rolls back `100%` atomically inside one transaction.
- **Publication history & atomic version rollback (`Phase 8` / `Gate 6 Part 1`):**
  - `public.list_wedding_published_versions(p_workspace_id, p_wedding_id)` (`STABLE`, `SECURITY DEFINER`) returns ordered immutable snapshots (`version_number DESC`, `LIMIT 50`) to workspace members (`owner | admin | editor | viewer`) using `published_versions_workspace_id_wedding_id_version_idx` (`0` `Sort` nodes) with `profiles.full_name` attribution and zero co-member email exposure.
  - `public.rollback_wedding_published_version(p_workspace_id, p_wedding_id, p_target_version_number)` (`VOLATILE`, `SECURITY DEFINER`) enforces `owner | admin | editor` RBAC, locks `public.weddings` (`FOR UPDATE`), rejects `archived` weddings and unknown versions, deactivates the prior active row before activating `v_target` (`is_active = true`), restores `'draft'` weddings to `'published'`, and leaves historical snapshot payloads, Builder drafts, and operational guest/token/RSVP records `100%` untouched.

---

## 4. Migration & Type-Generation Workflow

- **Imperative migrations:** All schema changes live in `supabase/migrations/<YYYYMMDDHHMMSS>_<domain>_<description>.sql` created via Supabase CLI (`npx supabase migration new <name>`). Never edit already-applied migrations.
- **Verification:** Apply migrations to the linked development project (`npx supabase db push`), inspect `npx supabase migration list`, and run Supabase security/performance advisors before committing.
- **Safe TypeScript generation:** Run `npm run db:types` (`node scripts/generate-db-types.mjs`), which executes `supabase gen types --lang=typescript --remote`, verifies a zero exit code and non-empty TypeScript output in a temporary file, and atomically updates `src/types/database.types.ts` so failed CLI runs never corrupt committed types.
