# Implementation Status Tracker

**Current Phase:** Phase 2 — Wedding Project Management (**Implemented & Locally/Live-DB Verified; Awaiting Signed Commit & Push for Final `P2-AC14` Vercel/CI Sign-Off**)  
**Last Updated:** 2026-11-18

---

## 1. Phase Overview

| Phase  | Name                                        | Status                                       | Exit Gate Status                                                        |
| :----: | :------------------------------------------ | :------------------------------------------- | :---------------------------------------------------------------------- |
| **0**  | Project Foundation & Engineering Standards  | **Completed**                                | **Passed (`P0-AC01`–`P0-AC10` verified)**                               |
| **1**  | Authentication & Workspace Management       | **Completed**                                | **Passed (`P1-AC01`–`P1-AC15` verified — Gate 1 Green)**                |
| **2**  | Wedding Project Management                  | **In Review (Pending Push & Vercel Verify)** | `P2-AC01`–`P2-AC13` **PASSED**; `P2-AC14` pending push to `origin/main` |
| **3**  | Invitation Design System & Rendering Engine | Not Started                                  | Ready upon Phase 2 Gate 2 sign-off                                      |
| **4**  | Invitation Builder & Live Preview           | Not Started                                  | Blocked on Phase 3                                                      |
| **5**  | Public Wedding Website                      | Not Started                                  | Blocked on Phase 4                                                      |
| **6**  | Guest & Invitation Management               | Not Started                                  | Blocked on Phase 5                                                      |
| **7**  | RSVP Management System                      | Not Started                                  | Blocked on Phase 6                                                      |
| **8**  | Publishing, Versioning & Analytics          | Not Started                                  | Blocked on Phase 7                                                      |
| **9**  | Testing, Security & Reliability             | Not Started                                  | Blocked on Phase 8                                                      |
| **10** | Production Deployment & Launch              | Not Started                                  | Blocked on Phase 9 & dedicated Prod Supabase DB                         |

---

## 2. Provisioned Infrastructure & Environments

| Surface                     | Identifier / URL                                                                                      | Notes                                                                                                  |
| :-------------------------- | :---------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| **GitHub Repository**       | `https://github.com/jeanmaureal/Digital-Wedding-Invitation-RSVP-Platform`                             | Default branch: `main`; CI workflow: `.github/workflows/ci.yml`                                        |
| **Supabase Dev Project**    | `wedding-platform-dev` (`tfwmbpvbfavugvokdych`, `ap-southeast-1`)                                     | Phase 0–2 migrations applied (`20261111142432`..`20261118015735`); `0` advisor errors & `0` perf lints |
| **Vercel Project**          | `jeanmaureals-projects/digital-wedding-invitation-rsvp-platform` (`prj_9xzQtBiDrsaoszBe0jdfv5KFVoWC`) | Connected to GitHub for automatic Production & Preview deployments                                     |
| **Vercel Production URL**   | `https://digital-wedding-invitation-rsvp-pla.vercel.app`                                              | Auto-deployed from `main`; `VITE_APP_ENV=production`                                                   |
| **Vercel Preview Verified** | `https://digital-wedding-invitation-rsv-git-2341de-jeanmaureals-projects.vercel.app`                  | Auto-deployed from `feature/*`; `VITE_APP_ENV=preview`                                                 |

---

## 3. Phase 2 Task Group Progress

