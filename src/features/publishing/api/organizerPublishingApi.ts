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
      .limit(5),
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
