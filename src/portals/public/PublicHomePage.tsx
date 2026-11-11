import type { JSX } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/lib/constants/routes';

export function PublicHomePage(): JSX.Element {
  return (
    <section data-testid="route-public-home" aria-labelledby="public-home-heading" className="space-y-8">
      <div className="space-y-3">
        <Badge variant="secondary">Public Portal</Badge>
        <h1 id="public-home-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Digital Wedding Invitation &amp; RSVP Platform
        </h1>
        <p className="text-muted-foreground max-w-2xl text-base">
          Create customizable, multi-wedding digital invitations with schema-driven themes and
          household-verified RSVP links.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Route Boundary Verification</CardTitle>
          <CardDescription>
            Explore the public guest routes and organizer workspace portal shells.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to={ROUTES.organizerRoot}>Open Organizer Portal (/app)</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/w/sample-wedding">Sample Wedding Route (/w/:slug)</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/i/sample-token">Sample Invitation Route (/i/:token)</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
