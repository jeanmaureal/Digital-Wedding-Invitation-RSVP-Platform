# System Architecture

## 1. Architectural Pattern

The Digital Wedding Invitation & RSVP Platform is implemented as a **feature-based modular monolith** backed by **Supabase (PostgreSQL, Auth, Storage, Database/Edge Functions)** and hosted on **Vercel**.

Key architectural invariants:

- **Multi-workspace, multi-wedding tenancy:** One organizer account can belong to multiple workspaces (`owner`, `admin`, `editor`, `viewer`), and each workspace can manage multiple independent wedding projects.
- **Database-enforced tenant isolation:** PostgreSQL Row Level Security (RLS), explicit privilege grants, and foreign-key constraints enforce workspace and wedding isolation. Frontend checks improve UX only and are never trusted as authorization boundaries.
- **Organizer vs. Public separation:** Wedding organizers authenticate via Supabase Auth under `/app`. Public visitors and invited guests access `/w/:slug` and `/i/:token` without creating accounts; RSVP mutations require valid household invitation tokens processed atomically server-side.
- **Draft vs. Published separation:** Organizers edit mutable draft configurations; public visitors read immutable `published_versions` snapshots. Publishing never overwrites operational guest, token, or RSVP records.
- **Schema-driven invitation rendering:** A single `<InvitationRenderer />` resolves versioned theme tokens and registered section schemas (`Hero`, `Our Story`, `Event Details`, `RSVP`, etc.) rather than per-wedding hardcoded templates.

---

## 2. Directory Boundaries (`src/`)

```text
src/
├── app/
│   ├── layouts/         # Portal chrome (OrganizerLayout, PublicLayout)
│   ├── providers/       # Root error boundary, runtime env guard, QueryClientProvider
│   └── router/          # Application route definitions (/app, /, /w/:slug, /i/:token)
├── components/
│   ├── ui/              # Design-system primitives (shadcn/ui)
│   ├── shared/          # Cross-cutting UI (error boundaries, status states)
│   └── forms/           # Reusable React Hook Form + Zod field primitives
├── features/            # Domain modules (auth, workspace, weddings, themes, guests, rsvp, ...)
├── portals/
│   ├── organizer/       # Organizer workspace portal entry pages (/app/*)
│   └── public/          # Guest/public wedding website entry pages (/, /w/:slug, /i/:token)
├── lib/
│   ├── supabase/        # Typed browser Supabase client & operational RPC helpers
│   ├── validation/      # Environment contract & shared Zod validators
│   ├── utilities/       # Pure helpers (e.g., cn())
│   └── constants/       # Route paths, query keys, schema version constants
├── hooks/               # Shared React hooks
├── types/               # Generated database.types.ts & shared TypeScript types
└── styles/              # Tailwind CSS v4 entry & theme tokens
```

> **Why `organizer` instead of `admin`?** Authenticated customers are wedding organizers managing invitations and guests, distinct from platform-level administration that may be introduced later.

---

## 3. Module Dependency Rules

Imports must flow strictly top-down:

1. `app/` -> may import `portals/`, `features/`, `components/`, `hooks/`, `lib/`, `types/`.
2. `portals/organizer/` and `portals/public/` -> may import `features/`, `components/`, `hooks/`, `lib/`, `types/`. **`portals/public/` must never import `portals/organizer/` (and vice versa).**
3. `features/<domain>/` -> may import `components/`, `hooks/`, `lib/`, `types/`, and explicitly exported contracts from foundational features (`auth`, `workspace`, `weddings`). Presentation components inside a feature must not embed raw Supabase queries; keep queries in feature data-access modules.
4. `components/`, `hooks/`, `lib/`, `types/` -> foundational layers; must never import from `features/`, `portals/`, or `app/`.
5. **Lean module growth:** Do not add empty `index.ts` barrel files or per-folder `README.md` files until a feature contains substantive code.
