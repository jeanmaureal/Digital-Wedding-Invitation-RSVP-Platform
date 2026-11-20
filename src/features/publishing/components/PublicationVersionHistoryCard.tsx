import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  History,
  Monitor,
  RefreshCw,
  RotateCcw,
  Smartphone,
} from 'lucide-react';
import { type JSX, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  InvitationRenderer,
  type InvitationViewportMode,
} from '@/features/design/components/InvitationRenderer';
import {
  fetchOrganizerPublicationHistory,
  rollbackOrganizerWeddingVersion,
} from '@/features/publishing/api/organizerPublishingApi';
import { translatePublishingError } from '@/features/publishing/api/publishingErrors';
import { publishingQueryKeys } from '@/features/publishing/queryKeys';
import type { WeddingRecord } from '@/features/weddings/api/weddingApi';
import { canCreateOrEditWedding } from '@/features/weddings/permissions/weddingPermissions';
import { weddingQueryKeys } from '@/features/weddings/queryKeys';
import {
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from '@/features/workspace/schemas/workspaceSchemas';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

export interface PublicationVersionHistoryCardProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly callerRole: WorkspaceRole;
  readonly wedding: WeddingRecord;
  readonly client?: TypedSupabaseClient | null | undefined;
}

export function PublicationVersionHistoryCard({
  userId,
  workspaceId,
  callerRole,
  wedding,
  client,
}: PublicationVersionHistoryCardProps): JSX.Element {
  const queryClient = useQueryClient();
  const canRollback = canCreateOrEditWedding(callerRole);
  const isArchived = wedding.status === 'archived';

  const [previewVersionNumber, setPreviewVersionNumber] = useState<number | null>(null);
  const [previewViewport, setPreviewViewport] = useState<InvitationViewportMode>('desktop');
  const [confirmRollbackVersion, setConfirmRollbackVersion] = useState<number | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: publishingQueryKeys.versionHistory(userId, workspaceId, wedding.id),
    queryFn: () =>
      fetchOrganizerPublicationHistory(
        {
          workspaceId,
          weddingId: wedding.id,
        },
        client,
      ),
    enabled: Boolean(userId && workspaceId && wedding.id),
  });

  const handleConfirmRollback = async (targetVersionNumber: number): Promise<void> => {
    if (!canRollback || isArchived || isRollingBack) {
      return;
    }
    setActionError(null);
    setFeedback(null);
    setIsRollingBack(true);
    try {
      const activated = await rollbackOrganizerWeddingVersion(
        {
          workspaceId,
          weddingId: wedding.id,
          targetVersionNumber,
        },
        client,
      );
      setConfirmRollbackVersion(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: weddingQueryKeys.allInWorkspace(userId, workspaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: publishingQueryKeys.organizerSummary(userId, workspaceId, wedding.id),
        }),
        queryClient.invalidateQueries({
          queryKey: publishingQueryKeys.versionHistory(userId, workspaceId, wedding.id),
        }),
        queryClient.invalidateQueries({
          queryKey: publishingQueryKeys.publicBySlug(wedding.slug),
        }),
      ]);
      setFeedback(
        `Activated immutable snapshot v${activated.version_number} on /w/${wedding.slug} and /i/:token links. Builder drafts and guest RSVPs were preserved.`,
      );
    } catch (error: unknown) {
      setActionError(translatePublishingError(error).message);
    } finally {
      setIsRollingBack(false);
    }
  };

  const versions = historyQuery.data ?? [];

  return (
    <Card data-testid="publication-version-history-card">
      <CardHeader className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2">
            <History className="text-primary size-5 shrink-0" aria-hidden="true" />
            <span>Immutable Publication History &amp; Version Rollback</span>
          </CardTitle>
          <CardDescription>
            Inspect every published snapshot, preview historical designs, or roll back live{' '}
            <code>/w/{wedding.slug}</code> &amp; <code>/i/:token</code> pages without altering
            Builder drafts or guest RSVPs.
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!canRollback ? (
            <Badge variant="outline" data-testid="version-history-readonly-badge">
              Read-only ({WORKSPACE_ROLE_LABELS[callerRole]})
            </Badge>
          ) : null}
          <Badge variant="outline" data-testid="version-history-count-badge">
            {versions.length} {versions.length === 1 ? 'snapshot' : 'snapshots'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {actionError ? (
          <div
            role="alert"
            data-testid="version-history-error-alert"
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-xs font-medium"
          >
            {actionError}
          </div>
        ) : null}

        {feedback ? (
          <div
            role="status"
            data-testid="version-history-feedback"
            className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-emerald-900 dark:text-emerald-200"
          >
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <span>{feedback}</span>
          </div>
        ) : null}

        {historyQuery.isPending ? (
          <p
            data-testid="version-history-loading"
            className="text-muted-foreground py-6 text-center text-xs"
          >
            Loading immutable publication history…
          </p>
        ) : historyQuery.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3.5 text-xs">
            <span className="text-destructive">
              {translatePublishingError(historyQuery.error).message}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void historyQuery.refetch()}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : versions.length === 0 ? (
          <p
            data-testid="version-history-empty"
            className="text-muted-foreground bg-muted/20 rounded-lg border border-dashed py-8 text-center text-xs"
          >
            No snapshots have been published yet. Click <strong>Publish website (v1)</strong> above
            to record your first immutable version.
          </p>
        ) : (
          <div className="space-y-3">
            {versions.map((entry) => {
              const isPreviewOpen = previewVersionNumber === entry.versionNumber;
              const isConfirmingThis = confirmRollbackVersion === entry.versionNumber;
              const isRestoringFromDraft = wedding.status !== 'published';

              return (
                <div
                  key={entry.id}
                  data-testid={`version-history-row-${entry.versionNumber}`}
                  className="space-y-3 rounded-lg border p-4"
                >
                  <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          Snapshot v{entry.versionNumber}
                        </span>
                        {entry.isActive ? (
                          <Badge
                            variant="secondary"
                            data-testid={`version-active-badge-${entry.versionNumber}`}
                          >
                            Active Live
                          </Badge>
                        ) : (
                          <Badge variant="outline">Historical</Badge>
                        )}
                        <Badge variant="outline">
                          {entry.accessMode === 'invite_only' ? 'Invite-Only' : 'Public'}
                        </Badge>
                        <Badge variant="outline">{entry.themePresetLabel}</Badge>
                        <Badge variant="outline">
                          {entry.visibleSectionCount} visible{' '}
                          {entry.visibleSectionCount === 1 ? 'section' : 'sections'}
                        </Badge>
                      </div>

                      <p className="text-muted-foreground text-xs leading-relaxed">
                        Published {new Date(entry.publishedAt).toLocaleString()} by{' '}
                        <strong className="text-foreground">{entry.publishedByName}</strong>
                        {entry.heroHeadline ? ` · Hero: “${entry.heroHeadline}”` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {entry.document ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setPreviewVersionNumber(isPreviewOpen ? null : entry.versionNumber)
                          }
                          data-testid={`preview-version-button-${entry.versionNumber}`}
                        >
                          {isPreviewOpen ? (
                            <>
                              <EyeOff className="size-3.5" aria-hidden="true" />
                              Hide Preview
                            </>
                          ) : (
                            <>
                              <Eye className="size-3.5" aria-hidden="true" />
                              Preview v{entry.versionNumber}
                            </>
                          )}
                        </Button>
                      ) : null}

                      {canRollback && !isArchived && !entry.isActive ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={isRollingBack}
                          onClick={() =>
                            setConfirmRollbackVersion(isConfirmingThis ? null : entry.versionNumber)
                          }
                          data-testid={`open-rollback-version-${entry.versionNumber}`}
                        >
                          <RotateCcw className="size-3.5" aria-hidden="true" />
                          {isRestoringFromDraft
                            ? `Restore v${entry.versionNumber} Live`
                            : `Roll Back to v${entry.versionNumber}`}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {isConfirmingThis ? (
                    <div
                      data-testid={`rollback-confirm-panel-${entry.versionNumber}`}
                      className="bg-muted/40 flex flex-col justify-between gap-3 rounded-lg border p-3.5 sm:flex-row sm:items-center"
                    >
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        <strong className="text-foreground">
                          Activate immutable snapshot v{entry.versionNumber}?
                        </strong>{' '}
                        Visitors on <code>/w/{wedding.slug}</code> and invited households on{' '}
                        <code>/i/:token</code> will immediately see v{entry.versionNumber}. Your
                        Builder draft, guest directory, QR links, and RSVP submissions remain
                        untouched.
                      </p>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={isRollingBack}
                          onClick={() => void handleConfirmRollback(entry.versionNumber)}
                          data-testid={`confirm-rollback-version-${entry.versionNumber}`}
                        >
                          {isRollingBack
                            ? 'Activating…'
                            : `Confirm v${entry.versionNumber} Activation`}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isRollingBack}
                          onClick={() => setConfirmRollbackVersion(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {isPreviewOpen && entry.document ? (
                    <div
                      data-testid={`version-snapshot-preview-${entry.versionNumber}`}
                      className="bg-muted/20 space-y-3 rounded-lg border p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium">
                          Immutable Snapshot Preview · v{entry.versionNumber}
                        </p>
                        <div
                          className="flex items-center gap-1.5"
                          role="group"
                          aria-label="Snapshot preview viewport"
                        >
                          <Button
                            type="button"
                            size="sm"
                            variant={previewViewport === 'desktop' ? 'default' : 'outline'}
                            onClick={() => setPreviewViewport('desktop')}
                            data-testid={`version-preview-desktop-${entry.versionNumber}`}
                          >
                            <Monitor className="size-3.5" aria-hidden="true" />
                            Desktop
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={previewViewport === 'mobile' ? 'default' : 'outline'}
                            onClick={() => setPreviewViewport('mobile')}
                            data-testid={`version-preview-mobile-${entry.versionNumber}`}
                          >
                            <Smartphone className="size-3.5" aria-hidden="true" />
                            Mobile
                          </Button>
                        </div>
                      </div>

                      <InvitationRenderer
                        document={entry.document}
                        viewportMode={previewViewport}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
