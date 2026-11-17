# Implementation Status Tracker

**Current Phase:** Phase 1 — Authentication & Workspace Management (**Completed — Gate 1 Passed; Ready for Phase 2**)  
**Last Updated:** 2026-11-18

---

## 1. Phase Overview

| Phase  | Name                                        | Status        | Exit Gate Status                                         |
| :----: | :------------------------------------------ | :------------ | :------------------------------------------------------- |
| **0**  | Project Foundation & Engineering Standards  | **Completed** | **Passed (`P0-AC01`–`P0-AC10` verified)**                |
| **1**  | Authentication & Workspace Management       | **Completed** | **Passed (`P1-AC01`–`P1-AC15` verified — Gate 1 Green)** |
| **2**  | Wedding Project Management                  | Not Started   | Ready upon Phase 1 sign-off                              |
| **3**  | Invitation Design System & Rendering Engine | Not Started   | Blocked on Phase 2                                       |
| **4**  | Invitation Builder & Live Preview           | Not Started   | Blocked on Phase 3                                       |
| **5**  | Public Wedding Website                      | Not Started   | Blocked on Phase 4                                       |
| **6**  | Guest & Invitation Management               | Not Started   | Blocked on Phase 5                                       |
| **7**  | RSVP Management System                      | Not Started   | Blocked on Phase 6                                       |
| **8**  | Publishing, Versioning & Analytics          | Not Started   | Blocked on Phase 7                                       |
| **9**  | Testing, Security & Reliability             | Not Started   | Blocked on Phase 8                                       |
| **10** | Production Deployment & Launch              | Not Started   | Blocked on Phase 9 & dedicated Prod Supabase DB          |

---

## 2. Provisioned Infrastructure & Environments

| Surface                     | Identifier / URL                                                                                      | Notes                                                                                                     |
| :-------------------------- | :---------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| **GitHub Repository**       | `https://github.com/jeanmaureal/Digital-Wedding-Invitation-RSVP-Platform`                             | Default branch: `main`; CI workflow: `.github/workflows/ci.yml`                                           |
| **Supabase Dev Project**    | `wedding-platform-dev` (`tfwmbpvbfavugvokdych`, `ap-southeast-1`)                                     | Phase 0 + Phase 1 migrations applied (`20261111142432`..`20261112055311`); Auth PKCE redirect URLs synced |
| **Vercel Project**          | `jeanmaureals-projects/digital-wedding-invitation-rsvp-platform` (`prj_9xzQtBiDrsaoszBe0jdfv5KFVoWC`) | Connected to GitHub for automatic Production & Preview deployments                                        |
| **Vercel Production URL**   | `https://digital-wedding-invitation-rsvp-pla.vercel.app`                                              | Auto-deployed from `main`; `VITE_APP_ENV=production`                                                      |
| **Vercel Preview Verified** | `https://digital-wedding-invitation-rsv-git-2341de-jeanmaureals-projects.vercel.app`                  | Auto-deployed from `feature/*`; `VITE_APP_ENV=preview`                                                    |

---

## 3. Phase 1 Task Group Progress

| Task Group | Scope                                                                                                         | Status        | Notes / Commit                                                                       |
| :--------: | :------------------------------------------------------------------------------------------------------------ | :------------ | :----------------------------------------------------------------------------------- |
|  **TG1**   | Database Schema, RLS, Atomic RBAC RPCs, Sole-Owner Delete Guard, Multi-Connection Concurrency & Query Plans   | **Completed** | Committed (`1948b5e`); verified live on `tfwmbpvbfavugvokdych`                       |
|  **TG2**   | Form Primitives, Stateless Public vs. PKCE Organizer Clients, Route-Scoped `AuthProvider`, Auth & Reset Pages | **Completed** | Committed (`f803965`); ESLint boundaries + 29/29 Vitest + Playwright smoke green     |
|  **TG3**   | Multi-Workspace Onboarding, `ActiveWorkspaceProvider`, `WorkspaceSwitcher`, Profile Editor & RBAC Settings UI | **Completed** | Committed (`1e49cc2`); 35/35 Vitest + lazy bundle isolation verified                 |
|  **TG4**   | Supabase Auth Redirect Sync, Live Desktop + Mobile Multi-User E2E, GitHub CI & Vercel Deep-Link Verification  | **Completed** | Auth config synced (`0` diffs); live Desktop + Mobile E2E green (`0` leftover users) |

