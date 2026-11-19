# Implementation Status Tracker

**Current Phase:** Phase 5 — Public Wedding Website (**Completed — `P5-AC01`–`P5-AC13` Verified; Mandatory Quality Gate 4 Green; Ready for Phase 6**)  
**Last Updated:** 2026-11-19

---

## 1. Phase Overview

| Phase  | Name                                        | Status        | Exit Gate Status                                         |
| :----: | :------------------------------------------ | :------------ | :------------------------------------------------------- |
| **0**  | Project Foundation & Engineering Standards  | **Completed** | **Passed (`P0-AC01`–`P0-AC10` verified)**                |
| **1**  | Authentication & Workspace Management       | **Completed** | **Passed (`P1-AC01`–`P1-AC15` verified — Gate 1 Green)** |
| **2**  | Wedding Project Management                  | **Completed** | **Passed (`P2-AC01`–`P2-AC14` verified — Gate 2 Green)** |
| **3**  | Invitation Design System & Rendering Engine | **Completed** | **Passed (`P3-AC01`–`P3-AC12` verified)**                |
| **4**  | Invitation Builder & Live Preview           | **Completed** | **Passed (`P4-AC01`–`P4-AC12` verified — Gate 3 Green)** |
| **5**  | Public Wedding Website                      | **Completed** | **Passed (`P5-AC01`–`P5-AC13` verified — Gate 4 Green)** |
| **6**  | Guest & Invitation Management               | Not Started   | Ready for Phase 6 (Guest Groups, CSV, Hashed Tokens, QR) |
| **7**  | RSVP Management System                      | Not Started   | Blocked on Phase 6                                       |
| **8**  | Publishing, Versioning & Analytics          | Not Started   | Blocked on Phase 7                                       |
| **9**  | Testing, Security & Reliability             | Not Started   | Blocked on Phase 8                                       |
| **10** | Production Deployment & Launch              | Not Started   | Blocked on Phase 9 & dedicated Prod Supabase DB          |

---

## 2. Provisioned Infrastructure & Environments

| Surface                     | Identifier / URL                                                                                      | Notes                                                                                                  |
| :-------------------------- | :---------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| **GitHub Repository**       | `https://github.com/jeanmaureal/Digital-Wedding-Invitation-RSVP-Platform`                             | Default branch: `main`; CI workflow: `.github/workflows/ci.yml`                                        |
| **Supabase Dev Project**    | `wedding-platform-dev` (`tfwmbpvbfavugvokdych`, `ap-southeast-1`)                                     | Phase 0–5 migrations applied (`20261111142432`..`20261119145142`); `0` advisor errors & `0` perf lints |
| **Vercel Project**          | `jeanmaureals-projects/digital-wedding-invitation-rsvp-platform` (`prj_9xzQtBiDrsaoszBe0jdfv5KFVoWC`) | Connected to GitHub for automatic Production & Preview deployments                                     |
| **Vercel Production URL**   | `https://digital-wedding-invitation-rsvp-pla.vercel.app`                                              | Auto-deployed from `main`; `VITE_APP_ENV=production`                                                   |
| **Vercel Preview Verified** | `https://digital-wedding-invitation-rsv-git-2341de-jeanmaureals-projects.vercel.app`                  | Auto-deployed from `feature/*`; `VITE_APP_ENV=preview`                                                 |

---

## 3. Phase 5 Task Group Progress

| Task Group | Scope                                                                                                        | Status        | Notes                                                                                             |
| :--------: | :----------------------------------------------------------------------------------------------------------- | :------------ | :------------------------------------------------------------------------------------------------ |
|  **TG1**   | `published_versions` Schema, Immutability Trigger, `publish_wedding` / `unpublish_wedding` / Public Slug RPC | **Completed** | Migration `20261119145142` applied (`0.061 ms` `Index Scan` lookup, `0` advisor errors/perf lint) |
|  **TG2**   | `publicWeddingApi` (`publicClient`), `organizerPublishingApi`, Typed Errors & ESLint Purity                  | **Completed** | Strict public/organizer bundle isolation (`0` ESLint errors/warnings)                             |
|  **TG3**   | Lazy Public `/w/:slug` Website, `WeddingPublishingCard` & Builder Snapshot Publish Button                    | **Completed** | `7.36 kB` lazy `/w/:slug` chunk, dirty-draft badge, `invite_only` & `unavailable` states          |
|  **TG4**   | Gate 4 Vitest (`60/60`), Two-Context Live Desktop + Mobile E2E (`2/2`), GitHub CI & Vercel Production        | **Completed** | Committed (`9e35e80`); GitHub CI run `44552247272` & live Vercel Production verified (`0` err)    |

---

## 4. Phase 5 Acceptance Criteria Matrix (`P5-AC01` – `P5-AC13`)

