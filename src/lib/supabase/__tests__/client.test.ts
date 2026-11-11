import { describe, expect, it } from 'vitest';
import {
  checkDatabaseHealth,
  createTypedSupabaseClient,
  getSupabaseClient,
} from '@/lib/supabase/client';
import { parseAppEnv } from '@/lib/validation/env';

describe('Supabase typed client initialization', () => {
  it('returns null and unconfigured health state when local Supabase env is omitted', async () => {
    const unconfiguredEnv = parseAppEnv({});
    const client = createTypedSupabaseClient(unconfiguredEnv);

    expect(client).toBeNull();
    await expect(checkDatabaseHealth(null)).resolves.toEqual({
      status: 'unconfigured',
    });
  });

  it('creates a typed SupabaseClient instance when valid public configuration is supplied', () => {
    const configuredEnv = parseAppEnv({
      VITE_APP_ENV: 'local',
      VITE_SUPABASE_URL: 'https://abcdefghijklm.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit_test_key_12345',
    });

    const client = createTypedSupabaseClient(configuredEnv);
    expect(client).not.toBeNull();
    expect(typeof client?.rpc).toBe('function');
  });
});

const hasLiveSupabaseEnv = Boolean(
  import.meta.env.VITE_SUPABASE_URL?.trim() &&
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim(),
);

describe.runIf(hasLiveSupabaseEnv)('Live Supabase health_check RPC (P0-AC04)', () => {
  it('executes public.health_check() through the application getSupabaseClient() singleton', async () => {
    const client = getSupabaseClient();
    expect(client).not.toBeNull();

    const first = await checkDatabaseHealth(client);
    const second = await checkDatabaseHealth(client);

    expect(first.status).toBe('ok');
    expect(second.status).toBe('ok');

    if (first.status === 'ok' && second.status === 'ok') {
      expect(Number.isNaN(Date.parse(first.timestamp))).toBe(false);
      expect(Number.isNaN(Date.parse(second.timestamp))).toBe(false);
    }
  });
});
