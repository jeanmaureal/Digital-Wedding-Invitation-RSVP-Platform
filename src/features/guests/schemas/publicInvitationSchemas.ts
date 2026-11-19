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

  return {
    status: 'active',
    versionNumber: parsedEnvelope.data.versionNumber,
    publishedAt: parsedEnvelope.data.publishedAt,
    document: validatedDoc.data,
    household: parsedEnvelope.data.household,
  };
}
