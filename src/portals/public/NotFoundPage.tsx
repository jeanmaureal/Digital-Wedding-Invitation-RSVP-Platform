import type { JSX } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/lib/constants/routes';

export function NotFoundPage(): JSX.Element {
  return (
    <section data-testid="route-not-found" aria-labelledby="not-found-heading">
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle asChild>
            <h1 id="not-found-heading" className="text-2xl">
              Page Not Found
            </h1>
          </CardTitle>
          <CardDescription>
            The page you requested does not exist or may have been moved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link to={ROUTES.home}>Back to Home</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
