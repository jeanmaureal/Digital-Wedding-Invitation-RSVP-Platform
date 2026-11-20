import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, RefreshCw, Search } from 'lucide-react';
import { type JSX, useDeferredValue, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  createOrganizerRsvpQuestion,
  deleteOrganizerRsvpQuestion,
  fetchWeddingRsvpOverview,
  updateOrganizerRsvpQuestion,
} from '@/features/rsvp/api/organizerRsvpApi';
import { translateOrganizerRsvpError } from '@/features/rsvp/api/rsvpErrors';
import { RsvpQuestionsManagerCard } from '@/features/rsvp/components/organizer/RsvpQuestionsManagerCard';
import { rsvpQueryKeys } from '@/features/rsvp/queryKeys';
import type {
  OrganizerHouseholdRsvpEntry,
  RsvpQuestionFormValues,
} from '@/features/rsvp/schemas/organizerRsvpSchemas';
import type { WorkspaceRole } from '@/features/workspace/schemas/workspaceSchemas';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

export interface WeddingRsvpDashboardProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly callerRole: WorkspaceRole;
  readonly client?: TypedSupabaseClient | null;
}

type ResponseFilter = 'all' | 'attending' | 'declined' | 'pending';

function canManageRsvpQuestions(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

export function WeddingRsvpDashboard({
  userId,
  workspaceId,
  weddingId,
  callerRole,
  client,
}: WeddingRsvpDashboardProps): JSX.Element {
  const queryClient = useQueryClient();
  const isWritable = canManageRsvpQuestions(callerRole);
  const overviewKey = rsvpQueryKeys.overview(userId, workspaceId, weddingId);

  const [statusFilter, setStatusFilter] = useState<ResponseFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const overviewQuery = useQuery({
    queryKey: overviewKey,
    queryFn: () =>
      fetchWeddingRsvpOverview({
        workspaceId,
        weddingId,
        ...(client !== undefined ? { client } : {}),
      }),
    enabled: Boolean(userId && workspaceId && weddingId),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  async function invalidateOverview(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: overviewKey });
  }

  const createQuestionMutation = useMutation({
    mutationFn: (values: RsvpQuestionFormValues) =>
      createOrganizerRsvpQuestion({
        workspaceId,
        weddingId,
        values,
        sortOrder: overviewQuery.data?.questions.length ?? 0,
        ...(client !== undefined ? { client } : {}),
      }),
    onSuccess: async (created) => {
      setMutationError(null);
      setFeedback(`Added custom RSVP question "${created.label}".`);
      await invalidateOverview();
    },
    onError: (err) => {
      setMutationError(translateOrganizerRsvpError(err).message);
    },
  });

  const updateQuestionMutation = useMutation({
    mutationFn: (params: {
      readonly questionId: string;
      readonly sortOrder: number;
      readonly values: RsvpQuestionFormValues;
    }) =>
      updateOrganizerRsvpQuestion({
        workspaceId,
        weddingId,
        questionId: params.questionId,
        sortOrder: params.sortOrder,
        values: params.values,
        ...(client !== undefined ? { client } : {}),
      }),
    onSuccess: async (updated) => {
      setMutationError(null);
      setFeedback(`Updated custom RSVP question "${updated.label}".`);
      await invalidateOverview();
    },
    onError: (err) => {
      setMutationError(translateOrganizerRsvpError(err).message);
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (questionId: string) =>
      deleteOrganizerRsvpQuestion({
        workspaceId,
        weddingId,
        questionId,
        ...(client !== undefined ? { client } : {}),
      }),
    onSuccess: async () => {
      setMutationError(null);
      setFeedback('Removed custom RSVP question.');
      await invalidateOverview();
    },
    onError: (err) => {
      setMutationError(translateOrganizerRsvpError(err).message);
    },
  });

  const filteredHouseholds = useMemo((): readonly OrganizerHouseholdRsvpEntry[] => {
    const all = overviewQuery.data?.households ?? [];
    const normalizedSearch = deferredSearchQuery.trim().toLowerCase();

    return all.filter((entry) => {
      if (statusFilter !== 'all' && entry.responseState !== statusFilter) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      if (entry.displayName.toLowerCase().includes(normalizedSearch)) {
        return true;
      }
      return entry.attendees.some((att) =>
        `${att.firstName} ${att.lastName}`.toLowerCase().includes(normalizedSearch),
      );
    });
  }, [overviewQuery.data?.households, statusFilter, deferredSearchQuery]);

  if (overviewQuery.isPending) {
    return (
      <Card data-testid="rsvp-dashboard-loading">
        <CardContent className="text-muted-foreground py-10 text-center text-sm">
          Loading RSVP responses &amp; custom questions…
        </CardContent>
      </Card>
    );
  }

  if (overviewQuery.isError) {
    return (
      <Card role="alert" data-testid="rsvp-dashboard-error">
        <CardHeader>
          <CardTitle>Unable to Load RSVP Overview</CardTitle>
          <CardDescription>
            {translateOrganizerRsvpError(overviewQuery.error).message}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void overviewQuery.refetch()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const overview = overviewQuery.data;
  const isMutatingQuestion =
    createQuestionMutation.isPending ||
    updateQuestionMutation.isPending ||
    deleteQuestionMutation.isPending;

  return (
    <div className="space-y-6" data-testid="wedding-rsvp-dashboard">
      {/* Metrics Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-xs font-medium">Responded Households</p>
            <p data-testid="rsvp-metric-responded" className="mt-1 text-2xl font-semibold">
              {overview.respondedHouseholdsCount} / {overview.totalHouseholds}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-xs font-medium">Awaiting RSVP</p>
            <p data-testid="rsvp-metric-pending" className="mt-1 text-2xl font-semibold">
              {overview.pendingHouseholdsCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-xs font-medium">Attending Households</p>
            <p
              data-testid="rsvp-metric-attending-households"
              className="mt-1 text-2xl font-semibold"
            >
              {overview.attendingHouseholdsCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-xs font-medium">Declined Households</p>
            <p
              data-testid="rsvp-metric-declined-households"
              className="mt-1 text-2xl font-semibold"
            >
              {overview.declinedHouseholdsCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-xs font-medium">Confirmed Attending Guests</p>
            <p data-testid="rsvp-metric-attending-guests" className="mt-1 text-2xl font-semibold">
              {overview.totalAttendingGuestsCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {!isWritable ? (
        <Card data-testid="rsvp-viewer-readonly-banner" className="bg-muted/30">
          <CardContent className="text-muted-foreground py-3 text-xs">
            You have <strong>Viewer</strong> access in this workspace. Custom RSVP questions and
            household responses are read-only.
          </CardContent>
        </Card>
      ) : null}

      {feedback ? (
        <div
          role="status"
          data-testid="rsvp-action-feedback"
          className="flex items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-500/5 px-3.5 py-2.5 text-xs font-medium"
        >
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
          <span>{feedback}</span>
        </div>
      ) : null}

      {/* Custom RSVP Questions Manager */}
      <RsvpQuestionsManagerCard
        questions={overview.questions}
        isWritable={isWritable}
        isMutating={isMutatingQuestion}
        mutationError={mutationError}
        onCreateQuestion={async (values) => {
          await createQuestionMutation.mutateAsync(values);
        }}
        onUpdateQuestion={async (questionId, sortOrder, values) => {
          await updateQuestionMutation.mutateAsync({ questionId, sortOrder, values });
        }}
        onDeleteQuestion={async (questionId) => {
          await deleteQuestionMutation.mutateAsync(questionId);
        }}
      />

      {/* Household Responses Section */}
      <Card data-testid="rsvp-responses-card">
        <CardHeader>
          <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0 space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardCheck className="text-primary size-5 shrink-0" aria-hidden="true" />
                <span>Household RSVP Responses</span>
              </CardTitle>
              <CardDescription>
                Live server-verified household submissions, dietary notes, and custom question
                answers. CSV attendance export &amp; version analytics arrive in Phase 8.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void overviewQuery.refetch()}
              data-testid="refresh-rsvp-responses-button"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter RSVP status">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'attending', label: 'Attending' },
                  { id: 'declined', label: 'Declined' },
                  { id: 'pending', label: 'Awaiting RSVP' },
                ] as const
              ).map((tab) => (
                <Button
                  key={tab.id}
                  type="button"
                  size="sm"
                  variant={statusFilter === tab.id ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(tab.id)}
                  data-testid={`rsvp-filter-${tab.id}`}
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            <div className="relative max-w-xs flex-1">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search household or guest…"
                aria-label="Search household or guest"
                className="pl-8"
              />
            </div>
          </div>

          {filteredHouseholds.length === 0 ? (
            <p
              data-testid="rsvp-responses-empty"
              className="text-muted-foreground py-8 text-center text-xs"
            >
              No household entries match the selected filter.
            </p>
          ) : (
            <div className="space-y-3">
              {filteredHouseholds.map((entry) => (
                <div
                  key={entry.groupId}
                  data-testid={`rsvp-household-entry-${entry.groupId}`}
                  className="space-y-3 rounded-lg border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{entry.displayName}</span>
                      {entry.responseState === 'attending' ? (
                        <Badge variant="secondary" data-testid={`rsvp-status-${entry.groupId}`}>
                          Attending ({entry.submission?.attending_count ?? 0} / {entry.maxAttendees}
                          )
                        </Badge>
                      ) : entry.responseState === 'declined' ? (
                        <Badge variant="outline" data-testid={`rsvp-status-${entry.groupId}`}>
                          Declined
                        </Badge>
                      ) : (
                        <Badge variant="outline" data-testid={`rsvp-status-${entry.groupId}`}>
                          Awaiting RSVP
                        </Badge>
                      )}
                    </div>

                    {entry.submission ? (
                      <span className="text-muted-foreground text-xs">
                        Response v{entry.submission.response_version} · Updated{' '}
                        {new Date(entry.submission.updated_at).toLocaleDateString('en-US', {
                          dateStyle: 'medium',
                        })}
                      </span>
                    ) : null}
                  </div>

                  {entry.attendees.length > 0 ? (
                    <ul className="flex flex-wrap gap-2 text-xs">
                      {entry.attendees.map((att) => (
                        <li
                          key={att.guestId}
                          className="bg-muted/30 inline-flex flex-wrap items-center gap-1.5 rounded-md border px-2.5 py-1"
                        >
                          <span className="font-medium">
                            {att.firstName} {att.lastName}
                          </span>
                          <span className="text-muted-foreground">
                            ·{' '}
                            {att.attendanceStatus === 'attending'
                              ? 'Attending'
                              : att.attendanceStatus === 'declined'
                                ? 'Declined'
                                : 'Pending'}
                          </span>
                          {att.dietaryNotes && att.attendanceStatus === 'attending' ? (
                            <Badge variant="outline" className="text-[10px]">
                              {att.dietaryNotes}
                            </Badge>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {entry.answers.length > 0 ? (
                    <div className="bg-muted/20 space-y-1 rounded-md border p-2.5 text-xs">
                      {entry.answers.map((ans) => (
                        <div key={ans.questionId}>
                          <span className="text-muted-foreground">{ans.questionLabel}:</span>{' '}
                          <strong className="font-medium">{ans.answerText}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {entry.submission?.household_note ? (
                    <p className="text-muted-foreground text-xs italic">
                      &ldquo;{entry.submission.household_note}&rdquo;
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
