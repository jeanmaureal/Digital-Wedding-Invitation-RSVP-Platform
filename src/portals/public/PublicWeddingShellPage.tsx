import type { JSX } from 'react';
import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/lib/constants/routes';

const SAFE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function PublicWeddingShellPage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const isValidSlugFormat = Boolean(slug && slug.length <= 80 && SAFE_SLUG_PATTERN.test(slug));

  return (
    <section data-testid="route-public-wedding" aria-labelledby="wedding-shell-heading">
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <div className="mb-2">
            <Badge variant="outline">Public Wedding Website</Badge>
          </div>
          <CardTitle id="wedding-shell-heading" className="text-2xl">
            {isValidSlugFormat ? 'Invitation Not Yet Available' : 'Invalid Wedding Link'}
          </CardTitle>
          <CardDescription>
            {isValidSlugFormat
              ? 'No published wedding snapshot exists for this link yet.'
              : 'The requested wedding address is not a valid invitation link.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Only active published wedding snapshots are served publicly. Draft configurations and
            guest records remain private.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to={ROUTES.home}>Return to Home</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
