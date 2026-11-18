import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Palette, RefreshCw, Send, Users } from 'lucide-react';
import type { JSX } from 'react';
import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';
import { fetchWorkspaceWeddingById } from '@/features/weddings/api/weddingApi';
import { translateWeddingError } from '@/features/weddings/api/weddingErrors';
import { WeddingDetailsCard } from '@/features/weddings/components/WeddingDetailsCard';
import { WeddingLifecycleCard } from '@/features/weddings/components/WeddingLifecycleCard';
import { WeddingSettingsCard } from '@/features/weddings/components/WeddingSettingsCard';
import { weddingQueryKeys } from '@/features/weddings/queryKeys';
import {
  WEDDING_ACCESS_MODE_LABELS,
  WEDDING_STATUS_LABELS,
} from '@/features/weddings/schemas/weddingSchemas';
import { formatCalendarDateDisplay } from '@/features/weddings/utils/weddingTimezone';
import { useActiveWorkspace } from '@/features/workspace/context/activeWorkspaceContext';
import { WORKSPACE_ROLE_LABELS } from '@/features/workspace/schemas/workspaceSchemas';
import { ROUTES } from '@/lib/constants/routes';

export function OrganizerWeddingDetailPage(): JSX.Element {
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
      <Card data-testid="wedding-detail-workspace-loading">
        <CardContent className="text-muted-foreground py-8 text-sm">
          Loading active workspace context…
        </CardContent>
      </Card>
    );
  }

  if (membershipsError) {
    return (
      <Card role="alert" data-testid="wedding-detail-workspace-error">
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
      <Card data-testid="wedding-detail-no-workspace-card">
        <CardHeader>
          <CardTitle>No Active Workspace</CardTitle>
          <CardDescription>
            Create or join a workspace before managing wedding projects.
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
      <Card data-testid="wedding-detail-loading-card">
        <CardContent className="text-muted-foreground py-8 text-sm">
          Loading wedding project…
        </CardContent>
      </Card>
    );
  }

  if (weddingQuery.isError) {
    return (
      <Card role="alert" data-testid="wedding-detail-error-card">
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
      <Card data-testid="wedding-workspace-mismatch-card">
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
          <Button asChild size="sm" data-testid="mismatch-back-to-overview-link">
            <Link to={ROUTES.organizerRoot}>
              <ArrowLeft className="size-4" aria-hidden="true" />
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
      data-testid="route-organizer-wedding-detail"
      aria-labelledby="wedding-detail-heading"
      className="space-y-6"
    >
      <div className="space-y-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to={ROUTES.organizerRoot} data-testid="back-to-weddings-link">
              <ArrowLeft className="size-4" aria-hidden="true" />
              All projects in {activeMembership.workspace.name}
            </Link>
          </Button>
        </div>

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" data-testid="detail-wedding-status-badge">
                {WEDDING_STATUS_LABELS[wedding.status]}
              </Badge>
              <Badge variant="outline">{WEDDING_ACCESS_MODE_LABELS[settings.access_mode]}</Badge>
              <Badge variant="outline" data-testid="detail-wedding-slug-badge">
                /w/{wedding.slug}
              </Badge>
              <Badge variant="outline">Role: {WORKSPACE_ROLE_LABELS[callerRole]}</Badge>
            </div>

            <h1
              id="wedding-detail-heading"
              data-testid="wedding-detail-heading"
              className="text-3xl font-semibold tracking-tight"
            >
              {wedding.title}
            </h1>
            <p className="text-muted-foreground text-sm">
              {wedding.partner_one_name} &amp; {wedding.partner_two_name} ·{' '}
              {formatCalendarDateDisplay(wedding.event_date)} · Timezone:{' '}
              <strong className="text-foreground">{settings.timezone}</strong>
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="bg-muted/30">
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Palette className="text-primary size-4" aria-hidden="true" />
              <span>Design &amp; Builder</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Theme tokens, section schemas, and live preview arrive in Phases 3–4.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-muted/30">
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="text-primary size-4" aria-hidden="true" />
              <span>Households &amp; RSVPs</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Guest groups, hashed /i/:token links, and transactional RSVPs arrive in Phases 6–7.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-muted/30">
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Send className="text-primary size-4" aria-hidden="true" />
              <span>Versioned Publishing</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Immutable public /w/{wedding.slug} snapshots and analytics arrive in Phases 5 &amp; 8.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <WeddingDetailsCard
        key={`details:${workspaceId}:${wedding.id}`}
        userId={userId}
        workspaceId={workspaceId}
        callerRole={callerRole}
        wedding={wedding}
      />

      <WeddingSettingsCard
        key={`settings:${workspaceId}:${wedding.id}`}
        userId={userId}
        workspaceId={workspaceId}
        callerRole={callerRole}
        settings={settings}
      />

      <WeddingLifecycleCard
        key={`lifecycle:${workspaceId}:${wedding.id}:${wedding.status}`}
        userId={userId}
        workspaceId={workspaceId}
        callerRole={callerRole}
        wedding={wedding}
      />
    </section>
  );
}