| ID          | Criterion                                                                                                                        | Status     | Auditable Evidence                                                                                                                                 |
| :---------- | :------------------------------------------------------------------------------------------------------------------------------- | :--------- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P5-AC01** | `published_versions` migration applied cleanly, `database.types.ts` synced, `0` unresolved security/performance findings         | **PASSED** | `20261119145142_public_wedding_publishing.sql` + `query-plan-and-advisors.md` (`0` errors, `0` perf lints).                                        |
| **P5-AC02** | Sequential `version_number`, `<= 1` `is_active` row, snapshot immutability (`IMMUTABLE_PUBLISHED_SNAPSHOT`), & status sync       | **PASSED** | `supabase/tests/phase5_database_verification.sql` (`ALL_PHASE5_DATABASE_VERIFICATIONS_PASSED`).                                                    |
| **P5-AC03** | `publish_wedding` & `unpublish_wedding` enforce `editor`+ RBAC and block archived or 0-visible-section projects                  | **PASSED** | `phase5_database_verification.sql` (Sections 2 & 3).                                                                                               |
| **P5-AC04** | **Gate 4 DB Proof:** `anon` holds `0` table privileges; `get_public_wedding_by_slug` isolates post-publish draft edits           | **PASSED** | `phase5_database_verification.sql` (Sections 1 & 3) + `rls-and-rbac-results.md`.                                                                   |
| **P5-AC05** | `invite_only`, `draft`, `archived`, and unknown slugs never leak `content_snapshot` (`invite_only` vs `unavailable`)             | **PASSED** | `phase5_database_verification.sql` + `publicWeddingPage.test.tsx` + live E2E.                                                                      |
| **P5-AC06** | Representative query plans (`321` weddings, `963` snapshots) execute via pure `Index Scan` (`0.061 ms` & `0.460 ms`, `0` `Sort`) | **PASSED** | `supabase/tests/phase5_query_plan_verification.sql` + `docs/implementation/phase-5/query-plan-and-advisors.md`.                                    |
| **P5-AC07** | Public `/w/:slug` renders active published snapshots through `<InvitationRenderer />` with safe `invite_only`/`invalid` states   | **PASSED** | `PublicWeddingShellPage.tsx` + `publicWeddingPage.test.tsx` + live E2E.                                                                            |
| **P5-AC08** | `/w/:slug` uses `publicClient` exclusively (`persistSession: false`) and never initializes `organizerClient`                     | **PASSED** | `publicWeddingPage.test.tsx` + `router.test.tsx` (`hasInitializedOrganizerSupabaseClient() === false`).                                            |
| **P5-AC09** | `WeddingPublishingCard` & Builder publish action support `v1`, dirty-draft badge, `v2` republish, unpublish & `viewer` readonly  | **PASSED** | `WeddingPublishingCard.tsx` + `publishingWorkflow.test.tsx` + live E2E.                                                                            |
| **P5-AC10** | ESLint forbids `src/portals/public/**` & pure renderer modules from importing organizer publishing modules                       | **PASSED** | `eslint.config.js` (`0` errors, `0` warnings) + lazy `7.36 kB` `PublicWeddingShellPage` chunk.                                                     |
| **P5-AC11** | **Gate 4 Live E2E Proof:** Two-context (`organizer` + `publicVisitor`) Desktop + Mobile Playwright E2E passes (`2/2`)            | **PASSED** | `docs/implementation/phase-5/e2e-verification-results.md` (`chromium-desktop` `16.4s`, `chromium-mobile` `17.1s`, `remaining_ephemeral_users: 0`). |
| **P5-AC12** | All offline quality gates (`format:check`, `lint`, `typecheck`, `test`, `build`, `security:secrets`, `test:e2e`) & GitHub CI     | **PASSED** | `13/13` Vitest suites (`60/60` tests) + GitHub Actions CI run `44552247272` (`conclusion: success`) on `9e35e80`.                                  |
| **P5-AC13** | Live Vercel Production host-verified across `/`, `/w/:slug` (published + unavailable + invalid), `/i/:token`, and `/app`         | **PASSED** | Host-verified on `https://digital-wedding-invitation-rsvp-pla.vercel.app` (`env: production`, live `v1` rendered, `0` console/page errors).        |

---

## 5. Prior Completed Gates

- **Phase 0 (`e86bcb7`..`90df19d`):** `P0-AC01`–`P0-AC10` **PASSED**.
- **Phase 1 / Gate 1 (`1948b5e`..`96e44cd`):** `P1-AC01`–`P1-AC15` **PASSED**.
- **Phase 2 / Gate 2 (`4b2cb38`..`4d7fad4`):** `P2-AC01`–`P2-AC14` **PASSED**.
- **Phase 3 (`f7bb360`..`c66f93c`):** `P3-AC01`–`P3-AC12` **PASSED**.
- **Phase 4 / Gate 3 (`623c3a8`..`b91389b`):** `P4-AC01`–`P4-AC12` **PASSED**.

---

## 6. Tracked Architectural Risks & Open Gates

1. **Temporary Shared Development Database (`Open — Mandatory Pre-Launch Gate`):** Vercel `Preview` and `Production` scopes temporarily reference `wedding-platform-dev` (`tfwmbpvbfavugvokdych`). Provision a dedicated Production Supabase project before storing real customer wedding data or launching publicly.
2. **Deferred Pending Workspace Invitations (`Tracked — Post-Phase 1 Enhancement`):** `add_workspace_member_by_email` adds existing registered organizers (`ORGANIZER_NOT_REGISTERED`). Tokenized invitations + email delivery (`workspace_invitations`) are deferred.
3. **Version Rollback UI (`Tracked — Phase 8`):** Sequential `published_versions` rows are preserved immutably in PostgreSQL; historical version list browsing, rollback to a prior `version_number`, and RSVP analytics arrive in Phase 8.
4. **GitHub Branch Protection Rules (`Recommended — Repository Governance`):** Configure branch protection on `main` requiring PRs and passing CI status checks.
5. **Deferred Full CSP (`Open — Pre-Phase 9`):** Baseline security headers are active in `vercel.json`; full `Content-Security-Policy` will be finalized in Phase 9.
6. **Deferred Media Storage Bucket (`Open — Media Phase`):** Private draft uploads vs. public published assets will be provisioned in the Media phase.
7. **Vercel Hobby Plan Scope (`Tracked — Pre-Commercial Launch`):** Upgrade to Vercel Pro before commercial operation.
