import type { JSX } from 'react';
import { RouterProvider } from 'react-router';
import { AppProviders } from '@/app/providers/AppProviders';
import { appRouter } from '@/app/router/router';

export function App(): JSX.Element {
  return (
    <AppProviders>
      <RouterProvider router={appRouter} />
    </AppProviders>
  );
}
