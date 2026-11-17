import type { Session } from '@supabase/supabase-js';
import { translateOrganizerAuthError } from '@/features/auth/api/authErrors';
import { ROUTES } from '@/lib/constants/routes';

export const RECOVERY_SESSION_STORAGE_KEY = 'wedding_platform:password_recovery_pending:v1';

export interface AuthCallbackInspection {
  readonly hadResetRoutePkceCode: boolean;
  readonly initialRecoveryError: string | null;
  readonly shouldScrubUrlErrorParams: boolean;
}

export function inspectAuthCallbackLocation(
  loc: Pick<Location, 'pathname' | 'search' | 'hash'>,
): AuthCallbackInspection {
  const searchParams = new URLSearchParams(loc.search);
  const hashRaw = loc.hash.startsWith('#') ? loc.hash.slice(1) : loc.hash;
  const hashParams = new URLSearchParams(hashRaw);

  const errorCode = searchParams.get('error_code') ?? hashParams.get('error_code');
  const errorDescription =
    searchParams.get('error_description') ??
    hashParams.get('error_description') ??
    searchParams.get('error') ??
    hashParams.get('error');

  const hasPkceCode = Boolean(searchParams.get('code'));
  const isResetRoute = loc.pathname.replace(/\/+$/, '') === ROUTES.organizerResetPassword;

  if (errorCode || errorDescription) {
    const translated = translateOrganizerAuthError({
      code: errorCode ?? 'otp_expired',
      message: errorDescription ?? 'Email link is invalid or has expired',
    });
    return {
      hadResetRoutePkceCode: isResetRoute && hasPkceCode,
      initialRecoveryError: translated.message,
      shouldScrubUrlErrorParams: !hasPkceCode,
    };
  }

  return {
    hadResetRoutePkceCode: isResetRoute && hasPkceCode,
    initialRecoveryError: null,
    shouldScrubUrlErrorParams: false,
  };
}

export function scrubAuthErrorParamsFromCurrentUrl(): void {
  const url = new URL(window.location.href);
  let mutated = false;

  for (const key of ['error', 'error_code', 'error_description']) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      mutated = true;
    }
  }

  if (url.hash && url.hash.includes('error')) {
    url.hash = '';
    mutated = true;
  }

  if (mutated) {
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }
}

export function sessionHasRecoveryAmr(session: Session | null): boolean {
  if (!session?.access_token) {
    return false;
  }

  const segments = session.access_token.split('.');
  const payloadSegment = segments[1];
  if (!payloadSegment) {
    return false;
  }

  try {
    const normalizedBase64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalizedBase64.padEnd(Math.ceil(normalizedBase64.length / 4) * 4, '=');
    const decodedJson = atob(padded);
    const parsed = JSON.parse(decodedJson) as { amr?: unknown };
    if (!Array.isArray(parsed.amr)) {
      return false;
    }
    return parsed.amr.some((entry) => {
      if (typeof entry === 'string') {
        return entry === 'recovery';
      }
      if (entry && typeof entry === 'object' && 'method' in entry) {
        return (entry as { method?: unknown }).method === 'recovery';
      }
      return false;
    });
  } catch {
    return false;
  }
}

export function readStoredRecoveryUserId(): string | null {
  try {
    return window.sessionStorage.getItem(RECOVERY_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredRecoveryUserId(userId: string): void {
  try {
    window.sessionStorage.setItem(RECOVERY_SESSION_STORAGE_KEY, userId);
  } catch {
    // Ignore storage quota or private-mode restrictions; in-memory state still tracks recovery.
  }
}

export function clearStoredRecoveryUserId(): void {
  try {
    window.sessionStorage.removeItem(RECOVERY_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage restrictions.
  }
}
