import { ArrowLeft } from 'lucide-react';
import { type JSX, useCallback, useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkspaceDangerZoneCard } from '@/features/workspace/components/WorkspaceDangerZoneCard';
import { WorkspaceGeneralSettingsCard } from '@/features/workspace/components/WorkspaceGeneralSettingsCard';
import { WorkspaceMembersCard } from '@/features/workspace/components/WorkspaceMembersCard';
import { useActiveWorkspace } from '@/features/workspace/context/activeWorkspaceContext';
import { WORKSPACE_ROLE_LABELS } from '@/features/workspace/schemas/workspaceSchemas';
import { ROUTES } from '@/lib/constants/routes';

export function OrganizerWorkspaceSettingsPage(): JSX.Element {
  const { isLoadingMemberships, membershipsError, activeMembership } = useActiveWorkspace();
  const [ownerCountsByWorkspace, setOwnerCountsByWorkspace] = useState<
    Readonly<Record<string, number>>
  >({});

  const activeWorkspaceId = activeMembership?.workspace.id ?? null;

  const handleOwnerCountResolved = useCallback(
    (ownerCount: number): void => {
      if (!activeWorkspaceId) {
        return;
      }
      setOwnerCountsByWorkspace((prev) => {
        if (prev[activeWorkspaceId] === ownerCount) {
          return prev;
        }
        return {
          ...prev,
          [activeWorkspaceId]: ownerCount,
        };
      });
    },
    [activeWorkspaceId],
  );

  return (
    <section
      data-testid="route-organizer-settings"
      aria-labelledby="organizer-settings-heading"
      className="space-y-6"
    >
      {isLoadingMemberships ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-sm">
            Loading workspace settings…
          </CardContent>
        </Card>
      ) : membershipsError ? (
        <Card role="alert">
          <CardHeader>
            <CardTitle>Unable to Load Workspace Settings</CardTitle>
            <CardDescription>{membershipsError}</CardDescription>
          </CardHeader>
        </Card>
      ) : !activeMembership ? (
        <Card data-testid="settings-no-workspace-card">
          <CardHeader>
            <CardTitle asChild>
              <h1 id="organizer-settings-heading" className="text-xl font-semibold tracking-tight">
                No Active Workspace
              </h1>
            </CardTitle>
            <CardDescription>
              Create or join a workspace first to configure settings and manage team roles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <Link to={ROUTES.organizerRoot}>Go to workspace onboarding</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Workspace Settings</Badge>
                <Badge variant="outline">
                  Your role: {WORKSPACE_ROLE_LABELS[activeMembership.role]}
                </Badge>
              </div>
              <h1 id="organizer-settings-heading" className="text-3xl font-semibold tracking-tight">
                {activeMembership.workspace.name}
              </h1>
              <p className="text-muted-foreground max-w-2xl text-sm">
                Configure workspace identity, manage registered co-organizers, and review role
                permissions enforced by PostgreSQL (`P1-AC05`).
              </p>
            </div>

            <Button asChild variant="outline" size="sm">
              <Link to={ROUTES.organizerRoot}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back to overview
              </Link>
            </Button>
          </div>

          <WorkspaceGeneralSettingsCard
            key={`general-${activeMembership.workspace.id}`}
            activeMembership={activeMembership}
          />

          <WorkspaceMembersCard
            key={`members-${activeMembership.workspace.id}`}
            activeMembership={activeMembership}
            onOwnerCountResolved={handleOwnerCountResolved}
          />

          <WorkspaceDangerZoneCard
            key={`danger-${activeMembership.workspace.id}`}
            activeMembership={activeMembership}
            ownerCount={ownerCountsByWorkspace[activeMembership.workspace.id] ?? null}
          />
        </>
      )}
    </section>
  );
}
