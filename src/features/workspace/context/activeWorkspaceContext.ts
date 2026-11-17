import { createContext, useContext } from 'react';
import type { OrganizerWorkspaceMembership } from '@/features/workspace/api/workspaceApi';

export interface ActiveWorkspaceContextValue {
  readonly isLoadingMemberships: boolean;
  readonly membershipsError: string | null;
  readonly memberships: readonly OrganizerWorkspaceMembership[];
  readonly activeMembership: OrganizerWorkspaceMembership | null;
  readonly activeWorkspaceId: string | null;
  readonly selectActiveWorkspace: (workspaceId: string) => void;
  readonly activateCreatedWorkspace: (workspaceId: string) => Promise<void>;
  readonly handleWorkspaceRemoved: (removedWorkspaceId: string) => Promise<void>;
  readonly refreshMemberships: () => Promise<void>;
}

export const ActiveWorkspaceContext = createContext<ActiveWorkspaceContextValue | null>(null);

export function useActiveWorkspace(): ActiveWorkspaceContextValue {
  const context = useContext(ActiveWorkspaceContext);
  if (!context) {
    throw new Error('useActiveWorkspace must be used within ActiveWorkspaceProvider.');
  }
  return context;
}
