import { z } from 'zod';
import { publicExistingRsvpSubmissionSchema } from '@/features/guests/schemas/publicInvitationSchemas';

const UNSAFE_SCRIPT_OR_URI_PATTERN = /<\s*script\b|(?:javascript|vbscript):|data:\s*text\/html/i;

function hasSafeText(value: string): boolean {
  return !UNSAFE_SCRIPT_OR_URI_PATTERN.test(value);
}

export const submitHouseholdRsvpPayloadSchema = z.object({
  overallStatus: z.enum(['attending', 'declined']),
  additionalGuestsCount: z.number().int().min(0).max(50),
  householdNote: z
    .string()
    .trim()
    .max(500, 'Message to the couple must be 500 characters or fewer.')
    .refine(hasSafeText, 'Unsafe script or URI markup is not permitted.'),
  attendees: z
    .array(
      z.object({
        guestId: z.uuid(),
        attendanceStatus: z.enum(['attending', 'declined']),
        dietaryNotes: z
          .string()
          .trim()
          .max(300, 'Dietary notes must be 300 characters or fewer.')
          .refine(hasSafeText, 'Unsafe script or URI markup is not permitted.'),
      }),
    )
    .max(50),
  answers: z
    .array(
      z.object({
        questionId: z.uuid(),
        answerText: z
          .string()
          .trim()
          .max(500, 'Answer must be 500 characters or fewer.')
          .refine(hasSafeText, 'Unsafe script or URI markup is not permitted.'),
      }),
    )
    .max(50),
});

export type SubmitHouseholdRsvpPayload = z.infer<typeof submitHouseholdRsvpPayloadSchema>;

export const submitHouseholdRsvpResponseSchema = z.strictObject({
  confirmationMessage: z.string(),
  submission: publicExistingRsvpSubmissionSchema,
});

export type SubmitHouseholdRsvpResponse = z.infer<typeof submitHouseholdRsvpResponseSchema>;

export type PublicRsvpErrorCode =
  | 'UNCONFIGURED'
  | 'INVALID_INVITATION_TOKEN'
  | 'INVITATION_UNAVAILABLE'
  | 'RSVP_CLOSED'
  | 'RSVP_DEADLINE_PASSED'
  | 'HOUSEHOLD_CAPACITY_EXCEEDED'
  | 'PLUS_ONES_NOT_ALLOWED'
  | 'ATTENDING_REQUIRES_AT_LEAST_ONE_GUEST'
  | 'RSVP_ANSWER_VALIDATION_ERROR'
  | 'UNSAFE_RSVP_PAYLOAD'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export class PublicRsvpDomainError extends Error {
  readonly code: PublicRsvpErrorCode;

  constructor(code: PublicRsvpErrorCode, message: string) {
    super(message);
    this.name = 'PublicRsvpDomainError';
    this.code = code;
  }
}

interface PostgrestErrorShape {
  readonly code?: string;
  readonly message?: string;
}

export function translatePublicRsvpError(rawError: unknown): PublicRsvpDomainError {
  if (rawError instanceof PublicRsvpDomainError) {
    return rawError;
  }

  const candidate = rawError as PostgrestErrorShape | null | undefined;
  const rawMessage = typeof candidate?.message === 'string' ? candidate.message.trim() : '';

  if (rawMessage.includes('HOUSEHOLD_CAPACITY_EXCEEDED:')) {
    return new PublicRsvpDomainError(
      'HOUSEHOLD_CAPACITY_EXCEEDED',
      rawMessage.replace(/^HOUSEHOLD_CAPACITY_EXCEEDED:\s*/i, '') ||
        'Total attending guests exceeds your household invitation limit.',
    );
  }

  if (rawMessage.includes('RSVP_DEADLINE_PASSED:')) {
    return new PublicRsvpDomainError(
      'RSVP_DEADLINE_PASSED',
      'The RSVP deadline for this celebration has passed.',
    );
  }

  if (rawMessage.includes('RSVP_CLOSED:')) {
    return new PublicRsvpDomainError(
      'RSVP_CLOSED',
      'Online RSVPs are currently closed for this celebration.',
    );
  }

  if (rawMessage.includes('INVITATION_UNAVAILABLE:')) {
    return new PublicRsvpDomainError(
      'INVITATION_UNAVAILABLE',
      'This household invitation link is no longer active. Please reach out to the couple for an updated link.',
    );
  }

  if (rawMessage.includes('PLUS_ONES_NOT_ALLOWED:')) {
    return new PublicRsvpDomainError(
      'PLUS_ONES_NOT_ALLOWED',
      'Additional unnamed plus-one guests are not enabled for this celebration.',
    );
  }

  if (rawMessage.includes('ATTENDING_REQUIRES_AT_LEAST_ONE_GUEST:')) {
    return new PublicRsvpDomainError(
      'ATTENDING_REQUIRES_AT_LEAST_ONE_GUEST',
      'Select at least one attending household member or switch your response to Unable to Attend.',
    );
  }

  if (rawMessage.includes('RSVP_ANSWER_VALIDATION_ERROR:')) {
    return new PublicRsvpDomainError(
      'RSVP_ANSWER_VALIDATION_ERROR',
      rawMessage.replace(/^RSVP_ANSWER_VALIDATION_ERROR:\s*/i, '') ||
        'Please complete all required RSVP questions.',
    );
  }

  if (rawMessage.includes('UNSAFE_RSVP_PAYLOAD:')) {
    return new PublicRsvpDomainError(
      'UNSAFE_RSVP_PAYLOAD',
      'Unsafe script or URI markup is not permitted in RSVP responses.',
    );
  }

  return new PublicRsvpDomainError(
    'UNKNOWN',
    'Unable to save your household RSVP right now. Please try again in a moment.',
  );
}
