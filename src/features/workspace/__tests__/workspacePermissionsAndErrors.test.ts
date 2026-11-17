import { describe, expect, it } from 'vitest';
import { translateWorkspaceError } from '@/features/workspace/api/workspaceErrors';
import {
  canAddWorkspaceMembers,
  canChangeMemberRole,
  canDeleteWorkspace,
  canEditWorkspaceSettings,
  canRemoveWorkspaceMember,
  canViewAllMemberEmails,
  getAssignableMemberRoles,
} from '@/features/workspace/permissions/workspacePermissions';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
} from '@/features/workspace/schemas/workspaceSchemas';

describe('workspacePermissions UX capability matrix (P1-AC05, P1-AC15)', () => {
  it('enforces workspace edit, delete, member-add, and co-member email visibility boundaries', () => {
    expect(canEditWorkspaceSettings('owner')).toBe(true);
    expect(canEditWorkspaceSettings('admin')).toBe(true);
    expect(canEditWorkspaceSettings('editor')).toBe(false);
    expect(canEditWorkspaceSettings('viewer')).toBe(false);

    expect(canDeleteWorkspace('owner')).toBe(true);
    expect(canDeleteWorkspace('admin')).toBe(false);
    expect(canDeleteWorkspace('editor')).toBe(false);
    expect(canDeleteWorkspace('viewer')).toBe(false);

    expect(canViewAllMemberEmails('owner')).toBe(true);
    expect(canViewAllMemberEmails('admin')).toBe(true);
    expect(canViewAllMemberEmails('editor')).toBe(false);
    expect(canViewAllMemberEmails('viewer')).toBe(false);

    expect(canAddWorkspaceMembers('owner')).toBe(true);
    expect(canAddWorkspaceMembers('admin')).toBe(true);
    expect(canAddWorkspaceMembers('editor')).toBe(false);
    expect(canAddWorkspaceMembers('viewer')).toBe(false);

    expect(getAssignableMemberRoles('owner')).toEqual(['owner', 'admin', 'editor', 'viewer']);
    expect(getAssignableMemberRoles('admin')).toEqual(['editor', 'viewer']);
    expect(getAssignableMemberRoles('editor')).toEqual([]);
    expect(getAssignableMemberRoles('viewer')).toEqual([]);
  });

  it('protects sole owners while allowing dual-owner and admin-scoped mutations', () => {
    // Sole owner cannot demote or leave
    expect(
      canChangeMemberRole({
        callerRole: 'owner',
        callerUserId: 'u-1',
        targetRole: 'owner',
        targetUserId: 'u-1',
        ownerCount: 1,
      }),
    ).toBe(false);
    expect(
      canRemoveWorkspaceMember({
        callerRole: 'owner',
        callerUserId: 'u-1',
        targetRole: 'owner',
        targetUserId: 'u-1',
        ownerCount: 1,
      }),
    ).toBe(false);

    // Dual owners CAN demote or leave
    expect(
      canChangeMemberRole({
        callerRole: 'owner',
        callerUserId: 'u-1',
        targetRole: 'owner',
        targetUserId: 'u-1',
        ownerCount: 2,
      }),
    ).toBe(true);
    expect(
      canRemoveWorkspaceMember({
        callerRole: 'owner',
        callerUserId: 'u-1',
        targetRole: 'owner',
        targetUserId: 'u-1',
        ownerCount: 2,
      }),
    ).toBe(true);

    // Admin can edit/remove editor & viewer, never owner or admin
    expect(
      canChangeMemberRole({
        callerRole: 'admin',
        callerUserId: 'u-admin',
        targetRole: 'editor',
        targetUserId: 'u-editor',
        ownerCount: 1,
      }),
    ).toBe(true);
    expect(
      canChangeMemberRole({
        callerRole: 'admin',
        callerUserId: 'u-admin',
        targetRole: 'admin',
        targetUserId: 'u-other-admin',
        ownerCount: 1,
      }),
    ).toBe(false);
    expect(
      canRemoveWorkspaceMember({
        callerRole: 'admin',
        callerUserId: 'u-admin',
        targetRole: 'owner',
        targetUserId: 'u-owner',
        ownerCount: 2,
      }),
    ).toBe(false);
    // Non-owner members can always leave voluntarily
    expect(
      canRemoveWorkspaceMember({
        callerRole: 'viewer',
        callerUserId: 'u-viewer',
        targetRole: 'viewer',
        targetUserId: 'u-viewer',
        ownerCount: 1,
      }),
    ).toBe(true);
  });
});

describe('workspaceSchemas & translateWorkspaceError contract', () => {
  it('validates optional and explicit slugs accurately', () => {
    const withoutSlug = createWorkspaceSchema.parse({ name: '  Studio Aurora  ', slug: '   ' });
    expect(withoutSlug).toEqual({ name: 'Studio Aurora', slug: undefined });

    const withSlug = createWorkspaceSchema.parse({ name: 'Studio Aurora', slug: 'Studio-Aurora' });
    expect(withSlug).toEqual({ name: 'Studio Aurora', slug: 'studio-aurora' });

    expect(
      updateWorkspaceSchema.safeParse({ name: 'Valid', slug: 'bad--double-hyphen' }).success,
    ).toBe(false);
  });

  it('maps PostgreSQL SQLSTATEs and domain prefixes to typed WorkspaceDomainError codes', () => {
    expect(
      translateWorkspaceError({
        code: 'P0001',
        message: 'LAST_WORKSPACE_OWNER_REQUIRED: At least one workspace owner must remain.',
      }).code,
    ).toBe('LAST_WORKSPACE_OWNER_REQUIRED');

    expect(
      translateWorkspaceError({
        code: 'P0002',
        message: 'ORGANIZER_NOT_REGISTERED: No registered organizer account matches that email.',
      }).code,
    ).toBe('ORGANIZER_NOT_REGISTERED');

    expect(
      translateWorkspaceError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "workspaces_slug_key"',
      }).code,
    ).toBe('WORKSPACE_SLUG_TAKEN');

    expect(
      translateWorkspaceError({
        code: '42501',
        message: 'INSUFFICIENT_WORKSPACE_ROLE: Workspace admins cannot assign owner roles.',
      }).code,
    ).toBe('INSUFFICIENT_WORKSPACE_ROLE');

    expect(
      translateWorkspaceError({
        code: '40P01',
        message: 'deadlock detected',
      }).code,
    ).toBe('CONCURRENCY_CONFLICT');
  });
});
