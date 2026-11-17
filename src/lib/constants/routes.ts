export const ROUTES = {
  home: '/',
  organizerRoot: '/app',
  organizerSettings: '/app/settings',
  organizerLogin: '/app/login',
  organizerSignup: '/app/signup',
  organizerForgotPassword: '/app/forgot-password',
  organizerResetPassword: '/app/reset-password',
  publicWedding: '/w/:slug',
  publicInvitation: '/i/:token',
} as const;
