import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, EyeOff, Globe, Lock, RefreshCw, Send } from 'lucide-react';
import { type JSX, useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  fetchOrganizerPublicationSummary,
  publishOrganizerWedding,
  unpublishOrganizerWedding,
} from '@/features/publishing/api/organizerPublishingApi';
import { translatePublishingError } from '@/features/publishing/api/publishingErrors';
import { publishingQueryKeys } from '@/features/publishing/queryKeys';
import type { WeddingRecord, WeddingSettingsRecord } from '@/features/weddings/api/weddingApi';
import { canCreateOrEditWedding } from '@/features/weddings/permissions/weddingPermissions';
import { weddingQueryKeys } from '@/features/weddings/queryKeys';
import {
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from '@/features/workspace/schemas/workspaceSchemas';
import { buildPublicWeddingPath } from '@/lib/constants/routes';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

export interface WeddingPublishingCardProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly callerRole: WorkspaceRole;
  readonly wedding: WeddingRecord;
  readonly settings: WeddingSettingsRecord;
  readonly client?: TypedSupabaseClient | null | undefined;
}

export function WeddingPublishingCard({
  userId,
  workspaceId,
  callerRole,
  wedding,
  settings,
  client,
}: WeddingPublishingCardProps): JSX.Element {
  const queryClient = useQueryClient();
  const canPublish = canCreateOrEditWedding(callerRole);
  const isArchived = wedding.status === 'archived';
  const publicPath = buildPublicWeddingPath(wedding.slug);

  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const summaryQuery = useQuery({
    queryKey: publishingQueryKeys.organizerSummary(userId, workspaceId, wedding.id),
    queryFn: () =>
      fetchOrganizerPublicationSummary(
        {
          workspaceId,
          weddingId: wedding.id,
          weddingUpdatedAt: wedding.updated_at,
          settingsUpdatedAt: settings.updated_at,
        },
        client,
      ),
    enabled: Boolean(userId && workspaceId && wedding.id),
  });

  const activeVersion = summaryQuery.data?.activeVersion ?? null;
  const latestVersionNumber = summaryQuery.data?.latestVersionNumber ?? 0;
  const isPublished = wedding.status === 'published' && activeVersion !== null;

  const isRolledBackVersion = isPublished && activeVersion.version_number < latestVersionNumber;

  const hasUnpublishedDraftChanges =
    isPublished &&
    summaryQuery.data !== undefined &&
    Date.parse(summaryQuery.data.lastDraftUpdatedAt) > Date.parse(activeVersion.published_at);

  const nextVersionNumber = latestVersionNumber + 1;

  const invalidatePublicationQueries = async () => {
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
  };

  const handlePublish = async (): Promise<void> => {
    if (!canPublish || isArchived || isMutating) {
      return;
    }
    setActionError(null);
    setStatusNotice(null);
    setIsMutating(true);
    try {
      const published = await publishOrganizerWedding(
        {
          workspaceId,
          weddingId: wedding.id,
        },
        client,
      );
      await invalidatePublicationQueries();
      setStatusNotice(
        `Published immutable snapshot v${published.version_number} to ${publicPath}.`,
      );
    } catch (error: unknown) {
      setActionError(translatePublishingError(error).message);
    } finally {
      setIsMutating(false);
    }
  };

  const handleUnpublish = async (): Promise<void> => {
    if (!canPublish || !isPublished || isMutating) {
      return;
    }
    setActionError(null);
    setStatusNotice(null);
    setIsMutating(true);
    try {
      await unpublishOrganizerWedding(
        {
          workspaceId,
          weddingId: wedding.id,
        },
        client,
      );
      await invalidatePublicationQueries();
      setStatusNotice(
        `Website unpublished and returned to Draft. Historical snapshots remain preserved.`,
      );
    } catch (error: unknown) {
      setActionError(translatePublishingError(error).message);
    } finally {
      setIsMutating(false);
    }
  };

  const handleCopyPublicUrl = async (): Promise<void> => {
    const fullUrl = `${window.location.origin}${publicPath}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setCopiedLink(false);
    }
  };

  return (
    <Card data-testid="wedding-publishing-card">
      <CardHeader className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Globe className="text-primary size-5" aria-hidden="true" />
            <span>Public Wedding Website &amp; Snapshot Publishing</span>
          </CardTitle>
          <CardDescription>
            Publish an immutable snapshot to <code>{publicPath}</code>. Editing your draft in the
            Builder never alters the live public site until you explicitly republish.
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!canPublish ? (
            <Badge variant="outline" data-testid="publishing-readonly-badge">
              Read-only ({WORKSPACE_ROLE_LABELS[callerRole]})
            </Badge>
          ) : null}

          {isPublished ? (
            <Badge variant="secondary" data-testid="publishing-active-version-badge">
              Published · v{activeVersion.version_number}
            </Badge>
          ) : (
            <Badge variant="outline" data-testid="publishing-draft-badge">
              {isArchived ? 'Archived · Offline' : 'Draft · Not Published'}
            </Badge>
          )}

          {isRolledBackVersion ? (
            <Badge variant="outline" data-testid="publishing-rolled-back-badge">
              Rolled back · Latest v{latestVersionNumber}
            </Badge>
          ) : null}

          {hasUnpublishedDraftChanges ? (
            <Badge variant="outline" data-testid="unpublished-draft-changes-badge">
              Unpublished draft changes
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {actionError ? (
          <div
            role="alert"
            data-testid="publishing-action-error"
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-sm"
          >
            {actionError}
          </div>
        ) : null}

        {statusNotice ? (
          <div
            role="status"
            data-testid="publishing-status-notice"
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-900 dark:text-emerald-200"
          >
            {statusNotice}
          </div>
        ) : null}

        {settings.access_mode === 'invite_only' ? (
          <div
            data-testid="publish-invite-only-notice"
            className="bg-muted/40 flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs"
          >
            <Lock className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Invite-Only mode active:</strong> Visitors opening{' '}
              <code>{publicPath}</code> without a personal household invitation link will see a
              private celebration notice with zero venue or schedule details leaked.
            </p>
          </div>
        ) : null}

        <div className="bg-muted/25 flex flex-col justify-between gap-4 rounded-lg border p-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              Public address: <code className="font-semibold">{publicPath}</code>
            </p>
            <p className="text-muted-foreground text-xs">
              {summaryQuery.isPending
                ? 'Checking publication snapshot status…'
                : isPublished
                  ? `Serving immutable snapshot v${activeVersion.version_number} (published ${new Date(
                      activeVersion.published_at,
                    ).toLocaleString()}).`
                  : latestVersionNumber > 0
                    ? `Currently offline (${latestVersionNumber} historical snapshot${
                        latestVersionNumber === 1 ? '' : 's'
                      } preserved).`
                    : 'No snapshot has been published yet — visitors see "Invitation Not Yet Available".'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="copy-public-wedding-link-button"
              onClick={() => void handleCopyPublicUrl()}
            >
              {copiedLink ? (
                <>
                  <Check className="size-3.5" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="size-3.5" aria-hidden="true" />
                  Copy URL
                </>
              )}
            </Button>

            <Button asChild variant="outline" size="sm">
              <Link
                to={publicPath}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="open-public-wedding-link"
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                Open /w/{wedding.slug}
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={!canPublish || isArchived || isMutating || summaryQuery.isPending}
              data-testid="publish-wedding-button"
              onClick={() => void handlePublish()}
            >
              <Send className="size-4" aria-hidden="true" />
              {isMutating
                ? 'Updating…'
                : latestVersionNumber === 0
                  ? 'Publish website (v1)'
                  : `Republish website (v${nextVersionNumber})`}
            </Button>

            {isPublished ? (
              <Button
                type="button"
                variant="outline"
                disabled={!canPublish || isMutating}
                data-testid="unpublish-wedding-button"
                onClick={() => void handleUnpublish()}
              >
                <EyeOff className="size-4" aria-hidden="true" />
                Unpublish to Draft
              </Button>
            ) : null}
          </div>

          {summaryQuery.isError ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void summaryQuery.refetch()}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Retry status check
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
