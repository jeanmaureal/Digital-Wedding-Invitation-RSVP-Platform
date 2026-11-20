import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/lib/constants/routes';
import { EnvConfigurationError } from '@/lib/validation/env';

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
  readonly onReset?: (() => void) | undefined;
}

interface AppErrorBoundaryState {
  readonly error: Error | null;
}

const INVITATION_TOKEN_PATH_PATTERN = /\/i\/[^\s/?#"']+/gi;

function redactInvitationTokens(value: string): string {
  return value.replace(INVITATION_TOKEN_PATH_PATTERN, '/i/[REDACTED_TOKEN]');
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  public override state: AppErrorBoundaryState = {
    error: null,
  };

  public static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const safeName = error.name || 'Error';
    const safeMessage = redactInvitationTokens(error.message || 'Unhandled application error');
    console.error(`Unhandled application boundary error (${safeName}): ${safeMessage}`, {
      componentStack: errorInfo.componentStack,
    });
  }

  private readonly handleReload = (): void => {
    if (this.props.onReset) {
      this.setState({ error: null });
      this.props.onReset();
      return;
    }

    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private readonly handleReturnHome = (): void => {
    this.setState({ error: null });
    if (typeof window !== 'undefined') {
      window.location.assign(ROUTES.home);
    }
  };

  public override render(): ReactNode {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    const isEnvError = error instanceof EnvConfigurationError;

    return (
      <main
        data-testid="app-error-boundary"
        className="bg-background text-foreground flex min-h-screen items-center justify-center p-6"
      >
        <Card className="w-full max-w-lg border-destructive/40">
          <CardHeader>
            <div className="text-destructive flex items-center gap-2">
              <AlertTriangle className="size-5" aria-hidden="true" />
              <CardTitle>
                {isEnvError ? 'Environment Configuration Required' : 'Something Went Wrong'}
              </CardTitle>
            </div>
            <CardDescription>
              {isEnvError
                ? error.message
                : 'An unexpected error interrupted this screen. Your saved wedding and RSVP records remain safe — reload the page or return to the home screen.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {isEnvError && error.issues.length > 0 ? (
              <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                {error.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={this.handleReload}
                data-testid="error-boundary-reload-button"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Reload Page
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={this.handleReturnHome}
                data-testid="error-boundary-home-button"
              >
                <Home className="size-4" aria-hidden="true" />
                Return to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }
}
