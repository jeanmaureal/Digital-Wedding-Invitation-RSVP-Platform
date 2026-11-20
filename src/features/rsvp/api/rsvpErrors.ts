export type OrganizerRsvpErrorCode =
  | 'UNCONFIGURED'
  | 'INSUFFICIENT_WORKSPACE_ROLE'
  | 'UNSAFE_RSVP_PAYLOAD'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export class OrganizerRsvpDomainError extends Error {
  readonly code: OrganizerRsvpErrorCode;

  constructor(code: OrganizerRsvpErrorCode, message: string) {
    super(message);
    this.name = 'OrganizerRsvpDomainError';
    this.code = code;
  }
}

interface PostgrestErrorShape {
  readonly code?: string;
  readonly message?: string;
}

export function translateOrganizerRsvpError(rawError: unknown): OrganizerRsvpDomainError {
  if (rawError instanceof OrganizerRsvpDomainError) {
    return rawError;
  }

  const candidate = rawError as PostgrestErrorShape | null | undefined;
  const rawMessage = typeof candidate?.message === 'string' ? candidate.message.trim() : '';
  const sqlState = typeof candidate?.code === 'string' ? candidate.code.trim() : '';

  if (rawMessage.includes('UNSAFE_RSVP_PAYLOAD:')) {
    return new OrganizerRsvpDomainError(
      'UNSAFE_RSVP_PAYLOAD',
      'Unsafe script or URI markup is not permitted in RSVP question fields.',
    );
  }

  if (sqlState === '42501' || rawMessage.includes('INSUFFICIENT_WORKSPACE_ROLE:')) {
    return new OrganizerRsvpDomainError(
      'INSUFFICIENT_WORKSPACE_ROLE',
      'Only workspace owners, admins, and editors can configure custom RSVP questions.',
    );
  }

  if (sqlState === '22023' || rawMessage.includes('VALIDATION_ERROR:')) {
    return new OrganizerRsvpDomainError(
      'VALIDATION_ERROR',
      rawMessage.replace(/^VALIDATION_ERROR:\s*/i, '') || 'Invalid RSVP question configuration.',
    );
  }

  return new OrganizerRsvpDomainError(
    'UNKNOWN',
    rawMessage || 'An unexpected error occurred while managing RSVP settings.',
  );
}
