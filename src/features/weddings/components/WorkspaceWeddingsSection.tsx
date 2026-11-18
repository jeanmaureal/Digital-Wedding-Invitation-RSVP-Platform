import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarHeart, Plus, RefreshCw, Search } from 'lucide-react';
import { type JSX, useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  fetchWorkspaceWeddings,
  setOrganizerWeddingArchiveStatus,
  type WeddingRecord,
} from '@/features/weddings/api/weddingApi';
import { translateWeddingError } from '@/features/weddings/api/weddingErrors';
import { CreateWeddingWizard } from '@/features/weddings/components/CreateWeddingWizard';
import { DuplicateWeddingCard } from '@/features/weddings/components/DuplicateWeddingCard';
import { WeddingProjectCard } from '@/features/weddings/components/WeddingProjectCard';
import { canCreateOrEditWedding } from '@/features/weddings/permissions/weddingPermissions';
import { weddingQueryKeys } from '@/features/weddings/queryKeys';
import type { OrganizerWorkspaceMembership } from '@/features/workspace/api/workspaceApi';
import { WORKSPACE_ROLE_LABELS } from '@/features/workspace/schemas/workspaceSchemas';
import { buildOrganizerWeddingPath } from '@/lib/constants/routes';

type DashboardStatusFilter = 'all' | 'draft' | 'archived';

export interface WorkspaceWeddingsSectionProps {
  readonly userId: string;
  readonly activeMembership: OrganizerWorkspaceMembership;
}

