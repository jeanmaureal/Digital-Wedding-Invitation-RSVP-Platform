import {
  translateWorkspaceError,
  WorkspaceDomainError,
} from '@/features/workspace/api/workspaceErrors';
import type {
  AddWorkspaceMemberPayload,
  CreateWorkspacePayload,
  ProfileFullNamePayload,
  UpdateWorkspacePayload,
  WorkspaceRole,
} from '@/features/workspace/schemas/workspaceSchemas';
import { getOrganizerSupabaseClient } from '@/lib/supabase/organizerClient';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';
import type { Tables } from '@/types/database.types';

export type OrganizerProfile = Tables<'profiles'>;
export type WorkspaceRecord = Tables<'workspaces'>;
export type WorkspaceMemberRecord = Tables<'workspace_members'>;

export interface OrganizerWorkspaceMembership {
  readonly membershipId: string;
  readonly role: WorkspaceRole;
  readonly joinedAt: string;
  readonly workspace: WorkspaceRecord;
}

export interface WorkspaceMemberDirectoryEntry {
  readonly memberId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly role: WorkspaceRole;
  readonly fullName: string;
  /**
   * Non-null when caller is `owner`/`admin` or viewing their own row;
   * `null` when masked by PostgreSQL for `editor` and `viewer` (`P1-AC15`).
   */
  readonly email: string | null;
  readonly joinedAt: string;
}

function requireWorkspaceClient(
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): TypedSupabaseClient {
  if (!client) {
    throw new WorkspaceDomainError(
      'UNCONFIGURED',
      'Supabase is not configured in this offline environment.',
    );
  }
  return client;
}

export async function fetchOwnOrganizerProfile(
  userId: string,
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<OrganizerProfile | null> {
  const supabase = requireWorkspaceClient(client);
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw translateWorkspaceError(error);
  }

  return data;
}

export async function updateOwnOrganizerProfile(
  params: { readonly userId: string } & ProfileFullNamePayload,
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<OrganizerProfile> {
  const supabase = requireWorkspaceClient(client);
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: params.fullName })
    .eq('id', params.userId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw translateWorkspaceError(error);
  }

  if (!data) {
    throw new WorkspaceDomainError(
      'AUTH_REQUIRED',
      'Your organizer profile could not be updated. Sign in again and retry.',
    );
  }

  return data;
}

export async function fetchUserWorkspaceMemberships(
  userId: string,
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<readonly OrganizerWorkspaceMembership[]> {
  const supabase = requireWorkspaceClient(client);

  const [workspacesRes, membershipsRes] = await Promise.all([
    supabase.from('workspaces').select('*').order('created_at', { ascending: true }),
    supabase
      .from('workspace_members')
      .select('id, workspace_id, role, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
  ]);

  if (workspacesRes.error) {
    throw translateWorkspaceError(workspacesRes.error);
  }
  if (membershipsRes.error) {
    throw translateWorkspaceError(membershipsRes.error);
  }

  const workspacesById = new Map<string, WorkspaceRecord>();
  for (const workspace of workspacesRes.data) {
    workspacesById.set(workspace.id, workspace);
  }

  const combined: OrganizerWorkspaceMembership[] = [];
  for (const membership of membershipsRes.data) {
    const workspace = workspacesById.get(membership.workspace_id);
    if (workspace) {
      combined.push({
        membershipId: membership.id,
        role: membership.role,
        joinedAt: membership.created_at,
        workspace,
      });
    }
  }

  return combined;
}

export async function createOrganizerWorkspace(
  payload: CreateWorkspacePayload,
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<WorkspaceRecord> {
  const supabase = requireWorkspaceClient(client);
  const rpcArgs =
    payload.slug !== undefined
      ? { p_name: payload.name, p_slug: payload.slug }
      : { p_name: payload.name };

  const { data, error } = await supabase.rpc('create_workspace', rpcArgs);

  if (error) {
    throw translateWorkspaceError(error);
  }

  return data;
}

export async function updateOrganizerWorkspace(
  params: { readonly workspaceId: string } & UpdateWorkspacePayload,
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<WorkspaceRecord> {
  const supabase = requireWorkspaceClient(client);

  const { data, error } = await supabase
    .from('workspaces')
    .update({
      name: params.name,
      slug: params.slug,
    })
    .eq('id', params.workspaceId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw translateWorkspaceError(error);
  }

  if (!data) {
    throw new WorkspaceDomainError(
      'INSUFFICIENT_WORKSPACE_ROLE',
      'Only workspace owners and admins can update workspace settings.',
    );
  }

  return data;
}

export async function deleteOrganizerWorkspace(
  workspaceId: string,
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<void> {
  const supabase = requireWorkspaceClient(client);

  const { data, error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId)
    .select('id');

  if (error) {
    throw translateWorkspaceError(error);
  }

  if (!data || data.length === 0) {
    throw new WorkspaceDomainError(
      'INSUFFICIENT_WORKSPACE_ROLE',
      'Only workspace owners can delete this workspace.',
    );
  }
}

export async function fetchWorkspaceMemberDirectory(
  workspaceId: string,
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<readonly WorkspaceMemberDirectoryEntry[]> {
  const supabase = requireWorkspaceClient(client);

  const { data, error } = await supabase.rpc('list_workspace_members', {
    p_workspace_id: workspaceId,
  });

  if (error) {
    throw translateWorkspaceError(error);
  }

  return data.map((row) => ({
    memberId: row.member_id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    fullName: row.full_name,
    email: (row.email as string | null) ?? null,
    joinedAt: row.joined_at,
  }));
}

export async function addOrganizerWorkspaceMember(
  params: { readonly workspaceId: string } & AddWorkspaceMemberPayload,
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<WorkspaceMemberRecord> {
  const supabase = requireWorkspaceClient(client);

  const { data, error } = await supabase.rpc('add_workspace_member_by_email', {
    p_workspace_id: params.workspaceId,
    p_email: params.email,
    p_role: params.role,
  });

  if (error) {
    throw translateWorkspaceError(error);
  }

  return data;
}

export async function changeOrganizerWorkspaceMemberRole(
  params: {
    readonly workspaceId: string;
    readonly memberUserId: string;
    readonly newRole: WorkspaceRole;
  },
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<WorkspaceMemberRecord> {
  const supabase = requireWorkspaceClient(client);

  const { data, error } = await supabase.rpc('update_workspace_member_role', {
    p_workspace_id: params.workspaceId,
    p_member_user_id: params.memberUserId,
    p_new_role: params.newRole,
  });

  if (error) {
    throw translateWorkspaceError(error);
  }

  return data;
}

export async function removeOrganizerWorkspaceMember(
  params: {
    readonly workspaceId: string;
    readonly memberUserId: string;
  },
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<void> {
  const supabase = requireWorkspaceClient(client);

  const { error } = await supabase.rpc('remove_workspace_member', {
    p_workspace_id: params.workspaceId,
    p_member_user_id: params.memberUserId,
  });

  if (error) {
    throw translateWorkspaceError(error);
  }
}
