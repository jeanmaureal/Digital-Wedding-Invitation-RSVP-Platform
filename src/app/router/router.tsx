import { createBrowserRouter, type RouteObject } from 'react-router';
import { PublicLayout } from '@/app/layouts/PublicLayout';
import { ROUTES } from '@/lib/constants/routes';
import { NotFoundPage } from '@/portals/public/NotFoundPage';
import { PublicHomePage } from '@/portals/public/PublicHomePage';
import { PublicInvitationShellPage } from '@/portals/public/PublicInvitationShellPage';

export const appRoutes: RouteObject[] = [
  {
    element: <PublicLayout />,
    HydrateFallback: () => (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center text-sm">
        Loading wedding website…
      </div>
    ),
    children: [
      {
        path: ROUTES.home,
        element: <PublicHomePage />,
      },
      {
        path: ROUTES.publicWedding,
        lazy: async () => {
          const { PublicWeddingShellPage } =
            await import('@/portals/public/PublicWeddingShellPage');
          return { Component: PublicWeddingShellPage };
        },
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
              const { OrganizerWorkspacePage } =
                await import('@/portals/organizer/OrganizerWorkspacePage');
              return { Component: OrganizerWorkspacePage };
            },
          },
          {
            path: 'settings',
            lazy: async () => {
              const { OrganizerWorkspaceSettingsPage } =
                await import('@/portals/organizer/OrganizerWorkspaceSettingsPage');
              return { Component: OrganizerWorkspaceSettingsPage };
            },
          },
          {
            path: 'weddings/:weddingId',
            lazy: async () => {
              const { OrganizerWeddingDetailPage } =
                await import('@/portals/organizer/OrganizerWeddingDetailPage');
              return { Component: OrganizerWeddingDetailPage };
            },
          },
          {
            path: 'weddings/:weddingId/builder',
            lazy: async () => {
              const { OrganizerWeddingBuilderPage } =
                await import('@/portals/organizer/OrganizerWeddingBuilderPage');
              return { Component: OrganizerWeddingBuilderPage };
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
