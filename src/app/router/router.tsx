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
      const { OrganizerPortalRoot } = await import('@/portals/organizer/OrganizerPortalRoot');
      return { Component: OrganizerPortalRoot };
    },
    children: [
      {
        lazy: async () => {
          const { RequireOrganizerAuth } =
            await import('@/features/auth/components/RequireOrganizerAuth');
          return { Component: RequireOrganizerAuth };
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
          {
            path: 'settings',
            lazy: async () => {
              const { OrganizerSettingsShellPage } =
                await import('@/portals/organizer/OrganizerSettingsShellPage');
              return { Component: OrganizerSettingsShellPage };
            },
          },
        ],
      },
      {
        lazy: async () => {
          const { RedirectIfOrganizerAuthenticated } =
            await import('@/features/auth/components/RedirectIfOrganizerAuthenticated');
          return { Component: RedirectIfOrganizerAuthenticated };
        },
        children: [
          {
            path: 'login',
            lazy: async () => {
              const { OrganizerLoginPage } =
                await import('@/portals/organizer/auth/OrganizerLoginPage');
              return { Component: OrganizerLoginPage };
            },
          },
          {
            path: 'signup',
            lazy: async () => {
              const { OrganizerSignupPage } =
                await import('@/portals/organizer/auth/OrganizerSignupPage');
              return { Component: OrganizerSignupPage };
            },
          },
          {
            path: 'forgot-password',
            lazy: async () => {
              const { OrganizerForgotPasswordPage } =
                await import('@/portals/organizer/auth/OrganizerForgotPasswordPage');
              return { Component: OrganizerForgotPasswordPage };
            },
          },
        ],
      },
      {
        path: 'reset-password',
        lazy: async () => {
          const { OrganizerResetPasswordPage } =
            await import('@/portals/organizer/auth/OrganizerResetPasswordPage');
          return { Component: OrganizerResetPasswordPage };
        },
      },
    ],
  },
];

export const appRouter = createBrowserRouter(appRoutes);
