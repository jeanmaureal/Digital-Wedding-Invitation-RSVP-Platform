# Phase 4 PostgreSQL RPC, RLS, RBAC & Advisor Verification Results (`TG1-E`)

**Date:** 2026-11-19  
**Target Database:** `wedding-platform-dev` (`tfwmbpvbfavugvokdych`, `ap-southeast-1`)  
**Applied Migration:** `20261119134557_invitation_builder_section_reorder.sql`  
**Verification Suite:** `supabase/tests/phase4_database_verification.sql`

---

## 1. Remote Migration & Generated Types Sync (`P4-AC01`)

- `npx supabase db push --remote --yes`: Applied `20261119134557_invitation_builder_section_reorder.sql` cleanly.
- `npx supabase migration list --remote`: All 8 migrations (`20261111142432`..`20261119134557`) synced local ↔ remote.
- `npm run db:types`: Updated `src/types/database.types.ts` (`21,263` bytes), adding typed signature `reorder_wedding_sections(Args: { p_ordered_section_ids: string[]; p_wedding_id: string; p_workspace_id: string })`.

---

## 2. Executable Database Verification Matrix (`P4-AC02`, `P4-AC08`)

Executed inside a single rolled-back transaction (`BEGIN; ... ROLLBACK;`) against live PostgreSQL (`[{"verification_result":"ALL_PHASE4_DATABASE_VERIFICATIONS_PASSED"}]`):

| Check                                                        | Expected Outcome                                                                                                                                                                         |   Result   |
| :----------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------: |
| **25-Function Catalog Audit**                                | All 25 functions in `public` + `app_private` owned by `postgres`, fixed empty `search_path = ''`, zero `PUBLIC` `EXECUTE` grants, `anon` denied on all except `health_check()`           | **PASSED** |
| **`SECURITY INVOKER` Verification**                          | `public.reorder_wedding_sections` has `prosecdef = false`, `auth_exec = true`, `anon_exec = false`, single unambiguous signature                                                         | **PASSED** |
| **Role `anon` Rejection**                                    | `42501` (`insufficient_privilege`)                                                                                                                                                       | **PASSED** |
| **Outsider Rejection**                                       | `42501 WORKSPACE_ACCESS_DENIED`                                                                                                                                                          | **PASSED** |
| **`viewer` Read-Only Enforcement**                           | Reads all 7 starter sections via `SELECT`; blocked from `reorder_wedding_sections` with `42501 INSUFFICIENT_WORKSPACE_ROLE`                                                              | **PASSED** |
| **Cross-Workspace Wedding Guard**                            | `P0002 WEDDING_NOT_FOUND` when passing a `wedding_id` belonging to another workspace                                                                                                     | **PASSED** |
| **Partial / Duplicate / `NULL` / Cross-Wedding Section IDs** | Rejected with `22023 SECTION_REORDER_MISMATCH`                                                                                                                                           | **PASSED** |
| **Adjacent Swap (`1 <-> 2`) & Full Reversal (`6..0`)**       | Succeeds atomically via `SET CONSTRAINTS public.wedding_sections_wedding_sort_order_key DEFERRED .. IMMEDIATE` with zero `23505` collisions; unmoved rows (`hero`) preserve `updated_at` | **PASSED** |

---

## 3. Supabase Security & Performance Advisors (`P4-AC01`)

- **Performance Advisors (`get_advisors` `type: "performance"`):** **`0` lints** (`{"result":{"lints":[]}}`).
- **Security Advisors (`get_advisors` `type: "security"`):** **`0` errors**, **`0` new warnings** (`public.reorder_wedding_sections` is `SECURITY INVOKER` and introduces zero `0029` findings; the existing 7 `0029_authenticated_security_definer_function_executable` notices [remediation guide](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) remain `WAIVED WITH JUSTIFICATION` for our intentional Phase 1–2 `authenticated` RPCs).
