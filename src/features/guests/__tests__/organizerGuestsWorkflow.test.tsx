import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as organizerGuestsApi from '@/features/guests/api/organizerGuestsApi';
import { WeddingGuestDirectoryManager } from '@/features/guests/components/WeddingGuestDirectoryManager';
import type {
  SafeInvitationRow,
  WeddingGuestDirectory,
} from '@/features/guests/schemas/guestSchemas';
import type { Tables } from '@/types/database.types';

const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
const TEST_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const TEST_WEDDING: Tables<'weddings'> = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: TEST_WORKSPACE_ID,
  title: 'Clara & Mateo Celebration',
  partner_one_name: 'Clara',
  partner_two_name: 'Mateo',
  slug: 'clara-mateo-2027',
  event_date: '2027-06-12',
  venue_name: 'Glass Conservatory',
  venue_location: 'Manila',
  status: 'published',
  archived_at: null,
  duplicated_from_wedding_id: null,
  created_by: TEST_USER_ID,
  created_at: '2026-11-19T14:00:00.000Z',
  updated_at: '2026-11-19T14:00:00.000Z',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WeddingGuestDirectoryManager — Households, CSV Import, QR Issuance & RBAC (P6-AC07..09, P6-AC12)', () => {
  it('supports CSV preview & atomic import, one-time 256-bit link + vector <QRCodeSVG /> issuance, and instant revocation', async () => {
    const user = userEvent.setup();

    let state: WeddingGuestDirectory = {
      households: [],
      totalHouseholds: 0,
      totalGuests: 0,
      totalCapacity: 0,
      activeLinksCount: 0,
      sharedLinksCount: 0,
    };

    const groupId = '44444444-4444-4444-8444-444444444444';
    const invId = '55555555-5555-4555-8555-555555555555';
    const issuedRawToken = 'OneTimeIssued256BitBase64UrlToken_012345678';

    vi.spyOn(organizerGuestsApi, 'fetchWeddingGuestDirectory').mockImplementation(
      async () => state,
    );

    vi.spyOn(organizerGuestsApi, 'importOrganizerWeddingGuests').mockImplementation(async () => {
      state = {
        households: [
          {
            group: {
              id: groupId,
              wedding_id: TEST_WEDDING.id,
              workspace_id: TEST_WORKSPACE_ID,
              display_name: 'The Rivera Family',
              max_attendees: 4,
              notes: 'Bride college table',
              sort_order: 0,
              created_by: TEST_USER_ID,
              created_at: '2026-11-19T15:00:00.000Z',
              updated_at: '2026-11-19T15:00:00.000Z',
            },
            guests: [
              {
                id: '66666666-6666-4666-8666-666666666666',
                group_id: groupId,
                wedding_id: TEST_WEDDING.id,
                workspace_id: TEST_WORKSPACE_ID,
                first_name: 'Elena',
                last_name: 'Rivera',
                email: 'elena@example.com',
                phone: '+63 917 555 0101',
                side: 'partner_one',
                is_child: false,
                dietary_notes: 'Vegetarian',
                sort_order: 0,
                created_at: '2026-11-19T15:00:00.000Z',
                updated_at: '2026-11-19T15:00:00.000Z',
              },
            ],
            activeInvitation: null,
            revokedCount: 0,
          },
        ],
        totalHouseholds: 1,
        totalGuests: 1,
        totalCapacity: 4,
        activeLinksCount: 0,
        sharedLinksCount: 0,
      };
      return { importedGroupCount: 1, importedGuestCount: 1 };
    });

    vi.spyOn(organizerGuestsApi, 'issueOrganizerHouseholdInvitation').mockImplementation(
      async () => {
        const activeInvitation: SafeInvitationRow = {
          id: invId,
          group_id: groupId,
          wedding_id: TEST_WEDDING.id,
          workspace_id: TEST_WORKSPACE_ID,
          status: 'active',
          delivery_status: 'not_shared',
          expires_at: null,
          revoked_at: null,
          issued_by: TEST_USER_ID,
          created_at: '2026-11-19T15:05:00.000Z',
          updated_at: '2026-11-19T15:05:00.000Z',
        };
        state = {
          ...state,
          activeLinksCount: 1,
          households: state.households.map((item) => ({
            ...item,
            activeInvitation,
          })),
        };
        return {
          rawToken: issuedRawToken,
          invitation: activeInvitation,
        };
      },
    );

    vi.spyOn(organizerGuestsApi, 'revokeOrganizerHouseholdInvitation').mockImplementation(
      async () => {
        const revoked: SafeInvitationRow = {
          id: invId,
          group_id: groupId,
          wedding_id: TEST_WEDDING.id,
          workspace_id: TEST_WORKSPACE_ID,
          status: 'revoked',
          delivery_status: 'not_shared',
          expires_at: null,
          revoked_at: '2026-11-19T15:10:00.000Z',
          issued_by: TEST_USER_ID,
          created_at: '2026-11-19T15:05:00.000Z',
          updated_at: '2026-11-19T15:10:00.000Z',
        };
        state = {
          ...state,
          activeLinksCount: 0,
          households: state.households.map((item) => ({
            ...item,
            activeInvitation: null,
            revokedCount: 1,
          })),
        };
        return revoked;
      },
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <WeddingGuestDirectoryManager
          userId={TEST_USER_ID}
          workspaceId={TEST_WORKSPACE_ID}
          callerRole="editor"
          wedding={TEST_WEDDING}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('guests-empty-state')).toBeInTheDocument();

    // Open CSV bulk import, load sample rows, and commit atomic import
    await user.click(screen.getByTestId('toggle-csv-import-button'));
    await user.click(screen.getByTestId('csv-load-sample-inline-button'));
    expect(await screen.findByTestId('csv-validation-ready')).toBeInTheDocument();
    await user.click(screen.getByTestId('csv-commit-import-button'));

    expect(await screen.findByTestId(`household-card-${groupId}`)).toBeInTheDocument();
    expect(screen.getByTestId('metric-total-households')).toHaveTextContent('1');
    expect(screen.getByTestId('metric-total-capacity')).toHaveTextContent('4');

    // Issue 256-bit link & vector QR code
    await user.click(screen.getByTestId(`issue-invitation-${groupId}`));
    expect(await screen.findByTestId('issued-invitation-qr-card')).toBeInTheDocument();

    const urlInput = screen.getByTestId('issued-invitation-url-input') as HTMLInputElement;
    expect(urlInput.value).toContain(`/i/${issuedRawToken}`);

    const qrWrapper = screen.getByTestId('issued-invitation-qr-svg');
    expect(qrWrapper.querySelector('svg')).not.toBeNull();

    // Revoke link -> hides one-time QR card and marks household No Active Link
    await user.click(screen.getByTestId(`revoke-invitation-${groupId}`));
    expect(await screen.findByTestId(`inv-status-${groupId}`)).toHaveTextContent('No Active Link');
    expect(screen.queryByTestId('issued-invitation-qr-card')).not.toBeInTheDocument();
  });

  it('enforces strict read-only UX when callerRole is viewer', async () => {
    vi.spyOn(organizerGuestsApi, 'fetchWeddingGuestDirectory').mockResolvedValue({
      households: [],
      totalHouseholds: 0,
      totalGuests: 0,
      totalCapacity: 0,
      activeLinksCount: 0,
      sharedLinksCount: 0,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <WeddingGuestDirectoryManager
          userId={TEST_USER_ID}
          workspaceId={TEST_WORKSPACE_ID}
          callerRole="viewer"
          wedding={TEST_WEDDING}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('guests-viewer-readonly-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('open-create-household-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('toggle-csv-import-button')).not.toBeInTheDocument();
  });
});
