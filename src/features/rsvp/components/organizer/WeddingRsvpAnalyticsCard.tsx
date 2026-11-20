import { BarChart3, PieChart, Utensils } from 'lucide-react';
import type { JSX } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { WeddingRsvpAnalytics } from '@/features/rsvp/utils/rsvpAnalytics';

export interface WeddingRsvpAnalyticsCardProps {
  readonly analytics: WeddingRsvpAnalytics;
}

export function WeddingRsvpAnalyticsCard({
  analytics,
}: WeddingRsvpAnalyticsCardProps): JSX.Element {
  const capacityUtilizationPercent =
    analytics.totalCapacity > 0
      ? Math.min(
          100,
          Math.round((analytics.confirmedTotalHeadcount / analytics.totalCapacity) * 100),
        )
      : 0;

  return (
    <div className="space-y-4" data-testid="wedding-rsvp-analytics-card">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Household-Level Funnel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <PieChart className="text-primary size-4 shrink-0" aria-hidden="true" />
                <span>Household Response Funnel</span>
              </span>
              <Badge variant="secondary" data-testid="analytics-household-response-rate">
                {analytics.responseRatePercent}% Responded
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Household-level invitation reach and overall response progression.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  {analytics.respondedHouseholdsCount} of {analytics.totalHouseholds} households
                  responded
                </span>
                <span className="font-medium">{analytics.responseRatePercent}%</span>
              </div>
              <div
                className="bg-muted h-2 w-full overflow-hidden rounded-full"
                role="progressbar"
                aria-valuenow={analytics.responseRatePercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Household RSVP response rate"
              >
                <div
                  className="bg-primary h-full transition-all"
                  style={{ width: `${analytics.responseRatePercent}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-3">
              <div className="bg-muted/30 min-w-0 rounded-lg border p-2.5">
                <p className="text-muted-foreground">Active Links</p>
                <p className="mt-0.5 text-base font-semibold" data-testid="analytics-active-links">
                  {analytics.invitedHouseholdsCount}
                </p>
              </div>
              <div className="bg-muted/30 min-w-0 rounded-lg border p-2.5">
                <p className="text-muted-foreground">Marked Shared</p>
                <p className="mt-0.5 text-base font-semibold" data-testid="analytics-shared-links">
                  {analytics.sharedHouseholdsCount}
                </p>
              </div>
              <div className="bg-muted/30 min-w-0 rounded-lg border p-2.5">
                <p className="text-muted-foreground">Attending Groups</p>
                <p className="mt-0.5 text-base font-semibold">
                  {analytics.attendingHouseholdsCount}
                </p>
              </div>
              <div className="bg-muted/30 min-w-0 rounded-lg border p-2.5">
                <p className="text-muted-foreground">Declined Groups</p>
                <p className="mt-0.5 text-base font-semibold">
                  {analytics.declinedHouseholdsCount}
                </p>
              </div>
              <div className="bg-muted/30 min-w-0 rounded-lg border p-2.5">
                <p className="text-muted-foreground">Awaiting RSVP</p>
                <p className="mt-0.5 text-base font-semibold">{analytics.pendingHouseholdsCount}</p>
              </div>
              <div className="bg-muted/30 min-w-0 rounded-lg border p-2.5">
                <p className="text-muted-foreground">Released Seats</p>
                <p className="mt-0.5 text-base font-semibold">
                  {analytics.unusedRespondedCapacity}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Individual Headcount & Capacity Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <BarChart3 className="text-primary size-4 shrink-0" aria-hidden="true" />
                <span>Individual Guest Headcount</span>
              </span>
              <Badge variant="secondary" data-testid="analytics-confirmed-headcount">
                {analytics.confirmedTotalHeadcount} / {analytics.totalCapacity} Seats
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Individual adult, child, and plus-one breakdown across {analytics.totalNamedGuests}{' '}
              named roster guests.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  {analytics.confirmedTotalHeadcount} confirmed guests of {analytics.totalCapacity}{' '}
                  max capacity
                </span>
                <span className="font-medium">{capacityUtilizationPercent}%</span>
              </div>
              <div
                className="bg-muted h-2 w-full overflow-hidden rounded-full"
                role="progressbar"
                aria-valuenow={capacityUtilizationPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Venue seat utilization"
              >
                <div
                  className="bg-primary h-full transition-all"
                  style={{ width: `${capacityUtilizationPercent}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-3">
              <div className="bg-muted/30 min-w-0 rounded-lg border p-2.5">
                <p className="text-muted-foreground">Named Adults</p>
                <p
                  className="mt-0.5 text-base font-semibold"
                  data-testid="analytics-attending-adults"
                >
                  {analytics.namedAttendingAdultsCount}
                </p>
              </div>
              <div className="bg-muted/30 min-w-0 rounded-lg border p-2.5">
                <p className="text-muted-foreground">Named Children</p>
                <p
                  className="mt-0.5 text-base font-semibold"
                  data-testid="analytics-attending-children"
                >
                  {analytics.namedAttendingChildrenCount}
                </p>
              </div>
              <div className="bg-muted/30 min-w-0 rounded-lg border p-2.5">
                <p className="text-muted-foreground">Plus-Ones Claimed</p>
                <p
                  className="mt-0.5 text-base font-semibold"
                  data-testid="analytics-claimed-plus-ones"
                >
                  {analytics.additionalGuestsClaimedCount}
                </p>
              </div>
              <div className="bg-muted/30 min-w-0 rounded-lg border p-2.5">
                <p className="text-muted-foreground">Named Declined</p>
                <p
                  className="mt-0.5 text-base font-semibold"
                  data-testid="analytics-declined-named"
                >
                  {analytics.namedDeclinedGuestsCount}
                </p>
              </div>
              <div className="bg-muted/30 min-w-0 rounded-lg border p-2.5">
                <p className="text-muted-foreground">Named Pending</p>
                <p className="mt-0.5 text-base font-semibold" data-testid="analytics-pending-named">
                  {analytics.namedPendingGuestsCount}
                </p>
              </div>
              <div className="bg-muted/30 min-w-0 rounded-lg border p-2.5">
                <p className="text-muted-foreground">Dietary Alerts</p>
                <p className="mt-0.5 text-base font-semibold" data-testid="analytics-dietary-count">
                  {analytics.dietarySummaries.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Celebration Side & Dietary Notes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="analytics-side-breakdown">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Celebration Side Breakdown</CardTitle>
            <CardDescription className="text-xs">
              Named guest attendance grouped by celebration side.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-xs">
              {analytics.sideBreakdowns.map((item) => (
                <li
                  key={item.side}
                  data-testid={`analytics-side-row-${item.side}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted-foreground">
                    <strong className="text-foreground">{item.attendingNamedCount}</strong>{' '}
                    attending · {item.declinedNamedCount} declined · {item.pendingNamedCount}{' '}
                    pending ({item.namedGuestsCount} listed)
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card data-testid="analytics-dietary-summary">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Utensils className="text-primary size-4 shrink-0" aria-hidden="true" />
              <span>Confirmed Dietary Notes</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Dietary preferences and allergies reported for confirmed attending guests.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.dietarySummaries.length === 0 ? (
              <p className="text-muted-foreground py-3 text-xs">
                No attending guests have reported dietary restrictions yet.
              </p>
            ) : (
              <ul className="max-h-44 divide-y overflow-y-auto text-xs">
                {analytics.dietarySummaries.map((item) => (
                  <li
                    key={item.guestId}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div>
                      <span className="font-medium">{item.guestFullName}</span>
                      <span className="text-muted-foreground"> · {item.householdName}</span>
                      {item.isChild ? (
                        <Badge variant="outline" className="ml-1.5 text-[10px]">
                          Child
                        </Badge>
                      ) : null}
                    </div>
                    <Badge variant="secondary" className="text-[11px]">
                      {item.dietaryNotes}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Custom Question Tallies */}
      {analytics.questionBreakdowns.length > 0 ? (
        <Card data-testid="analytics-question-tallies">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Custom RSVP Question Tallies</CardTitle>
            <CardDescription className="text-xs">
              Aggregated household selections across configured custom questions.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {analytics.questionBreakdowns.map((q) => (
              <div
                key={q.questionId}
                data-testid={`analytics-question-card-${q.questionId}`}
                className="bg-muted/20 space-y-2 rounded-lg border p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{q.label}</span>
                  <Badge variant="outline">{q.answeredCount} responses</Badge>
                </div>

                {q.optionTallies.length > 0 ? (
                  <ul className="space-y-1.5">
                    {q.optionTallies.map((opt) => (
                      <li key={opt.optionLabel} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{opt.optionLabel}</span>
                        <span className="font-medium">
                          {opt.count} ({opt.percentage}%)
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">
                    Free-text question · See individual household cards or CSV export for full
                    answers.
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
