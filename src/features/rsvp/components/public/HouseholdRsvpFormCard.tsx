import { useMutation } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, Lock, Pencil, Send } from 'lucide-react';
import { type FormEvent, type JSX, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type {
  PublicExistingRsvpSubmission,
  PublicHouseholdSummary,
  PublicRsvpContext,
} from '@/features/guests/schemas/publicInvitationSchemas';
import { submitPublicHouseholdRsvp } from '@/features/rsvp/api/publicRsvpApi';
import { translatePublicRsvpError } from '@/features/rsvp/schemas/publicRsvpSchemas';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

export interface HouseholdRsvpFormCardProps {
  readonly rawToken: string | undefined;
  readonly weddingTitle: string;
  readonly household: PublicHouseholdSummary;
  readonly rsvp: PublicRsvpContext;
  readonly client?: TypedSupabaseClient | null;
  readonly onSubmitted?: (updated: PublicExistingRsvpSubmission) => void;
}

function formatDeadlineInWeddingTimezone(
  isoDeadline: string | null,
  timezone: string,
): string | null {
  if (!isoDeadline) {
    return null;
  }
  const parsedMs = Date.parse(isoDeadline);
  if (Number.isNaN(parsedMs)) {
    return null;
  }
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(parsedMs));
    return `${formatted} (${timezone})`;
  } catch {
    return new Date(parsedMs).toUTCString();
  }
}

