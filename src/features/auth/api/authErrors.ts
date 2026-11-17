export type OrganizerAuthErrorCode =
  | 'UNCONFIGURED'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_CONFIRMED'
  | 'USER_ALREADY_REGISTERED'
  | 'WEAK_OR_SAME_PASSWORD'
  | 'RECOVERY_LINK_INVALID'
  | 'RATE_LIMITED'
  | 'PROFILE_EMAIL_REQUIRED'
  | 'SOLE_WORKSPACE_OWNER_DELETE_BLOCKED'
  | 'NETWORK_OR_UNKNOWN';

export class OrganizerAuthError extends Error {
  readonly code: OrganizerAuthErrorCode;

  constructor(code: OrganizerAuthErrorCode, message: string) {
    super(message);
    this.name = 'OrganizerAuthError';
    this.code = code;
  }
}

interface ErrorLike {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly status?: unknown;
}

function extractCodeAndMessage(error: unknown): { code: string; message: string } {
  if (error && typeof error === 'object') {
    const candidate = error as ErrorLike;
    return {
      code: typeof candidate.code === 'string' ? candidate.code.toLowerCase() : '',
      message: typeof candidate.message === 'string' ? candidate.message : '',
    };
  }
  if (typeof error === 'string') {
    return { code: '', message: error };
  }
  return { code: '', message: '' };
}

export function translateOrganizerAuthError(error: unknown): OrganizerAuthError {
  if (error instanceof OrganizerAuthError) {
    return error;
  }

  const { code, message } = extractCodeAndMessage(error);
  const lowerMessage = message.toLowerCase();

  if (message.includes('PROFILE_EMAIL_REQUIRED')) {
    return new OrganizerAuthError(
      'PROFILE_EMAIL_REQUIRED',
      'A valid organizer email address is required to create or update an account.',
    );
  }

  if (message.includes('SOLE_WORKSPACE_OWNER_DELETE_BLOCKED')) {
    return new OrganizerAuthError(
      'SOLE_WORKSPACE_OWNER_DELETE_BLOCKED',
      'Transfer workspace ownership or delete sole-owned workspaces before deleting this account.',
    );
  }

  if (
    code === 'invalid_credentials' ||
    lowerMessage.includes('invalid login credentials') ||
    lowerMessage.includes('invalid email or password')
  ) {
    return new OrganizerAuthError(
      'INVALID_CREDENTIALS',
      'Invalid email or password. Check your credentials and try again.',
    );
  }

  if (code === 'email_not_confirmed' || lowerMessage.includes('email not confirmed')) {
    return new OrganizerAuthError(
      'EMAIL_NOT_CONFIRMED',
      'Confirm your email address from the verification link sent to your inbox before signing in.',
    );
  }

  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    lowerMessage.includes('user already registered')
  ) {
    return new OrganizerAuthError(
      'USER_ALREADY_REGISTERED',
      'An organizer account with this email already exists. Sign in instead or reset your password.',
    );
  }

  if (code === 'same_password' || lowerMessage.includes('different from the old password')) {
    return new OrganizerAuthError(
      'WEAK_OR_SAME_PASSWORD',
      'Choose a new password that is different from your current password.',
    );
  }

  if (code === 'weak_password' || lowerMessage.includes('password should be at least')) {
    return new OrganizerAuthError(
      'WEAK_OR_SAME_PASSWORD',
      'Choose a stronger password with at least 8 characters.',
    );
  }

  if (
    code === 'otp_expired' ||
    code === 'flow_state_not_found' ||
    code === 'flow_state_expired' ||
    code === 'bad_code_verifier' ||
    code === 'validation_failed' ||
    lowerMessage.includes('email link is invalid or has expired') ||
    lowerMessage.includes('auth session missing') ||
    lowerMessage.includes('code verifier') ||
    lowerMessage.includes('flow state')
  ) {
    return new OrganizerAuthError(
      'RECOVERY_LINK_INVALID',
      'This password recovery link is invalid, expired, or has already been used. Request a fresh reset link.',
    );
  }

  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('for security purposes, you can only request this')
  ) {
    return new OrganizerAuthError(
      'RATE_LIMITED',
      'Too many authentication requests in a short period. Wait a moment and try again.',
    );
  }

  return new OrganizerAuthError(
    'NETWORK_OR_UNKNOWN',
    'Unable to complete authentication right now. Check your connection and try again.',
  );
}
