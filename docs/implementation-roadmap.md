# Implementation Roadmap

## 1. Phase Sequence & Priority

| Phase  | Name                                        | Priority | Primary Deliverable                                                                   |
| :----: | :------------------------------------------ | :------: | :------------------------------------------------------------------------------------ |
| **0**  | Project Foundation & Engineering Standards  | Critical | Deployable modular monolith skeleton, quality gates, linked dev Supabase, CI/CD       |
| **1**  | Authentication & Workspace Management       | Critical | Supabase Auth, `profiles`, `workspaces`, `workspace_members`, RBAC RLS                |
| **2**  | Wedding Project Management                  | Critical | `weddings`, `wedding_settings`, multi-wedding dashboard & creation wizard             |
| **3**  | Invitation Design System & Rendering Engine | Critical | `wedding_themes`, section registry, Zod schema validation, `<InvitationRenderer />`   |
| **4**  | Invitation Builder & Live Preview           |   High   | Section editor, theme controls, responsive preview, debounced draft autosave          |
| **5**  | Public Wedding Website                      | Critical | Public `/w/:slug` rendering active `published_versions` snapshots                     |
| **6**  | Guest & Invitation Management               | Critical | `guest_groups`, `guests`, CSV import, hashed household tokens, QR codes               |
| **7**  | RSVP Management System                      | Critical | Configurable RSVP fields, atomic transactional RSVP RPC, deadline & limit checks      |
| **8**  | Publishing, Versioning & Analytics          |   High   | Immutable publication history, rollback, individual vs. household metrics, CSV export |
| **9**  | Testing, Security & Reliability             | Critical | Cross-tenant RLS security suite, concurrency tests, Playwright E2E workflows          |
| **10** | Production Deployment & Launch              | Critical | Dedicated production Supabase project, verified backups/exports, live launch          |

---

## 2. Mandatory Quality Gates

No phase is complete merely because its UI renders. Progression requires passing its corresponding gate:

- **Gate 1 — Foundation (Phases 0–1):** Strict TypeScript build, lint, tests, migrations, RLS-enforced authentication, and workspace isolation pass.
- **Gate 2 — Multi-Wedding Architecture (Phase 2):** Multiple projects operate independently with zero cross-workspace or cross-wedding data leakage.
- **Gate 3 — Design Engine (Phases 3–4):** Two distinct wedding configurations render cleanly through one `<InvitationRenderer />`; invalid schemas are rejected.
- **Gate 4 — Public Website (Phase 5):** Published snapshots render publicly while draft configs and guest directories remain inaccessible.
- **Gate 5 — Transactional RSVP (Phases 6–7):** Token hashes validate server-side, household attendance caps and deadlines hold under concurrent requests, and failed submissions roll back atomically.
- **Gate 6 — Production Readiness (Phases 8–10):** Dedicated production database isolated from preview, secret safety verified, E2E suites green, and backup/export procedures tested.

---

## 3. Scope Discipline

### MVP (In Scope)

- Email/password organizer auth & password recovery, multi-workspace RBAC, multi-wedding management & duplication, 4 initial themes, section-based builder with responsive preview, public `/w/:slug` pages, household guest lists + CSV import, hashed `/i/:token` links + QR codes, transactional RSVP with custom questions, attendance analytics, CSV exports, versioned publishing.

### Post-MVP (Deferred)

- Freeform canvas drag-and-drop, automated email/SMS delivery pipelines, real-time collaborative editing, custom domains per wedding, seating-chart builders, commercial SaaS billing.
