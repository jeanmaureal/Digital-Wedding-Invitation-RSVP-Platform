import { z } from 'zod';
import {
  type InvitationDocument,
  parseInvitationDocument,
  type WeddingThemePresetId,
} from '@/features/design/schemas/designSchemas';
import { WEDDING_THEME_PRESETS } from '@/features/design/themes/themePresets';
import {
  PublishingDomainError,
  translatePublishingError,
} from '@/features/publishing/api/publishingErrors';
import { getOrganizerSupabaseClient } from '@/lib/supabase/organizerClient';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';
import type { Tables } from '@/types/database.types';

export type PublishedVersionRecord = Tables<'published_versions'>;
export type PublishedVersionSummaryRow = Pick<
  PublishedVersionRecord,
  | 'id'
  | 'wedding_id'
  | 'workspace_id'
  | 'version_number'
  | 'schema_version'
  | 'access_mode'
  | 'is_active'
  | 'published_by'
  | 'published_at'
>;

export interface OrganizerPublicationSummary {
  readonly activeVersion: PublishedVersionSummaryRow | null;
  readonly latestVersionNumber: number;
  readonly lastDraftUpdatedAt: string;
}

export interface OrganizerPublishedVersionHistoryEntry {
  readonly id: string;
  readonly weddingId: string;
  readonly workspaceId: string;
  readonly versionNumber: number;
  readonly schemaVersion: number;
  readonly accessMode: 'public' | 'invite_only';
  readonly isActive: boolean;
  readonly publishedAt: string;
  readonly publishedBy: string | null;
  readonly publishedByName: string;
  readonly themePresetId: WeddingThemePresetId | null;
  readonly themePresetLabel: string;
  readonly visibleSectionCount: number;
  readonly totalSectionCount: number;
  readonly heroHeadline: string | null;
  readonly document: InvitationDocument | null;
}

const rpcHistoryRowSchema = z.object({
  id: z.string().min(1),
  weddingId: z.string().min(1),
  workspaceId: z.string().min(1),
  versionNumber: z.number().int().min(1),
  schemaVersion: z.number().int().min(1),
  accessMode: z.enum(['public', 'invite_only']),
  isActive: z.boolean(),
  publishedAt: z.string().min(1),
  publishedBy: z.string().nullable(),
  publishedByName: z.string().min(1),
  contentSnapshot: z.unknown(),
});

const rpcHistoryListSchema = z.array(rpcHistoryRowSchema);

function requirePublishingClient(
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): TypedSupabaseClient {
  if (!client) {
    throw new PublishingDomainError(
      'UNCONFIGURED',
      'Supabase is not configured in this offline environment.',
    );
  }
  return client;
}

