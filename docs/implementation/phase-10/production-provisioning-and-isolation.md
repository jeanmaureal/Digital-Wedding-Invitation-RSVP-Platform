# Phase 10 — Dedicated Production Supabase Provisioning & Vercel Isolation (`P10-AC01`–`P10-AC05`)

## 1. Provisioned Production Infrastructure (`P10-AC01`)

| Resource / Attribute        | Development / Preview (`local` & `Preview`)        | Production (`Production` / `main`)                 |
| :-------------------------- | :------------------------------------------------- | :------------------------------------------------- |
| **Supabase Organization**   | `jeanmaureal's Org` (`kslcikbrxicntvylylit`)       | `jeanmaureal's Org` (`kslcikbrxicntvylylit`)       |
| **Supabase Project Name**   | `wedding-platform-dev`                             | `wedding-platform-prod`                            |
| **Supabase Project Ref**    | `tfwmbpvbfavugvokdych` (default locally linked)    | `ftmwcmsrfcgzmrowjudb`                             |
| **Region & Engine**         | `ap-southeast-1` · PostgreSQL `17.11.0.018` (`ga`) | `ap-southeast-1` · PostgreSQL `17.12.0.000` (`ga`) |
| **API URL**                 | `https://tfwmbpvbfavugvokdych.supabase.co`         | `https://ftmwcmsrfcgzmrowjudb.supabase.co`         |
| **Browser Credential Type** | Modern publishable key (`sb_publishable_...`)      | Modern publishable key (`sb_publishable_...`)      |
| **Status**                  | `ACTIVE_HEALTHY`                                   | `ACTIVE_HEALTHY`                                   |

---

## 2. Production Migration Parity & TypeScript Sync (`P10-AC02`)

All `12` immutable imperative migrations were applied to `wedding-platform-prod` (`ftmwcmsrfcgzmrowjudb`) without seed data (`seeds: []`):

1. `20261111142432_foundation_init.sql`
2. `20261112030812_auth_and_workspaces.sql`
3. `20261112054631_fix_fk_set_null_trigger_guards.sql`
4. `20261112055311_tune_rls_helper_row_estimates.sql`
5. `20261118005848_weddings_and_settings.sql`
6. `20261118015735_fix_wedding_trigger_helpers_and_fk_index.sql`
7. `20261119124511_invitation_design_system.sql`
8. `20261119134557_invitation_builder_section_reorder.sql`
9. `20261119145142_public_wedding_publishing.sql`
10. `20261119153501_guests_and_invitations.sql`
11. `20261119235955_rsvp_management_system.sql`
12. `20261120012113_publishing_versioning_and_rollback.sql`

- `npx supabase migration list --remote=ftmwcmsrfcgzmrowjudb`: **`12/12` Local/Remote parity**.
- `SUPABASE_PROJECT_REF=ftmwcmsrfcgzmrowjudb npm run db:types && git diff --exit-code src/types/database.types.ts`: **`0` bytes schema drift** (`38,514` bytes identical across Dev and Production).

---

## 3. Production Security, RLS & Advisor Verification (`P10-AC03`)

- **4-Part PostgreSQL Catalog, Cross-Tenant RLS/BOLA, RBAC & Negative RSVP Suite (`supabase/tests/phase9_security_and_rls_suite.sql`):**
  - Executed via `npx supabase db query --remote=ftmwcmsrfcgzmrowjudb --yes -f supabase/tests/phase9_security_and_rls_suite.sql` (`BEGIN ... ROLLBACK`, `0` persistent rows).
  - Result: **`ALL_PHASE9_SECURITY_AND_RLS_VERIFICATIONS_PASSED`** (`15/15` RLS-enabled `public` tables, `0` `anon` table/column grants, `0` `token_hash` grants, exact `4`-RPC `anon` allowlist, `postgres` ownership + fixed empty `search_path` on every `public` and `app_private` function).
- **Supabase Advisors (`get_advisors` on `ftmwcmsrfcgzmrowjudb`):**
  - **Security:** **`0` `ERROR`s** (`0028`/`0029` `WARN`s enumerate the intentional `SECURITY DEFINER` RPC surface: `3` `anon` + `18` `authenticated`).
  - **Performance:** **`0` `ERROR`s** and **`0` `WARN`s** (`0005` `unused_index` `INFO` expected on a newly provisioned database prior to live customer traffic).

---

## 4. Environment-Scoped Auth Configuration as Code (`P10-AC04`)

`supabase/config.toml` defines explicit `[remotes.dev]` (`tfwmbpvbfavugvokdych`) and `[remotes.production]` (`ftmwcmsrfcgzmrowjudb`) overrides:

- `auth.site_url = "https://digital-wedding-invitation-rsvp-pla.vercel.app"`
- `auth.additional_redirect_urls = ["https://digital-wedding-invitation-rsvp-pla.vercel.app/app/**"]` (`0` localhost or wildcard preview URLs permitted on Production Auth)
- `[remotes.production.db.seed] enabled = false`
- Applied via `npx supabase config push --remote=ftmwcmsrfcgzmrowjudb --yes` and verified via `npx supabase config diff --exit-code --remote=ftmwcmsrfcgzmrowjudb` -> **`0` config differences (`exit code 0`)**.

---

## 5. Vercel `Production` vs. `Preview` Environment Isolation (`P10-AC05`)

Verified on `jeanmaureals-projects/digital-wedding-invitation-rsvp-platform` (`prj_9xzQtBiDrsaoszBe0jdfv5KFVoWC`):

- **Production (`npx vercel env ls production`):** Holds **exclusively** `VITE_APP_ENV` (`production`), `VITE_SUPABASE_URL` (`https://ftmwcmsrfcgzmrowjudb.supabase.co`), and `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...` for `wedding-platform-prod`).
- **Orphaned Dev Variable Cleanup:** Removed all `16` orphaned Phase 0 integration variables (`POSTGRES_*`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_*`) from Vercel `Production`, ensuring zero server secrets or dev-project references reside in Production frontend hosting.
- **Preview (`npx vercel env ls preview`):** Untouched (`VITE_APP_ENV`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` pointing strictly to `wedding-platform-dev` / `tfwmbpvbfavugvokdych`).
