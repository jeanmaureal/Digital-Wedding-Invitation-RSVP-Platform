export type GuestDomainErrorCode =
  | 'UNCONFIGURED'
  | 'INSUFFICIENT_WORKSPACE_ROLE'
  | 'WEDDING_NOT_FOUND'
  | 'HOUSEHOLD_NOT_FOUND'
  | 'INVITATION_NOT_FOUND'
  | 'INVALID_INVITATION_EXPIRY'
  | 'REVOKED_INVITATION_CANNOT_UPDATE'
  | 'CSV_IMPORT_VALIDATION_ERROR'
  | 'UNSAFE_GUEST_PAYLOAD'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export class GuestDomainError extends Error {
  readonly code: GuestDomainErrorCode;

  constructor(code: GuestDomainErrorCode, message: string) {
    super(message);
    this.name = 'GuestDomainError';
    this.code = code;
  }
}

interface PostgrestErrorShape {
  readonly code?: string;
  readonly message?: string;
}

export function translateGuestError(rawError: unknown): GuestDomainError {
  if (rawError instanceof GuestDomainError) {
    return rawError;
  }

  const candidate = rawError as PostgrestErrorShape | null | undefined;
  const rawMessage = typeof candidate?.message === 'string' ? candidate.message.trim() : '';
  const sqlState = typeof candidate?.code === 'string' ? candidate.code.trim() : '';

  if (rawMessage.includes('INVALID_INVITATION_EXPIRY:')) {
    return new GuestDomainError(
      'INVALID_INVITATION_EXPIRY',
      'Invitation expiration date and time must be set in the future.',
    );
  }

  if (
    rawMessage.includes('REVOKED_INVITATION_CANNOT_UPDATE:') ||
    rawMessage.includes('REVOKED_INVITATION_CANNOT_REACTIVATE:')
  ) {
    return new GuestDomainError(
      'REVOKED_INVITATION_CANNOT_UPDATE',
      'Revoked invitation links cannot be modified. Issue a rotated link instead.',
    );
  }

  if (rawMessage.includes('UNSAFE_GUEST_PAYLOAD:')) {
    return new GuestDomainError(
      'UNSAFE_GUEST_PAYLOAD',
      'Unsafe script or URI markup is not permitted in household or guest fields.',
    );
  }

  if (rawMessage.includes('CSV_IMPORT_VALIDATION_ERROR:')) {
    return new GuestDomainError(
      'CSV_IMPORT_VALIDATION_ERROR',
      rawMessage.replace(/^CSV_IMPORT_VALIDATION_ERROR:\s*/i, '') ||
        'CSV guest import validation failed; zero records were written.',
    );
  }

  if (rawMessage.includes('HOUSEHOLD_NOT_FOUND:')) {
    return new GuestDomainError(
      'HOUSEHOLD_NOT_FOUND',
      'Household group was not found in this wedding project.',
    );
  }

  if (rawMessage.includes('INVITATION_NOT_FOUND:')) {
    return new GuestDomainError(
      'INVITATION_NOT_FOUND',
      'Invitation link record was not found in this wedding project.',
    );
  }

  if (sqlState === 'P0002' || rawMessage.includes('WEDDING_NOT_FOUND:')) {
    return new GuestDomainError(
      'WEDDING_NOT_FOUND',
      'Wedding project was not found in the active workspace.',
    );
  }

  if (sqlState === '42501' || rawMessage.includes('INSUFFICIENT_WORKSPACE_ROLE:')) {
    return new GuestDomainError(
      'INSUFFICIENT_WORKSPACE_ROLE',
      'Only workspace owners, admins, and editors can modify guests or issue invitation links.',
    );
  }

  if (sqlState === '22023' || rawMessage.includes('VALIDATION_ERROR:')) {
    return new GuestDomainError(
      'VALIDATION_ERROR',
      rawMessage.replace(/^VALIDATION_ERROR:\s*/i, '') || 'Invalid household or guest details.',
    );
  }

  return new GuestDomainError(
    'UNKNOWN',
    rawMessage || 'An unexpected error occurred while managing guests and invitations.',
  );
}
