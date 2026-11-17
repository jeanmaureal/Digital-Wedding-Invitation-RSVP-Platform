import type { JSX } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';

export function OrganizerSettingsShellPage(): JSX.Element {
  const { user } = useOrganizerAuth();

  return (
    <section
      data-testid="route-organizer-settings"
      aria-labelledby="organizer-settings-heading"
      className="space-y-6"
    >
      <div className="space-y-2">
        <Badge variant="secondary">Workspace Settings</Badge>
        <h1 id="organizer-settings-heading" className="text-3xl font-semibold tracking-tight">
          Workspace &amp; Member Settings
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Manage workspace identity, role-based member permissions, and account settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Signed-In Organizer</CardTitle>
          <CardDescription>
            Authenticated organizer identity verified via Supabase Auth (`P1-AC06`).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Active account: <strong className="text-foreground">{user?.email ?? 'Unknown'}</strong>
        </CardContent>
      </Card>
    </section>
  );
}
