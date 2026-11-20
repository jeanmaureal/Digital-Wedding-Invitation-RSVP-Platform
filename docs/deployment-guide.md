# Production Deployment, Environment Isolation & Operations Runbook

## 1. Environment Topology & Configuration Contract (`Gate 6` Final State)

The Digital Wedding Invitation & RSVP Platform enforces **strict physical project isolation** between non-production (`local` / Vercel `Preview`) and production (Vercel `Production`):

| Environment               | `VITE_APP_ENV`     | Target Supabase Project                                                        | Frontend Variables (`VITE_*`)                                                             | Runtime & Auth Redirect Contract                                                                                                          |
| :------------------------ | :----------------- | :----------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| **Local (offline shell)** | `local` (or unset) | None                                                                           | Optional (unset)                                                                          | Starts cleanly with `supabase.status = 'unconfigured'`; never substitutes placeholder credentials.                                        |
| **Local (connected)**     | `local`            | `wedding-platform-dev` (`tfwmbpvbfavugvokdych`, `ap-southeast-1`)              | `https://tfwmbpvbfavugvokdych.supabase.co` + dev publishable key                          | Default linked CLI project (`supabase link`); allows `http://localhost:5173/app/**` & `127.0.0.1:4173/app/**`.                            |
| **Vercel Preview**        | `preview`          | `wedding-platform-dev` (`tfwmbpvbfavugvokdych`, `ap-southeast-1`)              | Required (exact `3` `VITE_*` variables in Vercel `Preview`)                               | Fails fast with `EnvConfigurationError` if missing; allows `https://*-jeanmaureals-projects.vercel.app/app/**`.                           |
| **Vercel Production**     | `production`       | `wedding-platform-prod` (`ftmwcmsrfcgzmrowjudb`, `ap-southeast-1`, PG `17.12`) | Required (exact `3` `VITE_*` variables in Vercel `Production`; `0` server secrets/DB URL) | Fails fast with `EnvConfigurationError` if missing; allows **only** `https://digital-wedding-invitation-rsvp-pla.vercel.app` & `/app/**`. |

### Security & Least-Privilege Boundaries

1. **Publishable-Key Only Frontend Hosting:** Vercel `Production` and `Preview` store **only** `VITE_APP_ENV`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`). Server-only credentials (`sb_secret_...`, `service_role`, `POSTGRES_PASSWORD`, `SUPABASE_ACCESS_TOKEN`) are **never** stored in `.env` files tracked by Git or in frontend `VITE_*` variables.
2. **Environment-Scoped Supabase Auth Config (`supabase/config.toml`):**
   - `[remotes.dev]` (`tfwmbpvbfavugvokdych`) retains localhost and wildcard Vercel Preview redirect allowlists for development and PR testing.
   - `[remotes.production]` (`ftmwcmsrfcgzmrowjudb`) locks `site_url = "https://digital-wedding-invitation-rsvp-pla.vercel.app"`, restricts `additional_redirect_urls` exclusively to `["https://digital-wedding-invitation-rsvp-pla.vercel.app/app/**"]`, and enforces `[remotes.production.db.seed] enabled = false`.

---

## 2. Local Setup & Environment Sync

```bash
npm ci
# Optional: copy .env.example to .env.local and populate wedding-platform-dev credentials
npm run dev
```

Verify linked Supabase projects and Vercel project binding before running remote operations:

```bash
npx supabase projects list
npx vercel project inspect --non-interactive
npx vercel env ls production
npx vercel env ls preview
```

---

## 3. Safe Two-Phase Release & Migration Sequencing

Because Vite embeds `VITE_*` configuration at build time and Vercel serves static assets globally while PostgreSQL serves live queries immediately, any release containing database changes **must** follow backward-compatible expand-and-contract sequencing:

1. **Author & Test on Dev (`wedding-platform-dev`):**
   ```bash
   npx supabase migration new <descriptive_name>
   # Apply & verify on dev (default linked project)
   npx supabase db push --remote=tfwmbpvbfavugvokdych
   npm run db:types
   npx supabase db query --remote=tfwmbpvbfavugvokdych --yes -f supabase/tests/phase9_security_and_rls_suite.sql
   ```
2. **Run Local Quality, Browser CSP & Secret Gates:**
   ```bash
   npm run typecheck && npm run lint && npm run format:check
   npm test && npm run build && npm run test:e2e && npm run security:secrets
   ```
3. **Pre-Migration Production Snapshot + Production DB Push (Before Merging to `main`):**
   - **Never** pass `--include-seed` or run `db reset` against `ftmwcmsrfcgzmrowjudb`.
   ```bash
   npm run db:backup:prod
   npx supabase db push --dry-run --remote=ftmwcmsrfcgzmrowjudb
   npx supabase db push --remote=ftmwcmsrfcgzmrowjudb --yes
   npx supabase migration list --remote=ftmwcmsrfcgzmrowjudb
   ```
4. **Push GPG-Signed Commit to `main` & Verify Cutover:**
   - Pushing to `main` triggers GitHub Actions CI (`Typecheck, Lint, Format, Test, Build & E2E` + `Gitleaks`) and Vercel `Production` deployment.
   - If Auth/API configuration in `supabase/config.toml` (`[remotes.production]`) changed, review and push config explicitly:
     ```bash
     npx supabase config diff --remote=ftmwcmsrfcgzmrowjudb
     npx supabase config push --remote=ftmwcmsrfcgzmrowjudb --yes
     ```

---

## 4. Three-Layer Rollback Runbook

### Layer A — Frontend Application Rollback (Vercel)

If a newly deployed frontend bundle introduces a UI regression while the database schema remains backward-compatible:

```bash
# 1. Inspect recent deployments and current rollback status
npx vercel ls
npx vercel rollback status

