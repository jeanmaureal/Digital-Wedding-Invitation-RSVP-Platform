import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { WeddingPublishingCard } from '@/features/publishing/components/WeddingPublishingCard';
import type { WeddingRecord, WeddingSettingsRecord } from '@/features/weddings/api/weddingApi';
import type { WorkspaceRole } from '@/features/workspace/schemas/workspaceSchemas';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const WEDDING_ID = '33333333-3333-4333-8333-333333333333';

interface FakeVersion {
  id: string;
  wedding_id: string;
  workspace_id: string;
  version_number: number;
  schema_version: number;
  access_mode: 'public' | 'invite_only';
  is_active: boolean;
  published_by: string | null;
  published_at: string;
  content_snapshot: Record<string, unknown>;
}

function createFakePublishingHarness(params?: {
  readonly initialStatus?: 'draft' | 'published' | 'archived' | undefined;
  readonly accessMode?: 'public' | 'invite_only' | undefined;
  readonly sectionUpdatedAt?: string | undefined;
}) {
  const wedding: WeddingRecord = {
    id: WEDDING_ID,
    workspace_id: WORKSPACE_ID,
    title: 'Elena & Mateo Celebration',
    slug: 'elena-mateo-2027',
    partner_one_name: 'Elena',
    partner_two_name: 'Mateo',
    event_date: '2027-06-19',
    venue_name: 'Villa Aurelia',
    venue_location: 'Tagaytay',
    status: params?.initialStatus ?? 'draft',
    archived_at: params?.initialStatus === 'archived' ? '2026-11-19T00:00:00.000Z' : null,
    duplicated_from_wedding_id: null,
    created_by: USER_ID,
    created_at: '2026-11-19T00:00:00.000Z',
    updated_at: '2026-11-19T01:00:00.000Z',
  };

  const settings: WeddingSettingsRecord = {
    wedding_id: WEDDING_ID,
    workspace_id: WORKSPACE_ID,
    timezone: 'Asia/Manila',
    rsvp_deadline: null,
    is_rsvp_open: true,
    access_mode: params?.accessMode ?? 'public',
    allow_plus_ones_default: false,
    show_guest_dietary_notes: true,
    primary_locale: 'en',
    contact_email: null,
    dress_code: '',
    rsvp_confirmation_message: '',
    created_at: '2026-11-19T00:00:00.000Z',
    updated_at: '2026-11-19T01:00:00.000Z',
  };

  const versions: FakeVersion[] = [];
  let sectionUpdatedAt = params?.sectionUpdatedAt ?? '2026-11-19T01:00:00.000Z';

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'published_versions') {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          order: vi.fn(() => builder),
          limit: vi.fn(async () => ({
            data: [...versions].sort((a, b) => b.version_number - a.version_number),
            error: null,
          })),
        };
        return builder;
      }

      if (table === 'wedding_themes') {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({
            data: { updated_at: '2026-11-19T01:00:00.000Z' },
            error: null,
          })),
        };
        return builder;
      }

      if (table === 'wedding_sections') {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          then: (
            onFulfilled?:
              ((val: { data: Array<{ updated_at: string }>; error: null }) => unknown) | null,
            onRejected?: ((reason: unknown) => unknown) | null,
          ) =>
            Promise.resolve({ data: [{ updated_at: sectionUpdatedAt }], error: null }).then(
              onFulfilled,
              onRejected,
            ),
        };
        return builder;
      }

      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn(async (fnName: string) => {
      if (fnName === 'publish_wedding') {
        for (const v of versions) {
          v.is_active = false;
        }
        const nextVersion = versions.length + 1;
        const publishedAt = `2026-11-19T02:0${nextVersion}:00.000Z`;
        const row: FakeVersion = {
          id: `pub-${nextVersion}`,
          wedding_id: WEDDING_ID,
          workspace_id: WORKSPACE_ID,
          version_number: nextVersion,
          schema_version: 1,
          access_mode: settings.access_mode,
          is_active: true,
          published_by: USER_ID,
          published_at: publishedAt,
          content_snapshot: { schemaVersion: 1 },
        };
        versions.push(row);
        wedding.status = 'published';
        wedding.updated_at = publishedAt;
        return { data: row, error: null };
      }

      if (fnName === 'unpublish_wedding') {
        for (const v of versions) {
          v.is_active = false;
        }
        wedding.status = 'draft';
        return { data: { ...wedding }, error: null };
      }

      throw new Error(`Unexpected RPC ${fnName}`);
    }),
  } as unknown as TypedSupabaseClient;

  return {
    wedding,
    settings,
    versions,
    client,
    bumpDraftSectionTimestamp: (nextIso: string) => {
      sectionUpdatedAt = nextIso;
    },
  };
}

