import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EnvConfigurationError } from '@/lib/validation/env';

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
}

interface AppErrorBoundaryState {
  readonly error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  public override state: AppErrorBoundaryState = {
    error: null,
  };

  public static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unhandled application boundary error:', error, errorInfo);
  }

  public override render(): ReactNode {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    const isEnvError = error instanceof EnvConfigurationError;

    return (
      <main className="bg-background text-foreground flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-lg border-destructive/40">
          <CardHeader>
            <div className="text-destructive flex items-center gap-2">
              <AlertTriangle className="size-5" aria-hidden="true" />
              <CardTitle>
                {isEnvError ? 'Environment Configuration Required' : 'Application Error'}
              </CardTitle>
            </div>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
          {isEnvError && error.issues.length > 0 ? (
            <CardContent>
              <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                {error.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </CardContent>
          ) : null}
        </Card>
      </main>
    );
  }
}
