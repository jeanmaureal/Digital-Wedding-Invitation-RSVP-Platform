# Implementation Status Tracker

**Current Phase:** Phase 4 — Invitation Builder & Live Preview (**Locally Verified `P4-AC01`–`P4-AC11`; Awaiting Signed Push & Vercel Production Verification `P4-AC12` — Gate 3 Complete**)  
**Last Updated:** 2026-11-19

---

## 1. Phase Overview

| Phase  | Name                                        | Status               | Exit Gate Status                                                      |
| :----: | :------------------------------------------ | :------------------- | :-------------------------------------------------------------------- |
| **0**  | Project Foundation & Engineering Standards  | **Completed**        | **Passed (`P0-AC01`–`P0-AC10` verified)**                             |
| **1**  | Authentication & Workspace Management       | **Completed**        | **Passed (`P1-AC01`–`P1-AC15` verified — Gate 1 Green)**              |
| **2**  | Wedding Project Management                  | **Completed**        | **Passed (`P2-AC01`–`P2-AC14` verified — Gate 2 Green)**              |
| **3**  | Invitation Design System & Rendering Engine | **Completed**        | **Passed (`P3-AC01`–`P3-AC12` verified)**                             |
| **4**  | Invitation Builder & Live Preview           | **Pending Prod Ver** | **`P4-AC01`–`P4-AC11` Passed Locally; `P4-AC12` Pending Signed Push** |
| **5**  | Public Wedding Website                      | Not Started          | Unlocks after Phase 4 `P4-AC12`                                       |
| **6**  | Guest & Invitation Management               | Not Started          | Blocked on Phase 5                                                    |
| **7**  | RSVP Management System                      | Not Started          | Blocked on Phase 6                                                    |
| **8**  | Publishing, Versioning & Analytics          | Not Started          | Blocked on Phase 7                                                    |
| **9**  | Testing, Security & Reliability             | Not Started          | Blocked on Phase 8                                                    |
| **10** | Production Deployment & Launch              | Not Started          | Blocked on Phase 9 & dedicated Prod Supabase DB                       |

---

## 2. Provisioned Infrastructure & Environments

| Surface                     | Identifier / URL                                                                                      | Notes                                                                                                  |
| :-------------------------- | :---------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| **GitHub Repository**       | `https://github.com/jeanmaureal/Digital-Wedding-Invitation-RSVP-Platform`                             | Default branch: `main`; CI workflow: `.github/workflows/ci.yml`                                        |
| **Supabase Dev Project**    | `wedding-platform-dev` (`tfwmbpvbfavugvokdych`, `ap-southeast-1`)                                     | Phase 0–4 migrations applied (`20261111142432`..`20261119134557`); `0` advisor errors & `0` perf lints |
| **Vercel Project**          | `jeanmaureals-projects/digital-wedding-invitation-rsvp-platform` (`prj_9xzQtBiDrsaoszBe0jdfv5KFVoWC`) | Connected to GitHub for automatic Production & Preview deployments                                     |
| **Vercel Production URL**   | `https://digital-wedding-invitation-rsvp-pla.vercel.app`                                              | Auto-deployed from `main`; `VITE_APP_ENV=production`                                                   |
| **Vercel Preview Verified** | `https://digital-wedding-invitation-rsv-git-2341de-jeanmaureals-projects.vercel.app`                  | Auto-deployed from `feature/*`; `VITE_APP_ENV=preview`                                                 |

---

## 3. Phase 4 Task Group Progress

| Task Group | Scope                                                                                                   | Status             | Notes                                                                                          |
| :--------: | :------------------------------------------------------------------------------------------------------ | :----------------- | :--------------------------------------------------------------------------------------------- |
|  **TG1**   | `SECURITY INVOKER` `public.reorder_wedding_sections` RPC, Live SQL Suite, Advisors & `db:types`         | **Completed**      | Migration `20261119134557` applied & verified (`0` advisor errors, `0` performance lints)      |
|  **TG2**   | Extended Draft API (`updateWeddingSectionDraft`, `reorderWeddingSectionsDraft`), Autosave & ESLint      | **Completed**      | Focus-safe `700 ms` debounced autosave + pre-write Zod v4 gate + strict ESLint boundaries      |
|  **TG3**   | Lazy `/app/weddings/:weddingId/builder`, 7 Section Editors, Theme Token Controls & Responsive Split UI  | **Completed**      | `58.82 kB` lazy builder chunk (`0.00 kB` builder UI in public bundle)                          |
|  **TG4**   | Gate 3 Vitest Suite (`54/54`), Live Desktop + Mobile E2E (`2/2`), Signed Git Push & Vercel Verification | **In Final Check** | Local CI & live Desktop/Mobile E2E green; awaiting signed Git push for CI & Vercel (`P4-AC12`) |

---

## 4. Phase 4 Acceptance Criteria Matrix (`P4-AC01` – `P4-AC12`)

