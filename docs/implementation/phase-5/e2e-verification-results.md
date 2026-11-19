# Phase 5 — Public Wedding Website & Snapshot Publishing Verification Results (`TG4` — Gate 4)

**Date:** 2026-11-19  
**Target Environment:** `wedding-platform-dev` (`tfwmbpvbfavugvokdych`, `ap-southeast-1`)

---

## 1. Unit, Integration & Bundle Isolation Verification (`P5-AC07`–`P5-AC10`, `P5-AC12`)

- **Vitest Suite (`npm test`):** `13/13` test files (`60/60` tests) passed, including:
  - `src/app/router/__tests__/publicWeddingPage.test.tsx` (`4/4`): Verifies `/w/:slug` renders active published snapshots through `<InvitationRenderer />` using `publicClient` (`hasInitializedOrganizerSupabaseClient() === false`), handles `invite_only` (`Private Wedding Celebration`), `unavailable`, non-echoing `invalid_slug` (`0` RPC calls), and rejects schema-tampered snapshots safely.
  - `src/features/publishing/__tests__/publishingWorkflow.test.tsx` (`2/2`): Verifies `WeddingPublishingCard` publish (`v1`), dirty-draft detection (`Unpublished draft changes`), republish (`v2`), unpublish (`Republish website (v3)`), `invite_only` notice, archived guard, and `viewer` read-only enforcement.
- **Production Bundle Audit (`npm run build`):**
  - `PublicWeddingShellPage` lazy-splits into `dist/assets/PublicWeddingShellPage-*.js` (`7.36 kB` / `2.25 kB` gzip) and `publicClient-*.js` (`0.68 kB` / `0.42 kB` gzip).
  - Public root entry chunk (`dist/assets/index-*.js`: `289.63 kB` / `90.47 kB` gzip) builds in `757ms` with **`0` warnings** and strict ESLint isolation (`0` errors, `0` warnings).

---

## 2. Live Two-Context Desktop + Mobile Playwright E2E (`npm run test:e2e:phase5:live` — `P5-AC11` / Gate 4)

- **Spec:** `e2e/phase5-public-website.spec.ts` via `scripts/verify-phase5-live-e2e.mjs`
- **Results:** **`2/2` passed (`19.8s` total)** across `chromium-desktop` (`16.4s`) and `chromium-mobile` (`17.1s`) using isolated `organizer` + zero-cookie `publicVisitor` browser contexts:
  1. **Pre-Publish Privacy:** Unauthenticated visitor opening `/w/:slug` saw `Invitation Not Yet Available` with `0` `<InvitationRenderer />` DOM nodes.
  2. **Publish `v1`:** Organizer customized design in Builder (`garden_sage`, `"Elena & Mateo — Published v1"`) and published `v1` directly from the Builder; unauthenticated visitor reloaded `/w/:slug` and rendered `"Elena & Mateo — Published v1"` (`data-published-version="1"`) plus interactive RSVP household guidance.
  3. **Gate 4 Draft-vs-Published Isolation:** Organizer edited draft headline to `"Elena & Mateo — Draft v2 Unreleased"` and waited for autosave (`saved`) without republishing; unauthenticated visitor reloaded `/w/:slug` and **still** saw `"Elena & Mateo — Published v1"` with zero `"Draft v2 Unreleased"` text in the DOM.
  4. **Republish `v2`:** Organizer returned to Wedding Detail, observed `Unpublished draft changes`, clicked `Republish website (v2)`, and unauthenticated visitor reloaded `/w/:slug` to see `"Elena & Mateo — Draft v2 Unreleased"` (`data-published-version="2"`).
  5. **`invite_only` & Unpublish Enforcement:** Switching `access_mode` to `invite_only` immediately replaced `/w/:slug` with `Private Wedding Celebration` (zero venue/headline leakage); switching back to `public` and clicking `Unpublish to Draft` returned `/w/:slug` to `Invitation Not Yet Available` while preserving `v1`–`v2` history (`Republish website (v3)`).
  6. **`viewer` Read-Only & Clean Teardown:** `viewer` co-member saw `Read-only (Viewer)` with `publish-wedding-button` disabled (`0` console/page errors across both browser contexts; `remaining_ephemeral_users: 0`).
