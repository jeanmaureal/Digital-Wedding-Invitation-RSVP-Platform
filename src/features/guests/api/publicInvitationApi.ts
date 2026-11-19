import {
  isValidPublicInvitationToken,
  parsePublicInvitationLookupEnvelope,
  type PublicInvitationLookupResult,
} from '@/features/guests/schemas/publicInvitationSchemas';
import { getPublicSupabaseClient, type TypedSupabaseClient } from '@/lib/supabase/publicClient';

/**
 * Resolves a household invitation token on `/i/:token` using ONLY the stateless
 * `publicClient` (`persistSession: false`, zero organizer auth coupling).
 *
 * Security invariant (`docs/security-baseline.md` §3): `rawToken` is NEVER echoed
 * into thrown Error messages, return objects, or console logs.
 */
export async function fetchPublicInvitationByToken(
  rawToken: string | undefined,
  client: TypedSupabaseClient | null = getPublicSupabaseClient(),
): Promise<PublicInvitationLookupResult> {
  if (!isValidPublicInvitationToken(rawToken)) {
    return { status: 'invalid_token' };
  }

  if (!client) {
    return { status: 'unconfigured' };
  }

  const { data, error } = await client.rpc('resolve_invitation_by_token', {
    p_token: rawToken.trim(),
  });

  if (error) {
    throw new Error('Unable to verify household invitation link at this moment.');
  }

  return parsePublicInvitationLookupEnvelope(data);
}
