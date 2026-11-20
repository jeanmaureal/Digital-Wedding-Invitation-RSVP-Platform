import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PublicHouseholdSummary,
  PublicRsvpContext,
} from '@/features/guests/schemas/publicInvitationSchemas';
import { HouseholdRsvpFormCard } from '@/features/rsvp/components/public/HouseholdRsvpFormCard';
import * as organizerClientModule from '@/lib/supabase/organizerClient';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

const SECRET_TOKEN = 'SecretRsvpToken256BitBase64Url_DoNotEcho_9911';
const G1_ID = '11111111-2222-4333-8444-555555555501';
const G2_ID = '11111111-2222-4333-8444-555555555502';
const G3_ID = '11111111-2222-4333-8444-555555555503';
const Q_MEAL_ID = '22222222-3333-4444-8555-666666666601';
const Q_SHUTTLE_ID = '22222222-3333-4444-8555-666666666602';

const TEST_HOUSEHOLD: PublicHouseholdSummary = {
  displayName: 'The Rivera Family',
  maxAttendees: 2,
  expiresAt: null,
  guests: [
    { id: G1_ID, firstName: 'Elena', lastName: 'Rivera', isChild: false, dietaryNotes: '' },
    { id: G2_ID, firstName: 'Mateo', lastName: 'Rivera', isChild: false, dietaryNotes: '' },
    { id: G3_ID, firstName: 'Lucas', lastName: 'Rivera', isChild: true, dietaryNotes: '' },
  ],
};

const OPEN_RSVP_CONTEXT: PublicRsvpContext = {
  isAcceptingResponses: true,
  closedReason: null,
  rsvpDeadline: '2027-07-01T15:59:00.000Z',
  timezone: 'Asia/Manila',
  allowPlusOnes: false,
  showDietaryNotes: true,
  confirmationMessage: 'Thank you! Your RSVP is confirmed.',
  questions: [
    {
      id: Q_MEAL_ID,
      label: 'Entrée Preference',
      helpText: 'Select one option for your household',
      questionType: 'single_select',
      options: ['Salmon', 'Beef', 'Risotto'],
      isRequired: true,
      sortOrder: 0,
    },
    {
      id: Q_SHUTTLE_ID,
      label: 'Need hotel shuttle?',
      helpText: '',
      questionType: 'boolean',
      options: [],
      isRequired: true,
      sortOrder: 1,
    },
  ],
  existingSubmission: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  organizerClientModule.resetOrganizerSupabaseClientForTests();
});

