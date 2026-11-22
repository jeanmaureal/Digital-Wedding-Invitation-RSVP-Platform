import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Lock, Pencil, X } from 'lucide-react';
import { type FormEvent, type JSX, useEffect, useState } from 'react';
import type {
  PublicExistingRsvpSubmission,
  PublicHouseholdSummary,
  PublicRsvpContext,
} from '@/features/guests/schemas/publicInvitationSchemas';
import { submitPublicHouseholdRsvp } from '@/features/rsvp/api/publicRsvpApi';
import { translatePublicRsvpError } from '@/features/rsvp/schemas/publicRsvpSchemas';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

export interface RoyalBotanicalRsvpDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly rawToken: string | undefined;
  readonly partnerOneName: string;
  readonly partnerTwoName: string;
  readonly eventDateLabel: string;
  readonly household: PublicHouseholdSummary;
  readonly rsvp: PublicRsvpContext;
  readonly client?: TypedSupabaseClient | null;
  readonly onSubmitted?: (updated: PublicExistingRsvpSubmission) => void;
}

const ORDINAL_GUEST_LABELS = [
  'PRIMARY GUEST FULL NAME',
  'SECOND GUEST FULL NAME',
  'THIRD GUEST FULL NAME',
  'FOURTH GUEST FULL NAME',
  'FIFTH GUEST FULL NAME',
  'SIXTH GUEST FULL NAME',
] as const;

function getGuestSlotLabel(index: number): string {
  return ORDINAL_GUEST_LABELS[index] ?? `GUEST ${index + 1} FULL NAME`;
}

function getSeatOptionLabel(count: number, maxSeats: number): string {
  if (count === 1) {
    return maxSeats === 1 ? '1 Guest (Reserved Seat)' : '1 Guest';
  }
  if (count === maxSeats) {
    return maxSeats === 2
      ? '2 Guests (Both Reserved Seats)'
      : `${count} Guests (All ${maxSeats} Reserved Seats)`;
  }
  return `${count} Guests`;
}

