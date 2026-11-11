# Implementation Status Tracker

**Current Phase:** Phase 0 — Project Foundation & Engineering Standards (**Completed — Awaiting Sign-Off for Phase 1**)  
**Last Updated:** 2026-11-11

---

## 1. Phase Overview

| Phase  | Name                                        | Status        | Exit Gate Status                                |
| :----: | :------------------------------------------ | :------------ | :---------------------------------------------- |
| **0**  | Project Foundation & Engineering Standards  | **Completed** | **Passed (`P0-AC01`–`P0-AC10` verified)**       |
| **1**  | Authentication & Workspace Management       | Not Started   | Ready upon user sign-off of Phase 0             |
| **2**  | Wedding Project Management                  | Not Started   | Blocked on Phase 1                              |
| **3**  | Invitation Design System & Rendering Engine | Not Started   | Blocked on Phase 2                              |
| **4**  | Invitation Builder & Live Preview           | Not Started   | Blocked on Phase 3                              |
| **5**  | Public Wedding Website                      | Not Started   | Blocked on Phase 4                              |
| **6**  | Guest & Invitation Management               | Not Started   | Blocked on Phase 5                              |
| **7**  | RSVP Management System                      | Not Started   | Blocked on Phase 6                              |
| **8**  | Publishing, Versioning & Analytics          | Not Started   | Blocked on Phase 7                              |
| **9**  | Testing, Security & Reliability             | Not Started   | Blocked on Phase 8                              |
| **10** | Production Deployment & Launch              | Not Started   | Blocked on Phase 9 & dedicated Prod Supabase DB |

---

## 2. Provisioned Infrastructure & Environments

| Surface                     | Identifier / URL                                                                                      | Notes                                                                       |
| :-------------------------- | :---------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------- |
| **GitHub Repository**       | `https://github.com/jeanmaureal/Digital-Wedding-Invitation-RSVP-Platform`                             | Default branch: `main`; CI workflow: `.github/workflows/ci.yml`             |
| **Supabase Dev Project**    | `wedding-platform-dev` (`tfwmbpvbfavugvokdych`, `ap-southeast-1`)                                     | Baseline migration `20261111142432_foundation_init` applied; 0 lints        |
| **Vercel Project**          | `jeanmaureals-projects/digital-wedding-invitation-rsvp-platform` (`prj_9xzQtBiDrsaoszBe0jdfv5KFVoWC`) | Connected to GitHub for automatic Production & Preview deployments          |
| **Vercel Production URL**   | `https://digital-wedding-invitation-rsvp-pla.vercel.app`                                              | Auto-deployed from `main`; `VITE_APP_ENV=production`                        |
| **Vercel Preview Verified** | `https://digital-wedding-invitation-rsv-git-2341de-jeanmaureals-projects.vercel.app`                  | Auto-deployed from `feature/phase-0-preview-verify`; `VITE_APP_ENV=preview` |

---

## 3. Phase 0 Task Group Progress

| Task Group | Scope                                                                                           | Status        | Notes / Commit                                                                  |
| :--------: | :---------------------------------------------------------------------------------------------- | :------------ | :------------------------------------------------------------------------------ |
|  **TG-1**  | Application Scaffold (Vite, React 19, strict TS)                                                | **Completed** | Committed (`e86bcb7`)                                                           |
|  **TG-2**  | Frontend Foundation (Tailwind v4, shadcn/ui, Router, Query, RHF+Zod, env contract)              | **Completed** | Committed (`56cee6c`)                                                           |
|  **TG-3**  | Architecture & Documentation (`organizer`/`public` shells, lean boundaries, `docs/`)            | **Completed** | Committed (`2a211e7`)                                                           |
|  **TG-4**  | Quality & CI (ESLint, Prettier, Vitest, Playwright, secret scan, `vercel.json`, GitHub Actions) | **Completed** | Committed (`511f3c9`)                                                           |
|  **TG-5**  | Supabase Dev Project, Baseline Migration, Type Gen & `health_check()` RPC                       | **Completed** | Committed (`137572f`); `wedding-platform-dev` (`tfwmbpvbfavugvokdych`) verified |
|  **TG-6**  | GitHub Push, CI Verification & Vercel Preview/Production Deployments                            | **Completed** | Committed (`de5a942`, `16d9804`); CI runs `43041683946` & `43046522698` green   |
|  **TG-7**  | Final Phase 0 Verification & Sign-Off                                                           | **Completed** | All `P0-AC01`–`P0-AC10` verified locally, in CI, and on live Vercel deployments |

---

## 4. Phase 0 Acceptance Criteria Matrix

