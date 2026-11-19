import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Palette, RefreshCw } from 'lucide-react';
import type { JSX } from 'react';
import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';
import { WeddingGuestDirectoryManager } from '@/features/guests/components/WeddingGuestDirectoryManager';
import { fetchWorkspaceWeddingById } from '@/features/weddings/api/weddingApi';
import { translateWeddingError } from '@/features/weddings/api/weddingErrors';
import { weddingQueryKeys } from '@/features/weddings/queryKeys';
import {
  WEDDING_ACCESS_MODE_LABELS,
  WEDDING_STATUS_LABELS,
} from '@/features/weddings/schemas/weddingSchemas';
import { useActiveWorkspace } from '@/features/workspace/context/activeWorkspaceContext';
import { WORKSPACE_ROLE_LABELS } from '@/features/workspace/schemas/workspaceSchemas';
import {
  buildOrganizerWeddingBuilderPath,
  buildOrganizerWeddingPath,
  ROUTES,
} from '@/lib/constants/routes';

export function OrganizerWeddingGuestsPage(): JSX.Element {
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

  if (isLoadingMemberships) {
    return (
      <Card data-testid="guests-workspace-loading">
        <CardContent className="text-muted-foreground py-8 text-sm">
          Loading active workspace context…
        </CardContent>
      </Card>
    );
  }

  if (membershipsError) {
    return (
      <Card role="alert" data-testid="guests-workspace-error">
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
      <Card data-testid="guests-no-workspace-card">
        <CardHeader>
          <CardTitle>No Active Workspace</CardTitle>
          <CardDescription>
            Create or join a workspace before managing households and invitations.
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
      <Card data-testid="guests-wedding-loading">
        <CardContent className="text-muted-foreground py-8 text-sm">
          Loading wedding project…
        </CardContent>
      </Card>
    );
  }

  if (weddingQuery.isError) {
    return (
      <Card role="alert" data-testid="guests-wedding-error">
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

  if (!weddingQuery.data) {
    return (
      <Card data-testid="guests-workspace-mismatch-card">
        <CardHeader>
          <CardTitle>Wedding Project Not Found in {activeMembership.workspace.name}</CardTitle>
          <CardDescription>
            This wedding project does not belong to your currently active workspace (
            <strong>{activeMembership.workspace.name}</strong>) or has been deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm">
            <Link to={ROUTES.organizerRoot}>
              Back to {activeMembership.workspace.name} projects
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { wedding, settings } = weddingQuery.data;
  const callerRole = activeMembership.role;

  return (
    <section
      data-testid="route-organizer-wedding-guests"
      aria-labelledby="wedding-guests-heading"
      className="space-y-6"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link
              to={buildOrganizerWeddingPath(wedding.id)}
              data-testid="guests-back-to-overview-link"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Project Overview
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={buildOrganizerWeddingBuilderPath(wedding.id)}>
              <Palette className="size-4" aria-hidden="true" />
              Open Builder
            </Link>
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{WEDDING_STATUS_LABELS[wedding.status]}</Badge>
            <Badge variant="outline">{WEDDING_ACCESS_MODE_LABELS[settings.access_mode]}</Badge>
            <Badge variant="outline">Role: {WORKSPACE_ROLE_LABELS[callerRole]}</Badge>
          </div>
          <h1
            id="wedding-guests-heading"
            data-testid="wedding-guests-heading"
            className="text-3xl font-semibold tracking-tight"
          >
            Households &amp; Invitations — {wedding.title}
          </h1>
          <p className="text-muted-foreground text-sm">
            Manage invited household groups, bulk import CSV guest spreadsheets, and issue SHA-256
            hashed <code>/i/…</code> links with printable vector QR codes.
          </p>
        </div>
      </div>

      <WeddingGuestDirectoryManager
        key={`guests:${workspaceId}:${wedding.id}`}
        userId={userId}
        workspaceId={workspaceId}
        callerRole={callerRole}
        wedding={wedding}
      />
    </section>
  );
}