export function HouseholdRsvpFormCard({
  rawToken,
  weddingTitle,
  household,
  rsvp,
  client,
  onSubmitted,
}: HouseholdRsvpFormCardProps): JSX.Element {
  const [confirmedSubmission, setConfirmedSubmission] =
    useState<PublicExistingRsvpSubmission | null>(rsvp.existingSubmission);
  const [confirmationText, setConfirmationText] = useState<string>(rsvp.confirmationMessage);
  const [isEditing, setIsEditing] = useState<boolean>(rsvp.existingSubmission === null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [overallStatus, setOverallStatus] = useState<'attending' | 'declined'>(
    rsvp.existingSubmission?.overallStatus ?? 'attending',
  );

  const [guestStatusMap, setGuestStatusMap] = useState<Record<string, 'attending' | 'declined'>>(
    () => {
      const initial: Record<string, 'attending' | 'declined'> = {};
      const existingMap = new Map(
        (rsvp.existingSubmission?.attendees ?? []).map((item) => [
          item.guestId,
          item.attendanceStatus,
        ]),
      );
      let defaultAttendingAssigned = 0;
      for (const guest of household.guests) {
        const saved = existingMap.get(guest.id);
        if (saved) {
          initial[guest.id] = saved;
        } else if (defaultAttendingAssigned < household.maxAttendees) {
          initial[guest.id] = 'attending';
          defaultAttendingAssigned += 1;
        } else {
          initial[guest.id] = 'declined';
        }
      }
      return initial;
    },
  );

  const [guestDietaryMap, setGuestDietaryMap] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    const existingMap = new Map(
      (rsvp.existingSubmission?.attendees ?? []).map((item) => [item.guestId, item.dietaryNotes]),
    );
    for (const guest of household.guests) {
      initial[guest.id] = existingMap.get(guest.id) ?? guest.dietaryNotes ?? '';
    }
    return initial;
  });

  const [additionalGuestsCount, setAdditionalGuestsCount] = useState<number>(() => {
    if (rsvp.existingSubmission) {
      return rsvp.existingSubmission.additionalGuestsCount;
    }
    return household.guests.length === 0 ? 1 : 0;
  });

  const [answersMap, setAnswersMap] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const ans of rsvp.existingSubmission?.answers ?? []) {
      initial[ans.questionId] = ans.answerText;
    }
    return initial;
  });

  const [householdNote, setHouseholdNote] = useState<string>(
    rsvp.existingSubmission?.householdNote ?? '',
  );

  const submitMutation = useMutation({
    mutationFn: () =>
      submitPublicHouseholdRsvp({
        rawToken,
        ...(client !== undefined ? { client } : {}),
        payload: {
          overallStatus,
          additionalGuestsCount: overallStatus === 'attending' ? additionalGuestsCount : 0,
          householdNote,
          attendees: household.guests.map((guest) => {
            const status =
              overallStatus === 'declined' ? 'declined' : (guestStatusMap[guest.id] ?? 'declined');
            return {
              guestId: guest.id,
              attendanceStatus: status,
              dietaryNotes: status === 'attending' ? (guestDietaryMap[guest.id] ?? '') : '',
            };
          }),
          answers:
            overallStatus === 'attending'
              ? rsvp.questions.map((question) => ({
                  questionId: question.id,
                  answerText: answersMap[question.id] ?? '',
                }))
              : [],
        },
      }),
    onSuccess: (response) => {
      setValidationError(null);
      setConfirmedSubmission(response.submission);
      setConfirmationText(response.confirmationMessage || rsvp.confirmationMessage);
      setIsEditing(false);
      onSubmitted?.(response.submission);
    },
    onError: (err) => {
      setValidationError(translatePublicRsvpError(err).message);
    },
  });

  const formattedDeadline = formatDeadlineInWeddingTimezone(rsvp.rsvpDeadline, rsvp.timezone);

  const namedAttendingCount =
    overallStatus === 'attending'
      ? household.guests.reduce(
          (acc, guest) => acc + ((guestStatusMap[guest.id] ?? 'declined') === 'attending' ? 1 : 0),
          0,
        )
      : 0;

  const canSpecifyAdditionalGuests =
    overallStatus === 'attending' &&
    (household.guests.length === 0 || rsvp.allowPlusOnes) &&
    household.maxAttendees > namedAttendingCount;

  const effectiveAdditionalGuests =
    overallStatus === 'attending' && (household.guests.length === 0 || rsvp.allowPlusOnes)
      ? additionalGuestsCount
      : 0;

  const totalAttendingSelected =
    overallStatus === 'attending' ? namedAttendingCount + effectiveAdditionalGuests : 0;

  function populateFormFromConfirmed(saved: PublicExistingRsvpSubmission): void {
    setOverallStatus(saved.overallStatus);
    setAdditionalGuestsCount(saved.additionalGuestsCount);
    setHouseholdNote(saved.householdNote);

    const nextStatusMap: Record<string, 'attending' | 'declined'> = {};
    const nextDietaryMap: Record<string, string> = {};
    for (const att of saved.attendees) {
      nextStatusMap[att.guestId] = att.attendanceStatus;
      nextDietaryMap[att.guestId] = att.dietaryNotes;
    }
    setGuestStatusMap((prev) => ({ ...prev, ...nextStatusMap }));
    setGuestDietaryMap((prev) => ({ ...prev, ...nextDietaryMap }));

    const nextAnswers: Record<string, string> = {};
    for (const ans of saved.answers) {
      nextAnswers[ans.questionId] = ans.answerText;
    }
    setAnswersMap(nextAnswers);
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setValidationError(null);

    if (overallStatus === 'attending') {
      if (totalAttendingSelected < 1) {
        setValidationError(
          'Please select at least one attending household member or choose Unable to Attend.',
        );
        return;
      }

      if (totalAttendingSelected > household.maxAttendees) {
        setValidationError(
          `Your household invitation is reserved for up to ${household.maxAttendees} ${household.maxAttendees === 1 ? 'guest' : 'guests'} (${totalAttendingSelected} currently selected).`,
        );
        return;
      }

      for (const question of rsvp.questions) {
        const answerVal = (answersMap[question.id] ?? '').trim();
        if (question.isRequired && !answerVal) {
          setValidationError(`Please answer the required question: "${question.label}".`);
          return;
        }
      }
    }

    submitMutation.mutate();
  }

  const guestNameById = new Map(
    household.guests.map((g) => [g.id, `${g.firstName} ${g.lastName}`.trim()]),
  );
  const questionLabelById = new Map(rsvp.questions.map((q) => [q.id, q.label]));

  return (
    <Card
      id="household-rsvp-section"
      data-testid="household-rsvp-form-card"
      className="mx-auto max-w-3xl"
    >
      <CardHeader>
        <div className="flex min-w-0 flex-col justify-between gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={rsvp.isAcceptingResponses ? 'secondary' : 'outline'}>
                {rsvp.isAcceptingResponses ? 'RSVP Open' : 'RSVP Closed'}
              </Badge>
              <Badge variant="outline">
                Household Limit: {household.maxAttendees}{' '}
                {household.maxAttendees === 1 ? 'guest' : 'guests'}
              </Badge>
              {confirmedSubmission ? (
                <Badge variant="outline" data-testid="rsvp-response-version-badge">
                  Response v{confirmedSubmission.responseVersion}
                </Badge>
              ) : null}
            </div>
            <CardTitle className="text-2xl">Respond for {household.displayName}</CardTitle>
            <CardDescription>
              Share your household&rsquo;s attendance details for <strong>{weddingTitle}</strong>.
            </CardDescription>
          </div>

          {formattedDeadline ? (
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
              <span>Respond by {formattedDeadline}</span>
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {!rsvp.isAcceptingResponses ? (
          <div
            role="status"
            data-testid="public-rsvp-closed-banner"
            className="bg-muted/40 flex items-start gap-2.5 rounded-lg border p-3.5 text-xs leading-relaxed"
          >
            <Lock className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">
                {rsvp.closedReason === 'deadline_passed'
                  ? 'The RSVP Deadline Has Passed'
                  : 'Online RSVPs Are Currently Closed'}
              </p>
              <p className="text-muted-foreground mt-0.5">
                Online changes are locked. Please reach out to the couple directly if your plans
                have changed.
              </p>
            </div>
          </div>
        ) : null}

        {/* Confirmed Summary View */}
        {confirmedSubmission && (!isEditing || !rsvp.isAcceptingResponses) ? (
          <div
            data-testid="public-rsvp-confirmed-summary"
            className="space-y-4 rounded-lg border border-emerald-600/30 bg-emerald-500/5 p-4"
          >
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                  <span className="text-sm font-semibold">
                    {confirmedSubmission.overallStatus === 'attending'
                      ? `Confirmed Attending (${confirmedSubmission.attendingCount} ${confirmedSubmission.attendingCount === 1 ? 'guest' : 'guests'})`
                      : 'Confirmed Unable to Attend'}
                  </span>
                </div>
                {confirmationText ? (
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {confirmationText}
                  </p>
                ) : null}
              </div>

              {rsvp.isAcceptingResponses ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    populateFormFromConfirmed(confirmedSubmission);
                    setValidationError(null);
                    setIsEditing(true);
                  }}
                  data-testid="public-rsvp-edit-button"
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Update Response
                </Button>
              ) : null}
            </div>

            {confirmedSubmission.attendees.length > 0 ? (
              <ul className="divide-y rounded-md border bg-white/70 text-xs dark:bg-black/20">
                {confirmedSubmission.attendees.map((att) => (
                  <li
                    key={att.guestId}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="font-medium">
                      {guestNameById.get(att.guestId) ?? 'Household Member'}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={att.attendanceStatus === 'attending' ? 'secondary' : 'outline'}
                      >
                        {att.attendanceStatus === 'attending' ? 'Attending' : 'Unable to Attend'}
                      </Badge>
                      {att.dietaryNotes ? (
                        <Badge variant="outline">Dietary: {att.dietaryNotes}</Badge>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {confirmedSubmission.answers.length > 0 ? (
              <div className="space-y-1 text-xs">
                <p className="font-semibold">Your Responses:</p>
                <ul className="space-y-1">
                  {confirmedSubmission.answers.map((ans) => (
                    <li key={ans.questionId}>
                      <span className="text-muted-foreground">
                        {questionLabelById.get(ans.questionId) ?? 'Question'}:
                      </span>{' '}
                      <strong className="font-medium">{ans.answerText}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {confirmedSubmission.householdNote ? (
              <p className="text-muted-foreground text-xs italic">
                &ldquo;{confirmedSubmission.householdNote}&rdquo;
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Interactive Form when accepting responses */}
        {rsvp.isAcceptingResponses && (isEditing || !confirmedSubmission) ? (
          <form noValidate onSubmit={handleFormSubmit} className="space-y-5">
            {/* Overall Household Response */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Will your household be attending?</Label>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={overallStatus === 'attending' ? 'default' : 'outline'}
                  onClick={() => setOverallStatus('attending')}
                  data-testid="rsvp-overall-attending-button"
                  className="justify-center"
                >
                  Joyfully Attending
                </Button>
                <Button
                  type="button"
                  variant={overallStatus === 'declined' ? 'default' : 'outline'}
                  onClick={() => setOverallStatus('declined')}
                  data-testid="rsvp-overall-declined-button"
                  className="justify-center"
                >
                  Regretfully Unable to Attend
                </Button>
              </div>
            </div>

            {overallStatus === 'attending' ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3.5 py-2.5 text-xs">
                  <span className="font-medium">Household Attendance Selection</span>
                  <Badge
                    variant={
                      totalAttendingSelected > household.maxAttendees ? 'destructive' : 'secondary'
                    }
                    data-testid="rsvp-live-capacity-badge"
                  >
                    {totalAttendingSelected} of {household.maxAttendees}{' '}
                    {household.maxAttendees === 1 ? 'spot' : 'spots'} selected
                  </Badge>
                </div>

                {/* Per-Named-Guest Attendance & Dietary Notes */}
                {household.guests.length > 0 ? (
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Household Members</Label>
                    <div className="space-y-3">
                      {household.guests.map((guest) => {
                        const memberChoice = guestStatusMap[guest.id] ?? 'declined';
                        return (
                          <div
                            key={guest.id}
                            data-testid={`rsvp-member-row-${guest.id}`}
                            className="bg-muted/20 space-y-2.5 rounded-lg border p-3.5"
                          >
                            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">
                                  {guest.firstName} {guest.lastName}
                                </span>
                                {guest.isChild ? (
                                  <Badge variant="outline" className="text-[11px]">
                                    Child
                                  </Badge>
                                ) : null}
                              </div>

                              <div className="flex flex-wrap gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={memberChoice === 'attending' ? 'default' : 'outline'}
                                  onClick={() =>
                                    setGuestStatusMap((prev) => ({
                                      ...prev,
                                      [guest.id]: 'attending',
                                    }))
                                  }
                                  data-testid={`rsvp-guest-attending-${guest.id}`}
                                >
                                  Attending
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={memberChoice === 'declined' ? 'secondary' : 'outline'}
                                  onClick={() =>
                                    setGuestStatusMap((prev) => ({
                                      ...prev,
                                      [guest.id]: 'declined',
                                    }))
                                  }
                                  data-testid={`rsvp-guest-declined-${guest.id}`}
                                >
                                  Unable to Attend
                                </Button>
                              </div>
                            </div>

                            {memberChoice === 'attending' && rsvp.showDietaryNotes ? (
                              <div className="space-y-1">
                                <Label
                                  htmlFor={`rsvp-dietary-${guest.id}`}
                                  className="text-muted-foreground text-xs"
                                >
                                  Dietary restrictions or allergies (optional)
                                </Label>
                                <Input
                                  id={`rsvp-dietary-${guest.id}`}
                                  data-testid={`rsvp-guest-dietary-${guest.id}`}
                                  value={guestDietaryMap[guest.id] ?? ''}
                                  onChange={(event) =>
                                    setGuestDietaryMap((prev) => ({
                                      ...prev,
                                      [guest.id]: event.target.value,
                                    }))
                                  }
                                  maxLength={300}
                                  placeholder="e.g., Vegetarian, nut allergy"
                                />
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Unnamed / Plus-One Spots when allowed */}
                {canSpecifyAdditionalGuests ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="rsvp-additional-guests-select">
                      {household.guests.length === 0
                        ? 'Number of Attending Household Guests'
                        : 'Additional Plus-One Guests'}
                    </Label>
                    <NativeSelect
                      id="rsvp-additional-guests-select"
                      data-testid="rsvp-additional-guests-select"
                      value={String(additionalGuestsCount)}
                      onChange={(event) =>
                        setAdditionalGuestsCount(Number.parseInt(event.target.value, 10) || 0)
                      }
                    >
                      {Array.from(
                        { length: Math.max(0, household.maxAttendees - namedAttendingCount) + 1 },
                        (_, count) => count,
                      ).map((count) => (
                        <option key={count} value={count}>
                          {count} {count === 1 ? 'guest' : 'guests'}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                ) : null}

                {/* Configurable Custom RSVP Questions */}
                {rsvp.questions.length > 0 ? (
                  <div className="space-y-4">
                    <Label className="text-sm font-semibold">Celebration Questions</Label>
                    {rsvp.questions.map((question) => {
                      const fieldId = `rsvp-question-${question.id}`;
                      const currentVal = answersMap[question.id] ?? '';

                      return (
                        <div key={question.id} className="space-y-1.5">
                          <Label htmlFor={fieldId} className="text-sm">
                            {question.label}{' '}
                            {question.isRequired ? (
                              <span className="text-destructive">*</span>
                            ) : (
                              <span className="text-muted-foreground text-xs font-normal">
                                (optional)
                              </span>
                            )}
                          </Label>
                          {question.helpText ? (
                            <p className="text-muted-foreground text-xs">{question.helpText}</p>
                          ) : null}

                          {question.questionType === 'single_select' ? (
                            <NativeSelect
                              id={fieldId}
                              data-testid={`rsvp-question-input-${question.id}`}
                              value={currentVal}
                              onChange={(event) =>
                                setAnswersMap((prev) => ({
                                  ...prev,
                                  [question.id]: event.target.value,
                                }))
                              }
                            >
                              <option value="">Select an option…</option>
                              {question.options.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </NativeSelect>
                          ) : question.questionType === 'boolean' ? (
                            <NativeSelect
                              id={fieldId}
                              data-testid={`rsvp-question-input-${question.id}`}
                              value={currentVal}
                              onChange={(event) =>
                                setAnswersMap((prev) => ({
                                  ...prev,
                                  [question.id]: event.target.value,
                                }))
                              }
                            >
                              <option value="">Select Yes or No…</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </NativeSelect>
                          ) : (
                            <Input
                              id={fieldId}
                              data-testid={`rsvp-question-input-${question.id}`}
                              value={currentVal}
                              onChange={(event) =>
                                setAnswersMap((prev) => ({
                                  ...prev,
                                  [question.id]: event.target.value,
                                }))
                              }
                              maxLength={500}
                              placeholder="Your answer"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="rsvp-household-note">Note for the Couple (optional)</Label>
              <Textarea
                id="rsvp-household-note"
                data-testid="rsvp-household-note-input"
                rows={3}
                maxLength={500}
                value={householdNote}
                onChange={(event) => setHouseholdNote(event.target.value)}
                placeholder="Share a warm wish or message for the couple…"
              />
            </div>

            {validationError ? (
              <div
                role="alert"
                data-testid="rsvp-submit-error"
                className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-xs font-medium"
              >
                {validationError}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              {confirmedSubmission ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={submitMutation.isPending}
                  onClick={() => {
                    setValidationError(null);
                    setIsEditing(false);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
              <Button
                type="submit"
                disabled={submitMutation.isPending}
                data-testid="rsvp-submit-button"
              >
                <Send className="size-4" aria-hidden="true" />
                {submitMutation.isPending
                  ? 'Saving Response…'
                  : confirmedSubmission
                    ? 'Save Updated RSVP'
                    : 'Submit Household RSVP'}
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
