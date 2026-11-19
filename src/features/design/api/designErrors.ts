export type DesignErrorCode =
  | 'UNCONFIGURED'
  | 'INSUFFICIENT_WORKSPACE_ROLE'
  | 'WEDDING_NOT_FOUND'
  | 'SECTION_REORDER_MISMATCH'
  | 'UNSAFE_DESIGN_PAYLOAD'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'DESIGN_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export class DesignDomainError extends Error {
  readonly code: DesignErrorCode;

  constructor(code: DesignErrorCode, message: string) {
    super(message);
    this.name = 'DesignDomainError';
    this.code = code;
  }
}

interface PostgrestErrorShape {
  readonly code?: string;
  readonly message?: string;
}

export function translateDesignError(rawError: unknown): DesignDomainError {
  if (rawError instanceof DesignDomainError) {
    return rawError;
  }

  const candidate = rawError as PostgrestErrorShape | null | undefined;
  const rawMessage = typeof candidate?.message === 'string' ? candidate.message.trim() : '';
  const sqlState = typeof candidate?.code === 'string' ? candidate.code.trim() : '';

  if (rawMessage.includes('UNSAFE_DESIGN_PAYLOAD:')) {
    const clean = rawMessage.slice(rawMessage.indexOf('UNSAFE_DESIGN_PAYLOAD:') + 22).trim();
    return new DesignDomainError(
      'UNSAFE_DESIGN_PAYLOAD',
      clean || 'Unsafe script or URL detected in invitation design.',
    );
  }

  if (rawMessage.includes('SECTION_REORDER_MISMATCH:')) {
    const clean = rawMessage.slice(rawMessage.indexOf('SECTION_REORDER_MISMATCH:') + 25).trim();
    return new DesignDomainError(
      'SECTION_REORDER_MISMATCH',
      clean || 'Ordered section list must include every section of this wedding exactly once.',
    );
  }

  if (sqlState === 'P0002' || rawMessage.includes('WEDDING_NOT_FOUND:')) {
    return new DesignDomainError(
      'WEDDING_NOT_FOUND',
      'Wedding project was not found in the active workspace.',
    );
  }

  if (sqlState === '42501' || rawMessage.includes('INSUFFICIENT_WORKSPACE_ROLE:')) {
    return new DesignDomainError(
      'INSUFFICIENT_WORKSPACE_ROLE',
      'Only workspace owners, admins, and editors can update wedding design settings.',
    );
  }

  if (sqlState === '22023' || rawMessage.includes('VALIDATION_ERROR:')) {
    return new DesignDomainError(
      'VALIDATION_ERROR',
      rawMessage || 'Invalid invitation theme or section configuration.',
    );
  }

  return new DesignDomainError(
    'UNKNOWN',
    rawMessage || 'An unexpected error occurred while loading or saving the invitation design.',
  );
}
