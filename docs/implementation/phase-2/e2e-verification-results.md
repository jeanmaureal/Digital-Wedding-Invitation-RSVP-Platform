# Phase 2 End-to-End, Bundle & Gate 2 Verification Results (`P2-AC09`–`P2-AC14`)

- **Local Offline E2E (`npm run test:e2e`):** `PASSED` (`2/2` smoke projects across `chromium-desktop` & `chromium-mobile`)
- **Live Multi-Tenant Gate 2 E2E (`npm run test:e2e:phase2:live`):** `PASSED` (`2/2` projects — `chromium-mobile` `14.6s`, `chromium-desktop` `17.2s`, `0` console/page errors, `0` leftover ephemeral users/workspaces/weddings)
- **Public Bundle Isolation (`npm run build`):** `PASSED` (`dist/assets/index-*.js = 289.55 kB` / `90.36 kB` gzip; `OrganizerWeddingDetailPage`, `OrganizerWorkspacePage`, `DuplicateWeddingCard`, and `organizerClient` isolated in lazy chunks)
- **GitHub Actions CI & Live Vercel Production Deep-Link (`P2-AC14`):** `NOT RUN` _(executes immediately after interactive GPG-signed commit & push to `origin/main`)_

---

## Verified End-to-End Scenarios (`e2e/phase2-multi-wedding.spec.ts`)

| Step | Scenario Verified (`chromium-desktop` + `chromium-mobile`)                                                                                                                                                                                                                                         |  Status  |
| :--: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------: |
|  1   | Unauthenticated cold deep-link to `/app/weddings/:weddingId` redirects to `/app/login?redirectTo=%2Fapp%2Fweddings%2F...` (`P2-AC11`)                                                                                                                                                              | `PASSED` |
|  2   | Multi-workspace setup (`Studio Alpha` + `Studio Beta`) and co-member onboarding (`Editor`, `Viewer`)                                                                                                                                                                                               | `PASSED` |
|  3   | 2-step `CreateWeddingWizard` (`Asia/Manila` IANA timezone, `invite_only`, RSVP deadline `2027-05-15` `23:59` -> UTC `2027-05-15T15:59:00.000Z`), reload persistence, and `WeddingSettingsCard` save confirmation                                                                                   | `PASSED` |
|  4   | Switching active workspace (`Studio Alpha` -> `Studio Beta`) while on `/app/weddings/:weddingId` renders `wedding-workspace-mismatch-card` with zero cross-workspace UI bleed (`P2-AC09`)                                                                                                          | `PASSED` |
|  5   | `Editor` duplicates Wedding 1 into Wedding 2 (cloning `Asia/Manila` & `dress_code`, resetting `rsvp_deadline` to empty, rendering `Duplicated` provenance badge), archives & restores to `Draft`, and sees permanent deletion restricted (`P2-AC03`, `P2-AC05`)                                    | `PASSED` |
|  6   | `Viewer` accesses dashboard and `/app/weddings/:weddingId` in strictly read-only mode (`P2-AC05`)                                                                                                                                                                                                  | `PASSED` |
|  7   | Unrelated `Outsider` organizer creates `Outsider Studio`, attempts direct URL navigation to `Studio Alpha`'s `/app/weddings/:weddingId` (blocked by RLS with zero title/venue leakage), and receives `WEDDING_SLUG_TAKEN` on global slug collision without leaking `Studio Alpha` data (`P2-AC04`) | `PASSED` |
|  8   | Unauthenticated visitor hitting `/w/<draft-slug>` sees generic unavailable state with zero draft couple/venue details leaked (`P2-AC14`)                                                                                                                                                           | `PASSED` |
|  9   | Ephemeral teardown (`DELETE FROM public.workspaces` + `DELETE FROM auth.users`) verified `remaining_ephemeral_users = 0`                                                                                                                                                                           | `PASSED` |
