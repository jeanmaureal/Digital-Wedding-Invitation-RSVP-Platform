import type { Session, User } from '@supabase/supabase-js';
import { OrganizerAuthError, translateOrganizerAuthError } from '@/features/auth/api/authErrors';
import type {
  ForgotPasswordPayload,
  LoginPayload,
  ResetPasswordPayload,
  SignupPayload,
} from '@/features/auth/schemas/authSchemas';
import { ROUTES } from '@/lib/constants/routes';
import { getOrganizerSupabaseClient } from '@/lib/supabase/organizerClient';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

export type SignUpOrganizerResult =
  | {
      readonly kind: 'signed_in';
      readonly session: Session;
      readonly user: User;
    }
  | {
      readonly kind: 'confirmation_required';
      readonly email: string;
    };

function requireConfiguredClient(
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): TypedSupabaseClient {
  if (!client) {
    throw new OrganizerAuthError(
      'UNCONFIGURED',
      'Supabase authentication is not configured in this offline environment.',
    );
  }
  return client;
}

export function buildOrganizerCallbackUrl(
  targetPath: string,
  origin = window.location.origin,
): string {
  return new URL(targetPath, origin).toString();
}

export async function signInOrganizerWithPassword(
  payload: LoginPayload,
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<{ readonly session: Session; readonly user: User }> {
  const supabase = requireConfiguredClient(client);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: payload.email,
    password: payload.password,
  });

  if (error || !data.session || !data.user) {
    throw translateOrganizerAuthError(error ?? new Error('Invalid login credentials'));
  }

  return {
    session: data.session,
    user: data.user,
  };
}

export async function signUpOrganizer(
  payload: Omit<SignupPayload, 'confirmPassword'>,
  options?: {
    readonly emailRedirectTo?: string | undefined;
    readonly client?: TypedSupabaseClient | null | undefined;
  },
): Promise<SignUpOrganizerResult> {
  const supabase = requireConfiguredClient(options?.client);
  const emailRedirectTo =
    options?.emailRedirectTo ?? buildOrganizerCallbackUrl(ROUTES.organizerRoot);

  const { data, error } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: {
      emailRedirectTo,
      data: {
        full_name: payload.fullName,
      },
    },
  });

  if (error) {
    throw translateOrganizerAuthError(error);
  }

  // Supabase obfuscates duplicate signups when email confirmation is enabled by returning
  // a user object with an empty `identities` array instead of throwing an error.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new OrganizerAuthError(
      'USER_ALREADY_REGISTERED',
      'An organizer account with this email already exists. Sign in instead or reset your password.',
    );
  }

  if (data.session && data.user) {
    return {
      kind: 'signed_in',
      session: data.session,
      user: data.user,
    };
  }

  return {
    kind: 'confirmation_required',
    email: payload.email,
  };
}

export async function signOutOrganizer(
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<void> {
  const supabase = requireConfiguredClient(client);
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw translateOrganizerAuthError(error);
  }
}

export async function requestOrganizerPasswordReset(
  payload: ForgotPasswordPayload,
  options?: {
    readonly redirectTo?: string | undefined;
    readonly client?: TypedSupabaseClient | null | undefined;
  },
): Promise<void> {
  const supabase = requireConfiguredClient(options?.client);
  const redirectTo =
    options?.redirectTo ?? buildOrganizerCallbackUrl(ROUTES.organizerResetPassword);

  const { error } = await supabase.auth.resetPasswordForEmail(payload.email, {
    redirectTo,
  });

  if (error) {
    throw translateOrganizerAuthError(error);
  }
}

export async function updateOrganizerPassword(
  payload: Omit<ResetPasswordPayload, 'confirmPassword'>,
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<User> {
  const supabase = requireConfiguredClient(client);

  const { data, error } = await supabase.auth.updateUser({
    password: payload.password,
  });

  if (error || !data.user) {
    throw translateOrganizerAuthError(error ?? new Error('Auth session missing'));
  }

  return data.user;
}
