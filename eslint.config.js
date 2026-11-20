import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'src/types/database.types.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            'dangerouslySetInnerHTML is forbidden by the platform security baseline (P9-AC08); rely on React automatic escaping and validated schemas.',
        },
      ],
    },
  },
  {
    files: [
      'src/portals/public/**/*.{ts,tsx}',
      'src/features/rsvp/components/public/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/portals/organizer/*', '@/portals/organizer'],
              message: 'Public portal routes must never import Organizer portal modules.',
            },
            {
              group: [
                '@/lib/supabase/organizerClient',
                '@/lib/supabase/organizerClient/*',
                '@/features/auth',
                '@/features/auth/*',
                '@/features/workspace',
                '@/features/workspace/*',
                '@/features/weddings',
                '@/features/weddings/*',
                '@/features/design/api',
                '@/features/design/api/*',
                '@/features/design/hooks',
                '@/features/design/hooks/*',
                '@/features/design/components/WeddingDesignPreviewCard',
                '@/features/design/components/builder',
                '@/features/design/components/builder/*',
                '@/features/design/components/editors',
                '@/features/design/components/editors/*',
                '@/features/publishing/api/organizerPublishingApi',
                '@/features/publishing/api/publishingErrors',
                '@/features/publishing/components',
                '@/features/publishing/components/*',
                '@/features/guests/api/organizerGuestsApi',
                '@/features/guests/api/guestErrors',
                '@/features/guests/schemas/guestSchemas',
                '@/features/guests/utils',
                '@/features/guests/utils/*',
                '@/features/guests/components',
                '@/features/guests/components/*',
                '@/features/rsvp/api/organizerRsvpApi',
                '@/features/rsvp/api/rsvpErrors',
                '@/features/rsvp/schemas/organizerRsvpSchemas',
                '@/features/rsvp/utils',
                '@/features/rsvp/utils/*',
                '@/features/rsvp/components/organizer',
                '@/features/rsvp/components/organizer/*',
              ],
              message:
                'Public portal routes and public RSVP components must remain isolated from organizer auth/session clients, workspace modules, and organizer builder/publishing/guest/RSVP modules (P1-AC14 / P2-AC11 / P3-AC09 / P4-AC09 / P5-AC10 / P6-AC11 / P7-AC10 / P8-AC11).',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/features/design/{schemas,themes,registry}/**/*.{ts,tsx}',
      'src/features/design/components/InvitationRenderer.tsx',
      'src/features/design/components/sections/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/app/*',
                '@/portals/*',
                '@/lib/supabase/organizerClient',
                '@/lib/supabase/organizerClient/*',
                '@/features/auth',
                '@/features/auth/*',
                '@/features/workspace',
                '@/features/workspace/*',
                '@/features/weddings',
                '@/features/weddings/*',
                '@/features/design/api',
                '@/features/design/api/*',
                '@/features/design/hooks',
                '@/features/design/hooks/*',
                '@/features/design/components/builder',
                '@/features/design/components/builder/*',
                '@/features/design/components/editors',
                '@/features/design/components/editors/*',
                '@/features/publishing',
                '@/features/publishing/*',
                '@/features/guests',
                '@/features/guests/*',
                '@/features/rsvp',
                '@/features/rsvp/*',
              ],
              message:
                'Invitation design schemas, themes, registry, and <InvitationRenderer /> must remain pure and runtime-isolated from organizer session clients and builder forms so both Organizer Previews and Public /w/:slug & /i/:token Snapshots can share them safely (P3-AC09 / P4-AC09 / P5-AC10 / P6-AC11).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/portals/organizer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/portals/public/*', '@/portals/public'],
              message: 'Organizer portal routes must never import Public portal modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '@/portals/*'],
              message: 'Feature modules must not import from app shell or portal route modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/{components,hooks,lib,types}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '@/portals/*', '@/features/*'],
              message:
                'Foundational layers (components, hooks, lib, types) must not import from features, portals, or app.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts}', 'e2e/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
  eslintConfigPrettier,
);
