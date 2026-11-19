import type { Session, User } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appRoutes } from '@/app/router/router';
import { getActiveWorkspaceStorageKey } from '@/features/workspace/context/activeWorkspaceStorage';
import { workspaceQueryKeys } from '@/features/workspace/queryKeys';
import type { WorkspaceRole } from '@/features/workspace/schemas/workspaceSchemas';
import * as organizerClientModule from '@/lib/supabase/organizerClient';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

const USER_OWNER_ID = '11111111-1111-4111-8111-111111111111';
const USER_CO_MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const WS_ALPHA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WS_BETA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STALE_WS_ID = '99999999-9999-4999-8999-999999999999';

interface InMemoryWorkspace {
  id: string;
  name: string;
  slug: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface InMemoryMembership {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

interface InMemoryProfile {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  updated_at: string;
}

function buildAuthenticatedSession(userId: string, email: string): Session {
  const user: User = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: 'Alex Morgan' },
    created_at: '2026-11-12T00:00:00.000Z',
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

function createFakeWorkspaceSupabase(options: {
  readonly callerId: string;
  readonly callerEmail: string;
  readonly workspaces: InMemoryWorkspace[];
  readonly memberships: InMemoryMembership[];
  readonly profiles: InMemoryProfile[];
}): TypedSupabaseClient {
  const workspaces = [...options.workspaces];
  const memberships = [...options.memberships];
  const profiles = [...options.profiles];
  const session = buildAuthenticatedSession(options.callerId, options.callerEmail);

  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: () => undefined,
          },
        },
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        let pendingUpdate: { full_name?: string } | null = null;
        let filterId: string | null = null;
        const builder = {
          select: vi.fn(() => builder),
          update: vi.fn((patch: { full_name?: string }) => {
            pendingUpdate = patch;
            return builder;
          }),
          eq: vi.fn((col: string, val: string) => {
            if (col === 'id') {
              filterId = val;
            }
            return builder;
          }),
          maybeSingle: vi.fn(async () => {
            const profile = profiles.find((p) => p.id === filterId && p.id === options.callerId);
            if (!profile) {
              return { data: null, error: null };
            }
            if (pendingUpdate?.full_name !== undefined) {
              profile.full_name = pendingUpdate.full_name;
            }
            return { data: { ...profile }, error: null };
          }),
        };
        return builder;
      }

      if (table === 'workspaces') {
        let pendingUpdate: { name: string; slug: string } | null = null;
        let isDelete = false;
        let filterId: string | null = null;

        const builder = {
          select: vi.fn(() => {
            if (isDelete) {
              const idx = workspaces.findIndex((w) => w.id === filterId);
              const callerMem = memberships.find(
                (m) => m.workspace_id === filterId && m.user_id === options.callerId,
              );
              if (idx === -1 || callerMem?.role !== 'owner') {
                return Promise.resolve({ data: [], error: null });
              }
              const [removed] = workspaces.splice(idx, 1);
              for (let i = memberships.length - 1; i >= 0; i -= 1) {
                if (memberships[i]?.workspace_id === filterId) {
                  memberships.splice(i, 1);
                }
              }
              return Promise.resolve({ data: removed ? [{ id: removed.id }] : [], error: null });
            }
            return builder;
          }),
          update: vi.fn((patch: { name: string; slug: string }) => {
            pendingUpdate = patch;
            return builder;
          }),
          delete: vi.fn(() => {
            isDelete = true;
            return builder;
          }),
          eq: vi.fn((col: string, val: string) => {
            if (col === 'id') {
              filterId = val;
            }
            return builder;
          }),
          order: vi.fn(async () => {
            const allowedIds = new Set(
              memberships.filter((m) => m.user_id === options.callerId).map((m) => m.workspace_id),
            );
            return {
              data: workspaces.filter((w) => allowedIds.has(w.id)).map((w) => ({ ...w })),
              error: null,
            };
          }),
          maybeSingle: vi.fn(async () => {
            const ws = workspaces.find((w) => w.id === filterId);
            const callerMem = memberships.find(
              (m) => m.workspace_id === filterId && m.user_id === options.callerId,
            );
            if (!ws || !callerMem || !['owner', 'admin'].includes(callerMem.role)) {
              return { data: null, error: null };
            }
            if (pendingUpdate) {
              ws.name = pendingUpdate.name;
              ws.slug = pendingUpdate.slug;
            }
            return { data: { ...ws }, error: null };
          }),
        };
        return builder;
      }

      if (table === 'workspace_members') {
        let filterUserId: string | null = null;
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn((col: string, val: string) => {
            if (col === 'user_id') {
              filterUserId = val;
            }
            return builder;
          }),
          order: vi.fn(async () => ({
            data: memberships
              .filter((m) => m.user_id === filterUserId)
              .map((m) => ({
                id: m.id,
                workspace_id: m.workspace_id,
                role: m.role,
                created_at: m.created_at,
              })),
            error: null,
          })),
        };
        return builder;
      }

      if (
        table === 'weddings' ||
        table === 'wedding_settings' ||
        table === 'wedding_themes' ||
        table === 'wedding_sections'
      ) {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          order: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          then: (
            onFulfilled?: ((val: { data: unknown[]; error: null }) => unknown) | null,
            onRejected?: ((reason: unknown) => unknown) | null,
          ) => Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected),
        };
        return builder;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: vi.fn(async (fnName: string, args?: Record<string, unknown>) => {
      if (fnName === 'health_check') {
        return { data: { status: 'ok', timestamp: '2026-11-12T00:00:00.000Z' }, error: null };
      }

      if (fnName === 'create_workspace') {
        const name = String(args?.p_name ?? '').trim();
        const rawSlug = args?.p_slug
          ? String(args.p_slug)
          : name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        if (workspaces.some((w) => w.slug === rawSlug)) {
          return {
            data: null,
            error: {
              code: '23505',
              message: 'WORKSPACE_SLUG_TAKEN: That workspace URL slug is already in use.',
            },
          };
        }
        const created: InMemoryWorkspace = {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          name,
          slug: rawSlug,
          created_by: options.callerId,
          created_at: '2026-11-12T01:00:00.000Z',
          updated_at: '2026-11-12T01:00:00.000Z',
        };
        workspaces.push(created);
        memberships.push({
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          workspace_id: created.id,
          user_id: options.callerId,
          role: 'owner',
          invited_by: options.callerId,
          created_at: created.created_at,
          updated_at: created.updated_at,
        });
        return { data: created, error: null };
      }

      if (fnName === 'list_workspace_members') {
        const workspaceId = String(args?.p_workspace_id ?? '');
        const callerMem = memberships.find(
          (m) => m.workspace_id === workspaceId && m.user_id === options.callerId,
        );
        if (!callerMem) {
          return {
            data: null,
            error: { code: '42501', message: 'WORKSPACE_ACCESS_DENIED: Access denied.' },
          };
        }
        const canSeeAllEmails = callerMem.role === 'owner' || callerMem.role === 'admin';
        const rows = memberships
          .filter((m) => m.workspace_id === workspaceId)
          .map((m) => {
            const prof = profiles.find((p) => p.id === m.user_id);
            return {
              member_id: m.id,
              workspace_id: m.workspace_id,
              user_id: m.user_id,
              role: m.role,
              full_name: prof?.full_name ?? '',
              email: canSeeAllEmails || m.user_id === options.callerId ? (prof?.email ?? '') : null,
              joined_at: m.created_at,
            };
          });
        return { data: rows, error: null };
      }

      if (fnName === 'add_workspace_member_by_email') {
        const workspaceId = String(args?.p_workspace_id ?? '');
        const email = String(args?.p_email ?? '')
          .toLowerCase()
          .trim();
        const role = args?.p_role as WorkspaceRole;
        const targetProfile = profiles.find((p) => p.email === email);
        if (!targetProfile) {
          return {
            data: null,
            error: {
              code: 'P0002',
              message:
                'ORGANIZER_NOT_REGISTERED: No registered organizer account matches that email yet.',
            },
          };
        }
        const inserted: InMemoryMembership = {
          id: `mem-${Date.now()}`,
          workspace_id: workspaceId,
          user_id: targetProfile.id,
          role,
          invited_by: options.callerId,
          created_at: '2026-11-12T02:00:00.000Z',
          updated_at: '2026-11-12T02:00:00.000Z',
        };
        memberships.push(inserted);
        return { data: inserted, error: null };
      }

      if (fnName === 'update_workspace_member_role') {
        const workspaceId = String(args?.p_workspace_id ?? '');
        const memberUserId = String(args?.p_member_user_id ?? '');
        const newRole = args?.p_new_role as WorkspaceRole;
        const target = memberships.find(
          (m) => m.workspace_id === workspaceId && m.user_id === memberUserId,
        );
        if (!target) {
          return {
            data: null,
            error: { code: 'P0002', message: 'WORKSPACE_MEMBER_NOT_FOUND: Not found.' },
          };
        }
        target.role = newRole;
        return { data: { ...target }, error: null };
      }

      if (fnName === 'remove_workspace_member') {
        const workspaceId = String(args?.p_workspace_id ?? '');
        const memberUserId = String(args?.p_member_user_id ?? '');
        const idx = memberships.findIndex(
          (m) => m.workspace_id === workspaceId && m.user_id === memberUserId,
        );
        if (idx !== -1) {
          memberships.splice(idx, 1);
        }
        return { data: undefined, error: null };
      }

      throw new Error(`Unexpected RPC: ${fnName}`);
    }),
  } as unknown as TypedSupabaseClient;

  return client;
}

