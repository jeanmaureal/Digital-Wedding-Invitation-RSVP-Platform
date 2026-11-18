import type { WorkspaceRole } from '@/features/workspace/schemas/workspaceSchemas';

/**
 * UX-ONLY WEDDING RBAC CAPABILITY HELPERS (`P2-AC05`).
 *
 * Architectural boundary:
 *   Supabase Auth establishes identity.
 *   PostgreSQL RLS policies and `SECURITY DEFINER` RPCs enforce authorization and invariants.
 *   These helpers exist strictly to render accurate controls and guidance in the React UI;
 *   they are NEVER a security boundary.
 */

export function canCreateOrEditWedding(callerRole: WorkspaceRole): boolean {
  return callerRole === 'owner' || callerRole === 'admin' || callerRole === 'editor';
}

export function canDuplicateWedding(callerRole: WorkspaceRole): boolean {
  return callerRole === 'owner' || callerRole === 'admin' || callerRole === 'editor';
}

export function canArchiveOrRestoreWedding(callerRole: WorkspaceRole): boolean {
  return callerRole === 'owner' || callerRole === 'admin' || callerRole === 'editor';
}

export function canPermanentlyDeleteWedding(callerRole: WorkspaceRole): boolean {
  return callerRole === 'owner' || callerRole === 'admin';
}
