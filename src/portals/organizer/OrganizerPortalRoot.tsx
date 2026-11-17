import type { JSX } from 'react';
import { OrganizerLayout } from '@/app/layouts/OrganizerLayout';
import { AuthProvider } from '@/features/auth/context/AuthProvider';

/**
 * Lazy-loaded root boundary for `/app/*` (`P1-AC09`, `P1-AC14`).
 * Mounts `AuthProvider` exclusively on organizer routes so public wedding and
 * invitation routes (`/`, `/w/:slug`, `/i/:token`) never initialize organizer auth.
 */
export function OrganizerPortalRoot(): JSX.Element {
  return (
    <AuthProvider>
      <OrganizerLayout />
    </AuthProvider>
  );
}
