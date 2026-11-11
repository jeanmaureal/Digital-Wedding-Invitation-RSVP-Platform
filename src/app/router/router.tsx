import { createBrowserRouter, type RouteObject } from 'react-router';
import { PublicLayout } from '@/app/layouts/PublicLayout';
import { ROUTES } from '@/lib/constants/routes';
import { NotFoundPage } from '@/portals/public/NotFoundPage';
import { PublicHomePage } from '@/portals/public/PublicHomePage';
import { PublicInvitationShellPage } from '@/portals/public/PublicInvitationShellPage';
import { PublicWeddingShellPage } from '@/portals/public/PublicWeddingShellPage';

export const appRoutes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      {
        path: ROUTES.home,
        element: <PublicHomePage />,
      },
      {
        path: ROUTES.publicWedding,
        element: <PublicWeddingShellPage />,
      },
      {
        path: ROUTES.publicInvitation,
        element: <PublicInvitationShellPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
  {
    path: ROUTES.organizerRoot,
    HydrateFallback: () => (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center text-sm">
        Loading organizer workspace…
      </div>
    ),
    lazy: async () => {
      const { OrganizerLayout } = await import('@/app/layouts/OrganizerLayout');
      return { Component: OrganizerLayout };
    },
    children: [
      {
        index: true,
        lazy: async () => {
          const { OrganizerDashboardShellPage } =
            await import('@/portals/organizer/OrganizerDashboardShellPage');
          return { Component: OrganizerDashboardShellPage };
        },
      },
    ],
  },
];

export const appRouter = createBrowserRouter(appRoutes);
