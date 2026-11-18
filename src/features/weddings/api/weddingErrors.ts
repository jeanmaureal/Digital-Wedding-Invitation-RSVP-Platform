export type WeddingErrorCode =
  | 'UNCONFIGURED'
  | 'AUTH_REQUIRED'
  | 'WORKSPACE_ACCESS_DENIED'
  | 'INSUFFICIENT_WORKSPACE_ROLE'
  | 'WEDDING_SLUG_TAKEN'
  | 'RESERVED_WEDDING_SLUG'
  | 'INVALID_TIMEZONE'
  | 'WEDDING_NOT_FOUND'
  | 'PUBLISHING_REQUIRES_SNAPSHOT'
  | 'VALIDATION_ERROR'
  | 'CONCURRENCY_RETRY'
  | 'UNKNOWN';

export class WeddingDomainError extends Error {
  readonly code: WeddingErrorCode;

  constructor(code: WeddingErrorCode, message: string) {
    super(message);
    this.name = 'WeddingDomainError';
    this.code = code;
  }
}

interface PostgrestErrorShape {
  readonly code?: string;
  readonly message?: string;
  readonly details?: string | null;
}

const KNOWN_PREFIXES: ReadonlyArray<{
  readonly prefix: string;
  readonly code: WeddingErrorCode;
}> = [
  { prefix: 'AUTH_REQUIRED:', code: 'AUTH_REQUIRED' },
  { prefix: 'WORKSPACE_ACCESS_DENIED:', code: 'WORKSPACE_ACCESS_DENIED' },
  { prefix: 'INSUFFICIENT_WORKSPACE_ROLE:', code: 'INSUFFICIENT_WORKSPACE_ROLE' },
  { prefix: 'WEDDING_SLUG_TAKEN:', code: 'WEDDING_SLUG_TAKEN' },
  { prefix: 'RESERVED_WEDDING_SLUG:', code: 'RESERVED_WEDDING_SLUG' },
  { prefix: 'INVALID_TIMEZONE:', code: 'INVALID_TIMEZONE' },
  { prefix: 'WEDDING_NOT_FOUND:', code: 'WEDDING_NOT_FOUND' },
  { prefix: 'PUBLISHING_REQUIRES_SNAPSHOT:', code: 'PUBLISHING_REQUIRES_SNAPSHOT' },
  { prefix: 'VALIDATION_ERROR:', code: 'VALIDATION_ERROR' },
];

export function translateWeddingError(rawError: unknown): WeddingDomainError {
  if (rawError instanceof WeddingDomainError) {
    return rawError;
  }

  const candidate = rawError as PostgrestErrorShape | null | undefined;
  const rawMessage = typeof candidate?.message === 'string' ? candidate.message.trim() : '';
  const sqlState = typeof candidate?.code === 'string' ? candidate.code.trim() : '';

  for (const item of KNOWN_PREFIXES) {
    if (rawMessage.includes(item.prefix)) {
      const cleanMessage = rawMessage
        .slice(rawMessage.indexOf(item.prefix) + item.prefix.length)
        .trim();
      return new WeddingDomainError(
        item.code,
        cleanMessage || 'Unable to complete that wedding project action.',
      );
    }
  }

  if (sqlState === '23505') {
    return new WeddingDomainError(
      'WEDDING_SLUG_TAKEN',
      'That public wedding URL slug is already in use.',
    );
  }

  if (sqlState === '40P01' || sqlState === '40001') {
    return new WeddingDomainError(
      'CONCURRENCY_RETRY',
      'Another workspace update completed at the same time. Please retry.',
    );
  }

  if (sqlState === '42501') {
    return new WeddingDomainError(
      'INSUFFICIENT_WORKSPACE_ROLE',
      'You do not have permission to perform this action in the current workspace.',
    );
  }

  if (sqlState === '22023') {
    return new WeddingDomainError(
      'VALIDATION_ERROR',
      rawMessage || 'Check the wedding fields and try again.',
    );
  }

  return new WeddingDomainError(
    'UNKNOWN',
    rawMessage || 'An unexpected error occurred while saving this wedding project.',
  );
}
