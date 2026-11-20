# Phase 10 — Backup, Export & Disaster-Recovery Verification (`P10-AC06`–`P10-AC09`)

## 1. Gitignore & Secret-Scanner Backup Guardrails (`P10-AC06`)

- [.gitignore](file:///c:/Users/almau/Digital-Wedding-Invitation-RSVP-Platform/.gitignore) explicitly ignores `backups/` so local logical database snapshots and `pg_dump` archives are never staged by default.
- [scripts/scan-secrets.mjs](file:///c:/Users/almau/Digital-Wedding-Invitation-RSVP-Platform/scripts/scan-secrets.mjs) enforces `tracked-backup-file` (`/^backups\//`), failing `npm run security:secrets` if any file inside `backups/` is ever tracked by Git.

---

## 2. Zero-Docker Logical Backup Exporter & Unit Tests (`P10-AC07`)

- **Pure Manifest & Redaction Module:** [src/features/exports/backupManifest.ts](file:///c:/Users/almau/Digital-Wedding-Invitation-RSVP-Platform/src/features/exports/backupManifest.ts) + [src/features/exports/**tests**/backupManifest.test.ts](file:///c:/Users/almau/Digital-Wedding-Invitation-RSVP-Platform/src/features/exports/__tests__/backupManifest.test.ts) (`3/3` unit tests passed) verify:
  1. Complete `15`-table parent-before-child FK topological ordering (`profiles` -> `workspaces` -> `workspace_members` -> `weddings` -> `wedding_settings` -> `wedding_themes` -> `wedding_sections` -> `published_versions` -> `guest_groups` -> `guests` -> `invitations` -> `rsvp_questions` -> `rsvp_submissions` -> `rsvp_attendees` -> `rsvp_answers`).
  2. Strict stripping and rejection of `public.invitations.token_hash`.
  3. Deterministic key-sorted JSON serialization and SHA-256 `manifest.json` integrity digests.
- **CLI Exporter:** [scripts/export-remote-backup.mjs](file:///c:/Users/almau/Digital-Wedding-Invitation-RSVP-Platform/scripts/export-remote-backup.mjs) (`npm run db:backup` / `npm run db:backup:prod`) exports `snapshot.json` and `manifest.json` in a single read-only query over `npx supabase db query --remote=<ref> --output=json` without requiring Docker or local `pg_dump`.

---

## 3. End-to-End Disaster-Recovery Drill & Production Readiness (`P10-AC08`)

Executed `npm run test:ops:phase10:backup` ([scripts/verify-phase10-backup-and-exports.mjs](file:///c:/Users/almau/Digital-Wedding-Invitation-RSVP-Platform/scripts/verify-phase10-backup-and-exports.mjs) + [supabase/tests/phase10_disaster_recovery_drill.sql](file:///c:/Users/almau/Digital-Wedding-Invitation-RSVP-Platform/supabase/tests/phase10_disaster_recovery_drill.sql)) -> **`ALL_PHASE10_BACKUP_DR_AND_PROD_READINESS_CHECKS_PASSED` (`exit code 0`)**:

1. **Logical Snapshot & Checksum Verification:**
   - **Dev (`tfwmbpvbfavugvokdych`):** `migrationCount: 12`, `totalRows: 14`, `snapshotSha256: c864522fdef031a557ba9b2c81a8a48c799ed2a733347becc9afcb3b0a9cc863`, `0` `token_hash` fields.
   - **Production (`ftmwcmsrfcgzmrowjudb`):** `migrationCount: 12`, `totalRows: 0`, `snapshotSha256: c8c63c2ee37656299a7dcc42f2aeddb38596b35bd9b20c594648b47271554337`, `0` `token_hash` fields.
2. **Non-Destructive `BEGIN ... ROLLBACK` Disaster-Recovery Drill (Verified on Both Dev & Production Postgres 17):**
   - Seeded published wedding (`v1` & `v2`), `2` households, `3` guests, `2` custom RSVP questions (`Plated Entree`, `Shuttle Stop`), active household token, and submitted RSVP (`1` named attending, `1` named declined, `1` plus-one, `2` custom answers).
   - Simulated catastrophic cascade deletion (`DELETE FROM public.weddings`) and confirmed `0` rows remaining + `/w/:slug` returning `'unavailable'`.
   - Executed trigger-safe FK-topological re-hydration (`weddings` inserted as `'draft'` -> `wedding_settings`, `wedding_themes`, `wedding_sections`, `published_versions` -> `weddings` promoted to `'published'` -> `guest_groups`, `guests`, `rsvp_questions`, `rsvp_submissions` with `invitation_id = NULL`, `rsvp_attendees`, `rsvp_answers`) + fresh `issue_household_invitation` rotation.
   - Confirmed **`100%` parity** across restored row counts, byte-identical `get_public_wedding_by_slug` snapshot JSON, attendance metrics, custom answers, and `resolve_invitation_by_token` binding to the restored `existingSubmission` (`responseVersion = 1`) before `ROLLBACK`.
3. **Live Production Publishable-Key Readiness:**
   - `health_check` -> `ok`
   - `get_public_wedding_by_slug('non-existent-phase10-launch-probe')` -> `unavailable`
   - `resolve_invitation_by_token('launch-probe-1111111111111111111111111111')` -> `unavailable`
   - `auth.users` `@example.com` ephemeral count on `ftmwcmsrfcgzmrowjudb` -> **`0`**.

---

## 4. Operational Runbook Upgrade (`P10-AC09`)

[docs/deployment-guide.md](file:///c:/Users/almau/Digital-Wedding-Invitation-RSVP-Platform/docs/deployment-guide.md) now documents:

- Finalized `Local` / `Vercel Preview` (`tfwmbpvbfavugvokdych`) vs. `Vercel Production` (`ftmwcmsrfcgzmrowjudb`) isolation contract.
- Two-phase expand-and-contract release sequencing (`db:backup:prod` -> `db push --remote=ftmwcmsrfcgzmrowjudb` -> GPG-signed `main` deploy).
- Three-layer rollback runbook (`vercel rollback` + `vercel promote` caveat, per-wedding `rollback_wedding_published_version`, and forward-fix database migrations).
- Zero-Docker (`npm run db:backup:prod`), Docker `pg_dump`, Organizer CSV export, and trigger-safe logical re-hydration procedures.
- Pre-commercial upgrade checklist (Vercel Pro, Supabase Pro PITR + leaked-password checks, custom Auth SMTP, GitHub `main` branch protection).
