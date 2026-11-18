import { useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Copy, Trash2 } from 'lucide-react';
import { type JSX, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  deleteOrganizerWedding,
  setOrganizerWeddingArchiveStatus,
  type WeddingRecord,
} from '@/features/weddings/api/weddingApi';
import { translateWeddingError } from '@/features/weddings/api/weddingErrors';
import { DuplicateWeddingCard } from '@/features/weddings/components/DuplicateWeddingCard';
import {
  canArchiveOrRestoreWedding,
  canDuplicateWedding,
  canPermanentlyDeleteWedding,
} from '@/features/weddings/permissions/weddingPermissions';
import { weddingQueryKeys } from '@/features/weddings/queryKeys';
import {
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from '@/features/workspace/schemas/workspaceSchemas';
import { buildOrganizerWeddingPath, ROUTES } from '@/lib/constants/routes';

export interface WeddingLifecycleCardProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly callerRole: WorkspaceRole;
  readonly wedding: WeddingRecord;
}

export function WeddingLifecycleCard({
  userId,
  workspaceId,
  callerRole,
  wedding,
}: WeddingLifecycleCardProps): JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [isArchivePending, setIsArchivePending] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const [confirmSlug, setConfirmSlug] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isArchived = wedding.status === 'archived';
  const canDuplicate = canDuplicateWedding(callerRole);
  const canArchive = canArchiveOrRestoreWedding(callerRole);
  const canDelete = canPermanentlyDeleteWedding(callerRole);
  const slugMatches = confirmSlug.trim().toLowerCase() === wedding.slug.toLowerCase();

  const onToggleArchive = async (): Promise<void> => {
    setArchiveError(null);
    setIsArchivePending(true);
    try {
      await setOrganizerWeddingArchiveStatus({
        workspaceId,
        weddingId: wedding.id,
        archived: !isArchived,
      });
      await queryClient.invalidateQueries({
        queryKey: weddingQueryKeys.allInWorkspace(userId, workspaceId),
      });
    } catch (error: unknown) {
      setArchiveError(translateWeddingError(error).message);
    } finally {
      setIsArchivePending(false);
    }
  };

  const onDeleteWedding = async (): Promise<void> => {
    if (!slugMatches) {
      return;
    }
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteOrganizerWedding({
        workspaceId,
        weddingId: wedding.id,
      });
      await queryClient.invalidateQueries({
        queryKey: weddingQueryKeys.allInWorkspace(userId, workspaceId),
      });
      void navigate(ROUTES.organizerRoot, { replace: true });
    } catch (error: unknown) {
      setDeleteError(translateWeddingError(error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {showDuplicateForm && canDuplicate ? (
        <DuplicateWeddingCard
          key={`${workspaceId}:${wedding.id}`}
          userId={userId}
          workspaceId={workspaceId}
          sourceWedding={wedding}
          onCancel={() => setShowDuplicateForm(false)}
          onDuplicated={(duplicated) => {
            setShowDuplicateForm(false);
            void navigate(buildOrganizerWeddingPath(duplicated.id));
          }}
        />
      ) : null}

      <Card data-testid="wedding-lifecycle-card" className="border-destructive/30">
        <CardHeader>
          <CardTitle>Duplication, Archiving &amp; Danger Zone</CardTitle>
          <CardDescription>
            Clone this project within the current workspace, archive completed celebrations, or
            permanently remove draft projects (`P2-AC03`, `P2-AC05`).
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <p className="text-sm font-medium">Duplicate project configuration</p>
              <p className="text-muted-foreground text-xs">
                Creates an independent Draft wedding in this workspace with cloned timezone and
                access settings.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canDuplicate}
              onClick={() => setShowDuplicateForm((prev) => !prev)}
              data-testid="detail-duplicate-wedding-button"
            >
              <Copy className="size-4" aria-hidden="true" />
              Duplicate wedding
            </Button>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {isArchived ? 'Restore archived project to Draft' : 'Archive wedding project'}
                </p>
                <p className="text-muted-foreground text-xs">
                  {isArchived
                    ? 'Returns this project to active Draft status so organizers can continue editing.'
                    : 'Moves this project into the Archived filter without deleting any settings or history.'}
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canArchive || isArchivePending}
                onClick={() => void onToggleArchive()}
                data-testid="detail-archive-wedding-button"
              >
                {isArchived ? (
                  <>
                    <ArchiveRestore className="size-4" aria-hidden="true" />
                    {isArchivePending ? 'Restoring…' : 'Restore to Draft'}
                  </>
                ) : (
                  <>
                    <Archive className="size-4" aria-hidden="true" />
                    {isArchivePending ? 'Archiving…' : 'Archive wedding'}
                  </>
                )}
              </Button>
            </div>

            {archiveError ? (
              <div
                role="alert"
                data-testid="detail-archive-wedding-error"
                className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-sm"
              >
                {archiveError}
              </div>
            ) : null}
          </div>

          {canDelete ? (
            <div className="border-destructive/30 bg-destructive/5 space-y-3 rounded-lg border p-4">
              <div className="space-y-1">
                <p className="text-destructive text-sm font-medium">
                  Delete wedding project permanently
                </p>
                <p className="text-muted-foreground text-xs">
                  Permanently deletes <strong className="text-foreground">{wedding.title}</strong>{' '}
                  and its 1:1 wedding settings. Type{' '}
                  <code className="text-foreground font-semibold">{wedding.slug}</code> to confirm.
                </p>
              </div>

              {deleteError ? (
                <div
                  role="alert"
                  data-testid="delete-wedding-error"
                  className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-sm"
                >
                  {deleteError}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="delete-wedding-confirm-slug">Confirm wedding slug</Label>
                  <Input
                    id="delete-wedding-confirm-slug"
                    type="text"
                    value={confirmSlug}
                    onChange={(event) => setConfirmSlug(event.target.value)}
                    placeholder={wedding.slug}
                    disabled={isDeleting}
                    data-testid="delete-wedding-confirm-input"
                  />
                </div>

                <Button
                  type="button"
                  variant="destructive"
                  disabled={!slugMatches || isDeleting}
                  onClick={() => void onDeleteWedding()}
                  data-testid="delete-wedding-button"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {isDeleting ? 'Deleting…' : 'Delete wedding'}
                </Button>
              </div>
            </div>
          ) : (
            <div
              data-testid="delete-wedding-restricted-notice"
              className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-xs"
            >
              Permanent wedding deletion is restricted to workspace Owners and Admins (your current
              role: <strong className="text-foreground">{WORKSPACE_ROLE_LABELS[callerRole]}</strong>
              ).
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
