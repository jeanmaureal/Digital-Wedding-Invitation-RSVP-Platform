import { Heart } from 'lucide-react';
import type { JSX } from 'react';
import { Link, Outlet } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { getAppEnv } from '@/lib/validation/env';

export function PublicLayout(): JSX.Element {
  const env = getAppEnv();

  return (
    <div
      data-testid="public-shell"
      className="bg-background text-foreground flex min-h-screen flex-col"
    >
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-6">
          <Link
            to={ROUTES.home}
            className="inline-flex items-center gap-2 font-semibold tracking-tight"
          >
            <Heart className="text-primary size-4" aria-hidden="true" />
            <span>Wedding Invitations</span>
          </Link>

          <div className="flex items-center gap-2">
            <Badge variant="outline" data-testid="env-badge">
              env: {env.appEnv}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link to={ROUTES.organizerRoot}>Organizer Sign In</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-12">
        <Outlet />
      </main>

      <footer className="text-muted-foreground border-t py-6 text-center text-xs">
        Digital Wedding Invitation &amp; RSVP Platform · Guest access requires no organizer account
      </footer>
    </div>
  );
}
