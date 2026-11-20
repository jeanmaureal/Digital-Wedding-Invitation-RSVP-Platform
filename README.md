# Digital Wedding Invitation & RSVP Platform

A multi-workspace, multi-wedding digital invitation builder, public wedding website renderer, household token/QR invitation manager, and transactional RSVP platform built as a modular monolith with **React 19**, **Vite 8**, **strict TypeScript**, **Tailwind CSS v4**, **TanStack Query v5**, **React Hook Form + Zod v4**, **Supabase (PostgreSQL 17, Auth, RLS, RPCs)**, and **Vercel**.

---

## 1. Prerequisites

- **Node.js:** `22.x` LTS or newer
- **npm:** `10.x` or newer
- **Playwright Chromium** _(for browser E2E suites)_: `npx playwright install chromium`
- **Supabase Account / Dev Credentials** _(optional for offline UI shell; required for live Auth, Builder, and RSVP flows)_

---

## 2. Quick Start (Developer Onboarding)

### Step 1 — Install Dependencies

```bash
npm ci
npx playwright install chromium
```

### Step 2 — Configure Local Environment

Copy [`.env.example`](./.env.example) to `.env.local` (which is gitignored):

```bash
cp .env.example .env.local
```

You can run locally in two modes:

1. **Connected Development Mode (Recommended):** Populate `.env.local` with the **Development (`wedding-platform-dev`)** Supabase project URL and modern publishable key (`sb_publishable_...` from Supabase Dashboard -> **Project Settings -> API Keys**):

   ```dotenv
   VITE_APP_ENV=local
   VITE_SUPABASE_URL=https://tfwmbpvbfavugvokdych.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me
   ```

   > **Security Rule:** Never place `sb_secret_...`, `service_role` JWTs, database passwords, or `Production` (`ftmwcmsrfcgzmrowjudb`) credentials in local `.env` files.

2. **Offline Shell Mode (Zero Cloud Setup):** Leave `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` unset (or keep `VITE_APP_ENV=local` only). The app boots cleanly with `supabase: unconfigured` so UI shells and routing can be inspected offline without fake credentials.

### Step 3 — Start the Local Dev Server

```bash
npm run dev
```

Open **`http://localhost:5173`** in your browser.

---

## 3. Manual Walkthrough: Testing the Full Product Flow Locally

Once `npm run dev` is running against `wedding-platform-dev`:

1. **Organizer Sign Up / Sign In (`/app/login` & `/app/signup`):**
   - Visit `http://localhost:5173/app/signup` to create an organizer account (note: Supabase Auth sends a confirmation email when email confirmations are enabled), or sign in at `http://localhost:5173/app/login` with an existing dev organizer account.
2. **Workspace & RBAC Management (`/app` & `/app/settings`):**
   - Create your first studio workspace on onboarding, switch workspaces from the header switcher, or visit `/app/settings` to manage co-members (`owner`, `admin`, `editor`, `viewer`).
3. **Create a Wedding Project (`/app`):**
   - Use the **Create Wedding** 2-step wizard to configure couple names, URL slug, celebration date, timezone, access mode (`public` vs. `invite_only`), and RSVP rules.
4. **Design & Preview the Invitation (`/app/weddings/:weddingId/builder`):**
   - Switch between the 4 curated theme presets, customize color/typography tokens, edit and reorder sections (`Hero`, `Our Story`, `Event Schedule`, `Venue & Travel`, `Dress Code`, `RSVP Banner`, `FAQ & Notes`), and toggle **Desktop / Mobile** live preview. Changes autosave to draft tables without affecting live guests.
5. **Publish & Version History (`/app/weddings/:weddingId`):**
   - Click **Publish Website** to mint immutable snapshot `v1`. Open `http://localhost:5173/w/<your-slug>` in a **Private / Incognito** window to verify public rendering, or test one-click rollback under **Publication History**.
6. **Guest Households, CSV Import & QR Invitations (`/app/weddings/:weddingId/guests`):**
   - Create households manually or upload a CSV batch, then click **Issue Link** on a household to generate a one-time 256-bit `/i/:token` link and downloadable/printable QR card (only the SHA-256 hash is stored in PostgreSQL).
7. **Guest RSVP Submission (`/i/:token`) & Organizer Analytics (`/app/weddings/:weddingId/rsvps`):**
   - Add custom RSVP questions (`single_select`, `boolean`, `short_text`) in `/rsvps`.
   - Open the issued `http://localhost:5173/i/<raw-token>` URL in an **Incognito** window to submit and update a household RSVP, then refresh `/rsvps` in the organizer tab to inspect live household vs. individual headcounts and export formula-safe Guest/RSVP CSVs.

