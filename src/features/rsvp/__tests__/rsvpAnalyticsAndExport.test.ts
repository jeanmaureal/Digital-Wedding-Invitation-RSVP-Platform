import { describe, expect, it } from 'vitest';
import { buildGuestDirectoryCsv } from '@/features/guests/utils/guestDirectoryCsvExport';
import type { WeddingRsvpOverview } from '@/features/rsvp/schemas/organizerRsvpSchemas';
import { computeWeddingRsvpAnalytics } from '@/features/rsvp/utils/rsvpAnalytics';
import {
  buildHouseholdSummaryCsv,
  buildRsvpAttendanceCsv,
} from '@/features/rsvp/utils/rsvpCsvExport';

const SAMPLE_OVERVIEW: WeddingRsvpOverview = {
  questions: [
    {
      id: 'q-meal',
      label: 'Entrée Choice',
      helpText: '',
      questionType: 'single_select',
      options: ['Sea Bass', 'Truffle Risotto', 'Short Rib'],
      isRequired: true,
      sortOrder: 0,
    },
    {
      id: 'q-shuttle',
      label: 'Need Hotel Shuttle?',
      helpText: '',
      questionType: 'boolean',
      options: [],
      isRequired: false,
      sortOrder: 1,
    },
  ],
  households: [
    {
      groupId: 'g-1',
      displayName: 'The Santos Family',
      maxAttendees: 4,
      responseState: 'attending',
      notes: '=VIPFrontRow',
      invitationLinkStatus: 'active',
      deliveryStatus: 'shared',
      invitationExpiresAt: '2027-09-01T00:00:00.000Z',
      submission: {
        id: 'sub-1',
        group_id: 'g-1',
        wedding_id: 'w-1',
        workspace_id: 'ws-1',
        invitation_id: 'inv-1',
        overall_status: 'attending',
        attending_count: 3,
        additional_guests_count: 1,
        household_note: '+Bringing wedding gift!',
        response_version: 2,
        submitted_at: '2026-11-20T01:00:00.000Z',
        updated_at: '2026-11-20T02:00:00.000Z',
      },
      attendees: [
        {
          guestId: 'guest-1',
          firstName: 'Elena',
          lastName: 'Santos',
          isChild: false,
          attendanceStatus: 'attending',
          dietaryNotes: '=1+1 Nut-free',
          side: 'partner_one',
          email: 'elena@example.com',
          phone: '+63-917-555-0101',
        },
        {
          guestId: 'guest-2',
          firstName: 'Lucas',
          lastName: 'Santos',
          isChild: true,
          attendanceStatus: 'attending',
          dietaryNotes: '',
          side: 'partner_one',
          email: '',
          phone: '',
        },
        {
          guestId: 'guest-3',
          firstName: 'Mateo',
          lastName: 'Santos',
          isChild: false,
          attendanceStatus: 'declined',
          dietaryNotes: 'Dairy-free',
          side: 'partner_two',
          email: '',
          phone: '',
        },
      ],
      answers: [
        {
          questionId: 'q-meal',
          questionLabel: 'Entrée Choice',
          answerText: 'Truffle Risotto',
        },
        {
          questionId: 'q-shuttle',
          questionLabel: 'Need Hotel Shuttle?',
          answerText: 'Yes',
        },
      ],
    },
    {
      groupId: 'g-2',
      displayName: 'The Tan Household',
      maxAttendees: 2,
      responseState: 'declined',
      notes: '',
      invitationLinkStatus: 'active',
      deliveryStatus: 'not_shared',
      invitationExpiresAt: null,
      submission: {
        id: 'sub-2',
        group_id: 'g-2',
        wedding_id: 'w-1',
        workspace_id: 'ws-1',
        invitation_id: 'inv-2',
        overall_status: 'declined',
        attending_count: 0,
        additional_guests_count: 0,
        household_note: 'Sending warm wishes from abroad.',
        response_version: 1,
        submitted_at: '2026-11-20T01:30:00.000Z',
        updated_at: '2026-11-20T01:30:00.000Z',
      },
      attendees: [
        {
          guestId: 'guest-4',
          firstName: 'Hannah',
          lastName: 'Tan',
          isChild: false,
          attendanceStatus: 'declined',
          dietaryNotes: '',
          side: 'mutual',
          email: '',
          phone: '',
        },
      ],
      answers: [],
    },
    {
      groupId: 'g-3',
      displayName: 'The Cruz Household',
      maxAttendees: 2,
      responseState: 'pending',
      notes: '',
      invitationLinkStatus: 'none',
      deliveryStatus: null,
      invitationExpiresAt: null,
      submission: null,
      attendees: [
        {
          guestId: 'guest-5',
          firstName: 'Noah',
          lastName: 'Cruz',
          isChild: false,
          attendanceStatus: 'pending',
          dietaryNotes: '',
          side: 'other',
          email: '',
          phone: '',
        },
      ],
      answers: [],
    },
  ],
  totalHouseholds: 3,
  respondedHouseholdsCount: 2,
  pendingHouseholdsCount: 1,
  attendingHouseholdsCount: 1,
  declinedHouseholdsCount: 1,
  totalAttendingGuestsCount: 3,
};

