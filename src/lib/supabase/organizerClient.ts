import { createClient } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';
import { getAppEnv, type ValidatedAppEnv } from '@/lib/validation/env';
import type { Database } from '@/types/database.types';

export const ORGANIZER_AUTH_STORAGE_KEY = 'wedding_platform:organizer_auth:v1';

let organizerSupabaseClient: TypedSupabaseClient | null = null;

/**
 * Creates the session-persisting PKCE Supabase client reserved strictly for `/app/*`
 * organizer routes (`P1-AC14`). Public routes (`src/portals/public/**`) are forbidden
 * by ESLint from importing this module.
 */
export function createOrganizerSupabaseClient(env: ValidatedAppEnv): TypedSupabaseClient | null {
  if (env.supabase.status === 'unconfigured') {
    return null;
  }

  return createClient<Database>(env.supabase.url, env.supabase.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: ORGANIZER_AUTH_STORAGE_KEY,
    },
  });
}

export function getOrganizerSupabaseClient(): TypedSupabaseClient | null {
  if (organizerSupabaseClient) {
    return organizerSupabaseClient;
  }

  const client = createOrganizerSupabaseClient(getAppEnv());
  if (client) {
    organizerSupabaseClient = client;
  }
  return client;
}

export function hasInitializedOrganizerSupabaseClient(): boolean {
  return organizerSupabaseClient !== null;
}

export function resetOrganizerSupabaseClientForTests(): void {
  organizerSupabaseClient = null;
}
