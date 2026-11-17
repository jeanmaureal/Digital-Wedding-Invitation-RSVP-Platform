import type { JSX } from 'react';
import { Navigate, Outlet, useSearchParams } from 'react-router';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';
import { sanitizeOrganizerRedirect } from '@/features/auth/schemas/authSchemas';
import { ROUTES } from '@/lib/constants/routes';

export function RedirectIfOrganizerAuthenticated(): JSX.Element {
  const { status, isPasswordRecoverySession } = useOrganizerAuth();
  const [searchParams] = useSearchParams();

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

  if (status === 'authenticated') {
    if (isPasswordRecoverySession) {
      return <Navigate to={ROUTES.organizerResetPassword} replace />;
    }
    const target = sanitizeOrganizerRedirect(searchParams.get('redirectTo'));
    return <Navigate to={target} replace />;
  }

  return <Outlet />;
}
