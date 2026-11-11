import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { appRoutes } from '@/app/router/router';

function renderRoute(initialPath: string) {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [initialPath],
  });
  return render(<RouterProvider router={router} />);
}

describe('appRoutes portal boundaries', () => {
  it('renders PublicHomePage inside PublicLayout on /', () => {
    renderRoute('/');
    expect(screen.getByTestId('public-shell')).toBeInTheDocument();
    expect(screen.getByTestId('route-public-home')).toBeInTheDocument();
    expect(screen.queryByTestId('organizer-shell')).not.toBeInTheDocument();
  });

  it('renders OrganizerDashboardShellPage inside OrganizerLayout on /app', () => {
    renderRoute('/app');
    expect(screen.getByTestId('organizer-shell')).toBeInTheDocument();
    expect(screen.getByTestId('route-organizer-root')).toBeInTheDocument();
    expect(screen.queryByTestId('public-shell')).not.toBeInTheDocument();
  });

  it('renders safe unavailable state for valid slug format on /w/test without exposing private data', () => {
    renderRoute('/w/test');
    expect(screen.getByTestId('public-shell')).toBeInTheDocument();
    expect(screen.getByTestId('route-public-wedding')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /invitation not yet available/i }),
    ).toBeInTheDocument();
  });

  it('renders invalid link notice for malformed slugs without echoing unsanitized input', () => {
    const malformedSlug = 'INVALID_SLUG_999';
    renderRoute(`/w/${malformedSlug}`);
    expect(screen.getByRole('heading', { name: /invalid wedding link/i })).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(malformedSlug))).not.toBeInTheDocument();
  });

  it('renders Guest RSVP Access shell on /i/:token without echoing the raw token', () => {
    const rawToken = 'guest-private-token-do-not-echo-8472';
    const { container } = renderRoute(`/i/${rawToken}`);
    expect(screen.getByTestId('public-shell')).toBeInTheDocument();
    expect(screen.getByTestId('route-public-invitation')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain(rawToken);
  });

  it('renders NotFoundPage on unmatched paths', () => {
    renderRoute('/nonexistent-route');
    expect(screen.getByTestId('route-not-found')).toBeInTheDocument();
  });
});
