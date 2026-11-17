import type { JSX } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';
import { buildLoginRedirectPath } from '@/features/auth/schemas/authSchemas';
import { ROUTES } from '@/lib/constants/routes';

export function RequireOrganizerAuth(): JSX.Element {
  const { status, isPasswordRecoverySession } = useOrganizerAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div
        data-testid="organizer-auth-loading"
        className="text-muted-foreground flex min-h-[40vh] items-center justify-center text-sm"
      >
        Verifying organizer session…
      </div>
    );
  }

  if (status !== 'authenticated') {
    const loginTarget = buildLoginRedirectPath(location.pathname, location.search);
    return <Navigate to={loginTarget} replace />;
  }

  // Keep recovery sessions focused on completing password update before entering workspaces.
  if (isPasswordRecoverySession && location.pathname !== ROUTES.organizerResetPassword) {
    return <Navigate to={ROUTES.organizerResetPassword} replace />;
  }

  return <Outlet />;
}
