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
- **Guest RSVP submission (`Phase 7`):** Public guests do not hold `INSERT`/`UPDATE` table privileges on `guests` or `invitations`. RSVP submission runs through a single atomic PostgreSQL function that validates the token hash, active status, deadline, household membership, and `max_attendees` cap inside one transaction.

---

## 4. Migration & Type-Generation Workflow

- **Imperative migrations:** All schema changes live in `supabase/migrations/<YYYYMMDDHHMMSS>_<domain>_<description>.sql` created via Supabase CLI (`npx supabase migration new <name>`). Never edit already-applied migrations.
- **Verification:** Apply migrations to the linked development project (`npx supabase db push`), inspect `npx supabase migration list`, and run Supabase security/performance advisors before committing.
- **Safe TypeScript generation:** Run `npm run db:types` (`node scripts/generate-db-types.mjs`), which executes `supabase gen types typescript --linked`, verifies a zero exit code and non-empty TypeScript output in a temporary file, and atomically updates `src/types/database.types.ts` so failed CLI runs never corrupt committed types.
