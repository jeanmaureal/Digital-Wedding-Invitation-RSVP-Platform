import type { Session, User } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appRoutes } from '@/app/router/router';
import type { WeddingRecord, WeddingSettingsRecord } from '@/features/weddings/api/weddingApi';
import type { WorkspaceRole } from '@/features/workspace/schemas/workspaceSchemas';
import * as organizerClientModule from '@/lib/supabase/organizerClient';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

const CALLER_ID = '11111111-1111-4111-8111-111111111111';
const WS_ALPHA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WS_BETA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WS_GAMMA_VIEWER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WEDDING_BETA_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const WEDDING_GAMMA_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

interface FakeWorkspace {
  id: string;
  name: string;
  slug: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface FakeMembership {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
}

function buildSession(userId: string, email: string): Session {
  const user: User = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: 'Elena Planner' },
    created_at: '2026-11-18T00:00:00.000Z',
  };

  return {
    access_token: 'header.eyJhbXIiOltdfQ.sig',
    refresh_token: `refresh-${userId}`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };
}

function createFakeMultiWeddingSupabase(): {
  readonly client: TypedSupabaseClient;
  readonly weddings: WeddingRecord[];
  readonly settings: WeddingSettingsRecord[];
} {
  const session = buildSession(CALLER_ID, 'elena.planner@example.com');
  let idCounter = 1;

  const workspaces: FakeWorkspace[] = [
    {
      id: WS_ALPHA_ID,
      name: 'Alpha Bridals',
      slug: 'alpha-bridals',
      created_by: CALLER_ID,
      created_at: '2026-11-18T00:00:00.000Z',
      updated_at: '2026-11-18T00:00:00.000Z',
    },
    {
      id: WS_BETA_ID,
      name: 'Beta Celebrations',
      slug: 'beta-celebrations',
      created_by: CALLER_ID,
      created_at: '2026-11-18T00:01:00.000Z',
      updated_at: '2026-11-18T00:01:00.000Z',
    },
    {
      id: WS_GAMMA_VIEWER_ID,
      name: 'Gamma ReadOnly Studio',
      slug: 'gamma-readonly-studio',
      created_by: null,
      created_at: '2026-11-18T00:02:00.000Z',
      updated_at: '2026-11-18T00:02:00.000Z',
    },
  ];

  const memberships: FakeMembership[] = [
    {
      id: 'mem-alpha-owner',
      workspace_id: WS_ALPHA_ID,
      user_id: CALLER_ID,
      role: 'owner',
      created_at: '2026-11-18T00:00:00.000Z',
    },
    {
      id: 'mem-beta-editor',
      workspace_id: WS_BETA_ID,
      user_id: CALLER_ID,
      role: 'editor',
      created_at: '2026-11-18T00:01:00.000Z',
    },
    {
      id: 'mem-gamma-viewer',
      workspace_id: WS_GAMMA_VIEWER_ID,
      user_id: CALLER_ID,
      role: 'viewer',
      created_at: '2026-11-18T00:02:00.000Z',
    },
  ];

  const weddings: WeddingRecord[] = [
    {
      id: WEDDING_BETA_ID,
      workspace_id: WS_BETA_ID,
      title: 'Maya & Noah Harbor Vows',
      partner_one_name: 'Maya',
      partner_two_name: 'Noah',
      slug: 'maya-noah-harbor',
      event_date: '2027-09-18',
      venue_name: 'Harbor Pavilion',
      venue_location: 'Boston, MA',
      status: 'draft',
      archived_at: null,
      duplicated_from_wedding_id: null,
      created_by: CALLER_ID,
      created_at: '2026-11-18T00:05:00.000Z',
      updated_at: '2026-11-18T00:05:00.000Z',
    },
    {
      id: WEDDING_GAMMA_ID,
      workspace_id: WS_GAMMA_VIEWER_ID,
      title: 'Chloe & Ethan Villa Gala',
      partner_one_name: 'Chloe',
      partner_two_name: 'Ethan',
      slug: 'chloe-ethan-villa',
      event_date: null,
      venue_name: '',
      venue_location: '',
      status: 'draft',
      archived_at: null,
      duplicated_from_wedding_id: null,
      created_by: null,
      created_at: '2026-11-18T00:06:00.000Z',
      updated_at: '2026-11-18T00:06:00.000Z',
    },
  ];

  const settings: WeddingSettingsRecord[] = [
    {
      wedding_id: WEDDING_BETA_ID,
      workspace_id: WS_BETA_ID,
      timezone: 'America/New_York',
      rsvp_deadline: '2027-08-15T22:30:00.000Z',
      is_rsvp_open: true,
      access_mode: 'public',
      allow_plus_ones_default: false,
      show_guest_dietary_notes: true,
      primary_locale: 'en',
      contact_email: null,
      dress_code: '',
      rsvp_confirmation_message: '',
      created_at: '2026-11-18T00:05:00.000Z',
      updated_at: '2026-11-18T00:05:00.000Z',
    },
    {
      wedding_id: WEDDING_GAMMA_ID,
      workspace_id: WS_GAMMA_VIEWER_ID,
      timezone: 'UTC',
      rsvp_deadline: null,
      is_rsvp_open: true,
      access_mode: 'invite_only',
      allow_plus_ones_default: false,
      show_guest_dietary_notes: true,
      primary_locale: 'en',
      contact_email: null,
      dress_code: '',
      rsvp_confirmation_message: '',
      created_at: '2026-11-18T00:06:00.000Z',
      updated_at: '2026-11-18T00:06:00.000Z',
    },
  ];

  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: () => undefined } },
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({
            data: {
              id: CALLER_ID,
              email: 'elena.planner@example.com',
              full_name: 'Elena Planner',
              created_at: '2026-11-18T00:00:00.000Z',
              updated_at: '2026-11-18T00:00:00.000Z',
            },
            error: null,
          })),
        };
        return builder;
      }

      if (table === 'workspaces') {
        const builder = {
          select: vi.fn(() => builder),
          order: vi.fn(async () => ({ data: [...workspaces], error: null })),
        };
        return builder;
      }

      if (table === 'workspace_members') {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          order: vi.fn(async () => ({ data: [...memberships], error: null })),
        };
        return builder;
      }

      if (table === 'weddings') {
        const filters = new Map<string, string>();
        let patch: Partial<WeddingRecord> | null = null;
        let isDelete = false;

        const executeList = () => {
          const wsFilter = filters.get('workspace_id');
          return weddings
            .filter((w) => !wsFilter || w.workspace_id === wsFilter)
            .map((w) => ({ ...w }));
        };

        const builder = {
          select: vi.fn(() => {
            if (isDelete) {
              const wsId = filters.get('workspace_id');
              const wId = filters.get('id');
              const mem = memberships.find((m) => m.workspace_id === wsId);
              if (!mem || !['owner', 'admin'].includes(mem.role)) {
                return Promise.resolve({ data: [], error: null });
              }
              const idx = weddings.findIndex((w) => w.id === wId && w.workspace_id === wsId);
              if (idx === -1) {
                return Promise.resolve({ data: [], error: null });
              }
              const [removed] = weddings.splice(idx, 1);
              const sIdx = settings.findIndex((s) => s.wedding_id === wId);
              if (sIdx !== -1) {
                settings.splice(sIdx, 1);
              }
              return Promise.resolve({ data: removed ? [{ id: removed.id }] : [], error: null });
            }
            return builder;
          }),
          update: vi.fn((nextPatch: Partial<WeddingRecord>) => {
            patch = nextPatch;
            return builder;
          }),
          delete: vi.fn(() => {
            isDelete = true;
            return builder;
          }),
          eq: vi.fn((col: string, val: string) => {
            filters.set(col, val);
            return builder;
          }),
          order: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => {
            const wsId = filters.get('workspace_id');
            const wId = filters.get('id');
            const target = weddings.find((w) => w.id === wId && w.workspace_id === wsId);
            if (!target) {
              return { data: null, error: null };
            }
            if (patch) {
              const mem = memberships.find((m) => m.workspace_id === wsId);
              if (!mem || mem.role === 'viewer') {
                return { data: null, error: null };
              }
              if (
                patch.slug &&
                weddings.some((other) => other.id !== target.id && other.slug === patch?.slug)
              ) {
                return {
                  data: null,
                  error: {
                    code: '23505',
                    message: 'duplicate key value violates unique constraint',
                  },
                };
              }
              Object.assign(target, patch);
              if (patch.status === 'archived') {
                target.archived_at = '2026-11-18T02:00:00.000Z';
              } else if (patch.status === 'draft') {
                target.archived_at = null;
              }
              target.updated_at = `2026-11-18T02:00:0${idCounter}.000Z`;
              idCounter += 1;
            }
            return { data: { ...target }, error: null };
          }),
          then: (
            onFulfilled?: ((val: { data: WeddingRecord[]; error: null }) => unknown) | null,
            onRejected?: ((reason: unknown) => unknown) | null,
          ) => Promise.resolve({ data: executeList(), error: null }).then(onFulfilled, onRejected),
        };
        return builder;
      }

      if (table === 'wedding_settings') {
        const filters = new Map<string, string>();
        let patch: Partial<WeddingSettingsRecord> | null = null;

        const builder = {
          select: vi.fn(() => builder),
          update: vi.fn((nextPatch: Partial<WeddingSettingsRecord>) => {
            patch = nextPatch;
            return builder;
          }),
          eq: vi.fn((col: string, val: string) => {
            filters.set(col, val);
            return builder;
          }),
          maybeSingle: vi.fn(async () => {
            const wsId = filters.get('workspace_id');
            const wId = filters.get('wedding_id');
            const target = settings.find((s) => s.wedding_id === wId && s.workspace_id === wsId);
            if (!target) {
              return { data: null, error: null };
            }
            if (patch) {
              const mem = memberships.find((m) => m.workspace_id === wsId);
              if (!mem || mem.role === 'viewer') {
                return { data: null, error: null };
              }
              Object.assign(target, patch);
              target.updated_at = `2026-11-18T02:10:0${idCounter}.000Z`;
              idCounter += 1;
            }
            return { data: { ...target }, error: null };
          }),
          then: (
            onFulfilled?: ((val: { data: WeddingSettingsRecord[]; error: null }) => unknown) | null,
            onRejected?: ((reason: unknown) => unknown) | null,
          ) => {
            const wsId = filters.get('workspace_id');
            const rows = settings
              .filter((s) => !wsId || s.workspace_id === wsId)
              .map((s) => ({ ...s }));
            return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
          },
        };
        return builder;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: vi.fn(async (fnName: string, args?: Record<string, unknown>) => {
      if (fnName === 'health_check') {
        return { data: { status: 'ok', timestamp: '2026-11-18T00:00:00.000Z' }, error: null };
      }

      if (fnName === 'create_wedding') {
        const wsId = String(args?.p_workspace_id ?? '');
        const rawSlug = args?.p_slug
          ? String(args.p_slug)
          : `${String(args?.p_partner_one_name ?? '')}-${String(args?.p_partner_two_name ?? '')}`
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-');

        if (weddings.some((w) => w.slug === rawSlug)) {
          return {
            data: null,
            error: {
              code: '23505',
              message: 'WEDDING_SLUG_TAKEN: That public wedding URL slug is already in use.',
            },
          };
        }

        const newId = `10000000-0000-4000-8000-00000000000${idCounter}`;
        idCounter += 1;
        const created: WeddingRecord = {
          id: newId,
          workspace_id: wsId,
          title: String(args?.p_title ?? ''),
          partner_one_name: String(args?.p_partner_one_name ?? ''),
          partner_two_name: String(args?.p_partner_two_name ?? ''),
          slug: rawSlug,
          event_date: args?.p_event_date ? String(args.p_event_date) : null,
          venue_name: String(args?.p_venue_name ?? ''),
          venue_location: String(args?.p_venue_location ?? ''),
          status: 'draft',
          archived_at: null,
          duplicated_from_wedding_id: null,
          created_by: CALLER_ID,
          created_at: '2026-11-18T01:00:00.000Z',
          updated_at: '2026-11-18T01:00:00.000Z',
        };
        weddings.unshift(created);
        settings.push({
          wedding_id: newId,
          workspace_id: wsId,
          timezone: String(args?.p_timezone ?? 'UTC'),
          rsvp_deadline: args?.p_rsvp_deadline ? String(args.p_rsvp_deadline) : null,
          is_rsvp_open: Boolean(args?.p_is_rsvp_open ?? true),
          access_mode: (args?.p_access_mode as 'public' | 'invite_only') ?? 'public',
          allow_plus_ones_default: Boolean(args?.p_allow_plus_ones_default ?? false),
          show_guest_dietary_notes: Boolean(args?.p_show_guest_dietary_notes ?? true),
          primary_locale: 'en',
          contact_email: args?.p_contact_email ? String(args.p_contact_email) : null,
          dress_code: '',
          rsvp_confirmation_message: '',
          created_at: '2026-11-18T01:00:00.000Z',
          updated_at: '2026-11-18T01:00:00.000Z',
        });
        return { data: { ...created }, error: null };
      }

      if (fnName === 'duplicate_wedding') {
        const wsId = String(args?.p_workspace_id ?? '');
        const srcId = String(args?.p_source_wedding_id ?? '');
        const srcWedding = weddings.find((w) => w.id === srcId && w.workspace_id === wsId);
        const srcSettings = settings.find((s) => s.wedding_id === srcId && s.workspace_id === wsId);
        if (!srcWedding || !srcSettings) {
          return {
            data: null,
            error: {
              code: 'P0002',
              message: 'WEDDING_NOT_FOUND: Source wedding project was not found in this workspace.',
            },
          };
        }

        const newId = `20000000-0000-4000-8000-00000000000${idCounter}`;
        idCounter += 1;
        const dupSlug = args?.p_slug
          ? String(args.p_slug)
          : `${String(args?.p_title ?? 'copy')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-+|-+$)/g, '')}-${idCounter}`;

        const created: WeddingRecord = {
          id: newId,
          workspace_id: wsId,
          title: String(args?.p_title ?? ''),
          partner_one_name: args?.p_partner_one_name
            ? String(args.p_partner_one_name)
            : srcWedding.partner_one_name,
          partner_two_name: args?.p_partner_two_name
            ? String(args.p_partner_two_name)
            : srcWedding.partner_two_name,
          slug: dupSlug,
          event_date: args?.p_event_date ? String(args.p_event_date) : null,
          venue_name: srcWedding.venue_name,
          venue_location: srcWedding.venue_location,
          status: 'draft',
          archived_at: null,
          duplicated_from_wedding_id: srcWedding.id,
          created_by: CALLER_ID,
          created_at: '2026-11-18T01:30:00.000Z',
          updated_at: '2026-11-18T01:30:00.000Z',
        };
        weddings.unshift(created);
        settings.push({
          ...srcSettings,
          wedding_id: newId,
          rsvp_deadline: null,
          is_rsvp_open: true,
        });
        return { data: { ...created }, error: null };
      }

      throw new Error(`Unexpected RPC: ${fnName}`);
    }),
  } as unknown as TypedSupabaseClient;

  return { client, weddings, settings };
}

