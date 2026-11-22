import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicLayout } from '@/app/layouts/PublicLayout';
import { createStarterInvitationDocument } from '@/features/design/registry/sectionRegistry';
import { ROUTES } from '@/lib/constants/routes';
import * as organizerClientModule from '@/lib/supabase/organizerClient';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';
import { PublicInvitationShellPage } from '@/portals/public/PublicInvitationShellPage';

afterEach(() => {
  vi.restoreAllMocks();
  organizerClientModule.resetOrganizerSupabaseClientForTests();
});

function renderPublicInvitationRoute(invitationPath: string, rpcResponse: unknown) {
  const rpcMock = vi.fn(async () => ({ data: rpcResponse, error: null }));
  const mockPublicClient = {
    rpc: rpcMock,
  } as unknown as TypedSupabaseClient;

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const router = createMemoryRouter(
    [
      {
        element: <PublicLayout />,
        children: [
          {
            path: ROUTES.home,
            element: <div data-testid="home-stub">Home</div>,
          },
          {
            path: ROUTES.publicInvitation,
            element: <PublicInvitationShellPage client={mockPublicClient} />,
          },
        ],
      },
    ],
    { initialEntries: [invitationPath] },
  );

  return {
    rpcMock,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

describe('PublicInvitationShellPage — /i/:token Verification & Zero-Echo Isolation (P6-AC10, P6-AC11, P6-AC12)', () => {
  it('unlocks an active household invitation (including invite_only celebrations) without echoing the raw token or touching organizerClient', async () => {
    const user = userEvent.setup();
    const secretRawToken = 'SecretHouseholdToken256BitBase64Url_9876543';

    const snapshot = createStarterInvitationDocument({
      presetId: 'celestial_midnight',
      dressCode: 'Black Tie Optional',
      wedding: {
        title: 'Noelle & Julian Private Gala',
        partnerOneName: 'Noelle',
        partnerTwoName: 'Julian',
        slug: 'noelle-julian-private',
        eventDate: '2027-09-18',
        venueName: 'Private Cliffside Villa',
        venueLocation: 'Cebu',
        timezone: 'Asia/Manila',
        rsvpDeadline: '2027-08-15T15:59:00.000Z',
        isRsvpOpen: true,
      },
    });

    const { container, rpcMock } = renderPublicInvitationRoute(`/i/${secretRawToken}`, {
      status: 'active',
      versionNumber: 1,
      publishedAt: '2026-11-19T15:30:00.000Z',
      snapshot,
      household: {
        displayName: 'The Santos Household',
        maxAttendees: 3,
        expiresAt: null,
        guests: [
          {
            id: '11111111-2222-4333-8444-555555555551',
            firstName: 'Marco',
            lastName: 'Santos',
            isChild: false,
            dietaryNotes: 'Nut-free',
          },
          {
            id: '11111111-2222-4333-8444-555555555552',
            firstName: 'Lucia',
            lastName: 'Santos',
            isChild: true,
            dietaryNotes: '',
          },
        ],
      },
    });

    expect(await screen.findByTestId('public-invitation-household-card')).toBeInTheDocument();
    expect(screen.getByTestId('public-invitation-welcome-heading')).toHaveTextContent(
      'Welcome, The Santos Household',
    );
    expect(screen.getByTestId('public-invitation-capacity-badge')).toHaveTextContent(
      'Reserved for up to 3 guests',
    );
    expect(screen.getByTestId('public-invitation-guest-list')).toHaveTextContent('Marco Santos');
    expect(screen.getByTestId('public-invitation-guest-list')).toHaveTextContent('Lucia Santos');
    expect(screen.getByTestId('invitation-renderer')).toHaveAttribute(
      'data-theme-preset',
      'celestial_midnight',
    );
    expect(document.title).toContain('The Santos Household');
    expect(rpcMock).toHaveBeenCalledWith('resolve_invitation_by_token', {
      p_token: secretRawToken,
    });

    await user.click(screen.getByTestId('invitation-hero-cta'));
    expect(screen.getByTestId('public-invitation-rsvp-status-banner')).toHaveTextContent(
      /Household RSVP Verified/i,
    );

    expect(container.innerHTML).not.toContain(secretRawToken);
    expect(organizerClientModule.hasInitializedOrganizerSupabaseClient()).toBe(false);
  });

  it('renders Invitation Link Unavailable for revoked, expired, or unknown tokens without echoing the token', async () => {
    const revokedToken = 'RevokedHouseholdToken256BitBase64Url_1122334';
    const { container } = renderPublicInvitationRoute(`/i/${revokedToken}`, {
      status: 'unavailable',
    });

    expect(await screen.findByTestId('public-invitation-unavailable')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Invitation Link Unavailable/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('invitation-renderer')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain(revokedToken);
    expect(organizerClientModule.hasInitializedOrganizerSupabaseClient()).toBe(false);
  });

  it('rejects malformed tokens synchronously with zero RPC calls and zero DOM echo', () => {
    const malformed = 'short-bad-token-991';
    const { container, rpcMock } = renderPublicInvitationRoute(`/i/${malformed}`, {
      status: 'unavailable',
    });

    expect(screen.getByTestId('public-invitation-invalid-token')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain(malformed);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('hides the raw platform header (env badge, Organizer Sign In) and generic footer on /i/:token and renders the Royal Botanical envelope cleanly', async () => {
    const validToken = 'RoyalBotanicalHouseholdToken256BitBase64_12345';
    const snapshot = createStarterInvitationDocument({
      presetId: 'royal_botanical',
      dressCode: 'Dress in Comfort & Joy',
      wedding: {
        title: 'Sherwin & Jelly',
        partnerOneName: 'Sherwin',
        partnerTwoName: 'Jelly',
        slug: 'sherwin-jelly-2027',
        eventDate: '2027-01-25',
        venueName: "La Terrazzas by Loiza's",
        venueLocation: 'Malaybalay City, Bukidnon',
        timezone: 'Asia/Manila',
        rsvpDeadline: '2026-12-20T15:59:00.000Z',
        isRsvpOpen: true,
      },
    });

    renderPublicInvitationRoute(`/i/${validToken}`, {
      status: 'active',
      versionNumber: 1,
      publishedAt: '2026-11-22T14:00:00.000Z',
      snapshot,
      household: {
        displayName: 'The Reyes Family',
        maxAttendees: 2,
        expiresAt: null,
        guests: [
          {
            id: '11111111-2222-4333-8444-555555555551',
            firstName: 'Ana',
            lastName: 'Reyes',
            isChild: false,
            dietaryNotes: '',
          },
        ],
      },
    });

    expect(await screen.findByTestId('royal-botanical-envelope-stage')).toBeInTheDocument();
    expect(screen.queryByTestId('env-badge')).not.toBeInTheDocument();
    expect(screen.queryByText(/Organizer Sign In/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Digital Wedding Invitation & RSVP Platform/i),
    ).not.toBeInTheDocument();
  });
});
