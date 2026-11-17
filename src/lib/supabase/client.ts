export {
  checkDatabaseHealth,
  createPublicSupabaseClient,
  createPublicSupabaseClient as createTypedSupabaseClient,
  getPublicSupabaseClient,
  getPublicSupabaseClient as getSupabaseClient,
  type HealthCheckResult,
  resetPublicSupabaseClientForTests,
  type TypedSupabaseClient,
} from '@/lib/supabase/publicClient';
