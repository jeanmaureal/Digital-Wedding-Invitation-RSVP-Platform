# Deployment & Environment Guide

## 1. Environment Configuration Contract

| Environment               | `VITE_APP_ENV`     | `VITE_SUPABASE_URL` & `VITE_SUPABASE_PUBLISHABLE_KEY`  | Runtime Behavior                                                                                                  |
| :------------------------ | :----------------- | :----------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| **Local (offline shell)** | `local` (or unset) | Optional (unset)                                       | Application shell starts cleanly with `supabase.status = 'unconfigured'`. Fake credentials are never substituted. |
| **Local (connected)**     | `local`            | Valid dev project URL + publishable key                | Typed Supabase client initializes against `wedding-platform-dev`.                                                 |
| **Vercel Preview**        | `preview`          | Required (non-placeholder HTTPS URL + publishable key) | Fails fast with `EnvConfigurationError` if missing or invalid.                                                    |
| **Vercel Production**     | `production`       | Required (non-placeholder HTTPS URL + publishable key) | Fails fast with `EnvConfigurationError` if missing or invalid.                                                    |

---

## 2. Local Setup

```bash
npm ci
# Optional: copy .env.example to .env and populate development Supabase credentials
npm run dev
```

Link Supabase CLI for migrations and type generation (Phase 0 Task Group 5+):

```bash
npx supabase link --project-ref <dev-project-ref>
npx supabase db push
npm run db:types
```

---

## 3. Supabase Preview vs. Production Isolation Strategy

### Phase 0 Temporary State (Early Foundation)

- Vercel `Preview` and `Production` environment-variable scopes are configured **independently** (`VITE_APP_ENV=preview` vs. `VITE_APP_ENV=production`), while both temporarily reference the single `wedding-platform-dev` Supabase project during empty foundation setup.
- **Important limitation:** Separate Vercel environment scopes do **not** isolate database tables, Auth users, Storage buckets, or migrations while pointing to the same Supabase project.

### Mandatory Pre-Launch Gate (Before Real Data / Phase 10)

- Provision a dedicated **Supabase Production Project** used **exclusively** by the Vercel `Production` (`main`) scope.
- Keep `wedding-platform-dev` bound strictly to local development and Vercel `Preview` branches.

---

## 4. Vercel Hosting & SPA Routing

- `vercel.json` rewrites all client routes (`/(.*)` -> `/index.html`) so direct refreshes on `/`, `/app`, `/w/:slug`, and `/i/:token` load the React application rather than returning `404`.
- **Licensing & commercial usage note:** Vercel's **Hobby** plan is restricted to personal, non-commercial use. Before operating the platform commercially or launching paid customer weddings, upgrade hosting to **Vercel Pro** (or equivalent commercial plan).
