# Phase 8 PostgreSQL RLS, RBAC & Immutability Verification Results

## Verification Suite

- **Script:** [phase8_database_verification.sql](../../../../supabase/tests/phase8_database_verification.sql)
- **Execution Command:** `npx supabase db query --remote --yes -f supabase/tests/phase8_database_verification.sql`
- **Transaction Mode:** Single `BEGIN; ... ROLLBACK;` transaction (`0` persisted test rows)
- **Exit Code:** `0` (`ALL_PHASE8_DATABASE_VERIFICATIONS_PASSED`)

## Verified Criteria

| Criterion | Assertion Verified                                                                                                                                                                                                                                                                                      |  Status  |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------: |
| `P8-AC01` | All `45+` functions in `public` and `app_private` are owned by `postgres`, carry fixed empty `search_path = ''`, revoke `PUBLIC` execute, and restrict `anon` execution strictly to `health_check`, `get_public_wedding_by_slug`, `resolve_invitation_by_token`, and `submit_household_rsvp`.           | `PASSED` |
| `P8-AC01` | `list_wedding_published_versions` returns ordered `v2, v1` snapshots to `viewer` with `publishedByName` (`Marco Silva`, `Elena Vance`) and zero `@example.com` email leakage, while rejecting cross-workspace outsiders (`42501`) and `anon` (`42501`).                                                 | `PASSED` |
| `P8-AC02` | `rollback_wedding_published_version` rejects `viewer` (`42501`), outsiders (`42501`), `anon` (`42501`), unknown version `v99` (`P0002`), and `archived` weddings (`P0001 ARCHIVED_WEDDING_CANNOT_PUBLISH`), while allowing `editor`+ to roll back `v2 -> v1` and restore `v2` from unpublished `draft`. | `PASSED` |
| `P8-AC03` | Historical `v1` and `v2` `content_snapshot` and `published_at` values remain byte-identical across rollback, and republishing after rolling back to `v1` allocates `v3` monotonically.                                                                                                                  | `PASSED` |
| `P8-AC04` | Draft `wedding_themes` (`celestial_midnight`), draft `wedding_sections`, and operational `rsvp_submissions` (`attending_count = 2`) remain `100%` untouched across rollback.                                                                                                                            | `PASSED` |
| `P8-AC05` | `get_public_wedding_by_slug` and `resolve_invitation_by_token` immediately serve rolled-back `v1` while honoring live `wedding_settings.access_mode = 'invite_only'` fail-closed protection.                                                                                                            | `PASSED` |