# 2. Instantly revert Production alias to a known-good previous Production deployment
npx vercel rollback <previous-production-deployment-url-or-id>
```

> **Important Operational Caveat:** Running `vercel rollback` disables automatic domain assignment for subsequent Git pushes to `main`. Once a forward fix is built and verified on a staged Production deployment, re-enable normal Production releases with `npx vercel promote <fixed-production-deployment-url-or-id>`.

### Layer B — Per-Wedding Public Website Rollback (`published_versions`)

If an organizer publishes unwanted invitation copy or theme edits on `/w/:slug` or `/i/:token`:

- Use **Publication History -> Restore Version** inside `/app/weddings/:weddingId` (powered by `public.rollback_wedding_published_version(p_workspace_id, p_wedding_id, p_target_version_number)`).
- Creates a new immutable active `published_versions` row from the selected historical snapshot without altering draft builder tables, guest lists, invitation tokens, or RSVP submissions.

### Layer C — Database Schema Rollback (Forward-Fix Only)

- Applied migration files in `supabase/migrations/` (`20261111142432`..`20261120012113`+) are **strictly immutable** once pushed.
- Never edit or delete an applied migration or run `supabase db reset --linked` on Production. Always author a new forward-fix migration (`npx supabase migration new revert_<change>`), verify on `tfwmbpvbfavugvokdych`, and push to `ftmwcmsrfcgzmrowjudb`.

---

## 5. Backup, Export & Disaster-Recovery Procedures

### 5.1 Zero-Docker Logical Database Snapshot (`npm run db:backup:prod`)

Works on any workstation with Node.js 22+ and authenticated Supabase CLI (no Docker or local `pg_dump` required):

```bash
# Export Production logical snapshot + SHA-256 manifest under gitignored backups/
npm run db:backup:prod

# Export Development logical snapshot
npm run db:backup

