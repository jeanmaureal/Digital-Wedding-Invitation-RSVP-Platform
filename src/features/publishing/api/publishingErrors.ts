export type PublishingErrorCode =
  | 'UNCONFIGURED'
  | 'INSUFFICIENT_WORKSPACE_ROLE'
  | 'ARCHIVED_WEDDING_CANNOT_PUBLISH'
  | 'NO_VISIBLE_SECTIONS_TO_PUBLISH'
  | 'PUBLISHED_VERSION_NOT_FOUND'
  | 'WEDDING_NOT_FOUND'
  | 'UNSAFE_DESIGN_PAYLOAD'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export class PublishingDomainError extends Error {
  readonly code: PublishingErrorCode;

  constructor(code: PublishingErrorCode, message: string) {
    super(message);
    this.name = 'PublishingDomainError';
    this.code = code;
  }
}

interface PostgrestErrorShape {
  readonly code?: string;
  readonly message?: string;
}

export function translatePublishingError(rawError: unknown): PublishingDomainError {
  if (rawError instanceof PublishingDomainError) {
    return rawError;
  }

  const candidate = rawError as PostgrestErrorShape | null | undefined;
  const rawMessage = typeof candidate?.message === 'string' ? candidate.message.trim() : '';
  const sqlState = typeof candidate?.code === 'string' ? candidate.code.trim() : '';

  if (rawMessage.includes('ARCHIVED_WEDDING_CANNOT_PUBLISH:')) {
    return new PublishingDomainError(
      'ARCHIVED_WEDDING_CANNOT_PUBLISH',
      'Restore this archived wedding project to Draft before publishing or activating a snapshot.',
    );
  }

  if (rawMessage.includes('NO_VISIBLE_SECTIONS_TO_PUBLISH:')) {
    return new PublishingDomainError(
      'NO_VISIBLE_SECTIONS_TO_PUBLISH',
      'Enable at least one visible invitation section before publishing.',
    );
  }

  if (rawMessage.includes('PUBLISHED_VERSION_NOT_FOUND:')) {
    return new PublishingDomainError(
      'PUBLISHED_VERSION_NOT_FOUND',
      'That historical snapshot version could not be found for this wedding project.',
    );
  }

  if (rawMessage.includes('UNSAFE_DESIGN_PAYLOAD:')) {
    return new PublishingDomainError(
      'UNSAFE_DESIGN_PAYLOAD',
      'Unsafe script or URI scheme detected in invitation content.',
    );
  }

  if (sqlState === 'P0002' || rawMessage.includes('WEDDING_NOT_FOUND:')) {
    return new PublishingDomainError(
      'WEDDING_NOT_FOUND',
      'Wedding project was not found in the active workspace.',
    );
  }

  if (sqlState === '42501' || rawMessage.includes('INSUFFICIENT_WORKSPACE_ROLE:')) {
    return new PublishingDomainError(
      'INSUFFICIENT_WORKSPACE_ROLE',
      'Only workspace owners, admins, and editors can publish, unpublish, or roll back wedding websites.',
    );
  }

  if (sqlState === '22023' || rawMessage.includes('VALIDATION_ERROR:')) {
    return new PublishingDomainError(
      'VALIDATION_ERROR',
      rawMessage || 'Invalid wedding configuration for publishing.',
    );
  }

  return new PublishingDomainError(
    'UNKNOWN',
    rawMessage || 'An unexpected error occurred while updating publication status.',
  );
}
