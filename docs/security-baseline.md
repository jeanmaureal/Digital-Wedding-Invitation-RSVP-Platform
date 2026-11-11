# Security Baseline

## 1. Browser Key Model & Actual Authorization Boundary

- **Frontend credentials:** Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` may be passed to Vite (`VITE_*` variables are compiled directly into public browser assets).
- **Server-only credentials:** Supabase secret keys (`sb_secret_...`), legacy `service_role` JWTs, `SUPABASE_ACCESS_TOKEN`, and database passwords must **never** be placed in `.env` variables prefixed with `VITE_` or committed to Git.
- **True security boundary:** The publishable key identifies the project to Supabase APIs; **PostgreSQL Row Level Security (RLS), explicit table/function `GRANT`s, and transactional database functions** are the actual security boundary. Runtime checks in `src/lib/validation/env.ts` catch accidental misconfiguration early but never replace RLS.

---

## 2. Supabase RLS & Function Rules

1. **Enable RLS on every table** in `public` (and any exposed schema) in the same migration that creates the table.
2. **Explicit role targeting:** Use `TO authenticated` or `TO anon` in policies — never the deprecated `auth.role()` helper.
3. **Always pair `TO authenticated` with ownership/membership predicates:** `TO authenticated` alone only checks login state. Every policy must verify workspace membership (`workspace_members`) using `(select auth.uid())`.
4. **Update policies require both `USING` and `WITH CHECK`:** Prevents cross-workspace reassignment of `workspace_id` or `wedding_id`.
5. **Never trust `user_metadata` for authorization:** `raw_user_meta_data` is user-editable.
6. **Prefer `SECURITY INVOKER`:** Use `SECURITY DEFINER` only for narrowly scoped operations (such as token-verified RSVP submission), always set `search_path = ''`, schema-qualify all references, `REVOKE ALL ... FROM PUBLIC`, and grant `EXECUTE` only to required roles.

---

## 3. Guest Tokens, Public Routes & Media Isolation

- **Invitation tokens:** Generate cryptographically random tokens (`>= 128 bits` entropy), store only their SHA-256 hash in PostgreSQL, support expiration and revocation, and never echo raw `:token` parameters into DOM error states or logs.
- **Draft vs. public isolation:** Unauthenticated visitors can read only active `published_versions` snapshots for published weddings — never draft builder configs or `guests` / `guest_groups` directories.
- **Media storage (deferred until Media phase):** Do not create unrestricted public storage buckets. Organizer draft uploads remain private by default; only assets explicitly referenced by published invitations are exposed for public read.
- **Schema-driven rendering safety:** All theme and section configurations are validated with Zod; arbitrary HTML injection and script execution are prohibited.

---

## 4. HTTP Headers & Secret Scanning

- **Baseline headers (`vercel.json`):** `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, restrictive `Permissions-Policy`, and `X-Frame-Options: DENY`. A full `Content-Security-Policy` is intentionally deferred until Supabase, font, and media origins are finalized and tested end-to-end.
- **Complementary secret checks:**
  1. `scripts/scan-secrets.mjs` inspects Git-tracked files (excluding documented `.env.example` placeholders) and built `dist/` assets for secret prefixes, service-role JWTs, private keys, and connection strings.
  2. CI runs `gitleaks` alongside GitHub repository secret scanning to protect commit history.
