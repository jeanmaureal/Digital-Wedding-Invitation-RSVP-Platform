import {
  RSVP_GUEST_SIDE_LABELS,
  type RsvpGuestSide,
  type RsvpQuestionType,
  type WeddingRsvpOverview,
} from '@/features/rsvp/schemas/organizerRsvpSchemas';

export interface CelebrationSideBreakdown {
  readonly side: RsvpGuestSide;
  readonly label: string;
  readonly namedGuestsCount: number;
  readonly attendingNamedCount: number;
  readonly declinedNamedCount: number;
  readonly pendingNamedCount: number;
}

export interface DietaryNoteSummaryItem {
  readonly guestId: string;
  readonly guestFullName: string;
  readonly householdName: string;
  readonly isChild: boolean;
  readonly dietaryNotes: string;
}

export interface QuestionOptionTally {
  readonly optionLabel: string;
  readonly count: number;
  readonly percentage: number;
}

export interface CustomQuestionAnalyticsItem {
  readonly questionId: string;
  readonly label: string;
  readonly questionType: RsvpQuestionType;
  readonly answeredCount: number;
  readonly optionTallies: readonly QuestionOptionTally[];
}

export interface WeddingRsvpAnalytics {
  // Household-level metrics
  readonly totalHouseholds: number;
  readonly invitedHouseholdsCount: number;
  readonly sharedHouseholdsCount: number;
  readonly respondedHouseholdsCount: number;
  readonly pendingHouseholdsCount: number;
  readonly responseRatePercent: number;
  readonly attendingHouseholdsCount: number;
  readonly declinedHouseholdsCount: number;

  // Individual & capacity-level metrics
  readonly totalCapacity: number;
  readonly totalNamedGuests: number;
  readonly confirmedTotalHeadcount: number;
  readonly namedAttendingGuestsCount: number;
  readonly namedAttendingAdultsCount: number;
  readonly namedAttendingChildrenCount: number;
  readonly additionalGuestsClaimedCount: number;
  readonly namedDeclinedGuestsCount: number;
  readonly namedPendingGuestsCount: number;
  readonly unusedRespondedCapacity: number;

  // Breakdowns
  readonly sideBreakdowns: readonly CelebrationSideBreakdown[];
  readonly dietarySummaries: readonly DietaryNoteSummaryItem[];
  readonly questionBreakdowns: readonly CustomQuestionAnalyticsItem[];
}

const ORDERED_SIDES: readonly RsvpGuestSide[] = [
  'partner_one',
  'partner_two',
  'mutual',
  'other',
] as const;

