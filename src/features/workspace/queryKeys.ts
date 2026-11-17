export const workspaceQueryKeys = {
  profile: (userId: string) => ['organizer-profile', userId] as const,
  memberships: (userId: string) => ['workspace', userId, 'memberships'] as const,
  workspaceScope: (userId: string, workspaceId: string) =>
    ['workspace', userId, workspaceId] as const,
  memberDirectory: (userId: string, workspaceId: string) =>
    ['workspace', userId, workspaceId, 'members'] as const,
};
