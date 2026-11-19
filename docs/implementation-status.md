# Implementation Status Tracker

**Current Phase:** Phase 6 — Guest & Invitation Management (**Implementation & Local/Supabase Gates Completed — `P6-AC01`–`P6-AC13` Passed; Pending Signed Push, CI & Vercel Production Verification for `P6-AC14`**)  
**Last Updated:** 2026-11-20

---

## 1. Phase Overview

| Phase  | Name                                        | Status                             | Exit Gate Status                                                   |
| :----: | :------------------------------------------ | :--------------------------------- | :----------------------------------------------------------------- |
| **0**  | Project Foundation & Engineering Standards  | **Completed**                      | **Passed (`P0-AC01`–`P0-AC10` verified)**                          |
| **1**  | Authentication & Workspace Management       | **Completed**                      | **Passed (`P1-AC01`–`P1-AC15` verified — Gate 1 Green)**           |
| **2**  | Wedding Project Management                  | **Completed**                      | **Passed (`P2-AC01`–`P2-AC14` verified — Gate 2 Green)**           |
| **3**  | Invitation Design System & Rendering Engine | **Completed**                      | **Passed (`P3-AC01`–`P3-AC12` verified)**                          |
| **4**  | Invitation Builder & Live Preview           | **Completed**                      | **Passed (`P4-AC01`–`P4-AC12` verified — Gate 3 Green)**           |
| **5**  | Public Wedding Website                      | **Completed**                      | **Passed (`P5-AC01`–`P5-AC13` verified — Gate 4 Green)**           |
| **6**  | Guest & Invitation Management               | **In Progress (Awaiting CI/Prod)** | `P6-AC01`–`P6-AC13` **PASSED**; `P6-AC14` pending push + CI + Prod |
| **7**  | RSVP Management System                      | Not Started                        | Next after Phase 6 (**Completes Mandatory Quality Gate 5**)        |
| **8**  | Publishing, Versioning & Analytics          | Not Started                        | Blocked on Phase 7                                                 |
| **9**  | Testing, Security & Reliability             | Not Started                        | Blocked on Phase 8                                                 |
| **10** | Production Deployment & Launch              | Not Started                        | Blocked on Phase 9 & dedicated Prod Supabase DB                    |

---

## 2. Provisioned Infrastructure & Environments

| Surface                     | Identifier / URL                                                                                      | Notes                                                                                                  |
| :-------------------------- | :---------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| **GitHub Repository**       | `https://github.com/jeanmaureal/Digital-Wedding-Invitation-RSVP-Platform`                             | Default branch: `main`; CI workflow: `.github/workflows/ci.yml`                                        |
| **Supabase Dev Project**    | `wedding-platform-dev` (`tfwmbpvbfavugvokdych`, `ap-southeast-1`)                                     | Phase 0–6 migrations applied (`20261111142432`..`20261119153501`); `0` advisor errors & `0` perf lints |
| **Vercel Project**          | `jeanmaureals-projects/digital-wedding-invitation-rsvp-platform` (`prj_9xzQtBiDrsaoszBe0jdfv5KFVoWC`) | Connected to GitHub for automatic Production & Preview deployments                                     |
| **Vercel Production URL**   | `https://digital-wedding-invitation-rsvp-pla.vercel.app`                                              | Auto-deployed from `main`; `VITE_APP_ENV=production`                                                   |
| **Vercel Preview Verified** | `https://digital-wedding-invitation-rsv-git-2341de-jeanmaureals-projects.vercel.app`                  | Auto-deployed from `feature/*`; `VITE_APP_ENV=preview`                                                 |

---

## 3. Phase 6 Task Group Progress

