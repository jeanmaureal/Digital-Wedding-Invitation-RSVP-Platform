# Coding Standards & Engineering Workflow

## 1. TypeScript & Static Analysis

- **Compiler authority:** TypeScript strict mode (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`) via `npm run typecheck` (`tsc -b --noEmit`) is the source of truth for type safety.
- **No `any` escapes:** Prefer narrow domain types, discriminated unions, and Zod schema inference (`z.infer<typeof schema>`).
- **Formatting & linting:** ESLint (`typescript-eslint`, React Hooks, React Refresh) handles code-quality rules while Prettier (`eslint-config-prettier`) handles formatting exclusively.

---

## 2. Styling, Forms & Data Access

- **Tailwind CSS v4:** Configured exclusively via `@tailwindcss/vite` in `vite.config.ts` and `@import 'tailwindcss';` in `src/styles/globals.css`. Do not introduce Tailwind v3 `tailwind.config.js` or PostCSS `@tailwind` directives.
- **Component & file naming:**
  - React components: `PascalCase.tsx` (named exports).
  - Hooks: `useCamelCase.ts`.
  - Utilities, validators, data-access modules: `camelCase.ts` or `kebab-case.ts` consistently per layer.
  - `shadcn/ui` primitives in `src/components/ui/`: lowercase (`button.tsx`, `card.tsx`).
- **Data access separation:** Keep Supabase queries/mutations in `src/features/<domain>/api/` (or `queries.ts`) wrapped by TanStack Query hooks — never call `supabase.from(...)` directly inside presentation components.
- **Forms:** Use `react-hook-form` paired with `@hookform/resolvers/zod` schemas shared between form validation and payload parsing.
- **Accessibility & responsiveness:** Mobile-first layouts, semantic landmarks/labels, keyboard-reachable controls, and reduced-motion respect.

---

## 3. Dependency Management

- Pin exact dependency versions in `package.json` (`save-exact`) and always commit `package-lock.json`.
- Verify peer-dependency and Node engine compatibility before adding or upgrading packages.
- CI pipelines must install with `npm ci`.

---

## 4. Git Workflow & Branch Discipline

| Branch | Purpose | Deployment Target | Merge Rule |
| :--- | :--- | :--- | :--- |
| `main` | Stable integration branch | Vercel Production | Protected after Phase 0 foundation push: PR required, passing CI checks required, no force-push |
| `feature/*` | New phase / feature work | Vercel Preview | Opened as PR targeting `main` |
| `fix/*` | Defect & security fixes | Vercel Preview | Opened as PR targeting `main` |

Commit messages follow Conventional Commits (`feat(scope): ...`, `fix(scope): ...`, `chore(scope): ...`, `docs(scope): ...`, `test(scope): ...`).