# Run automated backup checksum + non-destructive BEGIN...ROLLBACK disaster-recovery drill
npm run test:ops:phase10:backup
```

Each backup writes `backups/<env>-<project-ref>-<iso-timestamp>/`:

- `snapshot.json`: Canonical JSON dump of `supabase_migrations.schema_migrations` and all `15` `public` tables ordered deterministically in parent-before-child FK topological order (`profiles` -> `workspaces` -> `workspace_members` -> `weddings` -> `wedding_settings` -> `wedding_themes` -> `wedding_sections` -> `published_versions` -> `guest_groups` -> `guests` -> `invitations` -> `rsvp_questions` -> `rsvp_submissions` -> `rsvp_attendees` -> `rsvp_answers`).
- `manifest.json`: Row counts per table, migration count, excluded sensitive columns (`["public.invitations.token_hash"]`), and `snapshotSha256` integrity digest.
- **Security Guarantee:** `public.invitations.token_hash` is stripped at query time and re-verified before disk write; `backups/` is gitignored and enforced by `npm run security:secrets` (`tracked-backup-file` rule).

### 5.2 Full `pg_dump` Schema & Data Export (Workstations with Docker)

When running on a workstation or CI runner with Docker Desktop / Engine installed:

```bash
npx supabase db dump --remote=ftmwcmsrfcgzmrowjudb -f backups/prod-schema.sql
npx supabase db dump --remote=ftmwcmsrfcgzmrowjudb --data-only --use-copy -f backups/prod-data.sql
```

### 5.3 Organizer-Level Operational CSV Exports

Organizers can export portable spreadsheet backups per wedding directly from `/app/weddings/:weddingId`:

1. **Guest Directory CSV** (`/guests` -> **Export Guest CSV**) — spreadsheet-formula-hardened (`'`, `=`, `+`, `-`, `@`, `\t`, `\r` neutralized).
2. **RSVP Attendance & Custom Answers CSV** (`/rsvps` -> **Export RSVP CSV**) — household and per-attendee attendance statuses, dietary notes, plus-one counts, and custom question responses.

### 5.4 Logical Re-Hydration Procedure (Verified by `phase10_disaster_recovery_drill.sql`)

1. Verify `manifest.json` `snapshotSha256` matches `sha256(snapshot.json)`.
2. Inside an explicit database transaction (`BEGIN; ... COMMIT;`), insert rows in the exact `manifest.tableOrder` sequence via `jsonb_populate_recordset(NULL::public.<table>, ...)`.
3. **Trigger-Safe Publication Status Restore:** Because `app_private.normalize_wedding_fields()` enforces `PUBLISHING_REQUIRES_SNAPSHOT` on `INSERT INTO public.weddings`, insert `weddings` rows with `status = 'draft'` first, insert `wedding_settings`, `wedding_themes`, `wedding_sections`, and `published_versions` (`is_active = true`), and then `UPDATE public.weddings SET status = 'published'` for published weddings.
4. Restore `public.rsvp_submissions` with `invitation_id = NULL` (preserving `100%` of guest attendance, dietary notes, custom answers, and submission versions without requiring historical `token_hash` values).
5. Re-issue fresh household invitation links (`public.issue_household_invitation`) for active households; guests immediately see their restored `existingSubmission` state when opening their new `/i/:token` link.

---

## 6. Hosting, Routing & Pre-Commercial Upgrade Checklist

- **Vercel Hosting & Security Headers (`vercel.json`):** Rewrites all SPA paths (`/(.*)` -> `/index.html`) while serving strict `Content-Security-Policy` (`script-src 'self'`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and `X-Frame-Options: DENY`.
- **Mandatory Commercial Launch Upgrades (Before Paid Customer Operations):**
  1. **Vercel Hobby -> Vercel Pro:** Vercel Hobby is restricted to personal, non-commercial use; upgrade to Vercel Pro before commercial operation.
  2. **Supabase Free -> Supabase Pro (`wedding-platform-prod`):** Enables automated daily backups, Point-in-Time Recovery (PITR), no inactivity pausing, and HaveIBeenPwned leaked-password protection (`auth_leaked_password_protection`).
  3. **Custom Transactional Auth SMTP:** Configure dedicated domain-verified SMTP (e.g., Resend / Postmark / SES) in Supabase Auth before high-volume organizer signups or password-reset traffic (default Supabase Auth SMTP is rate-limited for low-volume admin auth).
  4. **GitHub Branch Protection (`main`):** Require pull-request reviews and passing status checks (`Typecheck, Lint, Format, Test, Build & E2E` and `Git History Secret Scan (Gitleaks)`) before merging to `main`.
