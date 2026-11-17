import { WifiOff } from 'lucide-react';
import type { JSX } from 'react';

export function AuthUnconfiguredNotice(): JSX.Element {
  return (
    <div
      role="status"
      data-testid="auth-unconfigured-notice"
      className="bg-muted/70 text-muted-foreground flex items-start gap-3 rounded-lg border p-3.5 text-xs leading-relaxed"
    >
      <WifiOff className="text-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="text-foreground font-medium">Offline local environment</p>
        <p>
          Supabase authentication is not configured. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env</code> to enable organizer
          sign-in, registration, and password recovery.
        </p>
      </div>
    </div>
  );
}