| Task Group | Scope                                                                                                          | Status                     | Notes                                                                                                   |
| :--------: | :------------------------------------------------------------------------------------------------------------- | :------------------------- | :------------------------------------------------------------------------------------------------------ |
|  **TG1**   | `guest_groups`, `guests`, `invitations` Schema, RLS, Atomic CSV Import & SHA-256 Token Issuance/Resolution RPC | **Completed**              | Migration `20261119153501` applied (`0.038 ms` `Index Scan` token lookup, `0` advisor errors/perf lint) |
|  **TG2**   | `qrcode.react@4.2.0`, RFC-4180 CSV Parser, Organizer & Public Invitation APIs, ESLint Isolation                | **Completed**              | Strict public/organizer bundle isolation (`0` ESLint errors/warnings, `0` npm vulnerabilities)          |
|  **TG3**   | Lazy `/app/weddings/:weddingId/guests` Directory + QR Manager & Lazy Public `/i/:token` Verification           | **Completed**              | `8.41 kB` lazy `/i/:token` chunk, `73.42 kB` lazy `/guests` chunk, `0` Vite chunk warnings              |
|  **TG4**   | Vitest (`70/70`), Two-Context Live Desktop + Mobile E2E (`2/2`), GitHub CI & Vercel Production                 | **Awaiting Push & Verify** | Local + Supabase E2E green (`15.7s` Desktop, `15.7s` Mobile); awaiting signed push + CI + Vercel check  |

---

## 4. Phase 6 Acceptance Criteria Matrix (`P6-AC01` – `P6-AC14`)

| ID          | Criterion                                                                                                                       | Status      | Auditable Evidence                                                                                                                                 |
| :---------- | :------------------------------------------------------------------------------------------------------------------------------ | :---------- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P6-AC01** | `guest_groups`, `guests`, and `invitations` enforce composite FKs, `max_attendees >= 1`, triggers, and `0` `anon` table grants  | **PASSED**  | `20261119153501_guests_and_invitations.sql` + `phase6_database_verification.sql` (`ALL_PHASE6_DATABASE_VERIFICATIONS_PASSED`).                     |
| **P6-AC02** | Workspace RBAC (`editor`+ write, `viewer` read-only excluding `token_hash`) and cross-tenant isolation hold in PostgreSQL       | **PASSED**  | `phase6_database_verification.sql` + `docs/implementation/phase-6/rls-and-rbac-results.md`.                                                        |
| **P6-AC03** | `issue_household_invitation` issues `256-bit` tokens, stores SHA-256 hex only, revokes prior active tokens, hides `token_hash`  | **PASSED**  | `phase6_database_verification.sql` (Sections 1, 3, 4).                                                                                             |
| **P6-AC04** | `resolve_invitation_by_token` (`STABLE`) unlocks active tokens on `public` & `invite_only` weddings and rejects revoked/expired | **PASSED**  | `phase6_database_verification.sql` (Sections 5 & 6) + `publicInvitationPage.test.tsx` + live E2E.                                                  |
| **P6-AC05** | `import_wedding_guests` commits/rolls back atomically in one transaction; `duplicate_wedding` never clones guests or tokens     | **PASSED**  | `phase6_database_verification.sql` (Section 3.5–3.7).                                                                                              |
| **P6-AC06** | `EXPLAIN (ANALYZE, BUFFERS)` confirms `Index Scan` plans (`0.038 ms` token lookup, `0` `Sort`) & `0` advisor perf/security err  | **PASSED**  | `supabase/tests/phase6_query_plan_verification.sql` + `docs/implementation/phase-6/query-plan-and-advisors.md` (`lints: []`).                      |
| **P6-AC07** | `/app/weddings/:weddingId/guests` supports household (`max_attendees >= 1`) & guest CRUD with `viewer` read-only UX             | **PASSED**  | `WeddingGuestDirectoryManager.tsx` + `organizerGuestsWorkflow.test.tsx` + live E2E.                                                                |
| **P6-AC08** | CSV import workflow parses RFC-4180 files, previews row validation errors, provides sample CSV, and imports atomically          | **PASSED**  | `guestCsvParser.ts` + `guestCsvParser.test.ts` + live E2E.                                                                                         |
| **P6-AC09** | Organizer issues/rotates/revokes `/i/:token` links with one-time copyable URL + downloadable `<QRCodeSVG />`                    | **PASSED**  | `IssuedInvitationQrCard.tsx` + `organizerGuestsWorkflow.test.tsx` + live E2E.                                                                      |
| **P6-AC10** | Lazy `/i/:token` renders personalized household greeting + `<InvitationRenderer />` via `publicClient` and never echoes token   | **PASSED**  | `PublicInvitationShellPage.tsx` + `publicInvitationPage.test.tsx` + live E2E.                                                                      |
| **P6-AC11** | `eslint.config.js` enforces public/organizer isolation, `organizerClient` stays uninitialized on `/i/:token`, `0` chunk warn    | **PASSED**  | `eslint.config.js` (`0` errors/warnings) + `npm run build` (`8.41 kB` lazy `/i/:token` chunk).                                                     |
| **P6-AC12** | Unit & component suites pass (`16/16` files, `70/70` tests)                                                                     | **PASSED**  | `npm run test` (`70/70` green).                                                                                                                    |
| **P6-AC13** | Two-context (`organizer` + `guest`) Desktop + Mobile Playwright E2E passes against live Supabase (`0` leftover ephemeral users) | **PASSED**  | `docs/implementation/phase-6/e2e-verification-results.md` (`chromium-desktop` `15.7s`, `chromium-mobile` `15.7s`, `remaining_ephemeral_users: 0`). |
| **P6-AC14** | All static checks, secret scan, GitHub Actions CI, and live Vercel Production check pass                                        | **NOT RUN** | Local static checks & secret scan passed; awaiting signed Git push -> GitHub Actions CI -> Vercel Production verification.                         |

