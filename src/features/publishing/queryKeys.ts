export const publishingQueryKeys = {
  publicBySlug: (slug: string) => ['public-wedding', 'slug', slug] as const,
  organizerSummary: (userId: string, workspaceId: string, weddingId: string) =>
    ['publishing', userId, workspaceId, weddingId, 'summary'] as const,
};
