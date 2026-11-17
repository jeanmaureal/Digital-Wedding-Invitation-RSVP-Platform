import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getAppEnv, type ValidatedAppEnv } from '@/lib/validation/env';
import type { Database } from '@/types/database.types';

export type TypedSupabaseClient = SupabaseClient<Database>;

const healthCheckResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string().min(1),
});

export type HealthCheckResult =
  | {
      readonly status: 'unconfigured';
    }
  | {
      readonly status: 'ok';
      readonly timestamp: string;
    };

let publicSupabaseClient: TypedSupabaseClient | null = null;

/**
 * Creates a stateless Supabase client safe for public wedding/invitation routes and
 * anonymous operational checks (`P1-AC14`). Never reads/writes browser auth storage,
 * never schedules token refresh timers, and never inspects URL auth callback parameters.
 */
export function createPublicSupabaseClient(env: ValidatedAppEnv): TypedSupabaseClient | null {
  if (env.supabase.status === 'unconfigured') {
    return null;
  }

  return createClient<Database>(env.supabase.url, env.supabase.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function getPublicSupabaseClient(): TypedSupabaseClient | null {
  if (publicSupabaseClient) {
    return publicSupabaseClient;
  }

  const client = createPublicSupabaseClient(getAppEnv());
  if (client) {
    publicSupabaseClient = client;
  }
  return client;
}

export function resetPublicSupabaseClientForTests(): void {
  publicSupabaseClient = null;
}

/**
 * Executes the lightweight `public.health_check()` RPC through a typed Supabase client.
 * Confirms operational RPC reachability only; migration completeness is verified separately.
 */
export async function checkDatabaseHealth(
  client: TypedSupabaseClient | null = getPublicSupabaseClient(),
): Promise<HealthCheckResult> {
  if (!client) {
    return { status: 'unconfigured' };
  }

  const { data, error } = await client.rpc('health_check');

  if (error) {
    throw new Error(`Supabase health_check RPC failed: ${error.message}`);
  }

  const parsed = healthCheckResponseSchema.parse(data);
  return {
    status: parsed.status,
    timestamp: parsed.timestamp,
  };
}
