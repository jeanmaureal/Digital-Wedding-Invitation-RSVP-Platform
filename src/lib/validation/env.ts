import { z } from 'zod';

export const APP_ENVIRONMENTS = ['local', 'preview', 'production'] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export type SupabaseEnvConfig =
  | {
      readonly status: 'unconfigured';
    }
  | {
      readonly status: 'configured';
      readonly url: string;
      readonly publishableKey: string;
    };

export interface ValidatedAppEnv {
  readonly appEnv: AppEnvironment;
  readonly supabase: SupabaseEnvConfig;
}

export class EnvConfigurationError extends Error {
  public readonly issues: readonly string[];

  public constructor(message: string, issues: readonly string[] = []) {
    super(message);
    this.name = 'EnvConfigurationError';
    this.issues = issues;
  }
}

const PLACEHOLDER_HOSTS = new Set(['your-project-ref.supabase.co', 'example.supabase.co']);
const PLACEHOLDER_KEYS = new Set([
  'sb_publishable_replace_me',
  'sb_publishable_your_key_here',
  'your-anon-key',
]);

const appEnvSchema = z.enum(APP_ENVIRONMENTS);

function decodeJwtRolePayload(token: string): string | null {
  const segments = token.split('.');
  if (segments.length !== 3) {
    return null;
  }

  const payloadSegment = segments[1];
  if (!payloadSegment) {
    return null;
  }

  try {
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = atob(padded);
    const parsed: unknown = JSON.parse(decoded);
    if (typeof parsed === 'object' && parsed !== null && 'role' in parsed) {
      const role = (parsed as { role?: unknown }).role;
      return typeof role === 'string' ? role : null;
    }
    return null;
  } catch {
    return null;
  }
}

function looksLikeServerSecretKey(key: string): boolean {
  const normalized = key.trim();
  if (normalized.startsWith('sb_secret_')) {
    return true;
  }
  const jwtRole = decodeJwtRolePayload(normalized);
  return jwtRole === 'service_role' || jwtRole === 'supabase_admin';
}

function resolveAppEnvironment(rawEnv: Record<string, string | undefined>): AppEnvironment {
  const explicitAppEnv = rawEnv.VITE_APP_ENV?.trim();
  if (explicitAppEnv) {
    const parsed = appEnvSchema.safeParse(explicitAppEnv);
    if (!parsed.success) {
      throw new EnvConfigurationError(
        `Invalid VITE_APP_ENV "${explicitAppEnv}". Expected one of: local, preview, production.`,
        [`VITE_APP_ENV must be "local", "preview", or "production".`],
      );
    }
    return parsed.data;
  }

  const vercelEnv = rawEnv.VITE_VERCEL_ENV?.trim();
  if (vercelEnv === 'production') {
    return 'production';
  }
  if (vercelEnv === 'preview') {
    return 'preview';
  }

  return 'local';
}

/**
 * Validates public frontend environment variables according to the approved Phase 0 contract:
 * - Local without Supabase config: returns `supabase: { status: 'unconfigured' }` (no fake credentials).
 * - Local with valid config: validates URL and publishable key and returns `status: 'configured'`.
 * - Preview / Production: requires valid non-placeholder Supabase URL and publishable key.
 * - All environments: rejects accidental secret/service-role keys in `VITE_SUPABASE_PUBLISHABLE_KEY`.
 *
 * Security note: This runtime check prevents misconfiguration; PostgreSQL RLS and explicit grants
 * remain the actual authorization boundary.
 */
export function parseAppEnv(rawEnv: Record<string, string | undefined>): ValidatedAppEnv {
  const appEnv = resolveAppEnvironment(rawEnv);
  const rawUrl = rawEnv.VITE_SUPABASE_URL?.trim() ?? '';
  const rawKey = rawEnv.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

  if (!rawUrl && !rawKey) {
    if (appEnv === 'local') {
      return {
        appEnv,
        supabase: { status: 'unconfigured' },
      };
    }

    throw new EnvConfigurationError(
      `Missing required Supabase configuration for "${appEnv}" environment.`,
      [
        'VITE_SUPABASE_URL is required in preview and production deployments.',
        'VITE_SUPABASE_PUBLISHABLE_KEY is required in preview and production deployments.',
      ],
    );
  }

  const issues: string[] = [];

  if (!rawUrl) {
    issues.push('VITE_SUPABASE_URL must be set when VITE_SUPABASE_PUBLISHABLE_KEY is provided.');
  } else {
    try {
      const parsedUrl = new URL(rawUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const isLocalHttp =
        appEnv === 'local' &&
        parsedUrl.protocol === 'http:' &&
        (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1');

      if (!isHttps && !isLocalHttp) {
        issues.push(
          appEnv === 'local'
            ? 'VITE_SUPABASE_URL must use https:// (or http://localhost in local development).'
            : 'VITE_SUPABASE_URL must use https:// in preview and production deployments.',
        );
      }

      if (PLACEHOLDER_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
        issues.push('VITE_SUPABASE_URL still contains a placeholder hostname.');
      }
    } catch {
      issues.push('VITE_SUPABASE_URL must be a valid URL.');
    }
  }

  if (!rawKey) {
    issues.push('VITE_SUPABASE_PUBLISHABLE_KEY must be set when VITE_SUPABASE_URL is provided.');
  } else {
    if (looksLikeServerSecretKey(rawKey)) {
      issues.push(
        'VITE_SUPABASE_PUBLISHABLE_KEY appears to contain a privileged secret/service-role key, which must never be exposed in frontend builds.',
      );
    }

    if (PLACEHOLDER_KEYS.has(rawKey)) {
      issues.push('VITE_SUPABASE_PUBLISHABLE_KEY still contains a placeholder value.');
    }
  }

  if (issues.length > 0) {
    throw new EnvConfigurationError(
      `Invalid Supabase environment configuration for "${appEnv}" environment.`,
      issues,
    );
  }

  return {
    appEnv,
    supabase: {
      status: 'configured',
      url: rawUrl,
      publishableKey: rawKey,
    },
  };
}

let cachedEnv: ValidatedAppEnv | null = null;

export function getAppEnv(): ValidatedAppEnv {
  if (!cachedEnv) {
    cachedEnv = parseAppEnv({
      VITE_APP_ENV: import.meta.env.VITE_APP_ENV,
      VITE_VERCEL_ENV: import.meta.env.VITE_VERCEL_ENV,
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    });
  }
  return cachedEnv;
}
