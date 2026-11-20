import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from '@/components/shared/AppErrorBoundary';
import { EnvConfigurationError } from '@/lib/validation/env';

function CrashOnRender({ error }: { readonly error: Error }): JSX.Element {
  throw error;
}

describe('AppErrorBoundary security redaction & recovery (P9-AC09)', () => {
  it('displays structured diagnostics for EnvConfigurationError at boot', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const envErr = new EnvConfigurationError(
        'Missing required Supabase configuration for "production" environment.',
        ['VITE_SUPABASE_URL is required in preview and production deployments.'],
      );

      render(
        <AppErrorBoundary>
          <CrashOnRender error={envErr} />
        </AppErrorBoundary>,
      );

      expect(screen.getByTestId('app-error-boundary')).toBeInTheDocument();
      expect(screen.getByText('Environment Configuration Required')).toBeInTheDocument();
      expect(
        screen.getByText('Missing required Supabase configuration for "production" environment.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('VITE_SUPABASE_URL is required in preview and production deployments.'),
      ).toBeInTheDocument();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('never echoes raw runtime exception messages or /i/:token secrets into the DOM or console logs, and supports recovery', async () => {
    const user = userEvent.setup();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReset = vi.fn();
    let shouldCrash = true;

    const guestLinkSegment = 'guest-link-probe-1111111111111111111111111111';
    const sensitiveError = new Error(
      `Failed rendering route https://wedding.example/i/${guestLinkSegment}?source=qr internal stack detail`,
    );

    function RecoverableChild(): JSX.Element {
      if (shouldCrash) {
        throw sensitiveError;
      }
      return <div data-testid="recovered-child">Recovered cleanly</div>;
    }

    try {
      const { container } = render(
        <AppErrorBoundary
          onReset={() => {
            shouldCrash = false;
            onReset();
          }}
        >
          <RecoverableChild />
        </AppErrorBoundary>,
      );

      expect(screen.getByTestId('app-error-boundary')).toBeInTheDocument();
      expect(screen.getByText('Something Went Wrong')).toBeInTheDocument();

      // Raw exception details and secret `/i/:token` MUST NOT appear anywhere in rendered DOM
      expect(container.innerHTML).not.toContain(guestLinkSegment);
      expect(container.innerHTML).not.toContain('internal stack detail');

      // Console diagnostics MUST redact `/i/:token` segments
      const loggedOutput = consoleSpy.mock.calls.map((args) => JSON.stringify(args)).join(' ');
      expect(loggedOutput).not.toContain(guestLinkSegment);
      expect(loggedOutput).toContain('/i/[REDACTED_TOKEN]');

      // Clicking Reload Page invokes `onReset` and restores normal child rendering
      await user.click(screen.getByTestId('error-boundary-reload-button'));
      expect(onReset).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('recovered-child')).toBeInTheDocument();
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
