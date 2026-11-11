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

let browserSupabaseClient: TypedSupabaseClient | null = null;

export function createTypedSupabaseClient(env: ValidatedAppEnv): TypedSupabaseClient | null {
  if (env.supabase.status === 'unconfigured') {
    return null;
  }

  return createClient<Database>(env.supabase.url, env.supabase.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export function getSupabaseClient(): TypedSupabaseClient | null {
  if (browserSupabaseClient) {
    return browserSupabaseClient;
  }

  const client = createTypedSupabaseClient(getAppEnv());
  if (client) {
    browserSupabaseClient = client;
  }
  return client;
}

/**
 * Executes the lightweight `public.health_check()` RPC through the typed Supabase client.
 * Confirms operational RPC reachability only; migration completeness is verified separately.
 */
export async function checkDatabaseHealth(
  client: TypedSupabaseClient | null = getSupabaseClient(),
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
