import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

export type OrganizerAuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unconfigured';

export interface OrganizerAuthContextValue {
  readonly configurationStatus: 'configured' | 'unconfigured';
  readonly status: OrganizerAuthStatus;
  readonly session: Session | null;
  readonly user: User | null;
  readonly isPasswordRecoverySession: boolean;
  readonly recoveryError: string | null;
  readonly clearPasswordRecoveryState: () => void;
  readonly signOut: () => Promise<void>;
}

export const OrganizerAuthContext = createContext<OrganizerAuthContextValue | null>(null);

export function useOrganizerAuth(): OrganizerAuthContextValue {
  const context = useContext(OrganizerAuthContext);
  if (!context) {
    throw new Error('useOrganizerAuth must be used within an OrganizerPortalRoot AuthProvider.');
  }
  return context;
}
