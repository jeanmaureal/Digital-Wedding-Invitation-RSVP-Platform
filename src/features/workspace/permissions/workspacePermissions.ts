import type { WorkspaceRole } from '@/features/workspace/schemas/workspaceSchemas';

/**
 * UX-ONLY RBAC CAPABILITY HELPERS (`P1-AC05`).
 *
 * Architectural boundary:
 *   Supabase Auth establishes identity.
 *   PostgreSQL RLS policies and `SECURITY DEFINER` RPCs establish authorization and invariants.
 *   These helpers exist strictly to render accurate controls and guidance in the React UI;
 *   they are NEVER a security boundary.
 */

const OWNER_ASSIGNABLE_ROLES: readonly WorkspaceRole[] = ['owner', 'admin', 'editor', 'viewer'];
const ADMIN_ASSIGNABLE_ROLES: readonly WorkspaceRole[] = ['editor', 'viewer'];
const NO_ASSIGNABLE_ROLES: readonly WorkspaceRole[] = [];

export function canEditWorkspaceSettings(callerRole: WorkspaceRole): boolean {
  return callerRole === 'owner' || callerRole === 'admin';
}

export function canDeleteWorkspace(callerRole: WorkspaceRole): boolean {
  return callerRole === 'owner';
}

export function canViewAllMemberEmails(callerRole: WorkspaceRole): boolean {
  return callerRole === 'owner' || callerRole === 'admin';
}

export function canAddWorkspaceMembers(callerRole: WorkspaceRole): boolean {
  return callerRole === 'owner' || callerRole === 'admin';
}

export function getAssignableMemberRoles(callerRole: WorkspaceRole): readonly WorkspaceRole[] {
  if (callerRole === 'owner') {
    return OWNER_ASSIGNABLE_ROLES;
  }
  if (callerRole === 'admin') {
    return ADMIN_ASSIGNABLE_ROLES;
  }
  return NO_ASSIGNABLE_ROLES;
}

export interface MemberMutationCheckInput {
  readonly callerRole: WorkspaceRole;
  readonly callerUserId: string;
  readonly targetRole: WorkspaceRole;
  readonly targetUserId: string;
  readonly ownerCount: number;
}

export function canChangeMemberRole(input: MemberMutationCheckInput): boolean {
  const { callerRole, targetRole, ownerCount } = input;

  if (callerRole === 'owner') {
    // Sole owner cannot demote themselves or the only owner in the workspace.
    if (targetRole === 'owner' && ownerCount <= 1) {
      return false;
    }
    return true;
  }

  if (callerRole === 'admin') {
    return targetRole === 'editor' || targetRole === 'viewer';
  }

  return false;
}

export function canRemoveWorkspaceMember(input: MemberMutationCheckInput): boolean {
  const { callerRole, callerUserId, targetRole, targetUserId, ownerCount } = input;
  const isSelf = callerUserId === targetUserId;

  if (targetRole === 'owner' && ownerCount <= 1) {
    return false;
  }

  if (isSelf) {
    return true;
  }

  if (callerRole === 'owner') {
    return true;
  }

  if (callerRole === 'admin') {
    return targetRole === 'editor' || targetRole === 'viewer';
  }

  return false;
}
