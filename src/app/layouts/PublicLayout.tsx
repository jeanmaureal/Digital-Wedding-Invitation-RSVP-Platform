import { Heart } from 'lucide-react';
import type { JSX } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';

export function PublicLayout(): JSX.Element {
  const { pathname } = useLocation();
  const isGuestInvitationRoute = pathname.startsWith('/w/') || pathname.startsWith('/i/');

  return (
    <div
      data-testid="public-shell"
      className="bg-background text-foreground relative isolate flex min-h-screen flex-col"
    >
      {!isGuestInvitationRoute ? (
        <header className="bg-background/90 relative z-20 border-b backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-6">
            <Link
              to={ROUTES.home}
              className="inline-flex items-center gap-2 font-semibold tracking-tight"
            >
              <Heart className="text-primary size-4" aria-hidden="true" />
              <span>Wedding Invitations</span>
            </Link>

            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to={ROUTES.organizerRoot}>Organizer Sign In</Link>
              </Button>
            </div>
          </div>
        </header>
      ) : null}

      <main
        className={
          isGuestInvitationRoute
            ? 'flex w-full flex-1 flex-col'
            : 'mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-12'
        }
      >
        <Outlet />
      </main>

      {!isGuestInvitationRoute ? (
        <footer className="bg-background/90 text-muted-foreground relative z-20 border-t py-6 text-center text-xs backdrop-blur-sm">
          Digital Wedding Invitation &amp; RSVP Platform · Guest access requires no organizer account
        </footer>
      ) : null}
    </div>
  );
}
