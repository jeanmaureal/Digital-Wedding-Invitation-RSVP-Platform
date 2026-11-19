import { z } from 'zod';
import {
  type InvitationDocument,
  parseInvitationDocument,
  type SchemaValidationIssue,
} from '@/features/design/schemas/designSchemas';
import { getPublicSupabaseClient, type TypedSupabaseClient } from '@/lib/supabase/publicClient';

const SAFE_PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidPublicWeddingSlug(rawSlug: string | undefined): rawSlug is string {
  return Boolean(
    rawSlug &&
    rawSlug.length >= 3 &&
    rawSlug.length <= 80 &&
    SAFE_PUBLIC_SLUG_PATTERN.test(rawSlug),
  );
}

const rpcPublicLookupResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('invalid_slug'),
  }),
  z.strictObject({
    status: z.literal('unavailable'),
  }),
  z.strictObject({
    status: z.literal('invite_only'),
  }),
  z.strictObject({
    status: z.literal('published'),
    versionNumber: z.number().int().min(1),
    publishedAt: z.string().min(1),
    snapshot: z.unknown(),
  }),
]);

export type PublicWeddingLookupResult =
  | { readonly status: 'unconfigured' }
  | { readonly status: 'invalid_slug' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'invite_only' }
  | {
      readonly status: 'schema_invalid';
      readonly issues: readonly SchemaValidationIssue[];
    }
  | {
      readonly status: 'published';
      readonly versionNumber: number;
      readonly publishedAt: string;
      readonly document: InvitationDocument;
    };

/**
 * Fetches the active published invitation snapshot for `/w/:slug` using ONLY the
 * stateless `publicClient` (`persistSession: false`, zero organizer auth coupling).
 */
export async function fetchPublicWeddingBySlug(
  rawSlug: string | undefined,
  client: TypedSupabaseClient | null = getPublicSupabaseClient(),
): Promise<PublicWeddingLookupResult> {
  if (!isValidPublicWeddingSlug(rawSlug)) {
    return { status: 'invalid_slug' };
  }

  if (!client) {
    return { status: 'unconfigured' };
  }

  const { data, error } = await client.rpc('get_public_wedding_by_slug', {
    p_slug: rawSlug,
  });

  if (error) {
    throw new Error('Unable to load wedding website at this moment.');
  }

  const parsedEnvelope = rpcPublicLookupResponseSchema.safeParse(data);
  if (!parsedEnvelope.success) {
    return {
      status: 'schema_invalid',
      issues: [{ path: 'response', message: 'Unexpected public snapshot response envelope.' }],
    };
  }

  if (parsedEnvelope.data.status !== 'published') {
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
    status: 'published',
    versionNumber: parsedEnvelope.data.versionNumber,
    publishedAt: parsedEnvelope.data.publishedAt,
    document: validatedDoc.data,
  };
}
