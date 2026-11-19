export const guestQueryKeys = {
  all: ['guests'] as const,
  directory: (userId: string, workspaceId: string, weddingId: string) =>
    [...guestQueryKeys.all, 'directory', userId, workspaceId, weddingId] as const,
  publicByToken: (tokenKey: string) => [...guestQueryKeys.all, 'publicByToken', tokenKey] as const,
} as const;