export function RoyalBotanicalRsvpDialog({
  isOpen,
  onClose,
  rawToken,
  partnerOneName,
  partnerTwoName,
  eventDateLabel,
  household,
  rsvp,
  client,
  onSubmitted,
}: RoyalBotanicalRsvpDialogProps): JSX.Element | null {
  const maxSeats = Math.max(1, household.maxAttendees);

  const [confirmedSubmission, setConfirmedSubmission] =
    useState<PublicExistingRsvpSubmission | null>(rsvp.existingSubmission);
  const [confirmationText, setConfirmationText] = useState<string>(rsvp.confirmationMessage);
  const [isEditing, setIsEditing] = useState<boolean>(rsvp.existingSubmission === null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [overallStatus, setOverallStatus] = useState<'attending' | 'declined'>(
    rsvp.existingSubmission?.overallStatus ?? 'attending',
  );

  const [selectedSeats, setSelectedSeats] = useState<number>(() => {
    if (rsvp.existingSubmission && rsvp.existingSubmission.overallStatus === 'attending') {
      return Math.min(maxSeats, Math.max(1, rsvp.existingSubmission.attendingCount));
    }
    return maxSeats;
  });

  const [guestNames, setGuestNames] = useState<string[]>(() => {
    const names: string[] = [];
    for (let i = 0; i < maxSeats; i += 1) {
      const existing = household.guests[i];
      names.push(existing ? `${existing.firstName} ${existing.lastName}`.trim() : '');
    }
    return names;
  });

  const [guestDietary, setGuestDietary] = useState<string[]>(() => {
    const existingMap = new Map(
      (rsvp.existingSubmission?.attendees ?? []).map((a) => [a.guestId, a.dietaryNotes]),
    );
    const notes: string[] = [];
    for (let i = 0; i < maxSeats; i += 1) {
      const g = household.guests[i];
      notes.push(g ? (existingMap.get(g.id) ?? g.dietaryNotes ?? '') : '');
    }
    return notes;
  });

  const [answersMap, setAnswersMap] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const ans of rsvp.existingSubmission?.answers ?? []) {
      initial[ans.questionId] = ans.answerText;
    }
    return initial;
  });

  const [wishesNote, setWishesNote] = useState<string>(
    rsvp.existingSubmission?.householdNote ?? '',
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const submitMutation = useMutation({
    mutationFn: () => {
      const attendingSeatCount = overallStatus === 'attending' ? selectedSeats : 0;
      const namedGuestCount = Math.min(household.guests.length, attendingSeatCount);
      const additionalGuestsCount =
        overallStatus === 'attending' ? Math.max(0, attendingSeatCount - namedGuestCount) : 0;

      // Capture any companion names typed for unnamed slots into the note if not already present
      const extraTypedNames =
        overallStatus === 'attending'
          ? guestNames
              .slice(household.guests.length, attendingSeatCount)
              .map((n) => n.trim())
              .filter(Boolean)
          : [];

      const trimmedWishes = wishesNote.trim();
      const combinedNote =
        extraTypedNames.length > 0
          ? trimmedWishes
            ? `${trimmedWishes}\nGuests: ${extraTypedNames.join(', ')}`
            : `Guests: ${extraTypedNames.join(', ')}`
          : trimmedWishes;

      return submitPublicHouseholdRsvp({
        rawToken,
        ...(client !== undefined ? { client } : {}),
        payload: {
          overallStatus,
          additionalGuestsCount,
          householdNote: combinedNote.slice(0, 1000),
          attendees: household.guests.map((guest, index) => {
            const isAttending = overallStatus === 'attending' && index < attendingSeatCount;
            return {
              guestId: guest.id,
              attendanceStatus: isAttending ? 'attending' : 'declined',
              dietaryNotes: isAttending ? (guestDietary[index] ?? '') : '',
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
      });
    },
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

  if (!isOpen) {
    return null;
  }

  const coupleDisplay = `${partnerOneName} & ${partnerTwoName}`;
  const coupleUpper = coupleDisplay.toUpperCase();

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setValidationError(null);

    if (overallStatus === 'attending') {
      for (let i = 0; i < selectedSeats; i += 1) {
        if (!(guestNames[i] ?? '').trim()) {
          setValidationError(`Please enter the full name for ${getGuestSlotLabel(i).toLowerCase()}.`);
          return;
        }
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

  return (
    <div
      data-testid="royal-botanical-rsvp-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rb-rsvp-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#232C1C]/55 p-4 backdrop-blur-[3px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-[28px] border bg-[#FBF9F2] px-6 py-8 text-[#2F3A26] shadow-[0_28px_64px_-16px_rgba(20,28,14,0.48)] sm:px-9 sm:py-9"
        style={{ borderColor: '#E2D8BC' }}
      >
        {/* Top-right circular close button */}
        <button
          type="button"
          data-testid="rb-rsvp-dialog-close"
          onClick={onClose}
          aria-label="Close RSVP dialog"
          className="absolute top-5 right-5 inline-flex size-9 cursor-pointer items-center justify-center rounded-full border border-[#E5DBC0] bg-[#F3EEDB] text-[#4B583D] transition-colors hover:bg-[#EAE2C6]"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        {/* Dialog Header */}
        <div className="space-y-1.5 text-center">
          <div className="flex items-center justify-center gap-2.5 text-[10px] font-semibold tracking-[0.26em] uppercase text-[#B5974B]">
            <span className="rb-pearl rb-pearl-xs" aria-hidden="true" />
            <span>
              {maxSeats} {maxSeats === 1 ? 'SEAT' : 'SEATS'} RESERVED
            </span>
            <span className="rb-pearl rb-pearl-xs" aria-hidden="true" />
          </div>
          <h2
            id="rb-rsvp-dialog-title"
            className="text-3xl font-normal text-[#2F3A26] sm:text-[34px]"
            style={{
              fontFamily: "Garamond, 'Baskerville Old Face', 'Palatino Linotype', Georgia, serif",
            }}
          >
            Respond to Invitation
          </h2>
          <p className="text-xs tracking-wide text-[#6E7663]">
            {coupleDisplay}
            {eventDateLabel ? ` · ${eventDateLabel}` : ''}
          </p>
        </div>

        {/* Closed RSVP Notice */}
        {!rsvp.isAcceptingResponses ? (
          <div
            role="status"
            data-testid="public-rsvp-closed-banner"
            className="mt-6 flex items-start gap-2.5 rounded-2xl border border-[#E2D8BC] bg-[#F5F0E0] p-4 text-xs leading-relaxed text-[#4B583D]"
          >
            <Lock className="mt-0.5 size-4 shrink-0 text-[#9A8242]" aria-hidden="true" />
            <div>
              <p className="font-semibold">
                {rsvp.closedReason === 'deadline_passed'
                  ? 'The RSVP Deadline Has Passed'
                  : 'Online RSVPs Are Currently Closed'}
              </p>
              <p className="mt-0.5 text-[#69705E]">
                Online changes are locked. Please reach out to {coupleDisplay} directly if your
                plans have changed.
              </p>
            </div>
          </div>
        ) : null}

        {/* Confirmed Response Summary */}
        {confirmedSubmission && (!isEditing || !rsvp.isAcceptingResponses) ? (
          <div
            data-testid="public-rsvp-confirmed-summary"
            className="mt-6 space-y-5 rounded-2xl border border-[#DFC97B] bg-[#FAF4D7]/70 p-5 text-center"
          >
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="size-8 text-[#3E4C30]" aria-hidden="true" />
              <p
                className="text-2xl font-normal text-[#2F3A26]"
                style={{
                  fontFamily:
                    "Garamond, 'Baskerville Old Face', 'Palatino Linotype', Georgia, serif",
                }}
              >
                {confirmedSubmission.overallStatus === 'attending'
                  ? 'We Cannot Wait to Celebrate With You'
                  : 'Thank You for Letting Us Know'}
              </p>
              <p className="text-xs font-semibold tracking-[0.18em] uppercase text-[#9A8242]">
                {confirmedSubmission.overallStatus === 'attending'
                  ? `Confirmed · ${confirmedSubmission.attendingCount} ${confirmedSubmission.attendingCount === 1 ? 'Guest' : 'Guests'} Attending`
                  : 'Regretfully Declined'}
              </p>
              {confirmationText ? (
                <p className="mt-1 text-xs leading-relaxed text-[#5C6650]">{confirmationText}</p>
              ) : null}
            </div>

            {confirmedSubmission.householdNote ? (
              <p className="rounded-xl border border-[#E8DFC7] bg-[#FBF9F2] px-4 py-3 text-xs italic text-[#5C6650]">
                &ldquo;{confirmedSubmission.householdNote}&rdquo;
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              {rsvp.isAcceptingResponses ? (
                <button
                  type="button"
                  data-testid="public-rsvp-edit-button"
                  onClick={() => {
                    setValidationError(null);
                    setIsEditing(true);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#D4BE6A] bg-[#FBF9F2] px-5 py-2 text-[11px] font-semibold tracking-[0.18em] uppercase text-[#3E4C30] transition-colors hover:bg-[#F3ECD6]"
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  <span>Update Response</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-full bg-[#3E4C30] px-6 py-2 text-[11px] font-semibold tracking-[0.18em] uppercase text-[#FBF9F2] transition-opacity hover:opacity-90"
              >
                Back to Invitation
              </button>
            </div>
          </div>
        ) : null}

        {/* Interactive RSVP Form */}
        {rsvp.isAcceptingResponses && (isEditing || !confirmedSubmission) ? (
          <form noValidate onSubmit={handleSubmit} className="mt-6 space-y-5">
            {/* 2-Card Attendance Selector */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                data-testid="rsvp-overall-attending-button"
                onClick={() => setOverallStatus('attending')}
                className="cursor-pointer rounded-2xl border px-3 py-4 text-center transition-all"
                style={
                  overallStatus === 'attending'
                    ? {
                        backgroundColor: '#FAF2CE',
                        borderColor: '#D4BE6A',
                        boxShadow: '0 4px 12px -6px rgba(194, 166, 90, 0.45)',
                      }
                    : {
                        backgroundColor: '#F7F3E7',
                        borderColor: '#E4DABF',
                      }
                }
              >
                <span
                  className="block text-base font-medium text-[#2F3A26] sm:text-lg"
                  style={{
                    fontFamily:
                      "Garamond, 'Baskerville Old Face', 'Palatino Linotype', Georgia, serif",
                  }}
                >
                  Joyfully Accepts
                </span>
                <span className="mt-0.5 block text-[9px] font-semibold tracking-[0.18em] uppercase text-[#7A826F] sm:text-[10px]">
                  WE&rsquo;LL BE THERE!
                </span>
              </button>

              <button
                type="button"
                data-testid="rsvp-overall-declined-button"
                onClick={() => setOverallStatus('declined')}
                className="cursor-pointer rounded-2xl border px-3 py-4 text-center transition-all"
                style={
                  overallStatus === 'declined'
                    ? {
                        backgroundColor: '#FAF2CE',
                        borderColor: '#D4BE6A',
                        boxShadow: '0 4px 12px -6px rgba(194, 166, 90, 0.45)',
                      }
                    : {
                        backgroundColor: '#F7F3E7',
                        borderColor: '#E4DABF',
                      }
                }
              >
                <span
                  className="block text-base font-medium text-[#2F3A26] sm:text-lg"
                  style={{
                    fontFamily:
                      "Garamond, 'Baskerville Old Face', 'Palatino Linotype', Georgia, serif",
                  }}
                >
                  Regretfully Declines
                </span>
                <span className="mt-0.5 block text-[9px] font-semibold tracking-[0.18em] uppercase text-[#7A826F] sm:text-[10px]">
                  SENDING WARM WISHES
                </span>
              </button>
            </div>

            {overallStatus === 'attending' ? (
              <div className="space-y-4">
                {/* Seat Count Selector */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="rb-rsvp-seat-count"
                    className="block text-[10px] font-semibold tracking-[0.16em] uppercase text-[#3E4C30]"
                  >
                    HOW MANY OF YOUR {maxSeats} RESERVED {maxSeats === 1 ? 'SEAT' : 'SEATS'} WILL
                    ATTEND?
                  </label>
                  <select
                    id="rb-rsvp-seat-count"
                    data-testid="rb-rsvp-seat-count"
                    value={selectedSeats}
                    onChange={(event) => setSelectedSeats(Number(event.target.value))}
                    className="w-full rounded-xl border border-[#E0D6B8] bg-[#F5F0E0] px-4 py-3 text-sm text-[#2F3A26] focus:border-[#C2A65A] focus:outline-none focus:ring-2 focus:ring-[#C2A65A]/30"
                  >
                    {Array.from({ length: maxSeats }, (_, idx) => maxSeats - idx).map((count) => (
                      <option key={count} value={count}>
                        {getSeatOptionLabel(count, maxSeats)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Guest Full Name Fields */}
                {Array.from({ length: selectedSeats }, (_, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <label
                      htmlFor={`rb-rsvp-guest-name-${idx}`}
                      className="block text-[10px] font-semibold tracking-[0.16em] uppercase text-[#3E4C30]"
                    >
                      {getGuestSlotLabel(idx)} <span className="text-[#B5974B]">*</span>
                    </label>
                    <input
                      id={`rb-rsvp-guest-name-${idx}`}
                      data-testid={`rb-rsvp-guest-name-${idx}`}
                      type="text"
                      required
                      value={guestNames[idx] ?? ''}
                      onChange={(event) => {
                        const next = [...guestNames];
                        next[idx] = event.target.value;
                        setGuestNames(next);
                      }}
                      placeholder={
                        idx === 0 ? 'Enter your full name' : "Enter your companion's name"
                      }
                      maxLength={120}
                      className="w-full rounded-xl border border-[#E0D6B8] bg-[#F5F0E0] px-4 py-3 text-sm text-[#2F3A26] placeholder:text-[#969D8B] focus:border-[#C2A65A] focus:outline-none focus:ring-2 focus:ring-[#C2A65A]/30"
                    />

                    {rsvp.showDietaryNotes ? (
                      <input
                        type="text"
                        aria-label={`Dietary notes for guest ${idx + 1}`}
                        value={guestDietary[idx] ?? ''}
                        onChange={(event) => {
                          const next = [...guestDietary];
                          next[idx] = event.target.value;
                          setGuestDietary(next);
                        }}
                        placeholder="Dietary restrictions or allergies (optional)"
                        maxLength={300}
                        className="w-full rounded-xl border border-[#E6DDC4] bg-[#F8F5EB] px-3.5 py-2 text-xs text-[#2F3A26] placeholder:text-[#969D8B] focus:border-[#C2A65A] focus:outline-none"
                      />
                    ) : null}
                  </div>
                ))}

                {/* Custom Organizer Questions */}
                {rsvp.questions.map((question) => (
                  <div key={question.id} className="space-y-1.5">
                    <label
                      htmlFor={`rb-rsvp-question-${question.id}`}
                      className="block text-[10px] font-semibold tracking-[0.16em] uppercase text-[#3E4C30]"
                    >
                      {question.label}
                      {question.isRequired ? <span className="ml-1 text-[#B5974B]">*</span> : null}
                    </label>
                    {question.questionType === 'single_select' && question.options.length > 0 ? (
                      <select
                        id={`rb-rsvp-question-${question.id}`}
                        value={answersMap[question.id] ?? ''}
                        onChange={(event) =>
                          setAnswersMap((prev) => ({
                            ...prev,
                            [question.id]: event.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-[#E0D6B8] bg-[#F5F0E0] px-4 py-3 text-sm text-[#2F3A26] focus:border-[#C2A65A] focus:outline-none focus:ring-2 focus:ring-[#C2A65A]/30"
                      >
                        <option value="">Select an option…</option>
                        {question.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`rb-rsvp-question-${question.id}`}
                        type="text"
                        value={answersMap[question.id] ?? ''}
                        onChange={(event) =>
                          setAnswersMap((prev) => ({
                            ...prev,
                            [question.id]: event.target.value,
                          }))
                        }
                        maxLength={500}
                        placeholder="Your answer…"
                        className="w-full rounded-xl border border-[#E0D6B8] bg-[#F5F0E0] px-4 py-3 text-sm text-[#2F3A26] placeholder:text-[#969D8B] focus:border-[#C2A65A] focus:outline-none focus:ring-2 focus:ring-[#C2A65A]/30"
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {/* Wishes / Note Textarea */}
            <div className="space-y-1.5">
              <label
                htmlFor="rb-rsvp-wishes"
                className="block text-[10px] font-semibold tracking-[0.16em] uppercase text-[#3E4C30]"
              >
                WISHES FOR {coupleUpper} (OPTIONAL)
              </label>
              <textarea
                id="rb-rsvp-wishes"
                data-testid="rb-rsvp-wishes"
                rows={3}
                maxLength={800}
                value={wishesNote}
                onChange={(event) => setWishesNote(event.target.value)}
                placeholder="Leave a blessing or song request…"
                className="w-full resize-y rounded-xl border border-[#E0D6B8] bg-[#F5F0E0] px-4 py-3 text-sm text-[#2F3A26] placeholder:text-[#969D8B] focus:border-[#C2A65A] focus:outline-none focus:ring-2 focus:ring-[#C2A65A]/30"
              />
            </div>

            {validationError ? (
              <p
                role="alert"
                data-testid="rb-rsvp-error"
                className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-xs text-red-800"
              >
                {validationError}
              </p>
            ) : null}

            {/* Full-Width Deep Olive Submit Pill */}
            <button
              type="submit"
              data-testid="rsvp-submit-button"
              disabled={submitMutation.isPending}
              className="w-full cursor-pointer rounded-full bg-[#3E4C30] py-3.5 text-xs font-semibold tracking-[0.24em] uppercase text-[#FBF9F2] shadow-md transition-all hover:opacity-95 disabled:cursor-wait disabled:opacity-70"
            >
              {submitMutation.isPending
                ? 'SENDING RESPONSE…'
                : confirmedSubmission
                  ? 'UPDATE RESPONSE'
                  : 'SEND RESPONSE'}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