export function computeWeddingRsvpAnalytics(overview: WeddingRsvpOverview): WeddingRsvpAnalytics {
  let invitedHouseholdsCount = 0;
  let sharedHouseholdsCount = 0;
  let totalCapacity = 0;
  let respondedCapacity = 0;
  let totalNamedGuests = 0;
  let confirmedTotalHeadcount = 0;
  let namedAttendingGuestsCount = 0;
  let namedAttendingAdultsCount = 0;
  let namedAttendingChildrenCount = 0;
  let additionalGuestsClaimedCount = 0;
  let namedDeclinedGuestsCount = 0;
  let namedPendingGuestsCount = 0;

  const sideCounters = new Map<
    RsvpGuestSide,
    {
      named: number;
      attending: number;
      declined: number;
      pending: number;
    }
  >();
  for (const side of ORDERED_SIDES) {
    sideCounters.set(side, { named: 0, attending: 0, declined: 0, pending: 0 });
  }

  const dietarySummaries: DietaryNoteSummaryItem[] = [];
  const answersByQuestionId = new Map<string, string[]>();

  for (const entry of overview.households) {
    totalCapacity += entry.maxAttendees;

    if (entry.invitationLinkStatus === 'active') {
      invitedHouseholdsCount += 1;
      if (entry.deliveryStatus === 'shared') {
        sharedHouseholdsCount += 1;
      }
    }

    if (entry.submission) {
      respondedCapacity += entry.maxAttendees;
      if (entry.submission.overall_status === 'attending') {
        confirmedTotalHeadcount += entry.submission.attending_count;
        additionalGuestsClaimedCount += entry.submission.additional_guests_count;
      }
    }

    for (const att of entry.attendees) {
      totalNamedGuests += 1;
      const resolvedSide: RsvpGuestSide = att.side ?? 'other';
      const bucket = sideCounters.get(resolvedSide) ?? sideCounters.get('other')!;
      bucket.named += 1;

      const effectiveStatus =
        entry.responseState === 'declined' ? 'declined' : att.attendanceStatus;

      if (effectiveStatus === 'attending' && entry.responseState === 'attending') {
        namedAttendingGuestsCount += 1;
        bucket.attending += 1;
        if (att.isChild) {
          namedAttendingChildrenCount += 1;
        } else {
          namedAttendingAdultsCount += 1;
        }

        const trimmedDietary = att.dietaryNotes.trim();
        if (trimmedDietary.length > 0) {
          dietarySummaries.push({
            guestId: att.guestId,
            guestFullName: `${att.firstName} ${att.lastName}`.trim(),
            householdName: entry.displayName,
            isChild: att.isChild,
            dietaryNotes: trimmedDietary,
          });
        }
      } else if (effectiveStatus === 'declined') {
        namedDeclinedGuestsCount += 1;
        bucket.declined += 1;
      } else {
        namedPendingGuestsCount += 1;
        bucket.pending += 1;
      }
    }

    // Reconcile single-source households where submission attending_count exceeds explicit guest rows
    for (const ans of entry.answers) {
      const trimmed = ans.answerText.trim();
      if (trimmed.length === 0) {
        continue;
      }
      const list = answersByQuestionId.get(ans.questionId);
      if (list) {
        list.push(trimmed);
      } else {
        answersByQuestionId.set(ans.questionId, [trimmed]);
      }
    }
  }

  const totalHouseholds = overview.totalHouseholds;
  const respondedHouseholdsCount = overview.respondedHouseholdsCount;
  const pendingHouseholdsCount = overview.pendingHouseholdsCount;
  const responseRatePercent =
    totalHouseholds > 0 ? Math.round((respondedHouseholdsCount / totalHouseholds) * 100) : 0;

  const unusedRespondedCapacity = Math.max(0, respondedCapacity - confirmedTotalHeadcount);

  const sideBreakdowns: CelebrationSideBreakdown[] = ORDERED_SIDES.map((side) => {
    const counts = sideCounters.get(side)!;
    return {
      side,
      label: RSVP_GUEST_SIDE_LABELS[side],
      namedGuestsCount: counts.named,
      attendingNamedCount: counts.attending,
      declinedNamedCount: counts.declined,
      pendingNamedCount: counts.pending,
    };
  });

  const questionBreakdowns: CustomQuestionAnalyticsItem[] = overview.questions.map((question) => {
    const rawAnswers = answersByQuestionId.get(question.id) ?? [];
    const answeredCount = rawAnswers.length;

    if (question.questionType === 'single_select') {
      const countsByLower = new Map<string, number>();
      for (const ans of rawAnswers) {
        const key = ans.toLowerCase();
        countsByLower.set(key, (countsByLower.get(key) ?? 0) + 1);
      }
      const optionTallies: QuestionOptionTally[] = question.options.map((optionLabel) => {
        const count = countsByLower.get(optionLabel.toLowerCase()) ?? 0;
        const percentage = answeredCount > 0 ? Math.round((count / answeredCount) * 100) : 0;
        return { optionLabel, count, percentage };
      });
      return {
        questionId: question.id,
        label: question.label,
        questionType: question.questionType,
        answeredCount,
        optionTallies,
      };
    }

    if (question.questionType === 'boolean') {
      let yesCount = 0;
      let noCount = 0;
      for (const ans of rawAnswers) {
        const lower = ans.toLowerCase();
        if (lower === 'yes' || lower === 'true') {
          yesCount += 1;
        } else if (lower === 'no' || lower === 'false') {
          noCount += 1;
        }
      }
      const optionTallies: QuestionOptionTally[] = [
        {
          optionLabel: 'Yes',
          count: yesCount,
          percentage: answeredCount > 0 ? Math.round((yesCount / answeredCount) * 100) : 0,
        },
        {
          optionLabel: 'No',
          count: noCount,
          percentage: answeredCount > 0 ? Math.round((noCount / answeredCount) * 100) : 0,
        },
      ];
      return {
        questionId: question.id,
        label: question.label,
        questionType: question.questionType,
        answeredCount,
        optionTallies,
      };
    }

    return {
      questionId: question.id,
      label: question.label,
      questionType: question.questionType,
      answeredCount,
      optionTallies: [],
    };
  });

  return {
    totalHouseholds,
    invitedHouseholdsCount,
    sharedHouseholdsCount,
    respondedHouseholdsCount,
    pendingHouseholdsCount,
    responseRatePercent,
    attendingHouseholdsCount: overview.attendingHouseholdsCount,
    declinedHouseholdsCount: overview.declinedHouseholdsCount,
    totalCapacity,
    totalNamedGuests,
    confirmedTotalHeadcount,
    namedAttendingGuestsCount,
    namedAttendingAdultsCount,
    namedAttendingChildrenCount,
    additionalGuestsClaimedCount,
    namedDeclinedGuestsCount,
    namedPendingGuestsCount,
    unusedRespondedCapacity,
    sideBreakdowns,
    dietarySummaries,
    questionBreakdowns,
  };
}
