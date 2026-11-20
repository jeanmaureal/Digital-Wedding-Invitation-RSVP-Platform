import {
  RSVP_GUEST_SIDE_LABELS,
  type WeddingRsvpOverview,
} from '@/features/rsvp/schemas/organizerRsvpSchemas';
import { type CsvPrimitiveCell, serializeCsvDocument } from '@/lib/utilities/csvExport';

function formatHouseholdResponseLabel(state: 'attending' | 'declined' | 'pending'): string {
  if (state === 'attending') return 'Attending';
  if (state === 'declined') return 'Declined';
  return 'Awaiting RSVP';
}

function formatGuestStatusLabel(state: 'attending' | 'declined' | 'pending'): string {
  if (state === 'attending') return 'Attending';
  if (state === 'declined') return 'Declined';
  return 'Pending';
}

function formatLinkStatusLabel(
  status: 'active' | 'expired' | 'revoked' | 'none' | undefined,
): string {
  if (status === 'active') return 'Active';
  if (status === 'expired') return 'Expired';
  if (status === 'revoked') return 'Revoked';
  return 'Not Issued';
}

function formatDeliveryLabel(status: 'shared' | 'not_shared' | null | undefined): string {
  if (status === 'shared') return 'Shared';
  if (status === 'not_shared') return 'Not Shared';
  return '';
}

/**
 * Builds an RFC-4180 + formula-safe Guest & Household RSVP Attendance CSV (`P8-AC09`, `P8-AC10`).
 * Never includes `token_hash`, raw invitation tokens, or internal workspace/user UUIDs.
 */
export function buildRsvpAttendanceCsv(overview: WeddingRsvpOverview): string {
  const dynamicQuestionHeaders = overview.questions.map((q) => `Question: ${q.label}`);

  const headers: readonly string[] = [
    'Household',
    'Household RSVP Status',
    'Household Max Capacity',
    'Household Confirmed Headcount',
    'Additional Plus-Ones Claimed',
    'Guest First Name',
    'Guest Last Name',
    'Celebration Side',
    'Child Guest',
    'Guest Attendance Status',
    'Dietary Notes',
    'Email',
    'Phone',
    'Invitation Link Status',
    'Delivery Status',
    ...dynamicQuestionHeaders,
    'Household Note',
    'Response Version',
    'Last Responded At (UTC)',
  ];

  const rows: Array<readonly CsvPrimitiveCell[]> = [];

  for (const entry of overview.households) {
    const answerByQuestionId = new Map<string, string>();
    for (const ans of entry.answers) {
      answerByQuestionId.set(ans.questionId, ans.answerText);
    }

    const questionCells = overview.questions.map((q) => answerByQuestionId.get(q.id) ?? '');
    const confirmedCount = entry.submission ? entry.submission.attending_count : '';
    const plusOnesCount = entry.submission ? entry.submission.additional_guests_count : '';
    const householdNote = entry.submission?.household_note ?? '';
    const responseVersion = entry.submission ? entry.submission.response_version : '';
    const respondedAt = entry.submission?.updated_at ?? '';
    const linkStatusLabel = formatLinkStatusLabel(entry.invitationLinkStatus);
    const deliveryLabel = formatDeliveryLabel(entry.deliveryStatus);
    const householdStatusLabel = formatHouseholdResponseLabel(entry.responseState);

    if (entry.attendees.length === 0) {
      rows.push([
        entry.displayName,
        householdStatusLabel,
        entry.maxAttendees,
        confirmedCount,
        plusOnesCount,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        linkStatusLabel,
        deliveryLabel,
        ...questionCells,
        householdNote,
        responseVersion,
        respondedAt,
      ]);
      continue;
    }

    for (const att of entry.attendees) {
      const sideLabel = att.side ? RSVP_GUEST_SIDE_LABELS[att.side] : '';
      const effectiveGuestStatus =
        entry.responseState === 'declined' ? 'declined' : att.attendanceStatus;

      rows.push([
        entry.displayName,
        householdStatusLabel,
        entry.maxAttendees,
        confirmedCount,
        plusOnesCount,
        att.firstName,
        att.lastName,
        sideLabel,
        att.isChild,
        formatGuestStatusLabel(effectiveGuestStatus),
        att.dietaryNotes,
        att.email ?? '',
        att.phone ?? '',
        linkStatusLabel,
        deliveryLabel,
        ...questionCells,
        householdNote,
        responseVersion,
        respondedAt,
      ]);
    }
  }

  return serializeCsvDocument({ headers, rows });
}

/**
 * Builds a 1-row-per-household RSVP & Invitation Summary CSV (`P8-AC10`).
 */
export function buildHouseholdSummaryCsv(overview: WeddingRsvpOverview): string {
  const headers: readonly string[] = [
    'Household',
    'Max Attendees',
    'Named Guests Count',
    'Invitation Link Status',
    'Delivery Status',
    'Link Expires At (UTC)',
    'RSVP Status',
    'Confirmed Attending Count',
    'Additional Plus-Ones Claimed',
    'Response Version',
    'Last Responded At (UTC)',
    'Household Note',
    'Organizer Notes',
  ];

  const rows: Array<readonly CsvPrimitiveCell[]> = overview.households.map((entry) => [
    entry.displayName,
    entry.maxAttendees,
    entry.attendees.length,
    formatLinkStatusLabel(entry.invitationLinkStatus),
    formatDeliveryLabel(entry.deliveryStatus),
    entry.invitationExpiresAt ?? '',
    formatHouseholdResponseLabel(entry.responseState),
    entry.submission ? entry.submission.attending_count : '',
    entry.submission ? entry.submission.additional_guests_count : '',
    entry.submission ? entry.submission.response_version : '',
    entry.submission?.updated_at ?? '',
    entry.submission?.household_note ?? '',
    entry.notes ?? '',
  ]);

  return serializeCsvDocument({ headers, rows });
}
