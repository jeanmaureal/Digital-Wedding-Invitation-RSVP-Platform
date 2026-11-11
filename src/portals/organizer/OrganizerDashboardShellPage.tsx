import type { JSX } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAppEnv } from '@/lib/validation/env';

export function OrganizerDashboardShellPage(): JSX.Element {
  const env = getAppEnv();

  return (
    <section
      data-testid="route-organizer-root"
      aria-labelledby="organizer-heading"
      className="space-y-6"
    >
      <div className="space-y-2">
        <Badge variant="secondary">Organizer Workspace</Badge>
        <h1 id="organizer-heading" className="text-3xl font-semibold tracking-tight">
          Multi-Wedding Organizer Console
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Protected organizer authentication, workspace membership RBAC, and multi-wedding project
          management connect to this portal starting in Phase 1 and Phase 2.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Foundation Runtime Status</CardTitle>
          <CardDescription>
            Operational configuration state for the current deployment environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>
            Active environment: <strong className="text-foreground">{env.appEnv}</strong>
          </p>
          <p>
            Supabase client configuration:{' '}
            <strong className="text-foreground">{env.supabase.status}</strong>
          </p>
          {env.supabase.status === 'unconfigured' ? (
            <p>
              Running in offline local shell mode. Configure <code>VITE_SUPABASE_URL</code> and{' '}
              <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env</code> to enable database
              connectivity.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
