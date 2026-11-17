import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appRoutes } from '@/app/router/router';
import * as organizerClientModule from '@/lib/supabase/organizerClient';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

function buildFakeUser(id: string, email: string): User {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: 'Organizer Test' },
    created_at: '2026-11-12T00:00:00.000Z',
  };
}

function buildFakeSession(user: User, accessToken = 'header.eyJhbXIiOltdfQ.sig'): Session {
  return {
    access_token: accessToken,
    refresh_token: `refresh-${user.id}`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };
}

interface FakeAuthHarness {
  readonly client: TypedSupabaseClient;
  emitAuthEvent: (event: AuthChangeEvent, session: Session | null) => void;
  setSessionSilently: (session: Session | null) => void;
  readonly mocks: {
    readonly signInWithPassword: ReturnType<typeof vi.fn>;
    readonly signUp: ReturnType<typeof vi.fn>;
    readonly signOut: ReturnType<typeof vi.fn>;
    readonly resetPasswordForEmail: ReturnType<typeof vi.fn>;
    readonly updateUser: ReturnType<typeof vi.fn>;
  };
}

function createFakeAuthHarness(initialSession: Session | null = null): FakeAuthHarness {
  let currentSession: Session | null = initialSession;
  const listeners = new Set<AuthListener>();

  const emitAuthEvent = (event: AuthChangeEvent, nextSession: Session | null): void => {
    currentSession = nextSession;
    for (const listener of listeners) {
      listener(event, nextSession);
    }
  };

  const signInWithPassword = vi.fn(
    async ({ email, password }: { email: string; password: string }) => {
      if (password === 'WrongPassword123!') {
        return {
          data: { user: null, session: null },
          error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
        };
      }
      const user = buildFakeUser('11111111-1111-4111-8111-111111111111', email);
      const session = buildFakeSession(user);
      emitAuthEvent('SIGNED_IN', session);
      return { data: { user, session }, error: null };
    },
  );

  const signUp = vi.fn(async ({ email }: { email: string }) => {
    if (email === 'existing@studio.com') {
      const obfuscatedDuplicate = {
        ...buildFakeUser('22222222-2222-4222-8222-222222222222', email),
        identities: [],
      };
      return { data: { user: obfuscatedDuplicate, session: null }, error: null };
    }

    const createdUser = {
      ...buildFakeUser('33333333-3333-4333-8333-333333333333', email),
      identities: [{ id: 'ident-1' }],
    };
    return { data: { user: createdUser, session: null }, error: null };
  });

  const signOut = vi.fn(async () => {
    emitAuthEvent('SIGNED_OUT', null);
    return { error: null };
  });

  const resetPasswordForEmail = vi.fn(async () => ({ data: {}, error: null }));

  const updateUser = vi.fn(async ({ password }: { password?: string }) => {
    if (password === 'SameOldPassword123!') {
      return {
        data: { user: null },
        error: {
          code: 'same_password',
          message: 'New password should be different from the old password.',
        },
      };
    }
    const activeUser =
      currentSession?.user ?? buildFakeUser('11111111-1111-4111-8111-111111111111', 'a@b.com');
    return { data: { user: activeUser }, error: null };
  });

  const buildEmptySelectBuilder = () => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(async () => ({ data: [], error: null })),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    return builder;
  };

  const fakeClient = {
    from: vi.fn(() => buildEmptySelectBuilder()),
    rpc: vi.fn(async () => ({
      data: { status: 'ok', timestamp: '2026-11-12T00:00:00.000Z' },
      error: null,
    })),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: currentSession }, error: null })),
      onAuthStateChange: vi.fn((callback: AuthListener) => {
        listeners.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                listeners.delete(callback);
              },
            },
          },
        };
      }),
      signInWithPassword,
      signUp,
      signOut,
      resetPasswordForEmail,
      updateUser,
    },
  } as unknown as TypedSupabaseClient;

  return {
    client: fakeClient,
    emitAuthEvent,
    setSessionSilently: (next) => {
      currentSession = next;
    },
    mocks: {
      signInWithPassword,
      signUp,
      signOut,
      resetPasswordForEmail,
      updateUser,
    },
  };
}

