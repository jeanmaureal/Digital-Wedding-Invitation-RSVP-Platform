import { CalendarHeart, LayoutDashboard, LogOut, Settings } from 'lucide-react';
import { type JSX, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';
import { ROUTES } from '@/lib/constants/routes';
import { getAppEnv } from '@/lib/validation/env';

export function OrganizerLayout(): JSX.Element {
  const env = getAppEnv();
  const { status, user, isPasswordRecoverySession, signOut } = useOrganizerAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const showAuthenticatedNav = status === 'authenticated' && !isPasswordRecoverySession;

  const onSignOut = async (): Promise<void> => {
    setIsSigningOut(true);
    try {
      await signOut();
      void navigate(ROUTES.organizerLogin, { replace: true });
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div
      data-testid="organizer-shell"
      className="bg-background text-foreground flex min-h-screen flex-col"
    >
      <header className="bg-card border-b">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={ROUTES.organizerRoot}
              className="flex items-center gap-2 font-semibold tracking-tight"
            >
              <LayoutDashboard className="text-primary size-5" aria-hidden="true" />
              <span>Organizer Portal</span>
            </Link>
            <Badge variant="secondary">Workspace Shell</Badge>

            {showAuthenticatedNav ? (
              <nav aria-label="Organizer navigation" className="flex items-center gap-1 sm:ml-2">
                <Button asChild variant="ghost" size="sm">
                  <Link to={ROUTES.organizerRoot}>Overview</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link to={ROUTES.organizerSettings}>
                    <Settings className="size-4" aria-hidden="true" />
                    Settings
                  </Link>
                </Button>
              </nav>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" data-testid="env-badge">
              env: {env.appEnv}
            </Badge>
            <Badge
              variant={env.supabase.status === 'configured' ? 'default' : 'outline'}
              data-testid="supabase-status-badge"
            >
              supabase: {env.supabase.status}
            </Badge>

            {status === 'authenticated' && user?.email ? (
              <span
                data-testid="organizer-user-email"
                className="text-muted-foreground hidden max-w-[14rem] truncate text-xs sm:inline"
              >
                {user.email}
              </span>
            ) : null}

            <Button asChild variant="ghost" size="sm">
              <Link to={ROUTES.home}>
                <CalendarHeart className="size-4" aria-hidden="true" />
                Public Site
              </Link>
            </Button>

            {status === 'authenticated' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSigningOut}
                onClick={() => void onSignOut()}
                data-testid="organizer-signout-button"
              >
                <LogOut className="size-4" aria-hidden="true" />
                {isSigningOut ? 'Signing out…' : 'Sign out'}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
