export const rsvpQueryKeys = {
  all: ['rsvp'] as const,
  overview: (userId: string, workspaceId: string, weddingId: string) =>
    [...rsvpQueryKeys.all, 'overview', userId, workspaceId, weddingId] as const,
} as const;
