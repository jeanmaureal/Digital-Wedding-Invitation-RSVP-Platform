import type { JSX } from 'react';
import { createBrowserRouter, Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/lib/constants/routes';
import { getAppEnv } from '@/lib/validation/env';

function FoundationRouteView({
  title,
  description,
  portalLabel,
  routeDetail,
}: {
  readonly title: string;
  readonly description: string;
  readonly portalLabel: string;
  readonly routeDetail?: string;
}): JSX.Element {
  const env = getAppEnv();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{portalLabel}</Badge>
        <Badge variant="outline">env: {env.appEnv}</Badge>
        <Badge variant={env.supabase.status === 'configured' ? 'default' : 'outline'}>
          supabase: {env.supabase.status}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {routeDetail ? (
            <p className="text-muted-foreground text-sm">{routeDetail}</p>
          ) : null}
          <nav aria-label="Foundation navigation" className="flex flex-wrap gap-3">
            <Button asChild variant="outline" size="sm">
              <Link to={ROUTES.home}>Public Home (/)</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={ROUTES.organizerRoot}>Organizer Portal (/app)</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/w/test">Sample Wedding (/w/test)</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/i/test">Sample Invitation (/i/test)</Link>
            </Button>
          </nav>
        </CardContent>
      </Card>
    </main>
  );
}

function PublicWeddingRoutePlaceholder(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  return (
    <FoundationRouteView
      portalLabel="Public Portal"
      title="Public Wedding Shell"
      description="Route boundary active. Published wedding resolution is implemented in Phase 5."
      routeDetail={`Requested slug parameter: ${slug ?? '(none)'} — no private or unpublished wedding records are queried in Phase 0.`}
    />
  );
}

function PublicInvitationRoutePlaceholder(): JSX.Element {
  return (
    <FoundationRouteView
      portalLabel="Public Portal"
      title="Guest Invitation Shell"
      description="Route boundary active. Token-gated household RSVP resolution is implemented in Phases 6–7."
      routeDetail="Invitation token parameter detected — token values are not echoed into the page or logs, and no household data is exposed."
    />
  );
}

function NotFoundRouteView(): JSX.Element {
  return (
    <FoundationRouteView
      portalLabel="Router Fallback"
      title="Page Not Found"
      description="The requested route does not match an active organizer or public path."
    />
  );
}

export const appRouter = createBrowserRouter([
  {
    path: ROUTES.home,
    element: (
      <FoundationRouteView
        portalLabel="Public Portal"
        title="Digital Wedding Invitation & RSVP Platform"
        description="Frontend foundation active with Tailwind CSS v4, shadcn/ui, React Router, TanStack Query, React Hook Form, and Zod."
      />
    ),
  },
  {
    path: ROUTES.organizerRoot,
    element: (
      <FoundationRouteView
        portalLabel="Organizer Portal"
        title="Organizer Workspace Shell"
        description="Organizer portal route boundary (/app). Authentication and workspace RBAC are implemented in Phase 1."
      />
    ),
  },
  {
    path: ROUTES.publicWedding,
    element: <PublicWeddingRoutePlaceholder />,
  },
  {
    path: ROUTES.publicInvitation,
    element: <PublicInvitationRoutePlaceholder />,
  },
  {
    path: '*',
    element: <NotFoundRouteView />,
  },
]);
