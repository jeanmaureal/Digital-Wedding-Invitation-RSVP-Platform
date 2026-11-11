import { CalendarHeart, LayoutDashboard } from 'lucide-react';
import type { JSX } from 'react';
import { Link, Outlet } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { getAppEnv } from '@/lib/validation/env';

export function OrganizerLayout(): JSX.Element {
  const env = getAppEnv();

  return (
    <div
      data-testid="organizer-shell"
      className="bg-background text-foreground flex min-h-screen flex-col"
    >
      <header className="bg-card border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="text-primary size-5" aria-hidden="true" />
            <span className="font-semibold tracking-tight">Organizer Portal</span>
            <Badge variant="secondary">Workspace Shell</Badge>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" data-testid="env-badge">
              env: {env.appEnv}
            </Badge>
            <Badge
              variant={env.supabase.status === 'configured' ? 'default' : 'outline'}
              data-testid="supabase-status-badge"
            >
              supabase: {env.supabase.status}
            </Badge>
            <Button asChild variant="ghost" size="sm">
              <Link to={ROUTES.home}>
                <CalendarHeart className="size-4" aria-hidden="true" />
                Public Site
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
