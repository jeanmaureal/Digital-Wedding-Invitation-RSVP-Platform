import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { type JSX, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateOrganizerPassword } from '@/features/auth/api/authApi';
import { translateOrganizerAuthError } from '@/features/auth/api/authErrors';
import { AuthUnconfiguredNotice } from '@/features/auth/components/AuthUnconfiguredNotice';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';
import {
  type ResetPasswordFormValues,
  type ResetPasswordPayload,
  resetPasswordSchema,
} from '@/features/auth/schemas/authSchemas';
import { ROUTES } from '@/lib/constants/routes';

export function OrganizerResetPasswordPage(): JSX.Element {
  const {
    configurationStatus,
    status,
    isPasswordRecoverySession,
    recoveryError,
    clearPasswordRecoveryState,
  } = useOrganizerAuth();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues, unknown, ResetPasswordPayload>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  if (status === 'loading') {
    return (
      <div
        data-testid="organizer-auth-loading"
        className="text-muted-foreground flex min-h-[40vh] items-center justify-center text-sm"
      >
        Validating password recovery link…
      </div>
    );
  }

  const isUnconfigured = configurationStatus === 'unconfigured';
  const canSubmitNewPassword = status === 'authenticated' && isPasswordRecoverySession;

  const onSubmit = async (values: ResetPasswordPayload): Promise<void> => {
    setSubmitError(null);
    try {
      await updateOrganizerPassword({ password: values.password });
      clearPasswordRecoveryState();
      setPasswordUpdated(true);
    } catch (error: unknown) {
      setSubmitError(translateOrganizerAuthError(error).message);
    }
  };

  return (
    <section
      data-testid="route-organizer-reset-password"
      aria-labelledby="organizer-reset-password-heading"
      className="mx-auto flex w-full max-w-md flex-col py-6"
    >
      <Card>
        <CardHeader className="space-y-1.5">
          <CardTitle asChild>
            <h1
              id="organizer-reset-password-heading"
              className="text-2xl font-semibold tracking-tight"
            >
              Choose a New Password
            </h1>
          </CardTitle>
          <CardDescription>
            Complete your password reset to regain access to your organizer workspaces.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {isUnconfigured ? (
            <AuthUnconfiguredNotice />
          ) : passwordUpdated ? (
            <div
              role="status"
              data-testid="reset-password-success-notice"
              className="bg-muted/60 space-y-3 rounded-lg border p-4 text-sm"
            >
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="text-primary size-4 shrink-0" aria-hidden="true" />
                <span>Password updated</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Your organizer password has been updated. Continue directly to your workspace.
              </p>
              <Button
                type="button"
                className="w-full"
                onClick={() => void navigate(ROUTES.organizerRoot, { replace: true })}
                data-testid="reset-password-continue-button"
              >
                Continue to workspace
              </Button>
            </div>
          ) : canSubmitNewPassword ? (
            <>
              {submitError ? (
                <div
                  role="alert"
                  data-testid="auth-form-error"
                  className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-sm"
                >
                  {submitError}
                </div>
              ) : null}

              <form
                onSubmit={(event) => void handleSubmit(onSubmit)(event)}
                noValidate
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="reset-password-new">New password</Label>
                  <Input
                    id="reset-password-new"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'reset-password-new-error' : undefined}
                    {...register('password')}
                  />
                  <FormFieldError
                    id="reset-password-new-error"
                    message={errors.password?.message}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reset-password-confirm">Confirm new password</Label>
                  <Input
                    id="reset-password-confirm"
                    type="password"
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.confirmPassword)}
                    aria-describedby={
                      errors.confirmPassword ? 'reset-password-confirm-error' : undefined
                    }
                    {...register('confirmPassword')}
                  />
                  <FormFieldError
                    id="reset-password-confirm-error"
                    message={errors.confirmPassword?.message}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                  data-testid="reset-password-submit-button"
                >
                  {isSubmitting ? 'Updating password…' : 'Update password'}
                </Button>
              </form>
            </>
          ) : (
            <div
              role="alert"
              data-testid="reset-password-invalid-session"
              className="bg-muted/60 space-y-3 rounded-lg border p-4 text-sm"
            >
              <div className="flex items-center gap-2 font-medium">
                <ShieldAlert className="text-destructive size-4 shrink-0" aria-hidden="true" />
                <span>
                  {recoveryError ? 'Recovery link expired or invalid' : 'Recovery link required'}
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {recoveryError ??
                  'Open a valid one-time password recovery link from your email in this browser before setting a new password.'}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild className="w-full sm:w-auto">
                  <Link to={ROUTES.organizerForgotPassword}>Request a new reset link</Link>
                </Button>
                {status === 'authenticated' ? (
                  <Button asChild variant="outline" className="w-full sm:w-auto">
                    <Link to={ROUTES.organizerRoot}>Return to workspace</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="text-muted-foreground justify-center border-t pt-5 text-sm">
          <Link
            to={ROUTES.organizerLogin}
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </section>
  );
}
