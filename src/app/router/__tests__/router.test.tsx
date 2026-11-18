import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers/AppProviders';
import { appRoutes } from '@/app/router/router';
import * as organizerClientModule from '@/lib/supabase/organizerClient';

afterEach(() => {
  vi.restoreAllMocks();
  organizerClientModule.resetOrganizerSupabaseClientForTests();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function renderRoute(initialPath: string) {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [initialPath],
  });
  return {
    router,
    ...render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    ),
  };
}

describe('appRoutes portal boundaries & organizer isolation (P0-AC01, P1-AC06, P1-AC14)', () => {
  it('renders PublicHomePage inside PublicLayout on / without initializing organizerClient', () => {
    renderRoute('/');
    expect(screen.getByTestId('public-shell')).toBeInTheDocument();
    expect(screen.getByTestId('route-public-home')).toBeInTheDocument();
    expect(screen.queryByTestId('organizer-shell')).not.toBeInTheDocument();
    expect(organizerClientModule.hasInitializedOrganizerSupabaseClient()).toBe(false);
  });

  it('redirects unauthenticated /app visits to /app/login inside OrganizerLayout', async () => {
    vi.spyOn(organizerClientModule, 'getOrganizerSupabaseClient').mockReturnValue(null);
    const { router } = renderRoute('/app');

    expect(await screen.findByTestId('organizer-shell')).toBeInTheDocument();
    expect(await screen.findByTestId('route-organizer-login')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app/login');
    expect(router.state.location.search).toBe('');
    expect(screen.queryByTestId('public-shell')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated /app/settings visits to /app/login with encoded redirectTo', async () => {
    vi.spyOn(organizerClientModule, 'getOrganizerSupabaseClient').mockReturnValue(null);
    const { router } = renderRoute('/app/settings?tab=members');

    expect(await screen.findByTestId('route-organizer-login')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app/login');
    expect(router.state.location.search).toBe('?redirectTo=%2Fapp%2Fsettings%3Ftab%3Dmembers');
  });

  it('redirects unauthenticated /app/weddings/:weddingId deep links to /app/login with encoded redirectTo (P2-AC11)', async () => {
    vi.spyOn(organizerClientModule, 'getOrganizerSupabaseClient').mockReturnValue(null);
    const { router } = renderRoute('/app/weddings/11111111-2222-4333-8444-555555555555');

    expect(await screen.findByTestId('route-organizer-login')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app/login');
    expect(router.state.location.search).toBe(
      '?redirectTo=%2Fapp%2Fweddings%2F11111111-2222-4333-8444-555555555555',
    );
  });

  it('renders safe unavailable state on /w/test without initializing organizerClient', () => {
    renderRoute('/w/test');
    expect(screen.getByTestId('public-shell')).toBeInTheDocument();
    expect(screen.getByTestId('route-public-wedding')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /invitation not yet available/i }),
    ).toBeInTheDocument();
    expect(organizerClientModule.hasInitializedOrganizerSupabaseClient()).toBe(false);
  });

  it('renders invalid link notice for malformed slugs without echoing unsanitized input', () => {
    const malformedSlug = 'INVALID_SLUG_999';
    renderRoute(`/w/${malformedSlug}`);
    expect(screen.getByRole('heading', { name: /invalid wedding link/i })).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(malformedSlug))).not.toBeInTheDocument();
    expect(organizerClientModule.hasInitializedOrganizerSupabaseClient()).toBe(false);
  });

  it('renders Guest RSVP Access shell on /i/:token without echoing the raw token or touching organizer auth', () => {
    const rawToken = 'guest-private-token-do-not-echo-8472';
    const { container } = renderRoute(`/i/${rawToken}`);
    expect(screen.getByTestId('public-shell')).toBeInTheDocument();
    expect(screen.getByTestId('route-public-invitation')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain(rawToken);
    expect(organizerClientModule.hasInitializedOrganizerSupabaseClient()).toBe(false);
  });

  it('renders NotFoundPage on unmatched paths without initializing organizerClient', () => {
    renderRoute('/nonexistent-route');
    expect(screen.getByTestId('route-not-found')).toBeInTheDocument();
    expect(organizerClientModule.hasInitializedOrganizerSupabaseClient()).toBe(false);
  });
});
