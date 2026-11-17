import { afterEach, describe, expect, it } from 'vitest';
import {
  checkDatabaseHealth,
  createPublicSupabaseClient,
  getPublicSupabaseClient,
  resetPublicSupabaseClientForTests,
} from '@/lib/supabase/client';
import {
  createOrganizerSupabaseClient,
  hasInitializedOrganizerSupabaseClient,
  ORGANIZER_AUTH_STORAGE_KEY,
  resetOrganizerSupabaseClientForTests,
} from '@/lib/supabase/organizerClient';
import { parseAppEnv } from '@/lib/validation/env';

afterEach(() => {
  resetPublicSupabaseClientForTests();
  resetOrganizerSupabaseClientForTests();
  window.localStorage.clear();
});

describe('Dual Supabase client isolation (P1-AC14)', () => {
  it('returns null for both public and organizer clients when local Supabase env is omitted', async () => {
    const unconfiguredEnv = parseAppEnv({});

    expect(createPublicSupabaseClient(unconfiguredEnv)).toBeNull();
    expect(createOrganizerSupabaseClient(unconfiguredEnv)).toBeNull();
    expect(hasInitializedOrganizerSupabaseClient()).toBe(false);

    await expect(checkDatabaseHealth(null)).resolves.toEqual({
      status: 'unconfigured',
    });
  });

  it('creates isolated public (stateless) and organizer (PKCE session) clients when configured', () => {
    const configuredEnv = parseAppEnv({
      VITE_APP_ENV: 'local',
      VITE_SUPABASE_URL: 'https://abcdefghijklm.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit_test_key_12345',
    });

    const publicClient = createPublicSupabaseClient(configuredEnv);
    expect(publicClient).not.toBeNull();
    expect(typeof publicClient?.rpc).toBe('function');
    expect(window.localStorage.getItem(ORGANIZER_AUTH_STORAGE_KEY)).toBeNull();
    expect(hasInitializedOrganizerSupabaseClient()).toBe(false);

    const organizerClient = createOrganizerSupabaseClient(configuredEnv);
    expect(organizerClient).not.toBeNull();
    expect(organizerClient).not.toBe(publicClient);
  });
});

const hasLiveSupabaseEnv = Boolean(
  import.meta.env.VITE_SUPABASE_URL?.trim() &&
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim(),
);

describe.runIf(hasLiveSupabaseEnv)('Live Supabase health_check RPC (P0-AC04)', () => {
  it('executes public.health_check() through the stateless public Supabase client', async () => {
    const client = getPublicSupabaseClient();
    expect(client).not.toBeNull();
    expect(hasInitializedOrganizerSupabaseClient()).toBe(false);

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
