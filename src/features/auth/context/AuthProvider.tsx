import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { type JSX, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signOutOrganizer } from '@/features/auth/api/authApi';
import { translateOrganizerAuthError } from '@/features/auth/api/authErrors';
import {
  OrganizerAuthContext,
  type OrganizerAuthContextValue,
  type OrganizerAuthStatus,
} from '@/features/auth/context/organizerAuthContext';
import {
  clearStoredRecoveryUserId,
  inspectAuthCallbackLocation,
  readStoredRecoveryUserId,
  scrubAuthErrorParamsFromCurrentUrl,
  sessionHasRecoveryAmr,
  writeStoredRecoveryUserId,
} from '@/features/auth/context/recoverySessionUtils';
import { getOrganizerSupabaseClient } from '@/lib/supabase/organizerClient';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

export interface AuthProviderProps {
  readonly children: ReactNode;
  readonly clientOverride?: TypedSupabaseClient | null | undefined;
}

interface InternalAuthState {
  readonly status: OrganizerAuthStatus;
  readonly session: Session | null;
  readonly isPasswordRecoverySession: boolean;
  readonly recoveryError: string | null;
}

export function AuthProvider({ children, clientOverride }: AuthProviderProps): JSX.Element {
  const queryClient = useQueryClient();

  // Inspect initial URL parameters BEFORE calling `getOrganizerSupabaseClient()` so we know
  // whether the page loaded with `?code=...` on `/app/reset-password` or an explicit OAuth/PKCE error.
  const [initialInspection] = useState(() => inspectAuthCallbackLocation(window.location));
  const [supabaseClient] = useState<TypedSupabaseClient | null>(() =>
    clientOverride !== undefined ? clientOverride : getOrganizerSupabaseClient(),
  );

  const [authState, setAuthState] = useState<InternalAuthState>(() => {
    if (!supabaseClient) {
      return {
        status: 'unconfigured',
        session: null,
        isPasswordRecoverySession: false,
        recoveryError: initialInspection.initialRecoveryError,
      };
    }

    return {
      status: 'loading',
      session: null,
      isPasswordRecoverySession: false,
      recoveryError: initialInspection.initialRecoveryError,
    };
  });

  const previousUserIdRef = useRef<string | null>(null);
  const hadResetRoutePkceCodeRef = useRef<boolean>(initialInspection.hadResetRoutePkceCode);

  useEffect(() => {
    if (initialInspection.shouldScrubUrlErrorParams) {
      scrubAuthErrorParamsFromCurrentUrl();
    }
  }, [initialInspection.shouldScrubUrlErrorParams]);

  useEffect(() => {
    if (!supabaseClient) {
      return;
    }

    let isMounted = true;

    const applySessionTransition = (
      nextSession: Session | null,
      options: {
        readonly forceRecovery?: boolean;
        readonly isSignOutEvent?: boolean;
        readonly explicitRecoveryError?: string | null;
      } = {},
    ): void => {
      const nextUserId = nextSession?.user.id ?? null;
      const previousUserId = previousUserIdRef.current;

      // Clear TanStack Query caches immediately on sign-out or when switching between organizer users (`P1-AC07`).
      if (options.isSignOutEvent || (previousUserId !== null && previousUserId !== nextUserId)) {
        queryClient.clear();
        clearStoredRecoveryUserId();
      }
      previousUserIdRef.current = nextUserId;

      let isRecovery = false;
      if (nextSession && nextUserId) {
        const storedRecoveryUserId = readStoredRecoveryUserId();
        isRecovery = Boolean(
          options.forceRecovery ||
          hadResetRoutePkceCodeRef.current ||
          storedRecoveryUserId === nextUserId ||
          sessionHasRecoveryAmr(nextSession),
        );

        if (isRecovery) {
          writeStoredRecoveryUserId(nextUserId);
          hadResetRoutePkceCodeRef.current = false;
        }
      } else {
        clearStoredRecoveryUserId();
      }

      if (!isMounted) {
        return;
      }

      setAuthState((prev) => ({
        status: nextSession ? 'authenticated' : 'unauthenticated',
        session: nextSession,
        isPasswordRecoverySession: isRecovery,
        recoveryError:
          options.explicitRecoveryError !== undefined
            ? options.explicitRecoveryError
            : nextSession
              ? null
              : prev.recoveryError,
      }));
    };

    // Single `onAuthStateChange` subscription per AuthProvider mount.
    // Never `await` or invoke Supabase SDK methods inside this callback.
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        applySessionTransition(nextSession, { forceRecovery: true });
        return;
      }

      if (event === 'SIGNED_OUT') {
        applySessionTransition(null, { isSignOutEvent: true });
        return;
      }

      applySessionTransition(nextSession);
    });

    void supabaseClient.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) {
          return;
        }

        if (error) {
          const translated = translateOrganizerAuthError(error);
          applySessionTransition(null, {
            explicitRecoveryError:
              hadResetRoutePkceCodeRef.current || initialInspection.initialRecoveryError
                ? translated.message
                : null,
          });
          hadResetRoutePkceCodeRef.current = false;
          return;
        }

        if (!data.session && hadResetRoutePkceCodeRef.current) {
          const expiredError = translateOrganizerAuthError({
            code: 'otp_expired',
            message: 'Email link is invalid or has expired',
          });
          hadResetRoutePkceCodeRef.current = false;
          applySessionTransition(null, { explicitRecoveryError: expiredError.message });
          return;
        }

        applySessionTransition(data.session);
      })
      .catch((unknownError: unknown) => {
        if (!isMounted) {
          return;
        }
        const translated = translateOrganizerAuthError(unknownError);
        applySessionTransition(null, {
          explicitRecoveryError: hadResetRoutePkceCodeRef.current ? translated.message : null,
        });
        hadResetRoutePkceCodeRef.current = false;
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [initialInspection.initialRecoveryError, queryClient, supabaseClient]);

  const clearPasswordRecoveryState = useCallback((): void => {
    clearStoredRecoveryUserId();
    hadResetRoutePkceCodeRef.current = false;
    setAuthState((prev) => ({
      ...prev,
      isPasswordRecoverySession: false,
      recoveryError: null,
    }));
  }, []);

  const handleSignOut = useCallback(async (): Promise<void> => {
    clearStoredRecoveryUserId();
    hadResetRoutePkceCodeRef.current = false;
    if (!supabaseClient) {
      queryClient.clear();
      return;
    }
    try {
      await signOutOrganizer(supabaseClient);
    } finally {
      queryClient.clear();
      previousUserIdRef.current = null;
      setAuthState({
        status: 'unauthenticated',
        session: null,
        isPasswordRecoverySession: false,
        recoveryError: null,
      });
    }
  }, [queryClient, supabaseClient]);

  const contextValue = useMemo<OrganizerAuthContextValue>(
    () => ({
      configurationStatus: supabaseClient ? 'configured' : 'unconfigured',
      status: authState.status,
      session: authState.session,
      user: authState.session?.user ?? null,
      isPasswordRecoverySession: authState.isPasswordRecoverySession,
      recoveryError: authState.recoveryError,
      clearPasswordRecoveryState,
      signOut: handleSignOut,
    }),
    [
      authState.isPasswordRecoverySession,
      authState.recoveryError,
      authState.session,
      authState.status,
      clearPasswordRecoveryState,
      handleSignOut,
      supabaseClient,
    ],
  );

  return (
    <OrganizerAuthContext.Provider value={contextValue}>{children}</OrganizerAuthContext.Provider>
  );
}
