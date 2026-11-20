import { isValidPublicInvitationToken } from '@/features/guests/schemas/publicInvitationSchemas';
import {
  PublicRsvpDomainError,
  type SubmitHouseholdRsvpPayload,
  submitHouseholdRsvpPayloadSchema,
  type SubmitHouseholdRsvpResponse,
  submitHouseholdRsvpResponseSchema,
  translatePublicRsvpError,
} from '@/features/rsvp/schemas/publicRsvpSchemas';
import { getPublicSupabaseClient, type TypedSupabaseClient } from '@/lib/supabase/publicClient';
import type { Json } from '@/types/database.types';

/**
 * Submits or updates a household RSVP via `public.submit_household_rsvp` using ONLY
 * the stateless `publicClient` (`persistSession: false`, zero organizer auth coupling).
 *
 * Security invariant (`docs/security-baseline.md` §3): `rawToken` is NEVER echoed
 * into thrown Error messages, return objects, or console logs.
 */
export async function submitPublicHouseholdRsvp(params: {
  readonly rawToken: string | undefined;
  readonly payload: SubmitHouseholdRsvpPayload;
  readonly client?: TypedSupabaseClient | null;
}): Promise<SubmitHouseholdRsvpResponse> {
  if (!isValidPublicInvitationToken(params.rawToken)) {
    throw new PublicRsvpDomainError(
      'INVALID_INVITATION_TOKEN',
      'This household invitation link format is invalid.',
    );
  }

  const resolvedClient = params.client === undefined ? getPublicSupabaseClient() : params.client;
  if (!resolvedClient) {
    throw new PublicRsvpDomainError(
      'UNCONFIGURED',
      'Online RSVP submission is not configured in this environment.',
    );
  }

  const parsedPayload = submitHouseholdRsvpPayloadSchema.parse(params.payload);
  const rpcJsonPayload: Json = {
    overallStatus: parsedPayload.overallStatus,
    additionalGuestsCount: parsedPayload.additionalGuestsCount,
    householdNote: parsedPayload.householdNote,
    attendees: parsedPayload.attendees.map((att) => ({
      guestId: att.guestId,
      attendanceStatus: att.attendanceStatus,
      dietaryNotes: att.dietaryNotes,
    })),
    answers: parsedPayload.answers.map((ans) => ({
      questionId: ans.questionId,
      answerText: ans.answerText,
    })),
  };

  const { data, error } = await resolvedClient.rpc('submit_household_rsvp', {
    p_token: params.rawToken.trim(),
    p_payload: rpcJsonPayload,
  });

  if (error) {
    throw translatePublicRsvpError(error);
  }

  return submitHouseholdRsvpResponseSchema.parse(data);
}