---

## 4. Phase 1 Acceptance Criteria Matrix (`P1-AC01` – `P1-AC15`)

| ID          | Criterion                                                                                                                   | Status     | Auditable Evidence                                                                                                                                                                                                                                                                                 |
| :---------- | :-------------------------------------------------------------------------------------------------------------------------- | :--------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1-AC01** | Self-contained migrations, indexes/constraints, `npm run db:types` synced, and Supabase advisors clean/documented           | **PASSED** | Migrations `20261112030812`, `20261112054631`, `20261112055311` applied; `database.types.ts` synced; `query-plan-review.md` & `supabase-advisor-results.md` (`0` errors, `0` perf lints).                                                                                                          |
| **P1-AC02** | Mandatory normalized organizer email (`3..320` chars), `full_name` cap, untrusted `raw_user_meta_data`, immutable `email`   | **PASSED** | `phase1_database_verification.sql` (Section 2) + `OrganizerProfileCard.tsx` + live E2E verify `PROFILE_EMAIL_REQUIRED` and column-scoped `UPDATE (full_name)`.                                                                                                                                     |
| **P1-AC03** | Atomic `create_workspace` + `'owner'` membership, explicit `23505` error, bounded auto-slug collision retries               | **PASSED** | `phase1_database_verification.sql` + `verify-phase1-concurrency.mjs` (`6/6` simultaneous auto-slug burst succeeded with unique hex suffixes).                                                                                                                                                      |
| **P1-AC04** | Multi-user PostgreSQL RLS (`User A`, `User B`, `User C`, `Workspace C`), zero `anon` access, instant revocation on removal  | **PASSED** | `rls-isolation-results.md` (`phase1_database_verification.sql` Sections 3 & 4).                                                                                                                                                                                                                    |
| **P1-AC05** | Fresh DB RBAC across `owner`/`admin`/`editor`/`viewer`, immutable membership identity, existing-organizer addition scope    | **PASSED** | `rbac-verification-results.md` + `workspaceManagement.test.tsx` + live E2E (`ORGANIZER_NOT_REGISTERED` & role enforcement).                                                                                                                                                                        |
| **P1-AC06** | Unauthenticated `/app` & `/app/settings` redirect with allowlisted `redirectTo`; `/`, `/w/:slug`, `/i/:token` unaffected    | **PASSED** | `authSchemas.test.ts`, `router.test.tsx`, `e2e/smoke.spec.ts`, and `e2e/phase1-workspace-rbac.spec.ts` (including explicit sign-out `redirectTo` clearing).                                                                                                                                        |
| **P1-AC07** | Sign-up, sign-in, sign-out (`queryClient.clear()` on sign-out & user switch), PKCE `/app/reset-password` lifecycle          | **PASSED** | `authLifecycle.test.tsx` (offline mode, duplicate signup detection, expired/direct/refresh-persisted PKCE recovery, cache clearing).                                                                                                                                                               |
| **P1-AC08** | Zero-workspace onboarding, `user.id`-scoped active workspace persistence, server validation, and stale-cache eviction       | **PASSED** | `ActiveWorkspaceProvider.tsx`, `workspaceManagement.test.tsx` (stale ID eviction), and live Desktop + Mobile reload persistence E2E.                                                                                                                                                               |
| **P1-AC09** | Organizer routes/clients lazy-loaded away from public bundle + ESLint boundary rules                                        | **PASSED** | `eslint.config.js` (`0` errors/warnings); public entry bundle `289.06 kB` (`90.21 kB` gzip) with `organizerClient` & organizer pages split into separate lazy chunks.                                                                                                                              |
| **P1-AC10** | Full local & GitHub Actions CI pipelines green, separating offline CI checks from live DB/E2E, + Vercel deep links          | **PASSED** | GitHub Actions CI run `44121900473` green on `main`; offline `npm run test:e2e` separated from live `npm run test:e2e:live`; live Vercel Production (`digital-wedding-invitation-rsvp-platform-qcd1vs9hu.vercel.app`) deep links verified (`env: production`, `supabase: configured`, `0` errors). |
| **P1-AC11** | Sole-owner `auth.users` deletion blocked (`SOLE_WORKSPACE_OWNER_DELETE_BLOCKED`), including concurrent owner-insert races   | **PASSED** | `account-deletion-results.md` (`phase1_database_verification.sql` Section 6 + `3/3` parallel delete-vs-owner-insert races).                                                                                                                                                                        |
| **P1-AC12** | Parent `workspaces` (`FOR UPDATE`) + `auth.users` (`FOR UPDATE` / `FOR KEY SHARE`) lock serialization                       | **PASSED** | `concurrency-test-results.md` (`5/5` simultaneous dual-owner demote+remove races serialized with `1` surviving owner).                                                                                                                                                                             |
| **P1-AC13** | Catalog audit across all 14 functions in `public` & `app_private` (`OWNER TO postgres`, `search_path = ''`, minimal grants) | **PASSED** | `database-security-audit.md` (`phase1_database_verification.sql` Section 1).                                                                                                                                                                                                                       |
| **P1-AC14** | Public routes mount neither `AuthProvider` nor `organizerClient` (`persistSession: false` public client isolation)          | **PASSED** | `client.test.ts` + `router.test.tsx` (`hasInitializedOrganizerSupabaseClient() === false` on all public routes) + ESLint ban in `src/portals/public/**`.                                                                                                                                           |
| **P1-AC15** | `list_workspace_members` exposes co-member emails to `owner`/`admin` only and returns `NULL` to `editor`/`viewer`           | **PASSED** | `phase1_database_verification.sql` Section 5 + `workspaceManagement.test.tsx` + live Desktop + Mobile E2E (`member-email-masked`).                                                                                                                                                                 |

