import { useQuery } from '@tanstack/react-query';
import { Plus, RefreshCw, Settings } from 'lucide-react';
import { type JSX, useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';
import { WorkspaceWeddingsSection } from '@/features/weddings/components/WorkspaceWeddingsSection';
import { CreateWorkspaceCard } from '@/features/workspace/components/CreateWorkspaceCard';
import { OrganizerProfileCard } from '@/features/workspace/components/OrganizerProfileCard';
import { useActiveWorkspace } from '@/features/workspace/context/activeWorkspaceContext';
import { WORKSPACE_ROLE_LABELS } from '@/features/workspace/schemas/workspaceSchemas';
import { ROUTES } from '@/lib/constants/routes';
import { checkDatabaseHealth } from '@/lib/supabase/client';
import { getAppEnv } from '@/lib/validation/env';

export function OrganizerWorkspacePage(): JSX.Element {
  const env = getAppEnv();
  const isConfigured = env.supabase.status === 'configured';
  const { user } = useOrganizerAuth();
  const {
    isLoadingMemberships,
    membershipsError,
    activeMembership,
    memberships,
    refreshMemberships,
  } = useActiveWorkspace();
  const [showCreateAdditional, setShowCreateAdditional] = useState(false);

  const healthQuery = useQuery({
    queryKey: ['system', 'supabase-health'],
    queryFn: () => checkDatabaseHealth(),
    enabled: isConfigured,
  });

  return (
    <section
      data-testid="route-organizer-root"
      aria-labelledby="organizer-workspace-heading"
      className="space-y-6"
    >
      {isLoadingMemberships ? (
        <Card data-testid="workspace-loading-card">
          <CardContent className="text-muted-foreground py-8 text-sm">
            Loading your organizer workspaces…
          </CardContent>
        </Card>
      ) : membershipsError ? (
        <Card role="alert" data-testid="workspace-load-error-card">
          <CardHeader>
            <CardTitle>Unable to Load Workspaces</CardTitle>
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
      ) : !activeMembership ? (
        <>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="space-y-2">
              <Badge variant="secondary">Welcome Organizer</Badge>
              <h1
                id="organizer-workspace-heading"
                className="text-3xl font-semibold tracking-tight"
              >
                Set Up Your Organizer Workspace
              </h1>
              <p className="text-muted-foreground max-w-2xl text-sm">
                You are not a member of any workspace yet. Create your first workspace below, or
                refresh if a co-organizer just added your registered email address.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshMemberships()}
              data-testid="refresh-memberships-button"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh memberships
            </Button>
          </div>

          <CreateWorkspaceCard mode="onboarding" />
        </>
      ) : (
        <>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" data-testid="active-workspace-role-badge">
                  Role: {WORKSPACE_ROLE_LABELS[activeMembership.role]}
                </Badge>
                <Badge variant="outline" data-testid="active-workspace-slug-badge">
                  /{activeMembership.workspace.slug}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {memberships.length} {memberships.length === 1 ? 'workspace' : 'workspaces'}
                </span>
              </div>

              <h1
                id="organizer-workspace-heading"
                data-testid="active-workspace-heading"
                className="text-3xl font-semibold tracking-tight"
              >
                {activeMembership.workspace.name}
              </h1>
              <p className="text-muted-foreground max-w-2xl text-sm">
                Multi-tenant workspace context (`P1-AC08` / `P2-AC09`). All wedding projects,
                settings, and upcoming invitation modules below are scoped strictly to this
                workspace.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCreateAdditional((prev) => !prev)}
                data-testid="toggle-create-workspace-button"
              >
                <Plus className="size-4" aria-hidden="true" />
                New workspace
              </Button>

              <Button asChild size="sm" data-testid="go-to-workspace-settings-link">
                <Link to={ROUTES.organizerSettings}>
                  <Settings className="size-4" aria-hidden="true" />
                  Workspace settings
                </Link>
              </Button>
            </div>
          </div>

          {showCreateAdditional ? (
            <CreateWorkspaceCard
              mode="additional"
              onCreated={() => setShowCreateAdditional(false)}
              onCancel={() => setShowCreateAdditional(false)}
            />
          ) : null}

          {user ? (
            <WorkspaceWeddingsSection
              key={activeMembership.workspace.id}
              userId={user.id}
              activeMembership={activeMembership}
            />
          ) : null}
        </>
      )}

      <OrganizerProfileCard />

      <Card>
        <CardHeader>
          <CardTitle>Platform Runtime Status</CardTitle>
          <CardDescription>
            Operational configuration state for the current deployment environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-1.5 text-xs">
          <p>
            Active environment: <strong className="text-foreground">{env.appEnv}</strong>
          </p>
          <p>
            Supabase client configuration:{' '}
            <strong className="text-foreground">{env.supabase.status}</strong>
          </p>
          {isConfigured ? (
            <p data-testid="supabase-rpc-status">
              Health RPC reachability:{' '}
              <strong className="text-foreground">
                {healthQuery.isPending
                  ? 'checking...'
                  : healthQuery.isError
                    ? 'error'
                    : healthQuery.data?.status === 'ok'
                      ? `ok (${healthQuery.data.timestamp})`
                      : 'unconfigured'}
              </strong>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
