# Phase 4 Migration Static Review (`TG1-C`)

**Migration File:** `supabase/migrations/20261119134557_invitation_builder_section_reorder.sql`  
**Verification Suite:** `supabase/tests/phase4_database_verification.sql`  
**Target Remote Project:** `wedding-platform-dev` (`tfwmbpvbfavugvokdych`)

---

## 1. Security & Privilege Checklist (`docs/security-baseline.md` §2)

| Check                                     | Status | Review Notes                                                                                                                                                                                                                                                                                                                             |
| :---------------------------------------- | :----: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Immutable Prior Migrations**            |  PASS  | Prior migrations (`20261111142432`..`20261119124511`) remain untouched.                                                                                                                                                                                                                                                                  |
| **`SECURITY INVOKER` Preference**         |  PASS  | `public.reorder_wedding_sections(uuid, uuid, uuid[])` is `SECURITY INVOKER` (`prosecdef = false`), relying natively on existing `public.workspace_members` and `public.wedding_sections` RLS + column-scoped `UPDATE` privileges without expanding `SECURITY DEFINER` surface.                                                           |
| **Fixed Empty `search_path`**             |  PASS  | `SET search_path = ''` with schema-qualified `public.*` and `pg_catalog.*` references, including schema-qualified `SET CONSTRAINTS public.wedding_sections_wedding_sort_order_key DEFERRED / IMMEDIATE`.                                                                                                                                 |
| **Explicit Function Grants**              |  PASS  | `OWNER TO postgres`; `REVOKE ALL ... FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE ... TO authenticated` only (`anon` denied).                                                                                                                                                                                                       |
| **Multi-Tenant & RBAC Enforcement**       |  PASS  | Verifies `auth.uid()` (`42501 AUTH_REQUIRED`), workspace membership (`42501 WORKSPACE_ACCESS_DENIED`), and `owner` / `admin` / `editor` role (`42501 INSUFFICIENT_WORKSPACE_ROLE`), blocking `viewer` and outsiders.                                                                                                                     |
| **Deadlock-Safe Concurrency & Integrity** |  PASS  | Locks all section rows of `(p_workspace_id, p_wedding_id)` in deterministic `ORDER BY id ASC FOR UPDATE` (`P0002 WEDDING_NOT_FOUND` if `0`), verifies exact 1-to-1 section UUID set (`22023 SECTION_REORDER_MISMATCH`), updates only moved rows (`sort_order IS DISTINCT FROM ord.pos - 1`), and validates `IMMEDIATE` before returning. |

---

## 2. Explicit Remote Migration Approval Gate (`TG1-D`)

Awaiting user approval before running `npx supabase db push`, executing `supabase/tests/phase4_database_verification.sql`, running Supabase security/performance advisors, and regenerating `src/types/database.types.ts`.
