import { createBrowserRouter, type RouteObject } from 'react-router';
import { OrganizerLayout } from '@/app/layouts/OrganizerLayout';
import { PublicLayout } from '@/app/layouts/PublicLayout';
import { ROUTES } from '@/lib/constants/routes';
import { OrganizerDashboardShellPage } from '@/portals/organizer/OrganizerDashboardShellPage';
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
    element: <OrganizerLayout />,
    children: [
      {
        index: true,
        element: <OrganizerDashboardShellPage />,
      },
    ],
  },
];

export const appRouter = createBrowserRouter(appRoutes);
