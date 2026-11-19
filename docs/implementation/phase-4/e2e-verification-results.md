# Phase 4 — Invitation Builder & Live Preview Verification Results (`TG4` — Gate 3 Complete)

**Date:** 2026-11-19  
**Target Environment:** `wedding-platform-dev` (`tfwmbpvbfavugvokdych`, `ap-southeast-1`)

---

## 1. Unit, Integration & Bundle Isolation Verification (`P4-AC03`–`P4-AC09`, `P4-AC11`)

- **Vitest Suite (`npm test`):** `11/11` test files (`54/54` tests) passed, including `src/features/design/__tests__/invitationBuilder.test.tsx` (`5/5`) and `src/app/router/__tests__/router.test.tsx` (`9/9`):
  - Instant `<InvitationRenderer />` live reactivity with input-focus preservation (`document.activeElement` retained across debounced autosave) and cross-section queue flushing.
  - Pre-write Zod v4 gate blocking `http://` URLs, `<script>` payloads, and malformed `#RRGGBB` hex colors with `0` Supabase writes while surfacing both inline field errors and `Autosave paused` banners.
  - Curated theme preset switching (`terracotta_atelier`, `celestial_midnight`) + all 6 `ThemeTokenOverrides` (`primaryAccentHex`, `surfaceTint`, `headingFontPair`, `cornerStyle`, `sectionSpacing`, `ornamentStyle`) + `Reset overrides`.
  - Section reordering via `reorder_wedding_sections` RPC and last-visible-section guard (`>= 1` visible section).
  - Strict `viewer` read-only enforcement (`0` mutation calls) and unauthenticated `/app/weddings/:weddingId/builder` redirect with encoded `redirectTo`.
- **Production Bundle Audit (`npm run build`):**
  - `OrganizerWeddingBuilderPage` lazy-splits into `dist/assets/OrganizerWeddingBuilderPage-*.js` (`58.82 kB` / `12.82 kB` gzip).
  - Public entry chunk (`dist/assets/index-*.js`: `290.06 kB` / `90.50 kB` gzip) contains `0.00 kB` of builder UI or `react-hook-form` code, enforced mechanically via `eslint.config.js` (`0` errors, `0` warnings).

---

## 2. Live Desktop + Mobile Playwright E2E (`npm run test:e2e:phase4:live` — `P4-AC07`, `P4-AC10`)

- **Spec:** `e2e/phase4-invitation-builder.spec.ts` via `scripts/verify-phase4-live-e2e.mjs`
- **Results:** **`2/2` passed (`22.0s` total)**
  - `chromium-desktop`: **PASSED (`19.4s`)**
  - `chromium-mobile`: **PASSED (`17.0s`)** (exercising mobile `Edit Design` / `Live Preview` tabs)
- **End-to-End Gate 3 Coverage:**
  1. **Wedding A (`Elena & Mateo`):** Customized with `Terracotta Atelier`, `#8C3B2B` accent, `arch` framing, `botanical_flourish` dividers, swapped `Order of Events` ahead of `Our Story`, enabled `Questions & Guest Notes`, verified `http://` URL paused autosave (`validation_error`) until corrected to `https://maps.example.com/villa-aurelia`, debounced-autosaved (`saved`), reloaded browser, and verified 100% persistence across Desktop & Mobile frames.
  2. **Wedding B (`Clara & Julian`):** Independently customized with `Celestial Midnight` (`data-dark-surface="true"`), `modern_sans` headings, and custom RSVP banner copy—proving **Mandatory Quality Gate 3** across two materially distinct builder-authored weddings through `<InvitationRenderer />`.
  3. **Tenancy & RBAC Isolation:** Live workspace switch inside `/app/weddings/:weddingId/builder` rendered `wedding-builder-workspace-mismatch-card` with zero cross-workspace bleed; `viewer` co-member opened `/app/weddings/:weddingId/builder` in strict disabled read-only mode (`0` console/page errors).
  4. **Ephemeral Teardown:** `"remaining_ephemeral_users": 0`.