| ID          | Criterion                                                                                                                           | Status      | Auditable Evidence                                                                                                                                 |
| :---------- | :---------------------------------------------------------------------------------------------------------------------------------- | :---------- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P4-AC01** | `reorder_wedding_sections` migration pushed cleanly, `database.types.ts` synced, `0` unresolved security/performance findings       | **PASSED**  | `20261119134557_invitation_builder_section_reorder.sql` + `docs/implementation/phase-4/rls-and-rbac-results.md` (`0` errors, `0` perf lints).      |
| **P4-AC02** | Atomic `SECURITY INVOKER` `reorder_wedding_sections` swaps/reverses `sort_order` collision-free; rejects bad IDs/viewer/anon        | **PASSED**  | `supabase/tests/phase4_database_verification.sql` (`ALL_PHASE4_DATABASE_VERIFICATIONS_PASSED`).                                                    |
| **P4-AC03** | Lazy `/app/weddings/:weddingId/builder` supports all 7 registered section editors with React Hook Form + Zod v4                     | **PASSED**  | `src/features/design/components/editors/*` + `invitationBuilder.test.tsx`.                                                                         |
| **P4-AC04** | Theme Preset & `ThemeTokenOverrides` controls (`primaryAccentHex`, typography, tint, corners, spacing, ornaments) persist live      | **PASSED**  | `ThemeControlsPanel.tsx` + `invitationBuilder.test.tsx` + live Desktop/Mobile E2E.                                                                 |
| **P4-AC05** | Section visibility toggles (`>= 1` visible guard) and `Move Up` / `Move Down` reordering update live preview & persist              | **PASSED**  | `SectionStackSidebar.tsx` + `invitationBuilder.test.tsx` + live Desktop/Mobile reload E2E.                                                         |
| **P4-AC06** | Debounced draft autosave preserves input focus and blocks invalid schemas (`http://`, `<script>`, bad hex) before DB write          | **PASSED**  | `useDebouncedDesignAutosave.ts` + `invitationBuilder.test.tsx` + live E2E `http://` block proof.                                                   |
| **P4-AC07** | **Gate 3 Proof:** Two materially distinct builder-customized wedding configurations render cleanly through `<InvitationRenderer />` | **PASSED**  | `e2e/phase4-invitation-builder.spec.ts` (`terracotta_atelier` + `#8C3B2B` vs `celestial_midnight` dark surface).                                   |
| **P4-AC08** | Workspace RBAC & tenancy isolation: `viewer` strictly read-only; live workspace switch renders mismatch card with zero bleed        | **PASSED**  | `OrganizerWeddingBuilderPage.tsx` + `invitationBuilder.test.tsx` + live Desktop/Mobile E2E.                                                        |
| **P4-AC09** | ESLint forbids public portal & pure renderer modules from importing builder/draft APIs; builder chunk lazy-split from `/`           | **PASSED**  | `eslint.config.js` (`0` errors/warnings), `router.test.tsx`, and `OrganizerWeddingBuilderPage` lazy chunk (`58.82 kB`).                            |
| **P4-AC10** | Live Desktop + Mobile Playwright E2E (`npm run test:e2e:phase4:live`) passes with `0` console/page errors & `0` leftover rows       | **PASSED**  | `docs/implementation/phase-4/e2e-verification-results.md` (`chromium-desktop` `19.4s`, `chromium-mobile` `17.0s`, `remaining_ephemeral_users: 0`). |
| **P4-AC11** | All offline quality gates (`format:check`, `lint`, `typecheck`, `test`, `build`, `security:secrets`, `test:e2e`) pass               | **PASSED**  | `11/11` Vitest suites (`54/54` tests) + offline Playwright smoke (`6/6`) + secret scan (`0` findings); GitHub Actions CI pending push.             |
| **P4-AC12** | Live Vercel Production host-verified across `/`, `/app/weddings/:weddingId/builder`, `/w/:slug`, and `/i/:token`                    | **NOT RUN** | Pending user's interactive GPG-signed commit & push to `origin/main` so Vercel deploys Phase 4.                                                    |

---

## 5. Prior Completed Gates

- **Phase 0 (`e86bcb7`..`90df19d`):** `P0-AC01`–`P0-AC10` **PASSED**.
- **Phase 1 / Gate 1 (`1948b5e`..`96e44cd`):** `P1-AC01`–`P1-AC15` **PASSED**.
- **Phase 2 / Gate 2 (`4b2cb38`..`4d7fad4`):** `P2-AC01`–`P2-AC14` **PASSED**.
- **Phase 3 (`f7bb360`):** `P3-AC01`–`P3-AC12` **PASSED** (GitHub CI run `44532666587` & Vercel Production verified).

---

## 6. Tracked Architectural Risks & Open Gates

1. **Temporary Shared Development Database (`Open — Mandatory Pre-Launch Gate`):** Vercel `Preview` and `Production` scopes temporarily reference `wedding-platform-dev` (`tfwmbpvbfavugvokdych`). Provision a dedicated Production Supabase project before storing real customer wedding data or launching publicly.
2. **Deferred Pending Workspace Invitations (`Tracked — Post-Phase 1 Enhancement`):** `add_workspace_member_by_email` adds existing registered organizers (`ORGANIZER_NOT_REGISTERED`). Tokenized invitations + email delivery (`workspace_invitations`) are deferred.
3. **Phase 2–4 `'published'` Lifecycle Guard (`Active — Unlocks in Phase 5/8`):** `normalize_wedding_fields()` blocks transitions to `status = 'published'` (`PUBLISHING_REQUIRES_SNAPSHOT`) until immutable `published_versions` snapshots are introduced in Phase 5/8.
4. **GitHub Branch Protection Rules (`Recommended — Repository Governance`):** Configure branch protection on `main` requiring PRs and passing CI status checks.
5. **Deferred Full CSP (`Open — Pre-Phase 5/9`):** Baseline security headers are active in `vercel.json`; full `Content-Security-Policy` is deferred until media origins are finalized.
6. **Deferred Media Storage Bucket (`Open — Media Phase`):** Private draft uploads vs. public published assets will be provisioned in the Media phase.
7. **Vercel Hobby Plan Scope (`Tracked — Pre-Commercial Launch`):** Upgrade to Vercel Pro before commercial operation.