describe('HouseholdRsvpFormCard — Transactional Guest RSVP UX & Zero-Echo Isolation (P7-AC09..11)', () => {
  it('enforces maxAttendees cap & required custom questions, submits v1, allows v2 update, and never echoes rawToken or initializes organizerClient', async () => {
    const user = userEvent.setup();
    let rpcCallCount = 0;

    const rpcMock = vi.fn(async (_fn: string, args: { p_token: string; p_payload: unknown }) => {
      rpcCallCount += 1;
      const payload = args.p_payload as {
        overallStatus: 'attending' | 'declined';
        householdNote: string;
        attendees: Array<{
          guestId: string;
          attendanceStatus: 'attending' | 'declined';
          dietaryNotes: string;
        }>;
        answers: Array<{ questionId: string; answerText: string }>;
      };

      const attendingCount = payload.attendees.filter(
        (item) => item.attendanceStatus === 'attending',
      ).length;

      return {
        data: {
          confirmationMessage: OPEN_RSVP_CONTEXT.confirmationMessage,
          submission: {
            overallStatus: payload.overallStatus,
            attendingCount,
            additionalGuestsCount: 0,
            householdNote: payload.householdNote,
            responseVersion: rpcCallCount,
            submittedAt: '2026-11-20T00:15:00.000Z',
            updatedAt: '2026-11-20T00:15:00.000Z',
            attendees: payload.attendees,
            answers: payload.answers.filter((item) => item.answerText !== ''),
          },
        },
        error: null,
      };
    });

    const mockPublicClient = { rpc: rpcMock } as unknown as TypedSupabaseClient;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <HouseholdRsvpFormCard
          rawToken={SECRET_TOKEN}
          weddingTitle="Clara & Mateo Celebration"
          household={TEST_HOUSEHOLD}
          rsvp={OPEN_RSVP_CONTEXT}
          client={mockPublicClient}
        />
      </QueryClientProvider>,
    );

    // Default selects first 2 of 3 members (`2 of 2 spots selected`)
    expect(screen.getByTestId('rsvp-live-capacity-badge')).toHaveTextContent(
      '2 of 2 spots selected',
    );

    // Selecting the 3rd member exceeds cap (`3 of 2 spots selected`) and blocks submit before RPC!
    await user.click(screen.getByTestId(`rsvp-guest-attending-${G3_ID}`));
    expect(screen.getByTestId('rsvp-live-capacity-badge')).toHaveTextContent(
      '3 of 2 spots selected',
    );
    await user.click(screen.getByTestId('rsvp-submit-button'));
    expect(screen.getByTestId('rsvp-submit-error')).toHaveTextContent(/reserved for up to 2/i);
    expect(rpcMock).not.toHaveBeenCalled();

    // Mark 3rd member Unable to Attend -> test required custom question guard
    await user.click(screen.getByTestId(`rsvp-guest-declined-${G3_ID}`));
    await user.click(screen.getByTestId('rsvp-submit-button'));
    expect(screen.getByTestId('rsvp-submit-error')).toHaveTextContent(/Entrée Preference/i);
    expect(rpcMock).not.toHaveBeenCalled();

    // Fill custom questions, dietary note, and household message -> submit v1
    await user.type(screen.getByTestId(`rsvp-guest-dietary-${G1_ID}`), 'Vegetarian');
    await user.selectOptions(screen.getByTestId(`rsvp-question-input-${Q_MEAL_ID}`), 'Salmon');
    await user.selectOptions(screen.getByTestId(`rsvp-question-input-${Q_SHUTTLE_ID}`), 'yes');
    await user.type(screen.getByTestId('rsvp-household-note-input'), 'Cannot wait!');
    await user.click(screen.getByTestId('rsvp-submit-button'));

    expect(await screen.findByTestId('public-rsvp-confirmed-summary')).toHaveTextContent(
      'Confirmed Attending (2 guests)',
    );
    expect(screen.getByTestId('rsvp-response-version-badge')).toHaveTextContent('Response v1');
    expect(rpcMock).toHaveBeenCalledTimes(1);

    // Click Update Response -> switch to Unable to Attend -> save v2
    await user.click(screen.getByTestId('public-rsvp-edit-button'));
    await user.click(screen.getByTestId('rsvp-overall-declined-button'));
    await user.click(screen.getByTestId('rsvp-submit-button'));

    expect(await screen.findByTestId('public-rsvp-confirmed-summary')).toHaveTextContent(
      'Confirmed Unable to Attend',
    );
    expect(screen.getByTestId('rsvp-response-version-badge')).toHaveTextContent('Response v2');

    expect(container.innerHTML).not.toContain(SECRET_TOKEN);
    expect(organizerClientModule.hasInitializedOrganizerSupabaseClient()).toBe(false);
  });

  it('locks editing and shows read-only confirmed response when RSVP deadline has passed', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const closedRsvp: PublicRsvpContext = {
      ...OPEN_RSVP_CONTEXT,
      isAcceptingResponses: false,
      closedReason: 'deadline_passed',
      existingSubmission: {
        overallStatus: 'attending',
        attendingCount: 2,
        additionalGuestsCount: 0,
        householdNote: 'Submitted on time!',
        responseVersion: 1,
        submittedAt: '2026-11-18T10:00:00.000Z',
        updatedAt: '2026-11-18T10:00:00.000Z',
        attendees: [
          { guestId: G1_ID, attendanceStatus: 'attending', dietaryNotes: '' },
          { guestId: G2_ID, attendanceStatus: 'attending', dietaryNotes: '' },
          { guestId: G3_ID, attendanceStatus: 'declined', dietaryNotes: '' },
        ],
        answers: [],
      },
    };

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <HouseholdRsvpFormCard
          rawToken={SECRET_TOKEN}
          weddingTitle="Clara & Mateo Celebration"
          household={TEST_HOUSEHOLD}
          rsvp={closedRsvp}
          client={null}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('public-rsvp-closed-banner')).toHaveTextContent(
      /RSVP Deadline Has Passed/i,
    );
    expect(screen.getByTestId('public-rsvp-confirmed-summary')).toBeInTheDocument();
    expect(screen.queryByTestId('public-rsvp-edit-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rsvp-submit-button')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain(SECRET_TOKEN);
  });
});
