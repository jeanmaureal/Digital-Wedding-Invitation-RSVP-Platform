import type { JSX } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/lib/constants/routes';

export function PublicInvitationShellPage(): JSX.Element {
  // Security boundary note: raw `:token` route parameters are intentionally never rendered
  // into DOM output or written to console logs. Token verification occurs server-side via
  // cryptographic hash lookup in Phases 6–7.
  return (
    <section data-testid="route-public-invitation" aria-labelledby="invitation-shell-heading">
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <div className="mb-2">
            <Badge variant="outline">Guest RSVP Access</Badge>
          </div>
          <CardTitle asChild>
            <h1 id="invitation-shell-heading" className="text-2xl">
              Invitation Verification Unavailable
            </h1>
          </CardTitle>
          <CardDescription>
            Guest-specific invitation verification and household RSVP forms are enabled once a
            wedding is published.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            If you received an invitation link from the couple, please check back once RSVP
            responses open. No guest or household details are displayed for unverified links.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to={ROUTES.home}>Return to Home</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
