import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { PublicationVersionHistoryCard } from '@/features/publishing/components/PublicationVersionHistoryCard';
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
  published_by_name: string;
  published_at: string;
  content_snapshot: Record<string, unknown>;
}

function buildValidSnapshot(versionNumber: number): Record<string, unknown> {
  return {
    schemaVersion: 1,
    wedding: {
      title: 'Elena & Mateo Celebration',
      partnerOneName: 'Elena',
      partnerTwoName: 'Mateo',
      slug: 'elena-mateo-2027',
      eventDate: '2027-06-19',
      venueName: 'Villa Aurelia',
      venueLocation: 'Tagaytay',
      timezone: 'Asia/Manila',
      rsvpDeadline: null,
      isRsvpOpen: true,
    },
    theme: {
      schemaVersion: 1,
      presetId: versionNumber === 1 ? 'editorial_ivory' : 'celestial_midnight',
      tokenOverrides: {},
    },
    sections: [
      {
        id: 'sec-hero-1',
        sectionType: 'hero',
        sortOrder: 0,
        isVisible: true,
        schemaVersion: 1,
        content: {
          eyebrow: 'Together with their families',
          coupleHeadline: `Snapshot Headline v${versionNumber}`,
          celebrationSubtitle: 'Join us in Tagaytay',
          displayDateLabel: 'June 19, 2027',
          locationSummary: 'Villa Aurelia',
          primaryCtaLabel: 'RSVP',
          showCountdownBadge: false,
          alignment: 'center',
        },
      },
    ],
  };
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
    rpc: vi.fn(async (fnName: string, args?: Record<string, unknown>) => {
      if (fnName === 'publish_wedding') {
        for (const v of versions) {
          v.is_active = false;
        }
        const maxVersion = versions.reduce((acc, v) => Math.max(acc, v.version_number), 0);
        const nextVersion = maxVersion + 1;
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
          published_by_name: 'Elena Vance',
          published_at: publishedAt,
          content_snapshot: buildValidSnapshot(nextVersion),
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

      if (fnName === 'list_wedding_published_versions') {
        const ordered = [...versions]
          .sort((a, b) => b.version_number - a.version_number)
          .map((v) => ({
            id: v.id,
            weddingId: v.wedding_id,
            workspaceId: v.workspace_id,
            versionNumber: v.version_number,
            schemaVersion: v.schema_version,
            accessMode: v.access_mode,
            isActive: v.is_active,
            publishedAt: v.published_at,
            publishedBy: v.published_by,
            publishedByName: v.published_by_name,
            contentSnapshot: v.content_snapshot,
          }));
        return { data: ordered, error: null };
      }

      if (fnName === 'rollback_wedding_published_version') {
        const targetNum = Number(args?.p_target_version_number);
        const target = versions.find((v) => v.version_number === targetNum);
        if (!target) {
          return {
            data: null,
            error: {
              code: 'P0002',
              message: `PUBLISHED_VERSION_NOT_FOUND: Snapshot v${targetNum} not found`,
            },
          };
        }
        for (const v of versions) {
          v.is_active = v.version_number === targetNum;
        }
        wedding.status = 'published';
        return { data: { ...target }, error: null };
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

function renderPublishingStack(params?: {
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
        <PublicationVersionHistoryCard
          userId={USER_ID}
          workspaceId={WORKSPACE_ID}
          callerRole={params?.callerRole ?? 'owner'}
          wedding={w}
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

describe('WeddingPublishingCard & PublicationVersionHistoryCard — Publish, Preview, Rollback & RBAC (P5-AC09, P8-AC06)', () => {
  it('publishes v1, detects subsequent unpublished draft changes, republishes v2, previews v1, rolls back to v1, and unpublishes cleanly', async () => {
    const user = userEvent.setup();
    const { harness, queryClient, rerenderWithLatest } = renderPublishingStack();

    expect(await screen.findByTestId('publish-wedding-button')).toHaveTextContent(
      'Publish website (v1)',
    );
    expect(screen.getByTestId('publishing-draft-badge')).toHaveTextContent('Draft · Not Published');
    expect(await screen.findByTestId('version-history-empty')).toBeInTheDocument();

    // Publish v1
    await user.click(screen.getByTestId('publish-wedding-button'));
    rerenderWithLatest();

    await waitFor(() => {
      expect(screen.getByTestId('publishing-active-version-badge')).toHaveTextContent(
        'Published · v1',
      );
    });
    expect(await screen.findByTestId('version-active-badge-1')).toHaveTextContent('Active Live');

    // Simulate draft section edit AFTER v1 published_at (`2026-11-19T02:01:00.000Z`)
    harness.bumpDraftSectionTimestamp('2026-11-19T03:00:00.000Z');
    await queryClient.invalidateQueries();

    expect(await screen.findByTestId('unpublished-draft-changes-badge')).toBeInTheDocument();

    // Republish v2
    harness.bumpDraftSectionTimestamp('2026-11-19T02:01:30.000Z');
    await user.click(screen.getByTestId('publish-wedding-button'));
    rerenderWithLatest();

    await waitFor(() => {
      expect(screen.getByTestId('publishing-active-version-badge')).toHaveTextContent(
        'Published · v2',
      );
    });
    expect(await screen.findByTestId('version-active-badge-2')).toHaveTextContent('Active Live');

    // Preview historical snapshot v1 inside PublicationVersionHistoryCard (Desktop & Mobile)
    await user.click(screen.getByTestId('preview-version-button-1'));
    expect(await screen.findByTestId('version-snapshot-preview-1')).toHaveTextContent(
      'Snapshot Headline v1',
    );
    await user.click(screen.getByTestId('version-preview-mobile-1'));
    expect(screen.getByTestId('invitation-viewport-frame')).toHaveAttribute(
      'data-viewport-mode',
      'mobile',
    );

    // Roll back from v2 to v1 via confirmation panel
    await user.click(screen.getByTestId('open-rollback-version-1'));
    expect(screen.getByTestId('rollback-confirm-panel-1')).toBeInTheDocument();
    await user.click(screen.getByTestId('confirm-rollback-version-1'));
    rerenderWithLatest();

    await waitFor(() => {
      expect(screen.getByTestId('publishing-active-version-badge')).toHaveTextContent(
        'Published · v1',
      );
    });
    expect(screen.getByTestId('publishing-rolled-back-badge')).toHaveTextContent(
      'Rolled back · Latest v2',
    );
    expect(screen.getByTestId('version-active-badge-1')).toHaveTextContent('Active Live');

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

  it('displays invite-only notice, disables publishing/rollback on archived weddings, and enforces viewer read-only RBAC', async () => {
    const { unmount } = renderPublishingStack({
      accessMode: 'invite_only',
      callerRole: 'viewer',
    });

    expect(await screen.findByTestId('publish-invite-only-notice')).toBeInTheDocument();
    expect(screen.getByTestId('publishing-readonly-badge')).toHaveTextContent('Read-only (Viewer)');
    expect(screen.getByTestId('version-history-readonly-badge')).toHaveTextContent(
      'Read-only (Viewer)',
    );
    expect(screen.getByTestId('publish-wedding-button')).toBeDisabled();
    unmount();

    renderPublishingStack({ initialStatus: 'archived', callerRole: 'owner' });
    expect(await screen.findByTestId('publishing-draft-badge')).toHaveTextContent(
      'Archived · Offline',
    );
    expect(screen.getByTestId('publish-wedding-button')).toBeDisabled();
  });
});
