import { describe, expect, it } from 'vitest';
import { EnvConfigurationError, parseAppEnv } from '@/lib/validation/env';

function buildUnsignedJwtWithRole(role: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ role, iss: 'supabase-test' }));
  return `${header}.${payload}.signature_stub`;
}

describe('parseAppEnv', () => {
  it('allows local startup without Supabase configuration (no fake credentials)', () => {
    const result = parseAppEnv({});
    expect(result).toEqual({
      appEnv: 'local',
      supabase: { status: 'unconfigured' },
    });
  });

  it('initializes configured state in local when valid HTTPS URL and publishable key are supplied', () => {
    const result = parseAppEnv({
      VITE_APP_ENV: 'local',
      VITE_SUPABASE_URL: 'https://abcdefghijklm.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_valid_key_12345',
    });

    expect(result).toEqual({
      appEnv: 'local',
      supabase: {
        status: 'configured',
        url: 'https://abcdefghijklm.supabase.co',
        publishableKey: 'sb_publishable_test_valid_key_12345',
      },
    });
  });

  it('allows localhost HTTP Supabase URLs only in local environment', () => {
    const localResult = parseAppEnv({
      VITE_APP_ENV: 'local',
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_dev_key',
    });
    expect(localResult.supabase.status).toBe('configured');

    expect(() =>
      parseAppEnv({
        VITE_APP_ENV: 'preview',
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_dev_key',
      }),
    ).toThrow(EnvConfigurationError);
  });

  it('fails fast in preview and production when Supabase credentials are missing', () => {
    expect(() => parseAppEnv({ VITE_APP_ENV: 'preview' })).toThrow(EnvConfigurationError);
    expect(() => parseAppEnv({ VITE_APP_ENV: 'production' })).toThrow(EnvConfigurationError);
  });

  it('infers preview and production from VITE_VERCEL_ENV when VITE_APP_ENV is unset', () => {
    expect(() => parseAppEnv({ VITE_VERCEL_ENV: 'preview' })).toThrow(EnvConfigurationError);
    expect(() => parseAppEnv({ VITE_VERCEL_ENV: 'production' })).toThrow(EnvConfigurationError);
  });

  it('rejects partial configuration when only URL or only key is set', () => {
    expect(() =>
      parseAppEnv({
        VITE_APP_ENV: 'local',
        VITE_SUPABASE_URL: 'https://abcdefghijklm.supabase.co',
      }),
    ).toThrow(EnvConfigurationError);

    expect(() =>
      parseAppEnv({
        VITE_APP_ENV: 'local',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_valid_key_12345',
      }),
    ).toThrow(EnvConfigurationError);
  });

  it('rejects placeholder template values from .env.example', () => {
    expect(() =>
      parseAppEnv({
        VITE_APP_ENV: 'local',
        VITE_SUPABASE_URL: 'https://your-project-ref.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_replace_me',
      }),
    ).toThrow(EnvConfigurationError);
  });

  it('rejects privileged secret or service_role keys in frontend configuration', () => {
    const dynamicSecretPrefixKey = ['sb', 'secret', 'test_only_never_real_999999'].join('_');
    expect(() =>
      parseAppEnv({
        VITE_APP_ENV: 'local',
        VITE_SUPABASE_URL: 'https://abcdefghijklm.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: dynamicSecretPrefixKey,
      }),
    ).toThrow(EnvConfigurationError);

    expect(() =>
      parseAppEnv({
        VITE_APP_ENV: 'production',
        VITE_SUPABASE_URL: 'https://abcdefghijklm.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: buildUnsignedJwtWithRole('service_role'),
      }),
    ).toThrow(EnvConfigurationError);
  });
});
