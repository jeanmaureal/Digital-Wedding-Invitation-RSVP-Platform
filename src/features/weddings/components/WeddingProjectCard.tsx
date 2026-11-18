import { Archive, ArchiveRestore, Calendar, Clock, Copy, Globe, Lock, MapPin } from 'lucide-react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { WeddingProjectWithSettings } from '@/features/weddings/api/weddingApi';
import {
  canArchiveOrRestoreWedding,
  canDuplicateWedding,
} from '@/features/weddings/permissions/weddingPermissions';
import {
  WEDDING_ACCESS_MODE_LABELS,
  WEDDING_STATUS_LABELS,
} from '@/features/weddings/schemas/weddingSchemas';
import {
  formatCalendarDateDisplay,
  utcIsoToLocalDateTimeInTimezone,
} from '@/features/weddings/utils/weddingTimezone';
import type { WorkspaceRole } from '@/features/workspace/schemas/workspaceSchemas';
import { buildOrganizerWeddingPath } from '@/lib/constants/routes';

export interface WeddingProjectCardProps {
  readonly project: WeddingProjectWithSettings;
  readonly callerRole: WorkspaceRole;
  readonly isArchivePending: boolean;
  readonly onRequestDuplicate: () => void;
  readonly onToggleArchive: () => void;
}

export function WeddingProjectCard({
  project,
  callerRole,
  isArchivePending,
  onRequestDuplicate,
  onToggleArchive,
}: WeddingProjectCardProps): JSX.Element {
  const { wedding, settings } = project;
  const isArchived = wedding.status === 'archived';
  const canDuplicate = canDuplicateWedding(callerRole);
  const canArchive = canArchiveOrRestoreWedding(callerRole);

  const deadlineSummary = settings.rsvp_deadline
    ? utcIsoToLocalDateTimeInTimezone(settings.rsvp_deadline, settings.timezone).formatted
    : 'No RSVP deadline set';

  const venueSummary = [wedding.venue_name, wedding.venue_location]
    .filter((part) => part.trim().length > 0)
    .join(' · ');

  return (
    <Card
      data-testid={`wedding-project-card-${wedding.slug}`}
      className={isArchived ? 'opacity-80' : undefined}
    >
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant={isArchived ? 'outline' : 'secondary'}
              data-testid={`wedding-status-badge-${wedding.slug}`}
            >
              {WEDDING_STATUS_LABELS[wedding.status]}
            </Badge>
            <Badge variant="outline">
              {settings.access_mode === 'invite_only' ? (
                <Lock className="mr-1 size-3" aria-hidden="true" />
              ) : (
                <Globe className="mr-1 size-3" aria-hidden="true" />
              )}
              {WEDDING_ACCESS_MODE_LABELS[settings.access_mode]}
            </Badge>
            {wedding.duplicated_from_wedding_id ? (
              <Badge variant="outline" data-testid={`wedding-duplicated-badge-${wedding.slug}`}>
                Duplicated
              </Badge>
            ) : null}
          </div>

          <code className="text-muted-foreground text-xs">/w/{wedding.slug}</code>
        </div>

        <div>
          <CardTitle className="text-lg">{wedding.title}</CardTitle>
          <CardDescription>
            {wedding.partner_one_name} &amp; {wedding.partner_two_name}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="text-muted-foreground grid gap-1.5 text-xs">
          <div className="flex items-center gap-2">
            <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
            <dt className="sr-only">Celebration date</dt>
            <dd>
              <strong className="text-foreground">
                {formatCalendarDateDisplay(wedding.event_date)}
              </strong>{' '}
              · {settings.timezone}
            </dd>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            <dt className="sr-only">RSVP deadline</dt>
            <dd>
              RSVP: {settings.is_rsvp_open ? 'Open' : 'Paused'} · {deadlineSummary}
            </dd>
          </div>

          {venueSummary ? (
            <div className="flex items-center gap-2">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <dt className="sr-only">Venue</dt>
              <dd className="truncate">{venueSummary}</dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button asChild size="sm" data-testid={`open-wedding-button-${wedding.slug}`}>
            <Link to={buildOrganizerWeddingPath(wedding.id)}>Manage project</Link>
          </Button>

          {canDuplicate ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRequestDuplicate}
              data-testid={`duplicate-wedding-button-${wedding.slug}`}
            >
              <Copy className="size-3.5" aria-hidden="true" />
              Duplicate
            </Button>
          ) : null}

          {canArchive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isArchivePending}
              onClick={onToggleArchive}
              data-testid={`archive-toggle-button-${wedding.slug}`}
            >
              {isArchived ? (
                <>
                  <ArchiveRestore className="size-3.5" aria-hidden="true" />
                  Restore draft
                </>
              ) : (
                <>
                  <Archive className="size-3.5" aria-hidden="true" />
                  Archive
                </>
              )}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
