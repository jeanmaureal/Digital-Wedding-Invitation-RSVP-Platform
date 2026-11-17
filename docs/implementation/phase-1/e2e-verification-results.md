# Phase 1 End-to-End Browser & Route Isolation Results (`P1-AC06`–`P1-AC10`, `P1-AC14`, `P1-AC15`)

- **Overall Status:** `PASSED` _(verified on both `chromium-desktop` and `chromium-mobile` against live `wedding-platform-dev` / `tfwmbpvbfavugvokdych` with full ephemeral cleanup)_
- **Offline CI Smoke & Auth Guard Suite:** `e2e/smoke.spec.ts` (`chromium-desktop` & `chromium-mobile`)
- **Live Multi-User Supabase E2E Suite:** `e2e/phase1-workspace-rbac.spec.ts` via `npm run test:e2e:live` (`scripts/verify-phase1-live-e2e.mjs`)

| E2E Scenario                                                                                                                                                       | Viewports                                                                  |  Status  |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- | :------: |
| Public routes (`/`, `/w/test`, `/w/INVALID_SLUG_VALUE`, `/i/:token`) render with zero organizer auth or raw token echo                                             | Desktop Chrome + Mobile Pixel 7                                            | `PASSED` |
| Unauthenticated `/app` and `/app/settings` redirect to `/app/login` with allowlist-validated `redirectTo`                                                          | Desktop Chrome + Mobile Pixel 7                                            | `PASSED` |
| Organizer sign-in, 0-workspace onboarding, `full_name` profile update, and multi-workspace reload persistence                                                      | Desktop Chrome + Mobile Pixel 7                                            | `PASSED` |
| Live `ORGANIZER_NOT_REGISTERED` rejection + `owner` adding `viewer` & `editor` co-organizers                                                                       | Desktop Chrome + Mobile Pixel 7                                            | `PASSED` |
| Explicit sign-out clears `redirectTo` + `viewer` sign-in enforces read-only UI and PostgreSQL co-member email masking                                              | Desktop Chrome + Mobile Pixel 7                                            | `PASSED` |
| `viewer` voluntary workspace leave returns to 0-workspace onboarding + ephemeral test cleanup (`0` leftover users/rows)                                            | Desktop Chrome + Mobile Pixel 7                                            | `PASSED` |
| Live Vercel Production deep links (`/`, `/app`, `/app/settings`, `/app/signup`, `/app/forgot-password`, `/app/reset-password`, `/w/example`, `/i/:token`) + reload | Live Production (`https://digital-wedding-invitation-rsvp-pla.vercel.app`) | `PASSED` |
