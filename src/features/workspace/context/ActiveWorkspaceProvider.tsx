import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type JSX, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';
import {
  fetchUserWorkspaceMemberships,
  type OrganizerWorkspaceMembership,
} from '@/features/workspace/api/workspaceApi';
import { translateWorkspaceError } from '@/features/workspace/api/workspaceErrors';
import {
  ActiveWorkspaceContext,
  type ActiveWorkspaceContextValue,
} from '@/features/workspace/context/activeWorkspaceContext';
import {
  clearStoredActiveWorkspaceId,
  readStoredActiveWorkspaceId,
  writeStoredActiveWorkspaceId,
} from '@/features/workspace/context/activeWorkspaceStorage';
import { workspaceQueryKeys } from '@/features/workspace/queryKeys';

const EMPTY_MEMBERSHIPS: readonly OrganizerWorkspaceMembership[] = [];

export interface ActiveWorkspaceProviderProps {
  readonly children: ReactNode;
}

export function ActiveWorkspaceProvider({ children }: ActiveWorkspaceProviderProps): JSX.Element {
  const { status, user, isPasswordRecoverySession } = useOrganizerAuth();
  const queryClient = useQueryClient();
  const [selectedByUser, setSelectedByUser] = useState<Readonly<Record<string, string>>>({});

  const userId =
    status === 'authenticated' && !isPasswordRecoverySession ? (user?.id ?? null) : null;

  const membershipsQuery = useQuery({
    queryKey: userId
      ? workspaceQueryKeys.memberships(userId)
      : ['workspace', 'anonymous', 'memberships'],
    queryFn: () => {
      if (!userId) {
        return Promise.resolve(EMPTY_MEMBERSHIPS);
      }
      return fetchUserWorkspaceMemberships(userId);
    },
    enabled: Boolean(userId),
  });

  const memberships = membershipsQuery.data ?? EMPTY_MEMBERSHIPS;

  const candidateWorkspaceId = useMemo<string | null>(() => {
    if (!userId) {
      return null;
    }
    return selectedByUser[userId] ?? readStoredActiveWorkspaceId(userId);
  }, [selectedByUser, userId]);

  const activeMembership = useMemo<OrganizerWorkspaceMembership | null>(() => {
    if (!userId || memberships.length === 0) {
      return null;
    }
    if (candidateWorkspaceId) {
      const matched = memberships.find(
        (entry) => entry.workspace.id.toLowerCase() === candidateWorkspaceId.toLowerCase(),
      );
      if (matched) {
        return matched;
      }
    }
    return memberships[0] ?? null;
  }, [candidateWorkspaceId, memberships, userId]);

  // Synchronize validated server state with `localStorage` and evict stale workspace query caches (`P1-AC08`).
  useEffect(() => {
    if (!userId || !membershipsQuery.isSuccess) {
      return;
    }

    const resolvedId = activeMembership?.workspace.id ?? null;

    if (
      candidateWorkspaceId &&
      (!resolvedId || resolvedId.toLowerCase() !== candidateWorkspaceId.toLowerCase())
    ) {
      queryClient.removeQueries({
        queryKey: workspaceQueryKeys.workspaceScope(userId, candidateWorkspaceId),
      });
    }

    if (resolvedId) {
      writeStoredActiveWorkspaceId(userId, resolvedId);
    } else {
      clearStoredActiveWorkspaceId(userId);
    }
  }, [activeMembership, candidateWorkspaceId, membershipsQuery.isSuccess, queryClient, userId]);

  const selectActiveWorkspace = useCallback(
    (workspaceId: string): void => {
      if (!userId) {
        return;
      }
      const isMember = memberships.some(
        (entry) => entry.workspace.id.toLowerCase() === workspaceId.toLowerCase(),
      );
      if (!isMember) {
        return;
      }
      const normalized = workspaceId.toLowerCase();
      writeStoredActiveWorkspaceId(userId, normalized);
      setSelectedByUser((prev) => ({
        ...prev,
        [userId]: normalized,
      }));
    },
    [memberships, userId],
  );

  const activateCreatedWorkspace = useCallback(
    async (workspaceId: string): Promise<void> => {
      if (!userId) {
        return;
      }
      const normalized = workspaceId.toLowerCase();
      writeStoredActiveWorkspaceId(userId, normalized);
      setSelectedByUser((prev) => ({
        ...prev,
        [userId]: normalized,
      }));
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.memberships(userId),
      });
    },
    [queryClient, userId],
  );

  const handleWorkspaceRemoved = useCallback(
    async (removedWorkspaceId: string): Promise<void> => {
      if (!userId) {
        return;
      }
      const normalized = removedWorkspaceId.toLowerCase();
      queryClient.removeQueries({
        queryKey: workspaceQueryKeys.workspaceScope(userId, normalized),
      });
      if (readStoredActiveWorkspaceId(userId) === normalized) {
        clearStoredActiveWorkspaceId(userId);
      }
      setSelectedByUser((prev) => {
        if (prev[userId] !== normalized) {
          return prev;
        }
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.memberships(userId),
      });
    },
    [queryClient, userId],
  );

  const refreshMemberships = useCallback(async (): Promise<void> => {
    if (!userId) {
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: workspaceQueryKeys.memberships(userId),
    });
  }, [queryClient, userId]);

  const membershipsError = membershipsQuery.isError
    ? translateWorkspaceError(membershipsQuery.error).message
    : null;

  const contextValue = useMemo<ActiveWorkspaceContextValue>(
    () => ({
      isLoadingMemberships: Boolean(userId) && membershipsQuery.isPending,
      membershipsError,
      memberships,
      activeMembership,
      activeWorkspaceId: activeMembership?.workspace.id ?? null,
      selectActiveWorkspace,
      activateCreatedWorkspace,
      handleWorkspaceRemoved,
      refreshMemberships,
    }),
    [
      activateCreatedWorkspace,
      activeMembership,
      handleWorkspaceRemoved,
      memberships,
      membershipsError,
      membershipsQuery.isPending,
      refreshMemberships,
      selectActiveWorkspace,
      userId,
    ],
  );

  return (
    <ActiveWorkspaceContext.Provider value={contextValue}>
      {children}
    </ActiveWorkspaceContext.Provider>
  );
}
