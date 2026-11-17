import { describe, expect, it } from 'vitest';
import {
  buildAuthPageHref,
  buildLoginRedirectPath,
  loginSchema,
  resetPasswordSchema,
  sanitizeOrganizerRedirect,
  signupSchema,
} from '@/features/auth/schemas/authSchemas';

describe('sanitizeOrganizerRedirect allowlist (P1-AC06)', () => {
  it('preserves valid organizer routes including query strings and hashes', () => {
    expect(sanitizeOrganizerRedirect('/app')).toBe('/app');
    expect(sanitizeOrganizerRedirect('/app/settings')).toBe('/app/settings');
    expect(sanitizeOrganizerRedirect('/app/settings/')).toBe('/app/settings');
    expect(sanitizeOrganizerRedirect('/app/settings?tab=members#owners')).toBe(
      '/app/settings?tab=members#owners',
    );
  });

  it('rejects external URLs, protocol-relative URLs, backslashes, control chars, and prefix lookalikes', () => {
    expect(sanitizeOrganizerRedirect(null)).toBe('/app');
    expect(sanitizeOrganizerRedirect(undefined)).toBe('/app');
    expect(sanitizeOrganizerRedirect('')).toBe('/app');
    expect(sanitizeOrganizerRedirect('https://evil.example/app')).toBe('/app');
    expect(sanitizeOrganizerRedirect('http://localhost:5173/app/settings')).toBe('/app');
    expect(sanitizeOrganizerRedirect('//evil.example/app')).toBe('/app');
    expect(sanitizeOrganizerRedirect('/\\evil.example/app')).toBe('/app');
    expect(sanitizeOrganizerRedirect('/app\\evil')).toBe('/app');
    expect(sanitizeOrganizerRedirect('javascript:alert(1)')).toBe('/app');
    expect(sanitizeOrganizerRedirect('/app/settings\nSet-Cookie:bad=1')).toBe('/app');
    expect(sanitizeOrganizerRedirect('/apple')).toBe('/app');
    expect(sanitizeOrganizerRedirect('/w/alex-and-sam')).toBe('/app');
    expect(sanitizeOrganizerRedirect('/i/private-guest-token')).toBe('/app');
  });

  it('prevents redirect loops to organizer auth screens', () => {
    expect(sanitizeOrganizerRedirect('/app/login')).toBe('/app');
    expect(sanitizeOrganizerRedirect('/app/login?redirectTo=/app/settings')).toBe('/app');
    expect(sanitizeOrganizerRedirect('/app/signup')).toBe('/app');
    expect(sanitizeOrganizerRedirect('/app/forgot-password')).toBe('/app');
    expect(sanitizeOrganizerRedirect('/app/reset-password')).toBe('/app');
  });

  it('builds clean login redirect and auth cross-links', () => {
    expect(buildLoginRedirectPath('/app')).toBe('/app/login');
    expect(buildLoginRedirectPath('/app/settings', '?tab=members')).toBe(
      '/app/login?redirectTo=%2Fapp%2Fsettings%3Ftab%3Dmembers',
    );
    expect(buildAuthPageHref('/app/signup', '/app/settings')).toBe(
      '/app/signup?redirectTo=%2Fapp%2Fsettings',
    );
    expect(buildAuthPageHref('/app/signup', 'https://evil.example')).toBe('/app/signup');
  });
});

describe('Organizer auth Zod schemas', () => {
  it('normalizes email to trimmed lowercase and validates password requirements', () => {
    const parsedLogin = loginSchema.parse({
      email: '  Alex.Morgan@Studio.COM  ',
      password: 'Password123!',
    });
    expect(parsedLogin.email).toBe('alex.morgan@studio.com');

    const mismatchSignup = signupSchema.safeParse({
      fullName: 'Alex Morgan',
      email: 'alex@example.com',
      password: 'Password123!',
      confirmPassword: 'DifferentPassword123!',
    });
    expect(mismatchSignup.success).toBe(false);

    const validReset = resetPasswordSchema.safeParse({
      password: 'NewSecurePassword123!',
      confirmPassword: 'NewSecurePassword123!',
    });
    expect(validReset.success).toBe(true);
  });
});
