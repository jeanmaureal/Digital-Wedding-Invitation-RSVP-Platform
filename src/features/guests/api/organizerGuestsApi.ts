import { z } from 'zod';
import { GuestDomainError, translateGuestError } from '@/features/guests/api/guestErrors';
import {
  type GuestGroupRow,
  type GuestMemberFormValues,
  type GuestRow,
  guestMemberFormSchema,
  type HouseholdFormValues,
  householdFormSchema,
  type HouseholdWithDetails,
  type ImportedHouseholdPayload,
  type InvitationDeliveryStatus,
  type IssuedHouseholdInvitationPayload,
  type SafeInvitationRow,
  type WeddingGuestDirectory,
} from '@/features/guests/schemas/guestSchemas';
import { getOrganizerSupabaseClient } from '@/lib/supabase/organizerClient';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';
import type { Json } from '@/types/database.types';

const SAFE_INVITATION_SELECT =
  'id, group_id, wedding_id, workspace_id, status, delivery_status, expires_at, revoked_at, issued_by, created_at, updated_at' as const;

const rpcSafeInvitationSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  weddingId: z.uuid(),
  workspaceId: z.uuid(),
  status: z.enum(['active', 'revoked']),
  deliveryStatus: z.enum(['not_shared', 'shared']),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  issuedBy: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const rpcIssuedInvitationEnvelopeSchema = z.object({
  rawToken: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  invitation: rpcSafeInvitationSchema,
});

const rpcImportSummarySchema = z.object({
  importedGroupCount: z.number().int().min(1),
  importedGuestCount: z.number().int().min(1),
});

function mapRpcInvitationToRow(parsed: z.infer<typeof rpcSafeInvitationSchema>): SafeInvitationRow {
  return {
    id: parsed.id,
    group_id: parsed.groupId,
    wedding_id: parsed.weddingId,
    workspace_id: parsed.workspaceId,
    status: parsed.status,
    delivery_status: parsed.deliveryStatus,
    expires_at: parsed.expiresAt,
    revoked_at: parsed.revokedAt,
    issued_by: parsed.issuedBy,
    created_at: parsed.createdAt,
    updated_at: parsed.updatedAt,
  };
}

function requireClient(override?: TypedSupabaseClient | null): TypedSupabaseClient {
  const resolved = override === undefined ? getOrganizerSupabaseClient() : override;
  if (!resolved) {
    throw new GuestDomainError(
      'UNCONFIGURED',
      'Supabase client is not configured in this environment.',
    );
  }
  return resolved;
}