describe('computeWeddingRsvpAnalytics & CSV Builders (P8-AC07, P8-AC09, P8-AC10)', () => {
  it('computes accurate household vs. individual metrics, adult/child/plus-one splits, side counts, dietary notes, and question tallies', () => {
    const analytics = computeWeddingRsvpAnalytics(SAMPLE_OVERVIEW);

    // Household funnel
    expect(analytics.totalHouseholds).toBe(3);
    expect(analytics.invitedHouseholdsCount).toBe(2);
    expect(analytics.sharedHouseholdsCount).toBe(1);
    expect(analytics.respondedHouseholdsCount).toBe(2);
    expect(analytics.pendingHouseholdsCount).toBe(1);
    expect(analytics.responseRatePercent).toBe(67);
    expect(analytics.attendingHouseholdsCount).toBe(1);
    expect(analytics.declinedHouseholdsCount).toBe(1);

    // Individual headcount & capacity
    expect(analytics.totalCapacity).toBe(8);
    expect(analytics.totalNamedGuests).toBe(5);
    expect(analytics.confirmedTotalHeadcount).toBe(3); // 1 adult + 1 child + 1 plus-one
    expect(analytics.namedAttendingGuestsCount).toBe(2);
    expect(analytics.namedAttendingAdultsCount).toBe(1);
    expect(analytics.namedAttendingChildrenCount).toBe(1);
    expect(analytics.additionalGuestsClaimedCount).toBe(1);
    expect(analytics.namedDeclinedGuestsCount).toBe(2); // Mateo + Hannah
    expect(analytics.namedPendingGuestsCount).toBe(1); // Noah
    expect(analytics.unusedRespondedCapacity).toBe(3); // (4 + 2 responded cap) - 3 confirmed = 3

    // Side breakdown
    const partnerOne = analytics.sideBreakdowns.find((s) => s.side === 'partner_one')!;
    expect(partnerOne.attendingNamedCount).toBe(2);
    expect(partnerOne.namedGuestsCount).toBe(2);

    const partnerTwo = analytics.sideBreakdowns.find((s) => s.side === 'partner_two')!;
    expect(partnerTwo.declinedNamedCount).toBe(1);

    // Dietary summary includes only attending guests with non-empty notes
    expect(analytics.dietarySummaries).toHaveLength(1);
    expect(analytics.dietarySummaries[0]?.guestFullName).toBe('Elena Santos');
    expect(analytics.dietarySummaries[0]?.dietaryNotes).toBe('=1+1 Nut-free');

    // Question tallies
    const mealQuestion = analytics.questionBreakdowns.find((q) => q.questionId === 'q-meal')!;
    expect(mealQuestion.answeredCount).toBe(1);
    expect(mealQuestion.optionTallies).toEqual([
      { optionLabel: 'Sea Bass', count: 0, percentage: 0 },
      { optionLabel: 'Truffle Risotto', count: 1, percentage: 100 },
      { optionLabel: 'Short Rib', count: 0, percentage: 0 },
    ]);

    const shuttleQuestion = analytics.questionBreakdowns.find((q) => q.questionId === 'q-shuttle')!;
    expect(shuttleQuestion.optionTallies[0]).toEqual({
      optionLabel: 'Yes',
      count: 1,
      percentage: 100,
    });
  });

  it('builds formula-safe Guest & RSVP CSV, Household Summary CSV, and Guest Directory CSV with dynamic questions and zero token hashes', () => {
    const attendanceCsv = buildRsvpAttendanceCsv(SAMPLE_OVERVIEW);
    expect(attendanceCsv.startsWith('\uFEFF')).toBe(true);
    expect(attendanceCsv).toContain('Question: Entrée Choice');
    expect(attendanceCsv).toContain('Truffle Risotto');
    // Formula-injection neutralization checks:
    expect(attendanceCsv).toContain("'=1+1 Nut-free");
    expect(attendanceCsv).toContain("'+63-917-555-0101");
    expect(attendanceCsv).toContain("'+Bringing wedding gift!");
    expect(attendanceCsv.toLowerCase()).not.toContain('token_hash');

    const summaryCsv = buildHouseholdSummaryCsv(SAMPLE_OVERVIEW);
    expect(summaryCsv).toContain("'=VIPFrontRow");
    expect(summaryCsv).toContain('The Santos Family,4,3,Active,Shared');

    const directoryCsv = buildGuestDirectoryCsv(
      {
        totalHouseholds: 1,
        totalGuests: 1,
        totalCapacity: 2,
        activeLinksCount: 1,
        sharedLinksCount: 1,
        households: [
          {
            group: {
              id: 'g-1',
              wedding_id: 'w-1',
              workspace_id: 'ws-1',
              display_name: '@MaliciousHousehold',
              max_attendees: 2,
              notes: '-FormulaNote',
              sort_order: 0,
              created_by: null,
              created_at: '2026-11-20T00:00:00.000Z',
              updated_at: '2026-11-20T00:00:00.000Z',
            },
            guests: [
              {
                id: 'guest-1',
                group_id: 'g-1',
                wedding_id: 'w-1',
                workspace_id: 'ws-1',
                first_name: 'Clara',
                last_name: 'Vance',
                email: 'clara@example.com',
                phone: '+1-555-0100',
                side: 'partner_one',
                is_child: false,
                dietary_notes: '=CMD()',
                sort_order: 0,
                created_at: '2026-11-20T00:00:00.000Z',
                updated_at: '2026-11-20T00:00:00.000Z',
              },
            ],
            activeInvitation: {
              id: 'inv-1',
              group_id: 'g-1',
              wedding_id: 'w-1',
              workspace_id: 'ws-1',
              status: 'active',
              delivery_status: 'shared',
              expires_at: '2028-01-01T00:00:00.000Z',
              revoked_at: null,
              issued_by: null,
              created_at: '2026-11-20T00:00:00.000Z',
              updated_at: '2026-11-20T00:00:00.000Z',
            },
            revokedCount: 0,
          },
        ],
      },
      Date.parse('2026-11-20T00:00:00.000Z'),
    );

    expect(directoryCsv).toContain("'@MaliciousHousehold");
    expect(directoryCsv).toContain("'-FormulaNote");
    expect(directoryCsv).toContain("'=CMD()");
    expect(directoryCsv).toContain("'+1-555-0100");
  });
});
