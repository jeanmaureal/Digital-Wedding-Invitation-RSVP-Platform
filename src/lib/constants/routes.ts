export const ROUTES = {
  home: '/',
  organizerRoot: '/app',
  organizerSettings: '/app/settings',
  organizerWeddingDetail: '/app/weddings/:weddingId',
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