export async function fetchWeddingGuestDirectory(params: {
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly client?: TypedSupabaseClient | null;
}): Promise<WeddingGuestDirectory> {
  const client = requireClient(params.client);

  const [groupsRes, guestsRes, invitationsRes] = await Promise.all([
    client
      .from('guest_groups')
      .select(
        'id, wedding_id, workspace_id, display_name, max_attendees, notes, sort_order, created_by, created_at, updated_at',
      )
      .eq('workspace_id', params.workspaceId)
      .eq('wedding_id', params.weddingId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    client
      .from('guests')
      .select(
        'id, group_id, wedding_id, workspace_id, first_name, last_name, email, phone, side, is_child, dietary_notes, sort_order, created_at, updated_at',
      )
      .eq('workspace_id', params.workspaceId)
      .eq('wedding_id', params.weddingId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    client
      .from('invitations')
      .select(SAFE_INVITATION_SELECT)
      .eq('workspace_id', params.workspaceId)
      .eq('wedding_id', params.weddingId)
      .order('created_at', { ascending: false }),
  ]);

  if (groupsRes.error) {
    throw translateGuestError(groupsRes.error);
  }
  if (guestsRes.error) {
    throw translateGuestError(guestsRes.error);
  }
  if (invitationsRes.error) {
    throw translateGuestError(invitationsRes.error);
  }

  const groups: readonly GuestGroupRow[] = groupsRes.data ?? [];
  const guests: readonly GuestRow[] = guestsRes.data ?? [];
  const invitations: readonly SafeInvitationRow[] = invitationsRes.data ?? [];

  const guestsByGroupId = new Map<string, GuestRow[]>();
  for (const guest of guests) {
    const bucket = guestsByGroupId.get(guest.group_id);
    if (bucket) {
      bucket.push(guest);
    } else {
      guestsByGroupId.set(guest.group_id, [guest]);
    }
  }

  const activeInvitationByGroupId = new Map<string, SafeInvitationRow>();
  const revokedCountByGroupId = new Map<string, number>();

  for (const inv of invitations) {
    if (inv.status === 'active' && !activeInvitationByGroupId.has(inv.group_id)) {
      activeInvitationByGroupId.set(inv.group_id, inv);
    } else if (inv.status === 'revoked') {
      revokedCountByGroupId.set(inv.group_id, (revokedCountByGroupId.get(inv.group_id) ?? 0) + 1);
    }
  }

  let totalCapacity = 0;
  let activeLinksCount = 0;
  let sharedLinksCount = 0;

  const households: HouseholdWithDetails[] = groups.map((group) => {
    const groupGuests = guestsByGroupId.get(group.id) ?? [];
    const activeInvitation = activeInvitationByGroupId.get(group.id) ?? null;
    const revokedCount = revokedCountByGroupId.get(group.id) ?? 0;

    totalCapacity += group.max_attendees;
    if (activeInvitation) {
      const isExpired =
        activeInvitation.expires_at !== null &&
        Date.parse(activeInvitation.expires_at) <= Date.now();
      if (!isExpired) {
        activeLinksCount += 1;
        if (activeInvitation.delivery_status === 'shared') {
          sharedLinksCount += 1;
        }
      }
    }

    return {
      group,
      guests: groupGuests,
      activeInvitation,
      revokedCount,
    };
  });

  return {
    households,
    totalHouseholds: groups.length,
    totalGuests: guests.length,
    totalCapacity,
    activeLinksCount,
    sharedLinksCount,
  };
}

export async function createHouseholdGroup(params: {
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly values: HouseholdFormValues;
  readonly sortOrder?: number;
  readonly client?: TypedSupabaseClient | null;
}): Promise<GuestGroupRow> {
  const parsed = householdFormSchema.parse(params.values);
  const client = requireClient(params.client);

  const { data, error } = await client
    .from('guest_groups')
    .insert({
      workspace_id: params.workspaceId,
      wedding_id: params.weddingId,
      display_name: parsed.displayName,
      max_attendees: parsed.maxAttendees,
      notes: parsed.notes,
      sort_order: params.sortOrder ?? 0,
    })
    .select(
      'id, wedding_id, workspace_id, display_name, max_attendees, notes, sort_order, created_by, created_at, updated_at',
    )
    .single();

  if (error || !data) {
    throw translateGuestError(error);
  }
  return data;
}

export async function updateHouseholdGroup(params: {
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly groupId: string;
  readonly values: HouseholdFormValues;
  readonly client?: TypedSupabaseClient | null;
}): Promise<GuestGroupRow> {
  const parsed = householdFormSchema.parse(params.values);
  const client = requireClient(params.client);

  const { data, error } = await client
    .from('guest_groups')
    .update({
      display_name: parsed.displayName,
      max_attendees: parsed.maxAttendees,
      notes: parsed.notes,
    })
    .eq('workspace_id', params.workspaceId)
    .eq('wedding_id', params.weddingId)
    .eq('id', params.groupId)
    .select(
      'id, wedding_id, workspace_id, display_name, max_attendees, notes, sort_order, created_by, created_at, updated_at',
    )
    .single();

  if (error || !data) {
    throw translateGuestError(error);
  }
  return data;
}

export async function deleteHouseholdGroup(params: {
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly groupId: string;
  readonly client?: TypedSupabaseClient | null;
}): Promise<void> {
  const client = requireClient(params.client);

  const { error } = await client
    .from('guest_groups')
    .delete()
    .eq('workspace_id', params.workspaceId)
    .eq('wedding_id', params.weddingId)
    .eq('id', params.groupId);

  if (error) {
    throw translateGuestError(error);
  }
}

export async function createGuestMember(params: {
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly groupId: string;
  readonly values: GuestMemberFormValues;
  readonly sortOrder?: number;
  readonly client?: TypedSupabaseClient | null;
}): Promise<GuestRow> {
  const parsed = guestMemberFormSchema.parse(params.values);
  const client = requireClient(params.client);

  const { data, error } = await client
    .from('guests')
    .insert({
      workspace_id: params.workspaceId,
      wedding_id: params.weddingId,
      group_id: params.groupId,
      first_name: parsed.firstName,
      last_name: parsed.lastName,
      email: parsed.email,
      phone: parsed.phone,
      side: parsed.side,
      is_child: parsed.isChild,
      dietary_notes: parsed.dietaryNotes,
      sort_order: params.sortOrder ?? 0,
    })
    .select(
      'id, group_id, wedding_id, workspace_id, first_name, last_name, email, phone, side, is_child, dietary_notes, sort_order, created_at, updated_at',
    )
    .single();

  if (error || !data) {
    throw translateGuestError(error);
  }
  return data;
}

export async function updateGuestMember(params: {
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly groupId: string;
  readonly guestId: string;
  readonly values: GuestMemberFormValues;
  readonly client?: TypedSupabaseClient | null;
}): Promise<GuestRow> {
  const parsed = guestMemberFormSchema.parse(params.values);
  const client = requireClient(params.client);

  const { data, error } = await client
    .from('guests')
    .update({
      first_name: parsed.firstName,
      last_name: parsed.lastName,
      email: parsed.email,
      phone: parsed.phone,
      side: parsed.side,
      is_child: parsed.isChild,
      dietary_notes: parsed.dietaryNotes,
    })
    .eq('workspace_id', params.workspaceId)
    .eq('wedding_id', params.weddingId)
    .eq('group_id', params.groupId)
    .eq('id', params.guestId)
    .select(
      'id, group_id, wedding_id, workspace_id, first_name, last_name, email, phone, side, is_child, dietary_notes, sort_order, created_at, updated_at',
    )
    .single();

  if (error || !data) {
    throw translateGuestError(error);
  }
  return data;
}

export async function deleteGuestMember(params: {
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly groupId: string;
  readonly guestId: string;
  readonly client?: TypedSupabaseClient | null;
}): Promise<void> {
  const client = requireClient(params.client);

  const { error } = await client
    .from('guests')
    .delete()
    .eq('workspace_id', params.workspaceId)
    .eq('wedding_id', params.weddingId)
    .eq('group_id', params.groupId)
    .eq('id', params.guestId);

  if (error) {
    throw translateGuestError(error);
  }
}

export async function importOrganizerWeddingGuests(params: {
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly households: readonly ImportedHouseholdPayload[];
  readonly client?: TypedSupabaseClient | null;
}): Promise<{ readonly importedGroupCount: number; readonly importedGuestCount: number }> {
  const client = requireClient(params.client);

  const payloadJson: Json = params.households.map((household) => ({
    displayName: household.displayName,
    maxAttendees: household.maxAttendees,
    notes: household.notes,
    guests: household.guests.map((guest) => ({
      firstName: guest.firstName,
      lastName: guest.lastName,
      email: guest.email,
      phone: guest.phone,
      side: guest.side,
      isChild: guest.isChild,
      dietaryNotes: guest.dietaryNotes,
    })),
  }));

  const { data, error } = await client.rpc('import_wedding_guests', {
    p_workspace_id: params.workspaceId,
    p_wedding_id: params.weddingId,
    p_households: payloadJson,
  });

  if (error) {
    throw translateGuestError(error);
  }

  return rpcImportSummarySchema.parse(data);
}

export async function issueOrganizerHouseholdInvitation(params: {
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly groupId: string;
  readonly expiresAt?: string | null;
  readonly client?: TypedSupabaseClient | null;
}): Promise<IssuedHouseholdInvitationPayload> {
  const client = requireClient(params.client);

  const rpcArgs: {
    p_workspace_id: string;
    p_wedding_id: string;
    p_group_id: string;
    p_expires_at?: string;
  } = {
    p_workspace_id: params.workspaceId,
    p_wedding_id: params.weddingId,
    p_group_id: params.groupId,
  };
  if (params.expiresAt) {
    rpcArgs.p_expires_at = params.expiresAt;
  }

  const { data, error } = await client.rpc('issue_household_invitation', rpcArgs);
  if (error) {
    throw translateGuestError(error);
  }

  const parsed = rpcIssuedInvitationEnvelopeSchema.parse(data);
  return {
    rawToken: parsed.rawToken,
    invitation: mapRpcInvitationToRow(parsed.invitation),
  };
}

export async function revokeOrganizerHouseholdInvitation(params: {
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly invitationId: string;
  readonly client?: TypedSupabaseClient | null;
}): Promise<SafeInvitationRow> {
  const client = requireClient(params.client);

  const { data, error } = await client.rpc('revoke_household_invitation', {
    p_workspace_id: params.workspaceId,
    p_wedding_id: params.weddingId,
    p_invitation_id: params.invitationId,
  });

  if (error) {
    throw translateGuestError(error);
  }

  return mapRpcInvitationToRow(rpcSafeInvitationSchema.parse(data));
}

export async function updateOrganizerHouseholdInvitation(params: {
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly invitationId: string;
  readonly deliveryStatus: InvitationDeliveryStatus;
  readonly expiresAt?: string | null;
  readonly client?: TypedSupabaseClient | null;
}): Promise<SafeInvitationRow> {
  const client = requireClient(params.client);

  const rpcArgs: {
    p_workspace_id: string;
    p_wedding_id: string;
    p_invitation_id: string;
    p_delivery_status: InvitationDeliveryStatus;
    p_expires_at?: string;
  } = {
    p_workspace_id: params.workspaceId,
    p_wedding_id: params.weddingId,
    p_invitation_id: params.invitationId,
    p_delivery_status: params.deliveryStatus,
  };
  if (params.expiresAt) {
    rpcArgs.p_expires_at = params.expiresAt;
  }

  const { data, error } = await client.rpc('update_household_invitation', rpcArgs);
  if (error) {
    throw translateGuestError(error);
  }

  return mapRpcInvitationToRow(rpcSafeInvitationSchema.parse(data));
}
