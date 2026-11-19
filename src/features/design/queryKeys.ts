export const designQueryKeys = {
  draft: (userId: string, workspaceId: string, weddingId: string) =>
    ['workspace', userId, workspaceId, 'weddings', 'design', weddingId] as const,
};
