import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import type { JSX } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';
import { fetchWeddingDesignDraft } from '@/features/design/api/designDraftApi';
import { translateDesignError } from '@/features/design/api/designErrors';
import { WeddingInvitationBuilder } from '@/features/design/components/builder/WeddingInvitationBuilder';
import { designQueryKeys } from '@/features/design/queryKeys';
import type { InvitationWeddingMetadata } from '@/features/design/schemas/designSchemas';
import { fetchWorkspaceWeddingById } from '@/features/weddings/api/weddingApi';
import { translateWeddingError } from '@/features/weddings/api/weddingErrors';
import { weddingQueryKeys } from '@/features/weddings/queryKeys';
import { useActiveWorkspace } from '@/features/workspace/context/activeWorkspaceContext';
import { buildOrganizerWeddingPath, ROUTES } from '@/lib/constants/routes';

export function OrganizerWeddingBuilderPage(): JSX.Element {
  const { weddingId = '' } = useParams();
  const { user } = useOrganizerAuth();
  const { isLoadingMemberships, membershipsError, activeMembership, refreshMemberships } =
    useActiveWorkspace();

  const userId = user?.id ?? '';
  const workspaceId = activeMembership?.workspace.id ?? '';

  const weddingQuery = useQuery({
    queryKey: weddingQueryKeys.detail(userId, workspaceId, weddingId),
    queryFn: () => fetchWorkspaceWeddingById({ workspaceId, weddingId }),
    enabled: Boolean(userId && workspaceId && weddingId),
  });

  const weddingData = weddingQuery.data ?? null;

  const weddingMetadata: InvitationWeddingMetadata | null = weddingData
    ? {
        title: weddingData.wedding.title,
        partnerOneName: weddingData.wedding.partner_one_name,
        partnerTwoName: weddingData.wedding.partner_two_name,
        slug: weddingData.wedding.slug,
        eventDate: weddingData.wedding.event_date,
        venueName: weddingData.wedding.venue_name,
        venueLocation: weddingData.wedding.venue_location,
        timezone: weddingData.settings.timezone,
        rsvpDeadline: weddingData.settings.rsvp_deadline,
        isRsvpOpen: weddingData.settings.is_rsvp_open,
      }
    : null;

  const designQuery = useQuery({
    queryKey: designQueryKeys.draft(userId, workspaceId, weddingId),
    queryFn: () =>
      fetchWeddingDesignDraft({
        workspaceId,
        weddingId,
        weddingMetadata: weddingMetadata!,
      }),
    enabled: Boolean(userId && workspaceId && weddingId && weddingMetadata),
  });

  if (isLoadingMemberships) {
    return (
      <Card data-testid="wedding-builder-workspace-loading">
        <CardContent className="text-muted-foreground py-8 text-sm">
          Loading active workspace context…
        </CardContent>
      </Card>
    );
  }

  if (membershipsError) {
    return (
      <Card role="alert" data-testid="wedding-builder-workspace-error">
        <CardHeader>
          <CardTitle>Unable to Load Active Workspace</CardTitle>
          <CardDescription>{membershipsError}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refreshMemberships()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!activeMembership) {
    return (
      <Card data-testid="wedding-builder-no-workspace-card">
        <CardHeader>
          <CardTitle>No Active Workspace</CardTitle>
          <CardDescription>
            Create or join a workspace before opening the Invitation Builder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm">
            <Link to={ROUTES.organizerRoot}>Go to workspace onboarding</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (weddingQuery.isPending) {
    return (
      <Card data-testid="wedding-builder-loading-card">
        <CardContent className="text-muted-foreground py-8 text-sm">
          Loading wedding project…
        </CardContent>
      </Card>
    );
  }

  if (weddingQuery.isError) {
    return (
      <Card role="alert" data-testid="wedding-builder-error-card">
        <CardHeader>
          <CardTitle>Unable to Load Wedding Project</CardTitle>
          <CardDescription>{translateWeddingError(weddingQuery.error).message}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void weddingQuery.refetch()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Retry
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to={ROUTES.organizerRoot}>Back to workspace overview</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!weddingData) {
    return (
      <Card data-testid="wedding-builder-workspace-mismatch-card">
        <CardHeader>
          <CardTitle>Wedding Project Not Found in {activeMembership.workspace.name}</CardTitle>
          <CardDescription>
            This wedding project does not belong to your currently active workspace (
            <strong>{activeMembership.workspace.name}</strong>) or has been deleted. Switch back to
            its workspace in the header or return to {activeMembership.workspace.name}&rsquo;s
            project dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm" data-testid="builder-mismatch-back-link">
            <Link to={ROUTES.organizerRoot}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to {activeMembership.workspace.name} projects
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (designQuery.isPending) {
    return (
      <Card data-testid="wedding-builder-design-loading-card">
        <CardContent className="text-muted-foreground py-8 text-sm">
          Loading invitation sections &amp; theme tokens…
        </CardContent>
      </Card>
    );
  }

  if (designQuery.isError || !designQuery.data) {
    return (
      <Card role="alert" data-testid="wedding-builder-design-error-card">
        <CardHeader>
          <CardTitle>Unable to Load Invitation Design Draft</CardTitle>
          <CardDescription>
            {designQuery.isError
              ? translateDesignError(designQuery.error).message
              : 'Invitation theme or sections were not found for this wedding project.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void designQuery.refetch()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Retry
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to={buildOrganizerWeddingPath(weddingData.wedding.id)}>
              Back to project overview
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section
      data-testid="route-organizer-wedding-builder"
      aria-labelledby="wedding-builder-heading"
    >
      <WeddingInvitationBuilder
        key={`builder:${workspaceId}:${weddingData.wedding.id}`}
        userId={userId}
        workspaceId={workspaceId}
        callerRole={activeMembership.role}
        wedding={weddingData.wedding}
        settings={weddingData.settings}
        initialDocument={{
          ...designQuery.data,
          wedding: weddingMetadata!,
        }}
      />
    </section>
  );
}