export function WorkspaceWeddingsSection({
  userId,
  activeMembership,
}: WorkspaceWeddingsSectionProps): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceId = activeMembership.workspace.id;
  const workspaceName = activeMembership.workspace.name;
  const callerRole = activeMembership.role;
  const canCreate = canCreateOrEditWedding(callerRole);

  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [duplicatingWedding, setDuplicatingWedding] = useState<WeddingRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DashboardStatusFilter>('all');
  const [archivePendingId, setArchivePendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const weddingsQuery = useQuery({
    queryKey: weddingQueryKeys.list(userId, workspaceId),
    queryFn: () => fetchWorkspaceWeddings(workspaceId),
    enabled: Boolean(userId && workspaceId),
  });

  const projects = weddingsQuery.data ?? [];
  const draftCount = projects.filter((p) => p.wedding.status === 'draft').length;
  const archivedCount = projects.filter((p) => p.wedding.status === 'archived').length;

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredProjects = projects.filter((item) => {
    if (statusFilter !== 'all' && item.wedding.status !== statusFilter) {
      return false;
    }
    if (!normalizedSearch) {
      return true;
    }
    return (
      item.wedding.title.toLowerCase().includes(normalizedSearch) ||
      item.wedding.partner_one_name.toLowerCase().includes(normalizedSearch) ||
      item.wedding.partner_two_name.toLowerCase().includes(normalizedSearch) ||
      item.wedding.slug.toLowerCase().includes(normalizedSearch)
    );
  });

  const onToggleArchive = async (wedding: WeddingRecord): Promise<void> => {
    setActionError(null);
    setArchivePendingId(wedding.id);
    try {
      await setOrganizerWeddingArchiveStatus({
        workspaceId,
        weddingId: wedding.id,
        archived: wedding.status !== 'archived',
      });
      await queryClient.invalidateQueries({
        queryKey: weddingQueryKeys.allInWorkspace(userId, workspaceId),
      });
    } catch (error: unknown) {
      setActionError(translateWeddingError(error).message);
    } finally {
      setArchivePendingId(null);
    }
  };

  return (
    <div data-testid="workspace-weddings-section" className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <CalendarHeart className="text-primary size-5" aria-hidden="true" />
              <span>Wedding Projects in {workspaceName}</span>
            </CardTitle>
            <CardDescription>
              Manage independent wedding websites, IANA event timezones, and RSVP policies within
              this workspace.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canCreate ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setDuplicatingWedding(null);
                  setShowCreateWizard((prev) => !prev);
                }}
                data-testid="open-create-wedding-wizard-button"
              >
                <Plus className="size-4" aria-hidden="true" />
                New wedding project
              </Button>
            ) : (
              <Badge variant="outline" data-testid="wedding-viewer-readonly-badge">
                Read-only ({WORKSPACE_ROLE_LABELS[callerRole]})
              </Badge>
            )}
          </div>
        </CardHeader>

        {projects.length > 0 ? (
          <CardContent className="border-t pt-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-wrap items-center gap-1.5" role="tablist">
                <Button
                  type="button"
                  size="sm"
                  variant={statusFilter === 'all' ? 'default' : 'ghost'}
                  onClick={() => setStatusFilter('all')}
                  data-testid="wedding-filter-all"
                >
                  All ({projects.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={statusFilter === 'draft' ? 'default' : 'ghost'}
                  onClick={() => setStatusFilter('draft')}
                  data-testid="wedding-filter-draft"
                >
                  Draft ({draftCount})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={statusFilter === 'archived' ? 'default' : 'ghost'}
                  onClick={() => setStatusFilter('archived')}
                  data-testid="wedding-filter-archived"
                >
                  Archived ({archivedCount})
                </Button>
              </div>

              <div className="relative w-full sm:max-w-xs">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  placeholder="Filter by title, couple, or slug…"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pl-8"
                  aria-label="Filter wedding projects"
                  data-testid="wedding-search-input"
                />
              </div>
            </div>
          </CardContent>
        ) : null}
      </Card>

      {actionError ? (
        <div
          role="alert"
          data-testid="workspace-weddings-action-error"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-sm"
        >
          {actionError}
        </div>
      ) : null}

      {showCreateWizard && canCreate ? (
        <CreateWeddingWizard
          key={workspaceId}
          userId={userId}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          onCancel={() => setShowCreateWizard(false)}
          onCreated={(created) => {
            setShowCreateWizard(false);
            void navigate(buildOrganizerWeddingPath(created.id));
          }}
        />
      ) : null}

      {duplicatingWedding && canCreate ? (
        <DuplicateWeddingCard
          key={`${workspaceId}:${duplicatingWedding.id}`}
          userId={userId}
          workspaceId={workspaceId}
          sourceWedding={duplicatingWedding}
          onCancel={() => setDuplicatingWedding(null)}
          onDuplicated={(duplicated) => {
            setDuplicatingWedding(null);
            void navigate(buildOrganizerWeddingPath(duplicated.id));
          }}
        />
      ) : null}

      {weddingsQuery.isPending ? (
        <Card data-testid="weddings-loading-card">
          <CardContent className="text-muted-foreground py-8 text-sm">
            Loading wedding projects for {workspaceName}…
          </CardContent>
        </Card>
      ) : weddingsQuery.isError ? (
        <Card role="alert" data-testid="weddings-error-card">
          <CardHeader>
            <CardTitle>Unable to Load Wedding Projects</CardTitle>
            <CardDescription>{translateWeddingError(weddingsQuery.error).message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void weddingsQuery.refetch()}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : projects.length === 0 ? (
        <Card data-testid="weddings-empty-card">
          <CardContent className="space-y-3 py-8 text-center">
            <p className="text-sm font-medium">No wedding projects in {workspaceName} yet</p>
            <p className="text-muted-foreground mx-auto max-w-lg text-xs">
              {canCreate
                ? 'Launch the 2-step creation wizard to set up your first couple celebration, custom /w/:slug URL, and IANA timezone.'
                : 'No wedding projects have been created by workspace editors or owners yet.'}
            </p>
            {canCreate && !showCreateWizard ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setShowCreateWizard(true)}
                data-testid="empty-state-create-wedding-button"
              >
                <Plus className="size-4" aria-hidden="true" />
                Create first wedding project
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : filteredProjects.length === 0 ? (
        <Card data-testid="weddings-filtered-empty-card">
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            No wedding projects match your current filter.
          </CardContent>
        </Card>
      ) : (
        <div data-testid="weddings-grid" className="grid gap-4 md:grid-cols-2">
          {filteredProjects.map((project) => (
            <WeddingProjectCard
              key={project.wedding.id}
              project={project}
              callerRole={callerRole}
              isArchivePending={archivePendingId === project.wedding.id}
              onRequestDuplicate={() => {
                setShowCreateWizard(false);
                setDuplicatingWedding(project.wedding);
              }}
              onToggleArchive={() => void onToggleArchive(project.wedding)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