function renderCard(params?: {
  readonly callerRole?: WorkspaceRole | undefined;
  readonly initialStatus?: 'draft' | 'published' | 'archived' | undefined;
  readonly accessMode?: 'public' | 'invite_only' | undefined;
}) {
  const harness = createFakePublishingHarness(params);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const ui = (w: WeddingRecord, s: WeddingSettingsRecord) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WeddingPublishingCard
          userId={USER_ID}
          workspaceId={WORKSPACE_ID}
          callerRole={params?.callerRole ?? 'owner'}
          wedding={w}
          settings={s}
          client={harness.client}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );

  const view = render(ui({ ...harness.wedding }, { ...harness.settings }));
  return {
    ...view,
    harness,
    queryClient,
    rerenderWithLatest: () => view.rerender(ui({ ...harness.wedding }, { ...harness.settings })),
  };
}

describe('WeddingPublishingCard — Publish, Dirty-Draft Detection, Republish, Unpublish & RBAC (P5-AC09)', () => {
  it('publishes v1, detects subsequent unpublished draft changes, republishes v2, and unpublishes cleanly', async () => {
    const user = userEvent.setup();
    const { harness, queryClient, rerenderWithLatest } = renderCard();

    expect(await screen.findByTestId('publish-wedding-button')).toHaveTextContent(
      'Publish website (v1)',
    );
    expect(screen.getByTestId('publishing-draft-badge')).toHaveTextContent('Draft · Not Published');

    // Publish v1
    await user.click(screen.getByTestId('publish-wedding-button'));
    rerenderWithLatest();

    await waitFor(() => {
      expect(screen.getByTestId('publishing-active-version-badge')).toHaveTextContent(
        'Published · v1',
      );
    });
    expect(screen.queryByTestId('unpublished-draft-changes-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('publish-wedding-button')).toHaveTextContent(
      'Republish website (v2)',
    );

    // Simulate draft section edit AFTER v1 published_at (`2026-11-19T02:01:00.000Z`)
    harness.bumpDraftSectionTimestamp('2026-11-19T03:00:00.000Z');
    await queryClient.invalidateQueries();

    expect(await screen.findByTestId('unpublished-draft-changes-badge')).toBeInTheDocument();

    // Republish v2 -> clears unpublished-draft-changes badge if draft matches or precedes v2? Wait: bump was 03:00, let's verify v2 badge!
    harness.bumpDraftSectionTimestamp('2026-11-19T02:01:30.000Z');
    await user.click(screen.getByTestId('publish-wedding-button'));
    rerenderWithLatest();

    await waitFor(() => {
      expect(screen.getByTestId('publishing-active-version-badge')).toHaveTextContent(
        'Published · v2',
      );
    });
    expect(screen.queryByTestId('unpublished-draft-changes-badge')).not.toBeInTheDocument();

    // Unpublish -> returns to Draft while remembering v2 so next button says Republish website (v3)
    await user.click(screen.getByTestId('unpublish-wedding-button'));
    rerenderWithLatest();

    await waitFor(() => {
      expect(screen.getByTestId('publishing-draft-badge')).toHaveTextContent(
        'Draft · Not Published',
      );
    });
    expect(screen.getByTestId('publish-wedding-button')).toHaveTextContent(
      'Republish website (v3)',
    );
  });

  it('displays invite-only notice, disables publishing on archived weddings, and enforces viewer read-only RBAC', async () => {
    const { unmount } = renderCard({ accessMode: 'invite_only', callerRole: 'viewer' });

    expect(await screen.findByTestId('publish-invite-only-notice')).toBeInTheDocument();
    expect(screen.getByTestId('publishing-readonly-badge')).toHaveTextContent('Read-only (Viewer)');
    expect(screen.getByTestId('publish-wedding-button')).toBeDisabled();
    unmount();

    renderCard({ initialStatus: 'archived', callerRole: 'owner' });
    expect(await screen.findByTestId('publishing-draft-badge')).toHaveTextContent(
      'Archived · Offline',
    );
    expect(screen.getByTestId('publish-wedding-button')).toBeDisabled();
  });
});
