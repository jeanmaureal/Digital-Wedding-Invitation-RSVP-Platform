export const ROUTES = {
  home: '/',
  organizerRoot: '/app',
  organizerSettings: '/app/settings',
  organizerWeddingDetail: '/app/weddings/:weddingId',
  organizerWeddingBuilder: '/app/weddings/:weddingId/builder',
  organizerWeddingGuests: '/app/weddings/:weddingId/guests',
  organizerLogin: '/app/login',
  organizerSignup: '/app/signup',
  organizerForgotPassword: '/app/forgot-password',
  organizerResetPassword: '/app/reset-password',
  publicWedding: '/w/:slug',
  publicInvitation: '/i/:token',
} as const;

export function buildOrganizerWeddingPath(weddingId: string): string {
  return `/app/weddings/${encodeURIComponent(weddingId)}`;
}

export function buildOrganizerWeddingBuilderPath(weddingId: string): string {
  return `/app/weddings/${encodeURIComponent(weddingId)}/builder`;
}

export function buildOrganizerWeddingGuestsPath(weddingId: string): string {
  return `/app/weddings/${encodeURIComponent(weddingId)}/guests`;
}

export function buildPublicWeddingPath(slug: string): string {
  return `/w/${encodeURIComponent(slug)}`;
}

export function buildPublicInvitationPath(rawToken: string): string {
  return `/i/${encodeURIComponent(rawToken)}`;
}
