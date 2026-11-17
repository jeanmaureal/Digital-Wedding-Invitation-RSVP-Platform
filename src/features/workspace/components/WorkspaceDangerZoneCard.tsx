import { LogOut, Trash2 } from 'lucide-react';
import { type JSX, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';
import {
  deleteOrganizerWorkspace,
  type OrganizerWorkspaceMembership,
  removeOrganizerWorkspaceMember,
} from '@/features/workspace/api/workspaceApi';
import { translateWorkspaceError } from '@/features/workspace/api/workspaceErrors';
import { useActiveWorkspace } from '@/features/workspace/context/activeWorkspaceContext';
import {
  canDeleteWorkspace,
  canRemoveWorkspaceMember,
} from '@/features/workspace/permissions/workspacePermissions';
import { ROUTES } from '@/lib/constants/routes';

export interface WorkspaceDangerZoneCardProps {
  readonly activeMembership: OrganizerWorkspaceMembership;
  readonly ownerCount: number | null;
}

export function WorkspaceDangerZoneCard({
  activeMembership,
  ownerCount,
}: WorkspaceDangerZoneCardProps): JSX.Element {
  const { user } = useOrganizerAuth();
  const { handleWorkspaceRemoved } = useActiveWorkspace();
  const navigate = useNavigate();

  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);

  const [confirmSlug, setConfirmSlug] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const workspaceId = activeMembership.workspace.id;
  const workspaceSlug = activeMembership.workspace.slug;
  const callerRole = activeMembership.role;
  const userId = user?.id ?? '';

  const effectiveOwnerCount = ownerCount ?? (callerRole === 'owner' ? 1 : 2);
  const canLeave = canRemoveWorkspaceMember({
    callerRole,
    callerUserId: userId,
    targetRole: callerRole,
    targetUserId: userId,
    ownerCount: effectiveOwnerCount,
  });
  const canDelete = canDeleteWorkspace(callerRole);
  const slugMatches = confirmSlug.trim().toLowerCase() === workspaceSlug.toLowerCase();

  const onLeaveWorkspace = async (): Promise<void> => {
    if (!userId) {
      return;
    }
    setLeaveError(null);
    setIsLeaving(true);
    try {
      await removeOrganizerWorkspaceMember({
        workspaceId,
        memberUserId: userId,
      });
      await handleWorkspaceRemoved(workspaceId);
      void navigate(ROUTES.organizerRoot, { replace: true });
    } catch (error: unknown) {
      setLeaveError(translateWorkspaceError(error).message);
    } finally {
      setIsLeaving(false);
    }
  };

  const onDeleteWorkspace = async (): Promise<void> => {
    if (!slugMatches) {
      return;
    }
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteOrganizerWorkspace(workspaceId);
      await handleWorkspaceRemoved(workspaceId);
      void navigate(ROUTES.organizerRoot, { replace: true });
    } catch (error: unknown) {
      setDeleteError(translateWorkspaceError(error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card data-testid="workspace-danger-zone-card" className="border-destructive/30">
      <CardHeader>
        <CardTitle>Membership &amp; Workspace Lifecycle</CardTitle>
        <CardDescription>
          Leave this workspace or permanently delete it (`P1-AC05`, `P1-AC11`).
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <p className="text-sm font-medium">Leave workspace</p>
              <p className="text-muted-foreground text-xs">
                {canLeave
                  ? 'Revokes your access to this workspace immediately while keeping your other workspaces intact.'
                  : 'You are the sole Owner of this workspace. Promote another member to Owner before leaving, or delete the workspace below.'}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canLeave || isLeaving || ownerCount === null}
              onClick={() => void onLeaveWorkspace()}
              data-testid="leave-workspace-button"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {isLeaving ? 'Leaving…' : 'Leave workspace'}
            </Button>
          </div>

          {leaveError ? (
            <div
              role="alert"
              data-testid="leave-workspace-error"
              className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-sm"
            >
              {leaveError}
            </div>
          ) : null}
        </div>

        {canDelete ? (
          <div className="border-destructive/30 bg-destructive/5 space-y-3 rounded-lg border p-4">
            <div className="space-y-1">
              <p className="text-destructive text-sm font-medium">Delete workspace permanently</p>
              <p className="text-muted-foreground text-xs">
                Deleting{' '}
                <strong className="text-foreground">{activeMembership.workspace.name}</strong>{' '}
                permanently removes the workspace and all member assignments. Type{' '}
                <code className="text-foreground font-semibold">{workspaceSlug}</code> to confirm.
              </p>
            </div>

            {deleteError ? (
              <div
                role="alert"
                data-testid="delete-workspace-error"
                className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-sm"
              >
                {deleteError}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="delete-workspace-confirm-slug">Confirm workspace slug</Label>
                <Input
                  id="delete-workspace-confirm-slug"
                  type="text"
                  value={confirmSlug}
                  onChange={(event) => setConfirmSlug(event.target.value)}
                  placeholder={workspaceSlug}
                  disabled={isDeleting}
                  data-testid="delete-workspace-confirm-input"
                />
              </div>

              <Button
                type="button"
                variant="destructive"
                disabled={!slugMatches || isDeleting}
                onClick={() => void onDeleteWorkspace()}
                data-testid="delete-workspace-button"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {isDeleting ? 'Deleting…' : 'Delete workspace'}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
