import { z } from 'zod';
import {
  type InvitationDocument,
  parseInvitationDocument,
  type SchemaValidationIssue,
} from '@/features/design/schemas/designSchemas';

const SAFE_INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function isValidPublicInvitationToken(rawToken: string | undefined): rawToken is string {
  return Boolean(rawToken && SAFE_INVITATION_TOKEN_PATTERN.test(rawToken.trim()));
}

const publicHouseholdGuestSchema = z.strictObject({
  id: z.uuid(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80),
  isChild: z.boolean(),
  dietaryNotes: z.string().max(300),
});

export type PublicHouseholdGuest = z.infer<typeof publicHouseholdGuestSchema>;

const publicHouseholdSummarySchema = z.strictObject({
  displayName: z.string().min(1).max(120),
  maxAttendees: z.number().int().min(1).max(50),
  expiresAt: z.string().min(1).nullable(),
  guests: z.array(publicHouseholdGuestSchema).max(50),
});

export type PublicHouseholdSummary = z.infer<typeof publicHouseholdSummarySchema>;

export const publicRsvpQuestionSchema = z.strictObject({
  id: z.uuid(),
  label: z.string().min(1).max(160),
  helpText: z.string().max(240),
  questionType: z.enum(['short_text', 'single_select', 'boolean']),
  options: z.array(z.string().min(1).max(80)).max(10),
  isRequired: z.boolean(),
  sortOrder: z.number().int().min(0).max(50),
});

export type PublicRsvpQuestion = z.infer<typeof publicRsvpQuestionSchema>;

export const publicSubmittedAttendeeSchema = z.strictObject({
  guestId: z.uuid(),
  attendanceStatus: z.enum(['attending', 'declined']),
  dietaryNotes: z.string().max(300),
});

export type PublicSubmittedAttendee = z.infer<typeof publicSubmittedAttendeeSchema>;

export const publicSubmittedAnswerSchema = z.strictObject({
  questionId: z.uuid(),
  answerText: z.string().max(500),
});

export type PublicSubmittedAnswer = z.infer<typeof publicSubmittedAnswerSchema>;

export const publicExistingRsvpSubmissionSchema = z.strictObject({
  overallStatus: z.enum(['attending', 'declined']),
  attendingCount: z.number().int().min(0).max(50),
  additionalGuestsCount: z.number().int().min(0).max(50),
  householdNote: z.string().max(500),
  responseVersion: z.number().int().min(1),
  submittedAt: z.string().min(1),
  updatedAt: z.string().min(1),
  attendees: z.array(publicSubmittedAttendeeSchema).max(50),
  answers: z.array(publicSubmittedAnswerSchema).max(50),
});

export type PublicExistingRsvpSubmission = z.infer<typeof publicExistingRsvpSubmissionSchema>;

export const publicRsvpContextSchema = z.strictObject({
  isAcceptingResponses: z.boolean(),
  closedReason: z.enum(['rsvp_closed', 'deadline_passed']).nullable(),
  rsvpDeadline: z.string().min(1).nullable(),
  timezone: z.string().min(1),
  allowPlusOnes: z.boolean(),
  showDietaryNotes: z.boolean(),
  confirmationMessage: z.string(),
  questions: z.array(publicRsvpQuestionSchema).max(50),
  existingSubmission: publicExistingRsvpSubmissionSchema.nullable(),
});

export type PublicRsvpContext = z.infer<typeof publicRsvpContextSchema>;

export const rpcResolveInvitationEnvelopeSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('invalid_token'),
  }),
  z.strictObject({
    status: z.literal('unavailable'),
  }),
  z.strictObject({
    status: z.literal('active'),
    versionNumber: z.number().int().min(1),
    publishedAt: z.string().min(1),
    snapshot: z.unknown(),
    household: publicHouseholdSummarySchema,
    rsvp: publicRsvpContextSchema.optional(),
  }),
]);

export type PublicInvitationLookupResult =
  | { readonly status: 'unconfigured' }
  | { readonly status: 'invalid_token' }
  | { readonly status: 'unavailable' }
  | {
      readonly status: 'schema_invalid';
      readonly issues: readonly SchemaValidationIssue[];
    }
  | {
      readonly status: 'active';
      readonly versionNumber: number;
      readonly publishedAt: string;
      readonly document: InvitationDocument;
      readonly household: PublicHouseholdSummary;
      readonly rsvp: PublicRsvpContext;
    };

export function parsePublicInvitationLookupEnvelope(
  rawData: unknown,
): PublicInvitationLookupResult {
  const parsedEnvelope = rpcResolveInvitationEnvelopeSchema.safeParse(rawData);
  if (!parsedEnvelope.success) {
    return {
      status: 'schema_invalid',
      issues: [
        {
          path: 'response',
          message: 'Unexpected household invitation lookup response envelope.',
        },
      ],
    };
  }

  if (parsedEnvelope.data.status !== 'active') {
    return { status: parsedEnvelope.data.status };
  }

  const validatedDoc = parseInvitationDocument(parsedEnvelope.data.snapshot);
  if (!validatedDoc.ok) {
    return {
      status: 'schema_invalid',
      issues: validatedDoc.issues,
    };
  }

  const fallbackRsvpContext: PublicRsvpContext = {
    isAcceptingResponses: validatedDoc.data.wedding.isRsvpOpen,
    closedReason: validatedDoc.data.wedding.isRsvpOpen ? null : 'rsvp_closed',
    rsvpDeadline: validatedDoc.data.wedding.rsvpDeadline,
    timezone: validatedDoc.data.wedding.timezone,
    allowPlusOnes: false,
    showDietaryNotes: true,
    confirmationMessage: 'Thank you for sharing your household RSVP!',
    questions: [],
    existingSubmission: null,
  };

  return {
    status: 'active',
    versionNumber: parsedEnvelope.data.versionNumber,
    publishedAt: parsedEnvelope.data.publishedAt,
    document: validatedDoc.data,
    household: parsedEnvelope.data.household,
    rsvp: parsedEnvelope.data.rsvp ?? fallbackRsvpContext,
  };
}
