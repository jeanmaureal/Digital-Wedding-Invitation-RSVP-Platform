export type WorkspaceDomainErrorCode =
  | 'UNCONFIGURED'
  | 'AUTH_REQUIRED'
  | 'WORKSPACE_ACCESS_DENIED'
  | 'INSUFFICIENT_WORKSPACE_ROLE'
  | 'VALIDATION_ERROR'
  | 'ORGANIZER_NOT_REGISTERED'
  | 'WORKSPACE_MEMBER_NOT_FOUND'
  | 'WORKSPACE_SLUG_TAKEN'
  | 'MEMBER_ALREADY_EXISTS'
  | 'LAST_WORKSPACE_OWNER_REQUIRED'
  | 'CONCURRENCY_CONFLICT'
  | 'NETWORK_OR_UNKNOWN';

export class WorkspaceDomainError extends Error {
  readonly code: WorkspaceDomainErrorCode;

  constructor(code: WorkspaceDomainErrorCode, message: string) {
    super(message);
    this.name = 'WorkspaceDomainError';
    this.code = code;
  }
}

interface PostgresErrorLike {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly details?: unknown;
}

function readErrorParts(error: unknown): { code: string; message: string } {
  if (error && typeof error === 'object') {
    const candidate = error as PostgresErrorLike;
    return {
      code: typeof candidate.code === 'string' ? candidate.code.toUpperCase() : '',
      message: typeof candidate.message === 'string' ? candidate.message : '',
    };
  }
  if (typeof error === 'string') {
    return { code: '', message: error };
  }
  return { code: '', message: '' };
}

/**
 * Translates PostgreSQL `SQLSTATE` + domain prefixes from Phase 1 RPCs/RLS into
 * deterministic, safe user-facing messages (`Section 2.3` of Phase 1 Plan).
 */
export function translateWorkspaceError(error: unknown): WorkspaceDomainError {
  if (error instanceof WorkspaceDomainError) {
    return error;
  }

  const { code, message } = readErrorParts(error);

  if (message.includes('LAST_WORKSPACE_OWNER_REQUIRED')) {
    return new WorkspaceDomainError(
      'LAST_WORKSPACE_OWNER_REQUIRED',
      'At least one workspace owner must remain. Promote another member to owner before demoting or leaving.',
    );
  }

  if (message.includes('ORGANIZER_NOT_REGISTERED')) {
    return new WorkspaceDomainError(
      'ORGANIZER_NOT_REGISTERED',
      'No registered organizer account matches that email yet. Ask them to create an organizer account first.',
    );
  }

  if (message.includes('WORKSPACE_MEMBER_NOT_FOUND')) {
    return new WorkspaceDomainError(
      'WORKSPACE_MEMBER_NOT_FOUND',
      'That workspace member could not be found. Refresh the member list and try again.',
    );
  }

  if (
    message.includes('WORKSPACE_SLUG_TAKEN') ||
    (code === '23505' && message.toLowerCase().includes('workspaces_slug_key'))
  ) {
    return new WorkspaceDomainError(
      'WORKSPACE_SLUG_TAKEN',
      'That workspace URL slug is already in use. Choose a different slug.',
    );
  }

  if (
    message.includes('MEMBER_ALREADY_EXISTS') ||
    (code === '23505' && message.toLowerCase().includes('workspace_members'))
  ) {
    return new WorkspaceDomainError(
      'MEMBER_ALREADY_EXISTS',
      'That organizer is already a member of this workspace.',
    );
  }

  if (message.includes('INSUFFICIENT_WORKSPACE_ROLE')) {
    return new WorkspaceDomainError(
      'INSUFFICIENT_WORKSPACE_ROLE',
      'Your current workspace role does not allow this action.',
    );
  }

  if (message.includes('WORKSPACE_ACCESS_DENIED')) {
    return new WorkspaceDomainError(
      'WORKSPACE_ACCESS_DENIED',
      'You no longer have access to this workspace.',
    );
  }

  if (message.includes('AUTH_REQUIRED') || code === '42501') {
    return new WorkspaceDomainError(
      'INSUFFICIENT_WORKSPACE_ROLE',
      'You do not have permission to perform this workspace action.',
    );
  }

  if (message.includes('VALIDATION_ERROR') || code === '22023' || code === '23514') {
    return new WorkspaceDomainError(
      'VALIDATION_ERROR',
      'Check your workspace details and make sure all fields meet formatting rules.',
    );
  }

  if (code === '40P01' || code === '40001') {
    return new WorkspaceDomainError(
      'CONCURRENCY_CONFLICT',
      'Another workspace change occurred at the same moment. Please try your action again.',
    );
  }

  return new WorkspaceDomainError(
    'NETWORK_OR_UNKNOWN',
    'Unable to complete that workspace change right now. Check your connection and try again.',
  );
}
