import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as organizerRsvpApi from '@/features/rsvp/api/organizerRsvpApi';
import { WeddingRsvpDashboard } from '@/features/rsvp/components/organizer/WeddingRsvpDashboard';
import type { WeddingRsvpOverview } from '@/features/rsvp/schemas/organizerRsvpSchemas';

const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
const TEST_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const TEST_WEDDING_ID = '33333333-3333-4333-8333-333333333333';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WeddingRsvpDashboard — Custom RSVP Questions, Response Filtering & RBAC (P7-AC07, P7-AC08, P7-AC11)', () => {
  it('creates custom single_select questions, displays household responses & custom answers, and filters by status', async () => {
    const user = userEvent.setup();

    let state: WeddingRsvpOverview = {
      questions: [],
      households: [
        {
          groupId: '44444444-4444-4444-8444-444444444401',
          displayName: 'The Rivera Family',
          maxAttendees: 3,
          responseState: 'attending',
          submission: {
            id: '55555555-5555-4555-8555-555555555501',
            group_id: '44444444-4444-4444-8444-444444444401',
            wedding_id: TEST_WEDDING_ID,
            workspace_id: TEST_WORKSPACE_ID,
            invitation_id: null,
            overall_status: 'attending',
            attending_count: 2,
            additional_guests_count: 0,
            household_note: 'Counting down the days!',
            response_version: 1,
            submitted_at: '2026-11-20T00:00:00.000Z',
            updated_at: '2026-11-20T00:00:00.000Z',
          },
          attendees: [
            {
              guestId: '66666666-6666-4666-8666-666666666601',
              firstName: 'Elena',
              lastName: 'Rivera',
              isChild: false,
              attendanceStatus: 'attending',
              dietaryNotes: 'Vegetarian',
            },
          ],
          answers: [
            {
              questionId: '77777777-7777-4777-8777-777777777701',
              questionLabel: 'Entrée Preference',
              answerText: 'Truffle Risotto',
            },
          ],
        },
        {
          groupId: '44444444-4444-4444-8444-444444444402',
          displayName: 'The Lee Household',
          maxAttendees: 2,
          responseState: 'pending',
          submission: null,
          attendees: [],
          answers: [],
        },
      ],
      totalHouseholds: 2,
      respondedHouseholdsCount: 1,
      pendingHouseholdsCount: 1,
      attendingHouseholdsCount: 1,
      declinedHouseholdsCount: 0,
      totalAttendingGuestsCount: 2,
    };

    vi.spyOn(organizerRsvpApi, 'fetchWeddingRsvpOverview').mockImplementation(async () => state);

    vi.spyOn(organizerRsvpApi, 'createOrganizerRsvpQuestion').mockImplementation(async (params) => {
      const created = {
        id: '77777777-7777-4777-8777-777777777701',
        label: params.values.label,
        helpText: params.values.helpText,
        questionType: params.values.questionType,
        options: ['Salmon', 'Truffle Risotto'],
        isRequired: params.values.isRequired,
        sortOrder: 0,
      };
      state = { ...state, questions: [created] };
      return created;
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <WeddingRsvpDashboard
          userId={TEST_USER_ID}
          workspaceId={TEST_WORKSPACE_ID}
          weddingId={TEST_WEDDING_ID}
          callerRole="editor"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('rsvp-metric-attending-guests')).toHaveTextContent('2');
    expect(screen.getByTestId('analytics-household-response-rate')).toHaveTextContent(
      '50% Responded',
    );
    expect(screen.getByTestId('analytics-confirmed-headcount')).toHaveTextContent('2 / 5 Seats');
    expect(screen.getByTestId('analytics-attending-adults')).toHaveTextContent('1');
    expect(screen.getByTestId('rsvp-responses-card')).toHaveTextContent('Truffle Risotto');

    // Trigger CSV export
    const createUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:https://example.test/rsvp.csv');
    const revokeUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    await user.click(screen.getByTestId('export-rsvp-attendance-csv-button'));
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(revokeUrlSpy).toHaveBeenCalledTimes(1);
    createUrlSpy.mockRestore();
    revokeUrlSpy.mockRestore();
    anchorClickSpy.mockRestore();

    // Filter to Awaiting RSVP -> hides Rivera, keeps Lee
    await user.click(screen.getByTestId('rsvp-filter-pending'));
    expect(screen.queryByText('The Rivera Family')).not.toBeInTheDocument();
    expect(screen.getByText('The Lee Household')).toBeInTheDocument();

    // Add single_select question (testing < 2 options validation first!)
    await user.click(screen.getByTestId('open-create-rsvp-question-button'));
    await user.type(screen.getByTestId('rsvp-question-label-input'), 'Entrée Preference');
    await user.selectOptions(screen.getByTestId('rsvp-question-type-select'), 'single_select');
    await user.type(screen.getByTestId('rsvp-question-options-input'), 'OnlyOneChoice');
    await user.click(screen.getByTestId('save-rsvp-question-button'));
    expect(screen.getByText(/between 2 and 10 choices/i)).toBeInTheDocument();

    await user.clear(screen.getByTestId('rsvp-question-options-input'));
    await user.type(screen.getByTestId('rsvp-question-options-input'), 'Salmon, Truffle Risotto');
    await user.click(screen.getByTestId('rsvp-question-required-checkbox'));
    await user.click(screen.getByTestId('save-rsvp-question-button'));

    expect(
      await screen.findByTestId('rsvp-question-row-77777777-7777-4777-8777-777777777701'),
    ).toBeInTheDocument();
  });

  it('enforces read-only UX when callerRole is viewer', async () => {
    vi.spyOn(organizerRsvpApi, 'fetchWeddingRsvpOverview').mockResolvedValue({
      questions: [],
      households: [],
      totalHouseholds: 0,
      respondedHouseholdsCount: 0,
      pendingHouseholdsCount: 0,
      attendingHouseholdsCount: 0,
      declinedHouseholdsCount: 0,
      totalAttendingGuestsCount: 0,
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <WeddingRsvpDashboard
          userId={TEST_USER_ID}
          workspaceId={TEST_WORKSPACE_ID}
          weddingId={TEST_WEDDING_ID}
          callerRole="viewer"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('rsvp-viewer-readonly-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('open-create-rsvp-question-button')).not.toBeInTheDocument();
  });
});