function renderWithQueryClient(initialPath: string, queryClient = new QueryClient()) {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [initialPath],
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient, ...view };
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('Organizer Auth Lifecycle & Session Isolation (P1-AC06, P1-AC07)', () => {
  it('renders offline unconfigured notice and disables sign-in when Supabase env is omitted', async () => {
    vi.spyOn(organizerClientModule, 'getOrganizerSupabaseClient').mockReturnValue(null);

    renderWithQueryClient('/app/login');

    expect(await screen.findByTestId('auth-unconfigured-notice')).toBeInTheDocument();
    expect(screen.getByTestId('login-submit-button')).toBeDisabled();
  });

  it('translates invalid credentials, signs in cleanly, honors allowlisted redirectTo, and clears QueryClient on sign-out', async () => {
    const user = userEvent.setup();
    const harness = createFakeAuthHarness();
    vi.spyOn(organizerClientModule, 'getOrganizerSupabaseClient').mockReturnValue(harness.client);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['workspace', 'user-1', 'cached'], { name: 'Secret Workspace' });

    const { router } = renderWithQueryClient('/app/settings', queryClient);

    // Unauthenticated /app/settings redirects to /app/login?redirectTo=%2Fapp%2Fsettings
    expect(await screen.findByTestId('route-organizer-login')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?redirectTo=%2Fapp%2Fsettings');

    // Attempt invalid password first
    await user.type(screen.getByLabelText(/email address/i), '  Organizer@Studio.COM ');
    await user.type(screen.getByLabelText(/^password$/i), 'WrongPassword123!');
    await user.click(screen.getByTestId('login-submit-button'));

    expect(await screen.findByTestId('auth-form-error')).toHaveTextContent(
      /invalid email or password/i,
    );

    // Correct password -> navigates to /app/settings
    await user.clear(screen.getByLabelText(/^password$/i));
    await user.type(screen.getByLabelText(/^password$/i), 'CorrectPassword123!');
    await user.click(screen.getByTestId('login-submit-button'));

    expect(await screen.findByTestId('route-organizer-settings')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app/settings');
    expect(harness.mocks.signInWithPassword).toHaveBeenLastCalledWith({
      email: 'organizer@studio.com',
      password: 'CorrectPassword123!',
    });

    // Seed workspace query cache under signed-in user, then sign out -> cache must be wiped
    queryClient.setQueryData(
      ['workspace', '11111111-1111-4111-8111-111111111111', 'list'],
      ['ws-1'],
    );
    await user.click(screen.getByTestId('organizer-signout-button'));

    expect(await screen.findByTestId('route-organizer-login')).toBeInTheDocument();
    expect(
      queryClient.getQueryData(['workspace', '11111111-1111-4111-8111-111111111111', 'list']),
    ).toBeUndefined();
  });

  it('clears QueryClient cache when switching directly from User A to User B session', async () => {
    const userA = buildFakeUser('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@studio.com');
    const userB = buildFakeUser('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@studio.com');
    const harness = createFakeAuthHarness(buildFakeSession(userA));
    vi.spyOn(organizerClientModule, 'getOrganizerSupabaseClient').mockReturnValue(harness.client);

    const queryClient = new QueryClient();
    renderWithQueryClient('/app/settings', queryClient);

    expect(await screen.findByTestId('route-organizer-settings')).toBeInTheDocument();
    queryClient.setQueryData(['workspace', userA.id, 'list'], ['workspace-a']);

    act(() => {
      harness.emitAuthEvent('SIGNED_IN', buildFakeSession(userB));
    });

    expect(queryClient.getQueryData(['workspace', userA.id, 'list'])).toBeUndefined();
    expect(await screen.findByTestId('organizer-user-email')).toHaveTextContent('b@studio.com');
  });

  it('ignores malicious external redirectTo URLs on sign-in and lands safely on /app', async () => {
    const user = userEvent.setup();
    const harness = createFakeAuthHarness();
    vi.spyOn(organizerClientModule, 'getOrganizerSupabaseClient').mockReturnValue(harness.client);

    const { router } = renderWithQueryClient(
      '/app/login?redirectTo=https%3A%2F%2Fevil.example%2Fsteal',
    );

    expect(await screen.findByTestId('route-organizer-login')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/email address/i), 'safe@studio.com');
    await user.type(screen.getByLabelText(/^password$/i), 'ValidPassword123!');
    await user.click(screen.getByTestId('login-submit-button'));

    expect(await screen.findByTestId('route-organizer-root')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app');
  });

  it('handles sign-up email confirmation and obfuscated duplicate account detection', async () => {
    const user = userEvent.setup();
    const harness = createFakeAuthHarness();
    vi.spyOn(organizerClientModule, 'getOrganizerSupabaseClient').mockReturnValue(harness.client);

    renderWithQueryClient('/app/signup');
    expect(await screen.findByTestId('route-organizer-signup')).toBeInTheDocument();

    // Obfuscated duplicate (`identities: []`)
    await user.type(screen.getByLabelText(/full name/i), 'Alex Morgan');
    await user.type(screen.getByLabelText(/email address/i), 'existing@studio.com');
    await user.type(screen.getByLabelText(/^password$/i), 'ValidPassword123!');
    await user.type(screen.getByLabelText(/confirm password/i), 'ValidPassword123!');
    await user.click(screen.getByTestId('signup-submit-button'));

    expect(await screen.findByTestId('auth-form-error')).toHaveTextContent(/already exists/i);

    // Fresh organizer signup -> shows email confirmation notice
    await user.clear(screen.getByLabelText(/email address/i));
    await user.type(screen.getByLabelText(/email address/i), 'New.Organizer@Studio.com');
    await user.click(screen.getByTestId('signup-submit-button'));

    expect(await screen.findByTestId('signup-confirmation-notice')).toHaveTextContent(
      'new.organizer@studio.com',
    );
  });

  it('validates PKCE password recovery states (direct visit, expired link, refresh persistence, and update)', async () => {
    const user = userEvent.setup();
    const harness = createFakeAuthHarness();
    vi.spyOn(organizerClientModule, 'getOrganizerSupabaseClient').mockReturnValue(harness.client);

    // 1. Forgot password request
    const forgotView = renderWithQueryClient('/app/forgot-password');
    expect(await screen.findByTestId('route-organizer-forgot-password')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/email address/i), 'recover@studio.com');
    await user.click(screen.getByTestId('forgot-password-submit-button'));
    expect(await screen.findByTestId('forgot-password-sent-notice')).toHaveTextContent(
      'recover@studio.com',
    );
    forgotView.unmount();

    // 2. Direct unauthenticated visit to /app/reset-password -> blocked cleanly
    const directView = renderWithQueryClient('/app/reset-password');
    expect(await screen.findByTestId('reset-password-invalid-session')).toHaveTextContent(
      /recovery link required/i,
    );
    directView.unmount();

    // 3. Expired PKCE callback URL (?error_code=otp_expired) -> shows expired message & scrubs URL
    window.history.replaceState(
      {},
      '',
      '/app/reset-password?error=access_denied&error_code=otp_expired',
    );
    const expiredView = renderWithQueryClient('/app/reset-password');
    expect(await screen.findByTestId('reset-password-invalid-session')).toHaveTextContent(
      /expired or invalid/i,
    );
    expect(window.location.search).toBe('');
    expiredView.unmount();

    // 4. Valid PASSWORD_RECOVERY event -> form renders, survives refresh remount, and updates password
    const recoveryUser = buildFakeUser(
      '44444444-4444-4444-8444-444444444444',
      'recover@studio.com',
    );
    const recoverySession = buildFakeSession(recoveryUser);

    const activeRecoveryView = renderWithQueryClient('/app/reset-password');
    await screen.findByTestId('reset-password-invalid-session');
    act(() => {
      harness.emitAuthEvent('PASSWORD_RECOVERY', recoverySession);
    });
    expect(await screen.findByTestId('reset-password-submit-button')).toBeInTheDocument();

    // Unmount and remount to simulate browser reload on /app/reset-password before submitting
    activeRecoveryView.unmount();
    harness.setSessionSilently(recoverySession);

    const refreshedView = renderWithQueryClient('/app/reset-password');
    expect(await screen.findByTestId('reset-password-submit-button')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^new password$/i), 'UpdatedSecurePass123!');
    await user.type(screen.getByLabelText(/confirm new password/i), 'UpdatedSecurePass123!');
    await user.click(screen.getByTestId('reset-password-submit-button'));

    expect(await screen.findByTestId('reset-password-success-notice')).toBeInTheDocument();
    expect(harness.mocks.updateUser).toHaveBeenCalledWith({
      password: 'UpdatedSecurePass123!',
    });

    await user.click(screen.getByTestId('reset-password-continue-button'));
    expect(await screen.findByTestId('route-organizer-root')).toBeInTheDocument();
    expect(refreshedView.router.state.location.pathname).toBe('/app');
  });
});