---

## 5. Prior Completed Gates

- **Phase 0 (`e86bcb7`..`90df19d`):** `P0-AC01`–`P0-AC10` **PASSED**.
- **Phase 1 / Gate 1 (`1948b5e`..`96e44cd`):** `P1-AC01`–`P1-AC15` **PASSED**.
- **Phase 2 / Gate 2 (`4b2cb38`..`4d7fad4`):** `P2-AC01`–`P2-AC14` **PASSED**.
- **Phase 3 (`f7bb360`..`c66f93c`):** `P3-AC01`–`P3-AC12` **PASSED**.
- **Phase 4 / Gate 3 (`623c3a8`..`b91389b`):** `P4-AC01`–`P4-AC12` **PASSED**.
- **Phase 5 / Gate 4 (`9e35e80`..`b0fe97a`):** `P5-AC01`–`P5-AC13` **PASSED**.

---

## 6. Tracked Architectural Risks & Open Gates

1. **Temporary Shared Development Database (`Open — Mandatory Pre-Launch Gate`):** Vercel `Preview` and `Production` scopes temporarily reference `wedding-platform-dev` (`tfwmbpvbfavugvokdych`). Provision a dedicated Production Supabase project before storing real customer wedding data or launching publicly.
2. **Deferred Pending Workspace Invitations (`Tracked — Post-Phase 1 Enhancement`):** `add_workspace_member_by_email` adds existing registered organizers (`ORGANIZER_NOT_REGISTERED`). Tokenized invitations + email delivery (`workspace_invitations`) are deferred.
3. **Interactive RSVP Submission (`Next — Phase 7 / Gate 5 Completion`):** Phase 6 delivers household groups, individual guests, CSV import, QR codes, and server-side SHA-256 `/i/:token` verification; Phase 7 adds configurable custom RSVP questions, atomic `submit_rsvp` transactional RPC, household `max_attendees` enforcement, and deadline checks.
4. **Version Rollback UI (`Tracked — Phase 8`):** Sequential `published_versions` rows are preserved immutably in PostgreSQL; historical version list browsing, rollback to a prior `version_number`, and RSVP analytics arrive in Phase 8.
5. **GitHub Branch Protection Rules (`Recommended — Repository Governance`):** Configure branch protection on `main` requiring PRs and passing CI status checks.
6. **Deferred Full CSP (`Open — Pre-Phase 9`):** Baseline security headers are active in `vercel.json`; full `Content-Security-Policy` will be finalized in Phase 9.
7. **Deferred Media Storage Bucket (`Open — Media Phase`):** Private draft uploads vs. public published assets will be provisioned in the Media phase.
8. **Vercel Hobby Plan Scope (`Tracked — Pre-Commercial Launch`):** Upgrade to Vercel Pro before commercial operation.