| Task Group | Scope                                                                                                          | Status        | Notes                                                                                            |
| :--------: | :------------------------------------------------------------------------------------------------------------- | :------------ | :----------------------------------------------------------------------------------------------- |
|  **TG1**   | `weddings` & 1:1 `wedding_settings`, Composite FK, IANA Timezone Guard, RLS/RBAC, RPCs, Concurrency & Advisors | **Completed** | Migrations `20261118005848` & `20261118015735` applied & live-verified on `tfwmbpvbfavugvokdych` |
|  **TG2**   | `src/features/weddings` Schemas, `Intl` Timezone Utils, RBAC Helpers, API Layer, ESLint Boundary & Unit Tests  | **Completed** | `weddingDomain.test.ts` + strict TypeScript + public-portal ESLint ban green                     |
|  **TG3**   | Multi-Wedding Dashboard, 2-Step `CreateWeddingWizard`, `DuplicateWeddingCard` & `/app/weddings/:weddingId`     | **Completed** | `45/45` Vitest tests + lazy bundle split (`289.55 kB` / `90.36 kB` gzip public entry) green      |
|  **TG4**   | Live Multi-Tenant Gate 2 E2E (`Desktop` + `Mobile`), GitHub CI & Live Vercel Deep-Link Verification            | **In Review** | Live Desktop + Mobile E2E green (`0` leftover rows); awaiting signed commit/push for Vercel      |

---

## 4. Phase 2 Acceptance Criteria Matrix (`P2-AC01` – `P2-AC14`)

| ID          | Criterion                                                                                                                     | Status      | Auditable Evidence                                                                                                                                  |
| :---------- | :---------------------------------------------------------------------------------------------------------------------------- | :---------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P2-AC01** | Migrations applied cleanly, constraints/indexes verified, `database.types.ts` synced, `0` unresolved advisor findings         | **PASSED**  | Migrations `20261118005848` & `20261118015735`; `supabase-advisor-results.md` (`0` errors, `0` performance lints).                                  |
| **P2-AC02** | Composite FK `(workspace_id, wedding_id)` + RPC-only creation enforce 1:1 `wedding_settings` parity & block cross-WS linkage  | **PASSED**  | `phase2_database_verification.sql` (Sections 1–3) & `rls-and-rbac-results.md`.                                                                      |
| **P2-AC03** | Atomic `create_wedding` & `duplicate_wedding`, slug rules, auto-slug retries, `draft <-> archived`, `published` blocked       | **PASSED**  | `phase2_database_verification.sql` (Section 2) + `weddingDomain.test.ts` + live E2E (`PUBLISHING_REQUIRES_SNAPSHOT` & provenance badge).            |
| **P2-AC04** | Multi-tenant PostgreSQL RLS (`User A`, `User B`, multi-WS `User C`, `anon`) blocks cross-workspace reads/writes/duplications  | **PASSED**  | `phase2_database_verification.sql` (Section 4) + live E2E outsider isolation checks.                                                                |
| **P2-AC05** | Workspace RBAC: `owner`/`admin` full CRUD + `DELETE`; `editor` create/duplicate/update/archive (no `DELETE`); `viewer` read   | **PASSED**  | `phase2_database_verification.sql` (Section 5) + `weddingManagement.test.tsx` + live Desktop/Mobile E2E.                                            |
| **P2-AC06** | PostgreSQL IANA timezone validation (`pg_timezone_names`) + deterministic `Intl` wall-clock <-> UTC `timestamptz` deadlines   | **PASSED**  | `phase2_database_verification.sql` (Section 2.5) + `weddingDomain.test.ts` (`Asia/Manila`, US DST summer/winter, `UTC`).                            |
| **P2-AC07** | Parallel `create_wedding` (`6/6`) & `duplicate_wedding` (`6/6`) concurrency bursts + FK `ON DELETE SET NULL` cleanup          | **PASSED**  | `concurrency-test-results.md` (`verify-phase2-concurrency.mjs`) + `phase2_database_verification.sql` (Section 6).                                   |
| **P2-AC08** | 21-function catalog security audit (`OWNER TO postgres`, `search_path = ''`, minimal grants) + seeded `EXPLAIN ANALYZE` plans | **PASSED**  | `database-security-audit.md` + `query-plan-review.md` (`0.156 ms`–`0.490 ms` pure `Index Scan` plans across 601 seeded weddings).                   |
| **P2-AC09** | Dashboard (`/app`) & detail (`/app/weddings/:weddingId`) scope queries/caches by `(userId, activeWorkspaceId)`                | **PASSED**  | `weddingManagement.test.tsx` + live E2E (`wedding-workspace-mismatch-card` on workspace switch).                                                    |
| **P2-AC10** | 2-step `CreateWeddingWizard` & `DuplicateWeddingCard` with RHF + Zod v4, slug collision recovery, and multi-project cards     | **PASSED**  | `CreateWeddingWizard.tsx`, `DuplicateWeddingCard.tsx`, `weddingManagement.test.tsx`, and live Desktop/Mobile E2E.                                   |
| **P2-AC11** | Lazy-loaded `/app/weddings/:weddingId` with allowlisted `redirectTo`, ESLint public-portal ban, and `0` public auth client    | **PASSED**  | `eslint.config.js`, `router.test.tsx`, `e2e/smoke.spec.ts`, and `dist/` chunk inspection (`289.55 kB` public entry).                                |
| **P2-AC12** | Live Desktop + Mobile Playwright E2E (`test:e2e:phase2:live`) green with complete ephemeral teardown (`0` leftover rows)      | **PASSED**  | `docs/implementation/phase-2/e2e-verification-results.md` (`chromium-mobile` `14.6s`, `chromium-desktop` `17.2s`, `remaining_ephemeral_users: 0`).  |
| **P2-AC13** | Offline CI checks (`format:check`, `lint`, `typecheck`, `test`, `build`, `security:secrets`, `test:e2e`) green                | **PASSED**  | All local checks exit `0`; GitHub Actions CI run will be confirmed on push.                                                                         |
| **P2-AC14** | Live Vercel Production `/app` & `/app/weddings/:weddingId` deep-link verification + zero `/w/<draft-slug>` leakage            | **NOT RUN** | Local/dev `/w/<draft-slug>` non-leakage verified; live Vercel Production verification runs immediately after signed commit & push to `origin/main`. |

