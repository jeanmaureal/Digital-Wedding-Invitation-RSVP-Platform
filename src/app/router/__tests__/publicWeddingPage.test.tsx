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
import { PublicWeddingShellPage } from '@/portals/public/PublicWeddingShellPage';

afterEach(() => {
  vi.restoreAllMocks();
  organizerClientModule.resetOrganizerSupabaseClientForTests();
});

function renderPublicSlugRoute(slugPath: string, rpcResponse: unknown) {
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
            path: ROUTES.publicWedding,
            element: <PublicWeddingShellPage client={mockPublicClient} />,
          },
        ],
      },
    ],
    { initialEntries: [slugPath] },
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

describe('PublicWeddingShellPage — /w/:slug Snapshot Rendering & Gate 4 Isolation (P5-AC07, P5-AC08)', () => {
  it('renders an active published snapshot through <InvitationRenderer /> via publicClient without touching organizerClient', async () => {
    const user = userEvent.setup();
    const snapshot = createStarterInvitationDocument({
      presetId: 'garden_sage',
      dressCode: 'Garden Cocktail',
      wedding: {
        title: "Elena & Mateo's Wedding",
        partnerOneName: 'Elena',
        partnerTwoName: 'Mateo',
        slug: 'elena-mateo-2027',
        eventDate: '2027-06-19',
        venueName: 'Villa Aurelia',
        venueLocation: 'Tagaytay Highlands',
        timezone: 'Asia/Manila',
        rsvpDeadline: '2027-05-15T15:59:00.000Z',
        isRsvpOpen: true,
      },
    });

    const { rpcMock } = renderPublicSlugRoute('/w/elena-mateo-2027', {
      status: 'published',
      versionNumber: 2,
      publishedAt: '2026-11-19T14:00:00.000Z',
      snapshot,
    });

    expect(await screen.findByTestId('invitation-renderer')).toHaveAttribute(
      'data-theme-preset',
      'garden_sage',
    );
    expect(screen.getByTestId('route-public-wedding')).toHaveAttribute(
      'data-published-version',
      '2',
    );
    expect(screen.getByTestId('invitation-hero-headline')).toHaveTextContent('Elena & Mateo');
    expect(document.title).toContain("Elena & Mateo's Wedding");
    expect(rpcMock).toHaveBeenCalledWith('get_public_wedding_by_slug', {
      p_slug: 'elena-mateo-2027',
    });

    // Clicking primary RSVP CTA opens household invitation link guidance
    await user.click(screen.getByTestId('invitation-hero-cta'));
    expect(screen.getByTestId('public-rsvp-guidance-card')).toHaveTextContent(
      /Responding for Your Household/i,
    );

    expect(organizerClientModule.hasInitializedOrganizerSupabaseClient()).toBe(false);
  });

  it('renders Private Wedding Celebration without leaking snapshot details when access_mode is invite_only (P5-AC05, P5-AC07)', async () => {
    renderPublicSlugRoute('/w/private-gala', {
      status: 'invite_only',
    });

    expect(await screen.findByTestId('public-wedding-invite-only')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Private Wedding Celebration/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('invitation-renderer')).not.toBeInTheDocument();
    expect(organizerClientModule.hasInitializedOrganizerSupabaseClient()).toBe(false);
  });

  it('renders Invitation Not Yet Available for unpublished or unknown slugs and rejects schema-tampered snapshots safely', async () => {
    const { unmount } = renderPublicSlugRoute('/w/unpublished-draft', {
      status: 'unavailable',
    });

    expect(await screen.findByTestId('public-wedding-unavailable')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Invitation Not Yet Available/i }),
    ).toBeInTheDocument();
    unmount();

    renderPublicSlugRoute('/w/tampered-snapshot', {
      status: 'published',
      versionNumber: 1,
      publishedAt: '2026-11-19T14:00:00.000Z',
      snapshot: {
        schemaVersion: 1,
        unexpectedInjectedField: '<script>alert(1)</script>',
      },
    });

    expect(await screen.findByTestId('public-wedding-error')).toBeInTheDocument();
    expect(screen.queryByTestId('invitation-renderer')).not.toBeInTheDocument();
  });

  it('rejects malformed slugs synchronously with zero RPC calls and without echoing unsanitized input', () => {
    const { rpcMock } = renderPublicSlugRoute('/w/BAD_SLUG_XSS', { status: 'unavailable' });

    expect(screen.getByTestId('public-wedding-invalid-slug')).toBeInTheDocument();
    expect(screen.queryByText(/BAD_SLUG_XSS/)).not.toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
