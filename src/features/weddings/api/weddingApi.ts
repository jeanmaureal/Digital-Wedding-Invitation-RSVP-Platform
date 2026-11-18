import { translateWeddingError, WeddingDomainError } from '@/features/weddings/api/weddingErrors';
import {
  type CreateWeddingParsedValues,
  type DuplicateWeddingPayload,
  resolveRsvpDeadlineUtcIso,
  type UpdateWeddingDetailsPayload,
  type UpdateWeddingSettingsParsedValues,
} from '@/features/weddings/schemas/weddingSchemas';
import { getOrganizerSupabaseClient } from '@/lib/supabase/organizerClient';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';
import type { Database, Tables } from '@/types/database.types';

export type WeddingRecord = Tables<'weddings'>;
export type WeddingSettingsRecord = Tables<'wedding_settings'>;

export interface WeddingProjectWithSettings {
  readonly wedding: WeddingRecord;
  readonly settings: WeddingSettingsRecord;
}

function requireWeddingClient(
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): TypedSupabaseClient {
  if (!client) {
    throw new WeddingDomainError(
      'UNCONFIGURED',
      'Supabase is not configured in this offline environment.',
    );
  }
  return client;
}

export async function fetchWorkspaceWeddings(
  workspaceId: string,
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<readonly WeddingProjectWithSettings[]> {
  const supabase = requireWeddingClient(client);

  const [weddingsRes, settingsRes] = await Promise.all([
    supabase
      .from('weddings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false }),
    supabase.from('wedding_settings').select('*').eq('workspace_id', workspaceId),
  ]);

  if (weddingsRes.error) {
    throw translateWeddingError(weddingsRes.error);
  }
  if (settingsRes.error) {
    throw translateWeddingError(settingsRes.error);
  }

  const settingsByWeddingId = new Map<string, WeddingSettingsRecord>();
  for (const setting of settingsRes.data) {
    settingsByWeddingId.set(setting.wedding_id, setting);
  }

  const combined: WeddingProjectWithSettings[] = [];
  for (const wedding of weddingsRes.data) {
    const settings = settingsByWeddingId.get(wedding.id);
    if (settings) {
      combined.push({ wedding, settings });
    }
  }

  return combined;
}

export async function fetchWorkspaceWeddingById(
  params: {
    readonly workspaceId: string;
    readonly weddingId: string;
  },
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<WeddingProjectWithSettings | null> {
  const supabase = requireWeddingClient(client);

  const [weddingRes, settingsRes] = await Promise.all([
    supabase
      .from('weddings')
      .select('*')
      .eq('workspace_id', params.workspaceId)
      .eq('id', params.weddingId)
      .maybeSingle(),
    supabase
      .from('wedding_settings')
      .select('*')
      .eq('workspace_id', params.workspaceId)
      .eq('wedding_id', params.weddingId)
      .maybeSingle(),
  ]);

  if (weddingRes.error) {
    throw translateWeddingError(weddingRes.error);
  }
  if (settingsRes.error) {
    throw translateWeddingError(settingsRes.error);
  }

  if (!weddingRes.data || !settingsRes.data) {
    return null;
  }

  return {
    wedding: weddingRes.data,
    settings: settingsRes.data,
  };
}

export async function createOrganizerWedding(
  params: { readonly workspaceId: string } & CreateWeddingParsedValues,
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<WeddingRecord> {
  const supabase = requireWeddingClient(client);
  const rsvpDeadlineUtc = resolveRsvpDeadlineUtcIso({
    timezone: params.timezone,
    rsvpDeadlineDate: params.rsvpDeadlineDate,
    rsvpDeadlineTime: params.rsvpDeadlineTime,
  });

  const rpcArgs: Database['public']['Functions']['create_wedding']['Args'] = {
    p_workspace_id: params.workspaceId,
    p_title: params.title,
    p_partner_one_name: params.partnerOneName,
    p_partner_two_name: params.partnerTwoName,
    p_venue_name: params.venueName,
    p_venue_location: params.venueLocation,
    p_timezone: params.timezone,
    p_access_mode: params.accessMode,
    p_is_rsvp_open: params.isRsvpOpen,
    p_allow_plus_ones_default: params.allowPlusOnesDefault,
    p_show_guest_dietary_notes: params.showGuestDietaryNotes,
    ...(params.slug !== undefined ? { p_slug: params.slug } : {}),
    ...(params.eventDate !== null ? { p_event_date: params.eventDate } : {}),
    ...(rsvpDeadlineUtc !== null ? { p_rsvp_deadline: rsvpDeadlineUtc } : {}),
    ...(params.contactEmail !== null ? { p_contact_email: params.contactEmail } : {}),
  };

  const { data, error } = await supabase.rpc('create_wedding', rpcArgs);

  if (error) {
    throw translateWeddingError(error);
  }

  return data;
}

export async function duplicateOrganizerWedding(
  params: {
    readonly workspaceId: string;
    readonly sourceWeddingId: string;
  } & DuplicateWeddingPayload,
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<WeddingRecord> {
  const supabase = requireWeddingClient(client);

  const rpcArgs: Database['public']['Functions']['duplicate_wedding']['Args'] = {
    p_workspace_id: params.workspaceId,
    p_source_wedding_id: params.sourceWeddingId,
    p_title: params.title,
    ...(params.slug !== undefined ? { p_slug: params.slug } : {}),
    ...(params.partnerOneName !== undefined ? { p_partner_one_name: params.partnerOneName } : {}),
    ...(params.partnerTwoName !== undefined ? { p_partner_two_name: params.partnerTwoName } : {}),
    ...(params.eventDate !== null ? { p_event_date: params.eventDate } : {}),
  };

  const { data, error } = await supabase.rpc('duplicate_wedding', rpcArgs);

  if (error) {
    throw translateWeddingError(error);
  }

  return data;
}

export async function updateOrganizerWeddingDetails(
  params: {
    readonly workspaceId: string;
    readonly weddingId: string;
  } & UpdateWeddingDetailsPayload,
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<WeddingRecord> {
  const supabase = requireWeddingClient(client);

  const { data, error } = await supabase
    .from('weddings')
    .update({
      title: params.title,
      partner_one_name: params.partnerOneName,
      partner_two_name: params.partnerTwoName,
      slug: params.slug,
      event_date: params.eventDate,
      venue_name: params.venueName,
      venue_location: params.venueLocation,
    })
    .eq('workspace_id', params.workspaceId)
    .eq('id', params.weddingId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw translateWeddingError(error);
  }

  if (!data) {
    throw new WeddingDomainError(
      'INSUFFICIENT_WORKSPACE_ROLE',
      'Only workspace owners, admins, and editors can update wedding details.',
    );
  }

  return data;
}

export async function updateOrganizerWeddingSettings(
  params: {
    readonly workspaceId: string;
    readonly weddingId: string;
  } & UpdateWeddingSettingsParsedValues,
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<WeddingSettingsRecord> {
  const supabase = requireWeddingClient(client);
  const rsvpDeadlineUtc = resolveRsvpDeadlineUtcIso({
    timezone: params.timezone,
    rsvpDeadlineDate: params.rsvpDeadlineDate,
    rsvpDeadlineTime: params.rsvpDeadlineTime,
  });

  const { data, error } = await supabase
    .from('wedding_settings')
    .update({
      timezone: params.timezone,
      rsvp_deadline: rsvpDeadlineUtc,
      is_rsvp_open: params.isRsvpOpen,
      access_mode: params.accessMode,
      allow_plus_ones_default: params.allowPlusOnesDefault,
      show_guest_dietary_notes: params.showGuestDietaryNotes,
      primary_locale: params.primaryLocale,
      contact_email: params.contactEmail,
      dress_code: params.dressCode,
      rsvp_confirmation_message: params.rsvpConfirmationMessage,
    })
    .eq('workspace_id', params.workspaceId)
    .eq('wedding_id', params.weddingId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw translateWeddingError(error);
  }

  if (!data) {
    throw new WeddingDomainError(
      'INSUFFICIENT_WORKSPACE_ROLE',
      'Only workspace owners, admins, and editors can update wedding settings.',
    );
  }

  return data;
}

export async function setOrganizerWeddingArchiveStatus(
  params: {
    readonly workspaceId: string;
    readonly weddingId: string;
    readonly archived: boolean;
  },
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<WeddingRecord> {
  const supabase = requireWeddingClient(client);

  const { data, error } = await supabase
    .from('weddings')
    .update({
      status: params.archived ? 'archived' : 'draft',
    })
    .eq('workspace_id', params.workspaceId)
    .eq('id', params.weddingId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw translateWeddingError(error);
  }

  if (!data) {
    throw new WeddingDomainError(
      'INSUFFICIENT_WORKSPACE_ROLE',
      'Only workspace owners, admins, and editors can archive or restore weddings.',
    );
  }

  return data;
}

export async function deleteOrganizerWedding(
  params: {
    readonly workspaceId: string;
    readonly weddingId: string;
  },
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<void> {
  const supabase = requireWeddingClient(client);

  const { data, error } = await supabase
    .from('weddings')
    .delete()
    .eq('workspace_id', params.workspaceId)
    .eq('id', params.weddingId)
    .select('id');

  if (error) {
    throw translateWeddingError(error);
  }

  if (!data || data.length === 0) {
    throw new WeddingDomainError(
      'INSUFFICIENT_WORKSPACE_ROLE',
      'Only workspace owners and admins can permanently delete wedding projects.',
    );
  }
}