| ID          | Criterion                                                                                                         | Status       | Auditable Evidence                                                                                                                                                                                                                              |
| :---------- | :---------------------------------------------------------------------------------------------------------------- | :----------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0-AC01** | `/`, `/app`, `/w/test`, and `/i/test` render expected shells locally without console/page errors or data exposure | **Verified** | `router.test.tsx` (6 tests) + Playwright `e2e/smoke.spec.ts` (`chromium-desktop` & `chromium-mobile`) pass with 0 console/page errors and token safety.                                                                                         |
| **P0-AC02** | Strict TypeScript enabled and `npm run typecheck` passes                                                          | **Verified** | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` enabled; `tsc -b --noEmit` exits `0`.                                                                                                                  |
| **P0-AC03** | ESLint and Prettier checks pass with no errors                                                                    | **Verified** | `npm run lint` (including portal/feature `no-restricted-imports` rules) & `npm run format:check` exit `0`.                                                                                                                                      |
| **P0-AC04** | Application's typed Supabase client calls `health_check()` on linked dev project                                  | **Verified** | `client.test.ts` & `/app` live UI verify `getSupabaseClient().rpc('health_check')` returns `{ status: 'ok', timestamp }` locally, on Preview, and Prod.                                                                                         |
| **P0-AC05** | Baseline migration applies, history verified, and `scripts/generate-db-types.mjs` succeeds                        | **Verified** | Migration `20261111142432_foundation_init` applied; Supabase security/performance advisors report `0` issues; `src/types/database.types.ts` synced.                                                                                             |
| **P0-AC06** | Production build succeeds and `dist/` inspected for secret exposure                                               | **Verified** | `npm run build` & `npm run security:secrets` pass; live served JS bundles on Vercel Production & Preview scanned with 0 server-side secrets.                                                                                                    |
| **P0-AC07** | GitHub auto-deploys Preview & Production with intended env config and working deep-link refresh                   | **Verified** | `dpl_8joV7EJCrJeDwVM9wJopWG6AV3AA` (`production`) & `dpl_6HhCLud4T1PhawhczmWTbQpUVn6i` (`preview`) return HTTP `200` + security headers on `/`, `/app`, `/w/example`, `/i/example-token` with clean Playwright reloads & live `health_check()`. |
| **P0-AC08** | Independent Vercel Preview & Production env scopes configured; temporary shared-DB limitation documented          | **Verified** | `vercel env ls` & live browser checks confirm independent `Production` (`env: production`) and `Preview` (`env: preview`) scopes; shared-DB limitation documented in `docs/deployment-guide.md`.                                                |
| **P0-AC09** | Automated CI runs full quality pipeline on pushes/PRs and fails on check failures                                 | **Verified** | GitHub Actions correctly failed on synthetic key detection before `.gitleaks.toml` refinement and passed end-to-end on `main` (`43041683946`) and preview (`43046522698`).                                                                      |
| **P0-AC10** | Complementary secret scans confirm no server-side credentials in `dist/` or tracked Git files                     | **Verified** | `scripts/scan-secrets.mjs` (`dist/` + tracked files) and CI `gitleaks` (`v8.24.2`, `--log-opts="--all"`) both pass with 0 leaks.                                                                                                                |

---

## 5. Tracked Architectural Risks & Open Gates

1. **Temporary Shared Development Database (`Open — Mandatory Pre-Launch Gate`):** During Phase 0, Vercel `Preview` and `Production` scopes temporarily reference `wedding-platform-dev` (`tfwmbpvbfavugvokdych`). A separate dedicated Production Supabase project **must** be provisioned before storing real user/wedding data or launching publicly.
2. **GitHub Branch Protection Rules (`Recommended — Repository Governance`):** Configure GitHub branch protection on `main` requiring pull requests and passing status checks (`Typecheck, Lint, Format, Test, Build & E2E` and `Git History Secret Scan (Gitleaks)`) before merge.
3. **Deferred Full CSP (`Open — Pre-Phase 5/9`):** `vercel.json` enforces baseline framing/MIME/referrer/permissions headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`), while a full `Content-Security-Policy` is deferred until Supabase, font, and media asset origins are finalized and tested.
4. **Deferred Media Storage Bucket (`Open — Media Phase`):** No public storage bucket is created in Phase 0; private draft uploads vs. public published assets will be configured when the `media` feature is implemented.
5. **Vercel Hobby Plan Scope (`Tracked — Pre-Commercial Launch`):** Vercel Hobby is personal/non-commercial only; commercial SaaS operation requires upgrading to Vercel Pro.