---

## 4. Automated Local Testing & Verification Commands

### 4.1 Static Analysis, Unit Tests & Secret Safety (Offline — Fast)

Run these before every commit (mirrors GitHub Actions CI):

```bash
npm run typecheck        # Strict TypeScript project-references check (tsc -b --noEmit)
npm run lint             # ESLint (module boundary rules + DOM-XSS / eval bans)
npm run format:check     # Prettier formatting verification (use `npm run format` to fix)
npm test                 # Vitest + React Testing Library suite (24 files / 94 tests; watch mode: `npm run test:watch`)
npm run build            # Production Vite bundle into dist/
npm run security:secrets # Scans Git-tracked files & dist/ for leaked keys or tracked .env/backups
```

### 4.2 Production Bundle + Verbatim CSP/HSTS Playwright E2E (Offline)

Builds `dist/` and serves it locally with the exact HTTP security headers from [`vercel.json`](./vercel.json) (`Content-Security-Policy: script-src 'self'`, `Strict-Transport-Security`, etc.) across Desktop and Mobile Chromium:

```bash
npm run build
npm run test:e2e
```

### 4.3 Live End-to-End & Database Security Suites (Requires Dev Supabase + CLI Login)

> Each live script provisions isolated `@example.com` test accounts on `wedding-platform-dev` (`tfwmbpvbfavugvokdych`) and cleans them up automatically in `finally` blocks (`0` leftover test users). Requires `npx supabase login` and `.env.local` (or `.env`) pointed at `wedding-platform-dev`.

```bash
# Live Playwright E2E suites (Desktop + Mobile Chromium)
npm run test:e2e:live         # Phase 1: Auth, workspaces & RBAC
npm run test:e2e:phase2:live  # Phase 2: Multi-wedding wizard, duplication & isolation
npm run test:e2e:phase3:live  # Phase 3: Theme presets & <InvitationRenderer />
npm run test:e2e:phase4:live  # Phase 4: Builder live preview, reordering & autosave
npm run test:e2e:phase5:live  # Phase 5: Public /w/:slug snapshots & invite_only gating
npm run test:e2e:phase6:live  # Phase 6: Guest CSV import, QR codes & hashed /i/:token
npm run test:e2e:phase7:live  # Phase 7: Transactional household RSVPs & custom questions
npm run test:e2e:phase8:live  # Phase 8: Version rollback, analytics & safe CSV export
npm run test:e2e:phase9:live  # Phase 9: 3-tenant BOLA deep-link blocking, XSS & revocation

# Live PostgreSQL RLS/BOLA audit, Supavisor concurrency & disaster-recovery drills
npx supabase db query --remote=tfwmbpvbfavugvokdych --yes -f supabase/tests/phase9_security_and_rls_suite.sql
npm run test:db:phase9:concurrency
npm run test:ops:phase10:backup
```

---

## 5. Project Structure & Documentation Index

```text
├── docs/                  # Architecture, DB design, security baseline, runbook & phase reports
├── e2e/                   # Offline CI & live multi-tenant Playwright E2E suites
├── scripts/               # Secret scanner, typegen, logical backup & verification harnesses
├── src/
│   ├── app/               # Router (/app, /, /w/:slug, /i/:token), layouts & root providers
│   ├── components/        # Reusable UI primitives, error boundaries & form controls
│   ├── features/          # Domain modules (auth, workspace, weddings, design, publishing, guests, rsvp, exports)
│   ├── lib/               # Dual Supabase clients (organizerClient vs stateless publicClient), env & Zod config
│   ├── portals/           # Strictly separated organizer (/app/*) vs public (/, /w/*, /i/*) route entries
│   └── types/             # Generated Supabase TypeScript definitions (database.types.ts)
└── supabase/
    ├── config.toml        # Local stack & environment-scoped [remotes.dev] / [remotes.production] config
    ├── migrations/        # 12 immutable imperative PostgreSQL migrations
    └── tests/             # Rolled-back SQL security/RLS audit & disaster-recovery drills
```

### Core Engineering Docs

- [System Architecture & Module Dependency Rules](./docs/architecture.md)
- [Database Design & Multi-Tenant Composite FKs](./docs/database-design.md)
- [Security Baseline (RLS, Hashed Tokens, CSP & Secret Scanning)](./docs/security-baseline.md)
- [Coding Standards](./docs/coding-standards.md)
- [Production Deployment, Rollback & Disaster-Recovery Runbook](./docs/deployment-guide.md)
- [Implementation Roadmap & Quality Gates](./docs/implementation-roadmap.md)
- [Implementation Status Tracker (`Phases 0–10`)](./docs/implementation-status.md)
