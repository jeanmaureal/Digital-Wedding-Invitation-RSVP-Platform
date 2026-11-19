import { DesignDomainError, translateDesignError } from '@/features/design/api/designErrors';
import {
  DESIGN_SCHEMA_VERSION,
  type InvitationDocument,
  type InvitationWeddingMetadata,
  parseInvitationDocument,
  type ThemeTokenOverrides,
  weddingThemeConfigSchema,
  type WeddingThemePresetId,
} from '@/features/design/schemas/designSchemas';
import { getOrganizerSupabaseClient } from '@/lib/supabase/organizerClient';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';
import type { Json, Tables } from '@/types/database.types';

export type WeddingThemeRecord = Tables<'wedding_themes'>;
export type WeddingSectionRecord = Tables<'wedding_sections'>;

function requireDesignClient(
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): TypedSupabaseClient {
  if (!client) {
    throw new DesignDomainError(
      'UNCONFIGURED',
      'Supabase is not configured in this offline environment.',
    );
  }
  return client;
}

export async function fetchWeddingDesignDraft(
  params: {
    readonly workspaceId: string;
    readonly weddingId: string;
    readonly weddingMetadata: InvitationWeddingMetadata;
  },
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<InvitationDocument | null> {
  const supabase = requireDesignClient(client);

  const [themeRes, sectionsRes] = await Promise.all([
    supabase
      .from('wedding_themes')
      .select('*')
      .eq('workspace_id', params.workspaceId)
      .eq('wedding_id', params.weddingId)
      .maybeSingle(),
    supabase
      .from('wedding_sections')
      .select('*')
      .eq('workspace_id', params.workspaceId)
      .eq('wedding_id', params.weddingId)
      .order('sort_order', { ascending: true }),
  ]);

  if (themeRes.error) {
    throw translateDesignError(themeRes.error);
  }
  if (sectionsRes.error) {
    throw translateDesignError(sectionsRes.error);
  }

  if (!themeRes.data || sectionsRes.data.length === 0) {
    return null;
  }

  const candidateDocument = {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    wedding: params.weddingMetadata,
    theme: {
      schemaVersion: themeRes.data.schema_version,
      presetId: themeRes.data.preset_id,
      tokenOverrides: themeRes.data.token_overrides,
    },
    sections: sectionsRes.data.map((row) => ({
      id: row.id,
      sectionType: row.section_type,
      sortOrder: row.sort_order,
      isVisible: row.is_visible,
      schemaVersion: row.schema_version,
      content: row.content,
    })),
  };

  const validated = parseInvitationDocument(candidateDocument);
  if (!validated.ok) {
    throw new DesignDomainError(
      'SCHEMA_VALIDATION_FAILED',
      `Draft design failed schema validation (${validated.issues[0]?.path ?? 'document'}: ${validated.issues[0]?.message ?? 'invalid'}).`,
    );
  }

  return validated.data;
}

export async function updateWeddingThemeDraft(
  params: {
    readonly workspaceId: string;
    readonly weddingId: string;
    readonly presetId: WeddingThemePresetId;
    readonly tokenOverrides?: ThemeTokenOverrides | undefined;
  },
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<WeddingThemeRecord> {
  const supabase = requireDesignClient(client);

  const parsedConfig = weddingThemeConfigSchema.safeParse({
    schemaVersion: DESIGN_SCHEMA_VERSION,
    presetId: params.presetId,
    tokenOverrides: params.tokenOverrides ?? {},
  });

  if (!parsedConfig.success) {
    throw new DesignDomainError(
      'SCHEMA_VALIDATION_FAILED',
      parsedConfig.error.issues[0]?.message ?? 'Invalid theme configuration.',
    );
  }

  const { data, error } = await supabase
    .from('wedding_themes')
    .update({
      preset_id: parsedConfig.data.presetId,
      schema_version: parsedConfig.data.schemaVersion,
      token_overrides: parsedConfig.data.tokenOverrides as unknown as Json,
    })
    .eq('workspace_id', params.workspaceId)
    .eq('wedding_id', params.weddingId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw translateDesignError(error);
  }

  if (!data) {
    throw new DesignDomainError(
      'INSUFFICIENT_WORKSPACE_ROLE',
      'Only workspace owners, admins, and editors can change the wedding theme.',
    );
  }

  return data;
}