function renderPortalAt(initialPath: string, queryClient = new QueryClient()) {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [initialPath],
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient, ...view };
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('Organizer Workspace Onboarding, Switching & RBAC UI (P1-AC02, P1-AC03, P1-AC05, P1-AC08, P1-AC15)', () => {
  it('onboards a zero-workspace organizer by creating and activating their first workspace and saving profile full_name', async () => {
    const user = userEvent.setup();
    const fakeClient = createFakeWorkspaceSupabase({
      callerId: USER_OWNER_ID,
      callerEmail: 'alex@studio.com',
      workspaces: [],
      memberships: [],
      profiles: [
        {
          id: USER_OWNER_ID,
          email: 'alex@studio.com',
          full_name: 'Alex',
          created_at: '2026-11-12T00:00:00.000Z',
          updated_at: '2026-11-12T00:00:00.000Z',
        },
      ],
    });
    vi.spyOn(organizerClientModule, 'getOrganizerSupabaseClient').mockReturnValue(fakeClient);

    renderPortalAt('/app');

    // Zero-workspace onboarding card appears
    expect(await screen.findByTestId('workspace-onboarding-card')).toBeInTheDocument();

    // Update profile display name & verify email input is read-only
    const emailInput = screen.getByTestId('profile-email-readonly');
    expect(emailInput).toBeDisabled();
    const displayNameInput = screen.getByLabelText(/display name/i);
    await user.clear(displayNameInput);
    await user.type(displayNameInput, 'Alex Morgan');
    await user.click(screen.getByTestId('profile-save-button'));
    expect(await screen.findByTestId('profile-saved-notice')).toBeInTheDocument();

    // Create first workspace
    await user.type(screen.getByLabelText(/workspace name/i), 'Morgan Wedding Studio');
    await user.click(screen.getByTestId('create-workspace-submit-button'));

    expect(await screen.findByTestId('active-workspace-heading')).toHaveTextContent(
      'Morgan Wedding Studio',
    );
    expect(screen.getByTestId('active-workspace-role-badge')).toHaveTextContent('Role: Owner');
    expect(window.localStorage.getItem(getActiveWorkspaceStorageKey(USER_OWNER_ID))).toBe(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    );
  });

  it('evicts stale cached workspace IDs, switches active workspaces cleanly, and enforces viewer vs owner RBAC & email masking', async () => {
    const user = userEvent.setup();
    const fakeClient = createFakeWorkspaceSupabase({
      callerId: USER_OWNER_ID,
      callerEmail: 'alex@studio.com',
      workspaces: [
        {
          id: WS_ALPHA_ID,
          name: 'Alpha Events',
          slug: 'alpha-events',
          created_by: USER_OWNER_ID,
          created_at: '2026-11-12T00:00:00.000Z',
          updated_at: '2026-11-12T00:00:00.000Z',
        },
        {
          id: WS_BETA_ID,
          name: 'Beta Collective',
          slug: 'beta-collective',
          created_by: USER_CO_MEMBER_ID,
          created_at: '2026-11-12T00:05:00.000Z',
          updated_at: '2026-11-12T00:05:00.000Z',
        },
      ],
      memberships: [
        {
          id: 'mem-alpha-owner',
          workspace_id: WS_ALPHA_ID,
          user_id: USER_OWNER_ID,
          role: 'owner',
          invited_by: USER_OWNER_ID,
          created_at: '2026-11-12T00:00:00.000Z',
          updated_at: '2026-11-12T00:00:00.000Z',
        },
        {
          id: 'mem-beta-viewer',
          workspace_id: WS_BETA_ID,
          user_id: USER_OWNER_ID,
          role: 'viewer',
          invited_by: USER_CO_MEMBER_ID,
          created_at: '2026-11-12T00:05:00.000Z',
          updated_at: '2026-11-12T00:05:00.000Z',
        },
        {
          id: 'mem-beta-owner',
          workspace_id: WS_BETA_ID,
          user_id: USER_CO_MEMBER_ID,
          role: 'owner',
          invited_by: USER_CO_MEMBER_ID,
          created_at: '2026-11-12T00:05:00.000Z',
          updated_at: '2026-11-12T00:05:00.000Z',
        },
      ],
      profiles: [
        {
          id: USER_OWNER_ID,
          email: 'alex@studio.com',
          full_name: 'Alex Morgan',
          created_at: '2026-11-12T00:00:00.000Z',
          updated_at: '2026-11-12T00:00:00.000Z',
        },
        {
          id: USER_CO_MEMBER_ID,
          email: 'jordan.private@studio.com',
          full_name: 'Jordan Lee',
          created_at: '2026-11-12T00:00:00.000Z',
          updated_at: '2026-11-12T00:00:00.000Z',
        },
      ],
    });
    vi.spyOn(organizerClientModule, 'getOrganizerSupabaseClient').mockReturnValue(fakeClient);

    // Seed stale revoked workspace ID in localStorage and QueryClient cache
    window.localStorage.setItem(getActiveWorkspaceStorageKey(USER_OWNER_ID), STALE_WS_ID);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(workspaceQueryKeys.memberDirectory(USER_OWNER_ID, STALE_WS_ID), [
      'stale-cached-directory',
    ]);

    renderPortalAt('/app/settings', queryClient);

    // Automatically falls back to Alpha Events (Owner) and evicts STALE_WS_ID cache
    expect(await screen.findByRole('heading', { name: 'Alpha Events' })).toBeInTheDocument();
    expect(
      queryClient.getQueryData(workspaceQueryKeys.memberDirectory(USER_OWNER_ID, STALE_WS_ID)),
    ).toBeUndefined();
    expect(window.localStorage.getItem(getActiveWorkspaceStorageKey(USER_OWNER_ID))).toBe(
      WS_ALPHA_ID,
    );

    // Sole owner on Alpha Events: Leave button disabled, Sole owner badge shown, Delete section visible
    expect(await screen.findByTestId('sole-owner-badge')).toBeInTheDocument();
    expect(screen.getByTestId('leave-workspace-button')).toBeDisabled();
    expect(screen.getByTestId('delete-workspace-confirm-input')).toBeInTheDocument();

    // Unregistered email surfaces clear Phase 1 existing-organizer error
    await user.type(screen.getByLabelText(/organizer email/i), 'nobody@unregistered.com');
    await user.click(screen.getByTestId('add-member-submit-button'));
    expect(await screen.findByTestId('add-member-error')).toHaveTextContent(
      /no registered organizer account matches that email yet/i,
    );

    // Add registered Jordan Lee as Editor -> Owner sees Jordan's email
    await user.clear(screen.getByLabelText(/organizer email/i));
    await user.type(screen.getByLabelText(/organizer email/i), 'jordan.private@studio.com');
    await user.click(screen.getByTestId('add-member-submit-button'));
    expect(await screen.findByTestId('add-member-success')).toHaveTextContent(
      'Added jordan.private@studio.com as Editor.',
    );

    const jordanRowInAlpha = await screen.findByTestId(`member-row-${USER_CO_MEMBER_ID}`);
    expect(within(jordanRowInAlpha).getByTestId('member-email-visible')).toHaveTextContent(
      'jordan.private@studio.com',
    );

    // Switch active workspace to Beta Collective (where caller is Viewer)
    await user.selectOptions(screen.getByTestId('workspace-switcher'), WS_BETA_ID);
    expect(await screen.findByRole('heading', { name: 'Beta Collective' })).toBeInTheDocument();
    expect(window.localStorage.getItem(getActiveWorkspaceStorageKey(USER_OWNER_ID))).toBe(
      WS_BETA_ID,
    );

    // Viewer RBAC & Email Masking (`P1-AC05`, `P1-AC15`):
    // - Workspace name input is disabled; Save button, Add Member form, and Delete section are absent
    expect(screen.getByLabelText(/workspace name/i)).toBeDisabled();
    expect(screen.queryByTestId('workspace-settings-save-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-member-submit-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-workspace-button')).not.toBeInTheDocument();

    // - Co-member Jordan's email is masked (`Email hidden for your role`), while caller's own email is visible
    const jordanRowInBeta = await screen.findByTestId(`member-row-${USER_CO_MEMBER_ID}`);
    expect(within(jordanRowInBeta).getByTestId('member-email-masked')).toHaveTextContent(
      /email hidden for your role/i,
    );
    expect(jordanRowInBeta.textContent).not.toContain('jordan.private@studio.com');

    const ownRowInBeta = screen.getByTestId(`member-row-${USER_OWNER_ID}`);
    expect(within(ownRowInBeta).getByTestId('member-email-visible')).toHaveTextContent(
      'alex@studio.com',
    );

    // Switch back to Alpha Events and delete Alpha Events using slug confirmation
    await user.selectOptions(screen.getByTestId('workspace-switcher'), WS_ALPHA_ID);
    expect(await screen.findByRole('heading', { name: 'Alpha Events' })).toBeInTheDocument();

    const deleteBtn = screen.getByTestId('delete-workspace-button');
    expect(deleteBtn).toBeDisabled();
    await user.type(screen.getByTestId('delete-workspace-confirm-input'), 'alpha-events');
    expect(deleteBtn).toBeEnabled();
    await user.click(deleteBtn);

    // Redirects to /app with remaining workspace Beta Collective active!
    expect(await screen.findByTestId('active-workspace-heading')).toHaveTextContent(
      'Beta Collective',
    );
  });
});
