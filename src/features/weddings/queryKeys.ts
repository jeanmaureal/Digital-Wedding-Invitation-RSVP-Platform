export const weddingQueryKeys = {
  allInWorkspace: (userId: string, workspaceId: string) =>
    ['workspace', userId, workspaceId, 'weddings'] as const,
  list: (userId: string, workspaceId: string) =>
    ['workspace', userId, workspaceId, 'weddings', 'list'] as const,
  detail: (userId: string, workspaceId: string, weddingId: string) =>
    ['workspace', userId, workspaceId, 'weddings', 'detail', weddingId] as const,
};
