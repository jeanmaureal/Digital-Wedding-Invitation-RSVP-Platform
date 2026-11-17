import type { JSX } from 'react';
import { OrganizerLayout } from '@/app/layouts/OrganizerLayout';
import { AuthProvider } from '@/features/auth/context/AuthProvider';
import { ActiveWorkspaceProvider } from '@/features/workspace/context/ActiveWorkspaceProvider';

/**
 * Lazy-loaded root boundary for `/app/*` (`P1-AC08`, `P1-AC09`, `P1-AC14`).
 * Mounts `AuthProvider` and `ActiveWorkspaceProvider` exclusively on organizer routes
 * so public wedding and invitation routes (`/`, `/w/:slug`, `/i/:token`) never initialize
 * organizer auth or workspace state.
 */
export function OrganizerPortalRoot(): JSX.Element {
  return (
    <AuthProvider>
      <ActiveWorkspaceProvider>
        <OrganizerLayout />
      </ActiveWorkspaceProvider>
    </AuthProvider>
  );
}