describe('Multi-Wedding Project Management, Workspace Isolation & RBAC UI (P2-AC05, P2-AC06, P2-AC09, P2-AC10)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('creates a wedding via the 2-step wizard (surfacing slug collisions), duplicates, archives, and blocks cross-workspace detail bleed on workspace switch', async () => {
    const user = userEvent.setup();
    const { client, settings } = createFakeMultiWeddingSupabase();
    vi.spyOn(organizerClientModule, 'getOrganizerSupabaseClient').mockReturnValue(client);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/app'] });

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    // Alpha Bridals starts with 0 weddings
    expect(await screen.findByTestId('active-workspace-heading')).toHaveTextContent(
      'Alpha Bridals',
    );
    expect(await screen.findByTestId('weddings-empty-card')).toBeInTheDocument();

    // Launch 2-step wizard
    await user.click(screen.getByTestId('open-create-wedding-wizard-button'));
    expect(screen.getByTestId('wedding-wizard-step-badge')).toHaveTextContent('Step 1 of 2');

    await user.type(screen.getByLabelText('Partner 1 name'), 'Elena');
    await user.type(screen.getByLabelText('Partner 2 name'), 'Mateo');
    expect(screen.getByLabelText('Project title')).toHaveValue("Elena & Mateo's Wedding");

    // Enter a slug already taken by Workspace Beta (`maya-noah-harbor`) to verify global slug collision rolls back to Step 1
    const slugInput = screen.getByLabelText(/Public URL slug/i);
    await user.type(slugInput, 'maya-noah-harbor');
    await user.click(screen.getByTestId('wizard-next-step-button'));

    expect(await screen.findByTestId('wedding-wizard-step-badge')).toHaveTextContent('Step 2 of 2');
    await user.selectOptions(screen.getByLabelText('Wedding IANA timezone'), 'Asia/Manila');
    await user.type(screen.getByLabelText(/RSVP deadline date/i), '2027-05-15');
    await user.type(screen.getByLabelText(/Deadline time/i), '23:59');
    await user.click(screen.getByTestId('create-wedding-submit-button'));

    // Collision returns user to Step 1 with clear error message
    expect(await screen.findByTestId('create-wedding-error')).toHaveTextContent(
      'That public wedding URL slug is already in use.',
    );
    expect(screen.getByTestId('wedding-wizard-step-badge')).toHaveTextContent('Step 1 of 2');

    // Fix slug and complete creation
    await user.clear(screen.getByLabelText(/Public URL slug/i));
    await user.type(screen.getByLabelText(/Public URL slug/i), 'elena-mateo-manila');
    await user.click(screen.getByTestId('wizard-next-step-button'));
    await user.click(await screen.findByTestId('create-wedding-submit-button'));

    // Lands on /app/weddings/:weddingId with Asia/Manila timezone & UTC deadline stored accurately (`2027-05-15T15:59:00.000Z`)
    expect(await screen.findByTestId('route-organizer-wedding-detail')).toBeInTheDocument();
    expect(screen.getByTestId('wedding-detail-heading')).toHaveTextContent(
      "Elena & Mateo's Wedding",
    );
    const createdSettings = settings.find((s) => s.workspace_id === WS_ALPHA_ID);
    expect(createdSettings?.rsvp_deadline).toBe('2027-05-15T15:59:00.000Z');

    // Switch header WorkspaceSwitcher to Beta Celebrations while still on Alpha's /app/weddings/:weddingId!
    // Must immediately block cross-workspace UI bleed (`wedding-workspace-mismatch-card`).
    await user.selectOptions(screen.getByTestId('workspace-switcher'), WS_BETA_ID);
    expect(await screen.findByTestId('wedding-workspace-mismatch-card')).toBeInTheDocument();
    expect(screen.queryByTestId('wedding-details-card')).not.toBeInTheDocument();

    // Navigate back to Beta Celebrations overview -> sees Beta's wedding (`Maya & Noah Harbor Vows`)
    await user.click(screen.getByTestId('mismatch-back-to-overview-link'));
    expect(await screen.findByTestId('active-workspace-heading')).toHaveTextContent(
      'Beta Celebrations',
    );
    expect(await screen.findByTestId('wedding-project-card-maya-noah-harbor')).toBeInTheDocument();
    expect(screen.queryByTestId('wedding-project-card-elena-mateo-manila')).not.toBeInTheDocument();

    // As Editor in Beta Celebrations: duplicate Maya & Noah's wedding
    await user.click(screen.getByTestId('duplicate-wedding-button-maya-noah-harbor'));
    expect(await screen.findByTestId('duplicate-wedding-card')).toBeInTheDocument();
    await user.click(screen.getByTestId('duplicate-wedding-submit-button'));

    // Lands on duplicated project; as Editor, permanent delete is restricted (`delete-wedding-restricted-notice`)
    expect(await screen.findByTestId('wedding-detail-heading')).toHaveTextContent(
      'Copy of Maya & Noah Harbor Vows',
    );
    expect(screen.getByTestId('delete-wedding-restricted-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('delete-wedding-button')).not.toBeInTheDocument();

    // Editor CAN archive and restore the project
    await user.click(screen.getByTestId('detail-archive-wedding-button'));
    expect(await screen.findByTestId('detail-wedding-status-badge')).toHaveTextContent('Archived');
    await user.click(screen.getByTestId('detail-archive-wedding-button'));
    expect(await screen.findByTestId('detail-wedding-status-badge')).toHaveTextContent('Draft');

    // Switch to Gamma ReadOnly Studio (`viewer` role) -> strictly read-only UI
    await user.selectOptions(screen.getByTestId('workspace-switcher'), WS_GAMMA_VIEWER_ID);
    await user.click(await screen.findByTestId('mismatch-back-to-overview-link'));

    expect(await screen.findByTestId('wedding-viewer-readonly-badge')).toHaveTextContent(
      'Read-only (Viewer)',
    );
    expect(screen.queryByTestId('open-create-wedding-wizard-button')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('duplicate-wedding-button-chloe-ethan-villa'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId('open-wedding-button-chloe-ethan-villa'));
    expect(await screen.findByTestId('wedding-details-readonly-badge')).toBeInTheDocument();
    expect(screen.getByTestId('wedding-settings-readonly-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('save-wedding-details-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('save-wedding-settings-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('detail-duplicate-wedding-button')).toBeDisabled();
    expect(screen.getByTestId('detail-archive-wedding-button')).toBeDisabled();
  });
});
