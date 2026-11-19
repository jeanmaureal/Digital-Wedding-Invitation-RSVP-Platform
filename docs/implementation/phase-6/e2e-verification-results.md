# Phase 6 Automated Unit, Component & Live Two-Context Playwright E2E Results

## 1. Offline Quality Gates & Vitest Suite (`P6-AC11`, `P6-AC12`)

- **Formatting (`npm run format:check`):** `PASSED`
- **Strict TypeScript (`npm run typecheck` / `tsc -b --noEmit`):** `PASSED` (`0` errors)
- **ESLint (`npm run lint`):** `PASSED` (`0` errors, `0` warnings; `no-restricted-imports` enforces public/organizer isolation)
- **Vitest (`npm run test`):** `PASSED` (`16/16` test files, `70/70` tests green)
  - `src/features/guests/__tests__/guestCsvParser.test.ts` (`4/4` — RFC-4180 quoted commas, escaped quotes, BOM/CRLF, household grouping, conflicting `max_attendees` & `<script>` rejection)
  - `src/features/guests/__tests__/organizerGuestsWorkflow.test.tsx` (`2/2` — CSV preview & atomic import, one-time 256-bit link + `<QRCodeSVG />` issuance, instant revocation, `viewer` read-only UX)
  - `src/app/router/__tests__/publicInvitationPage.test.tsx` (`3/3` — unlocking `invite_only` celebration via `/i/:token`, revoked/expired `unavailable` state, malformed synchronous rejection, zero DOM `:token` echo, `organizerClient` uninitialized)
  - `src/app/router/__tests__/router.test.tsx` (`10/10` — including `/app/weddings/:weddingId/guests` unauthenticated redirect guard)
- **Production Bundle (`npm run build`):** `PASSED` (`0` Vite chunk warnings; `index.js` `289.73 kB` / `90.59 kB` gzip; lazy `PublicInvitationShellPage` `8.41 kB` / `2.74 kB` gzip; lazy `OrganizerWeddingGuestsPage` `73.42 kB` / `21.21 kB` gzip)
- **Secret Scan (`npm run security:secrets`):** `PASSED` (`247` tracked files + `51` `dist/` assets inspected)

---

## 2. Live Two-Context Desktop + Mobile Playwright E2E (`P6-AC13`)

- **Command:** `npm run test:e2e:phase6:live` (`e2e/phase6-guests-and-invitations.spec.ts`)
- **Projects Executed:** `chromium-desktop` (`15.7s`) + `chromium-mobile` (`15.7s`) -> **`2/2` PASSED (`19.9s` total)**
- **End-to-End Assertions Proven Against Live `wedding-platform-dev` (`tfwmbpvbfavugvokdych`):**
  1. Organizer creates workspace, invites `viewer`, creates an **`invite_only`** wedding project, and opens `/app/weddings/:weddingId/guests`.
  2. Organizer bulk-imports sample CSV (`2` households, `5` guests) atomically and manually adds `"The Santos Household"` (`max_attendees = 3`, private note, private guest email).
  3. Organizer issues a `256-bit` base64url `/i/:token` link + vector `<QRCodeSVG />` while wedding is still `Draft`; unauthenticated `guestContext` confirms `/i/:token` returns `Invitation Link Unavailable` with zero raw token echo.
  4. Organizer publishes Snapshot `v1`; unauthenticated `guestContext` confirms `/w/:slug` remains locked (`Private Wedding Celebration`), while `/i/:token` **unlocks** `"Welcome, The Santos Household"` (`Reserved for up to 3 guests`) + `<InvitationRenderer />` with **zero** raw token, organizer notes, or private guest email leaked in HTML.
  5. Organizer rotates link (`#1 -> #2`): old token `#1` immediately returns `Invitation Link Unavailable`, new token `#2` resolves active, and explicit **Revoke** immediately invalidates token `#2`.
  6. Workspace `viewer` signs in and verifies strict read-only banner with zero create/CSV/token mutation controls (`0` console errors, `0` page errors).
- **Deterministic Teardown:** `remaining_ephemeral_users: 0`.