export async function fetchOrganizerPublicationSummary(
  params: {
    readonly workspaceId: string;
    readonly weddingId: string;
    readonly weddingUpdatedAt: string;
    readonly settingsUpdatedAt: string;
  },
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<OrganizerPublicationSummary> {
  const supabase = requirePublishingClient(client);

  const [versionsRes, themeRes, sectionsRes] = await Promise.all([
    supabase
      .from('published_versions')
      .select(
        'id, wedding_id, workspace_id, version_number, schema_version, access_mode, is_active, published_by, published_at',
      )
      .eq('workspace_id', params.workspaceId)
      .eq('wedding_id', params.weddingId)
      .order('version_number', { ascending: false })
      .limit(50),
    supabase
      .from('wedding_themes')
      .select('updated_at')
      .eq('workspace_id', params.workspaceId)
      .eq('wedding_id', params.weddingId)
      .maybeSingle(),
    supabase
      .from('wedding_sections')
      .select('updated_at')
      .eq('workspace_id', params.workspaceId)
      .eq('wedding_id', params.weddingId),
  ]);

  if (versionsRes.error) {
    throw translatePublishingError(versionsRes.error);
  }
  if (themeRes.error) {
    throw translatePublishingError(themeRes.error);
  }
  if (sectionsRes.error) {
    throw translatePublishingError(sectionsRes.error);
  }

  const versions = versionsRes.data ?? [];
  const activeVersion = versions.find((v) => v.is_active) ?? null;
  const latestVersionNumber = versions[0]?.version_number ?? 0;

  const candidateTimestamps = [
    params.weddingUpdatedAt,
    params.settingsUpdatedAt,
    themeRes.data?.updated_at ?? '',
    ...(sectionsRes.data ?? []).map((s) => s.updated_at),
  ].filter(Boolean);

  let maxDraftMs = 0;
  let maxDraftIso = params.weddingUpdatedAt;
  for (const ts of candidateTimestamps) {
    const ms = Date.parse(ts);
    if (!Number.isNaN(ms) && ms >= maxDraftMs) {
      maxDraftMs = ms;
      maxDraftIso = ts;
    }
  }

  return {
    activeVersion,
    latestVersionNumber,
    lastDraftUpdatedAt: maxDraftIso,
  };
}

export async function fetchOrganizerPublicationHistory(
  params: {
    readonly workspaceId: string;
    readonly weddingId: string;
  },
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<readonly OrganizerPublishedVersionHistoryEntry[]> {
  const supabase = requirePublishingClient(client);

  const { data, error } = await supabase.rpc('list_wedding_published_versions', {
    p_workspace_id: params.workspaceId,
    p_wedding_id: params.weddingId,
  });

  if (error) {
    throw translatePublishingError(error);
  }

  const parsedRows = rpcHistoryListSchema.parse(data ?? []);

  return parsedRows.map((row): OrganizerPublishedVersionHistoryEntry => {
    const parsedDoc = parseInvitationDocument(row.contentSnapshot);
    if (!parsedDoc.ok) {
      return {
        id: row.id,
        weddingId: row.weddingId,
        workspaceId: row.workspaceId,
        versionNumber: row.versionNumber,
        schemaVersion: row.schemaVersion,
        accessMode: row.accessMode,
        isActive: row.isActive,
        publishedAt: row.publishedAt,
        publishedBy: row.publishedBy,
        publishedByName: row.publishedByName,
        themePresetId: null,
        themePresetLabel: 'Custom Snapshot',
        visibleSectionCount: 0,
        totalSectionCount: 0,
        heroHeadline: null,
        document: null,
      };
    }

    const doc = parsedDoc.data;
    const presetDef = WEDDING_THEME_PRESETS[doc.theme.presetId];
    const visibleSectionCount = doc.sections.filter((s) => s.isVisible).length;
    const heroSection = doc.sections.find((s) => s.sectionType === 'hero');
    const heroHeadline =
      heroSection && heroSection.sectionType === 'hero' ? heroSection.content.coupleHeadline : null;

    return {
      id: row.id,
      weddingId: row.weddingId,
      workspaceId: row.workspaceId,
      versionNumber: row.versionNumber,
      schemaVersion: row.schemaVersion,
      accessMode: row.accessMode,
      isActive: row.isActive,
      publishedAt: row.publishedAt,
      publishedBy: row.publishedBy,
      publishedByName: row.publishedByName,
      themePresetId: doc.theme.presetId,
      themePresetLabel: presetDef.name,
      visibleSectionCount,
      totalSectionCount: doc.sections.length,
      heroHeadline,
      document: doc,
    };
  });
}

export async function publishOrganizerWedding(
  params: {
    readonly workspaceId: string;
    readonly weddingId: string;
  },
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<PublishedVersionRecord> {
  const supabase = requirePublishingClient(client);

  const { data, error } = await supabase.rpc('publish_wedding', {
    p_workspace_id: params.workspaceId,
    p_wedding_id: params.weddingId,
  });

  if (error) {
    throw translatePublishingError(error);
  }

  return data;
}

export async function unpublishOrganizerWedding(
  params: {
    readonly workspaceId: string;
    readonly weddingId: string;
  },
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<Tables<'weddings'>> {
  const supabase = requirePublishingClient(client);

  const { data, error } = await supabase.rpc('unpublish_wedding', {
    p_workspace_id: params.workspaceId,
    p_wedding_id: params.weddingId,
  });

  if (error) {
    throw translatePublishingError(error);
  }

  return data;
}

export async function rollbackOrganizerWeddingVersion(
  params: {
    readonly workspaceId: string;
    readonly weddingId: string;
    readonly targetVersionNumber: number;
  },
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<PublishedVersionRecord> {
  const supabase = requirePublishingClient(client);

  const { data, error } = await supabase.rpc('rollback_wedding_published_version', {
    p_workspace_id: params.workspaceId,
    p_wedding_id: params.weddingId,
    p_target_version_number: params.targetVersionNumber,
  });

  if (error) {
    throw translatePublishingError(error);
  }

  return data;
}
