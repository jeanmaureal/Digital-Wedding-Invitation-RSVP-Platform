import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type JSX, type ReactNode, useState } from 'react';
import { AppErrorBoundary } from '@/components/shared/AppErrorBoundary';
import { getAppEnv } from '@/lib/validation/env';

interface AppProvidersProps {
  readonly children: ReactNode;
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

function ValidatedRuntimeGuard({ children }: AppProvidersProps): JSX.Element {
  // Validates environment contract on application boot:
  // - Local without Supabase config starts cleanly (`status: 'unconfigured'`).
  // - Preview and Production fail fast if required Supabase variables are missing.
  getAppEnv();
  return <>{children}</>;
}

export function AppProviders({ children }: AppProvidersProps): JSX.Element {
  const [queryClient] = useState(createQueryClient);

  return (
    <AppErrorBoundary>
      <ValidatedRuntimeGuard>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ValidatedRuntimeGuard>
    </AppErrorBoundary>
  );
}