---

## 5. Prior Completed Gates

- **Phase 0 (`e86bcb7`..`90df19d`):** `P0-AC01`–`P0-AC10` **PASSED**.
- **Phase 1 / Gate 1 (`1948b5e`..`96e44cd`):** `P1-AC01`–`P1-AC15` **PASSED**.

---

## 6. Tracked Architectural Risks & Open Gates

1. **Temporary Shared Development Database (`Open — Mandatory Pre-Launch Gate`):** Vercel `Preview` and `Production` scopes temporarily reference `wedding-platform-dev` (`tfwmbpvbfavugvokdych`). Provision a dedicated Production Supabase project before storing real customer wedding data or launching publicly.
2. **Deferred Pending Workspace Invitations (`Tracked — Post-Phase 1 Enhancement`):** `add_workspace_member_by_email` adds existing registered organizers (`ORGANIZER_NOT_REGISTERED`). Tokenized invitations + email delivery (`workspace_invitations`) are deferred.
3. **Phase 2 `'published'` Lifecycle Guard (`Active — Unlocks in Phase 5/8`):** `normalize_wedding_fields()` blocks transitions to `status = 'published'` (`PUBLISHING_REQUIRES_SNAPSHOT`) until immutable `published_versions` snapshots are introduced in Phase 5/8.
4. **GitHub Branch Protection Rules (`Recommended — Repository Governance`):** Configure branch protection on `main` requiring PRs and passing CI status checks.
5. **Deferred Full CSP (`Open — Pre-Phase 5/9`):** Baseline security headers are active in `vercel.json`; full `Content-Security-Policy` is deferred until font and media origins are finalized.
6. **Deferred Media Storage Bucket (`Open — Media Phase`):** Private draft uploads vs. public published assets will be provisioned in the Media phase.
7. **Vercel Hobby Plan Scope (`Tracked — Pre-Commercial Launch`):** Upgrade to Vercel Pro before commercial operation.
