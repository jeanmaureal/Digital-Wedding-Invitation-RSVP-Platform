import { z } from 'zod';
import { ROUTES } from '@/lib/constants/routes';

const DISALLOWED_REDIRECT_AUTH_PATHS = new Set<string>([
  ROUTES.organizerLogin,
  ROUTES.organizerSignup,
  ROUTES.organizerForgotPassword,
  ROUTES.organizerResetPassword,
]);

const SYNTHETIC_REDIRECT_ORIGIN = 'https://organizer-redirect.internal';

export const emailFieldSchema = z
  .string()
  .trim()
  .min(3, 'Enter your email address.')
  .max(320, 'Email must be 320 characters or fewer.')
  .transform((value) => value.toLowerCase())
  .pipe(z.email('Enter a valid email address.'));

export const passwordFieldSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password must be 72 characters or fewer.');

export const loginSchema = z.object({
  email: emailFieldSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export type LoginFormValues = z.input<typeof loginSchema>;
export type LoginPayload = z.output<typeof loginSchema>;

export const signupSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, 'Enter your full name.')
      .max(120, 'Full name must be 120 characters or fewer.'),
    email: emailFieldSchema,
    password: passwordFieldSchema,
    confirmPassword: z.string().min(1, 'Confirm your password.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

export type SignupFormValues = z.input<typeof signupSchema>;
export type SignupPayload = z.output<typeof signupSchema>;

export const forgotPasswordSchema = z.object({
  email: emailFieldSchema,
});

export type ForgotPasswordFormValues = z.input<typeof forgotPasswordSchema>;
export type ForgotPasswordPayload = z.output<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordFieldSchema,
    confirmPassword: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

export type ResetPasswordFormValues = z.input<typeof resetPasswordSchema>;
export type ResetPasswordPayload = z.output<typeof resetPasswordSchema>;

function hasAsciiControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Strictly validates `redirectTo` targets against an internal organizer-portal allowlist (`P1-AC06`).
 * Rejects external origins, protocol-relative URLs (`//`), backslashes, control characters,
 * public guest routes, and organizer auth screens (preventing redirect loops).
 */
export function sanitizeOrganizerRedirect(rawTarget: string | null | undefined): string {
  if (!rawTarget) {
    return ROUTES.organizerRoot;
  }

  const trimmed = rawTarget.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > 512 ||
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    hasAsciiControlCharacters(trimmed)
  ) {
    return ROUTES.organizerRoot;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, SYNTHETIC_REDIRECT_ORIGIN);
  } catch {
    return ROUTES.organizerRoot;
  }

  if (parsed.origin !== SYNTHETIC_REDIRECT_ORIGIN) {
    return ROUTES.organizerRoot;
  }

  const normalizedPathname =
    parsed.pathname.length > 1 && parsed.pathname.endsWith('/')
      ? parsed.pathname.replace(/\/+$/, '')
      : parsed.pathname;

  const isOrganizerPath =
    normalizedPathname === ROUTES.organizerRoot ||
    normalizedPathname.startsWith(`${ROUTES.organizerRoot}/`);

  if (!isOrganizerPath || DISALLOWED_REDIRECT_AUTH_PATHS.has(normalizedPathname)) {
    return ROUTES.organizerRoot;
  }

  return `${normalizedPathname}${parsed.search}${parsed.hash}`;
}

export function buildLoginRedirectPath(pathname: string, search = ''): string {
  const sanitized = sanitizeOrganizerRedirect(`${pathname}${search}`);
  if (sanitized === ROUTES.organizerRoot) {
    return ROUTES.organizerLogin;
  }
  return `${ROUTES.organizerLogin}?redirectTo=${encodeURIComponent(sanitized)}`;
}

export function buildAuthPageHref(
  authPath: typeof ROUTES.organizerLogin | typeof ROUTES.organizerSignup,
  rawRedirectTo: string | null | undefined,
): string {
  const sanitized = sanitizeOrganizerRedirect(rawRedirectTo);
  if (sanitized === ROUTES.organizerRoot) {
    return authPath;
  }
  return `${authPath}?redirectTo=${encodeURIComponent(sanitized)}`;
}