---

## 5. Phase 0 Reference Summary

All Phase 0 foundation criteria (`P0-AC01`–`P0-AC10`, commits `e86bcb7`..`90df19d`) remain passing and enforced in CI.

---

## 6. Tracked Architectural Risks & Open Gates

1. **Temporary Shared Development Database (`Open — Mandatory Pre-Launch Gate`):** Vercel `Preview` and `Production` scopes temporarily reference `wedding-platform-dev` (`tfwmbpvbfavugvokdych`). Provision a dedicated Production Supabase project before storing real customer wedding data or launching publicly.
2. **Deferred Pending Workspace Invitations (`Tracked — Post-Phase 1 Enhancement`):** Phase 1 `add_workspace_member_by_email` adds existing registered organizers (`ORGANIZER_NOT_REGISTERED`). Tokenized invitations + email delivery (`workspace_invitations`) are deferred.
3. **GitHub Branch Protection Rules (`Recommended — Repository Governance`):** Configure branch protection on `main` requiring PRs and passing CI status checks.
4. **Deferred Full CSP (`Open — Pre-Phase 5/9`):** Baseline security headers are active in `vercel.json`; full `Content-Security-Policy` is deferred until font and media origins are finalized.
5. **Deferred Media Storage Bucket (`Open — Media Phase`):** Private draft uploads vs. public published assets will be provisioned in the Media phase.
6. **Vercel Hobby Plan Scope (`Tracked — Pre-Commercial Launch`):** Upgrade to Vercel Pro before commercial operation.
