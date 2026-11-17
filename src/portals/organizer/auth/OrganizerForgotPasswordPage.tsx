import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { type JSX, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
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
import { requestOrganizerPasswordReset } from '@/features/auth/api/authApi';
import { translateOrganizerAuthError } from '@/features/auth/api/authErrors';
import { AuthUnconfiguredNotice } from '@/features/auth/components/AuthUnconfiguredNotice';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';
import {
  type ForgotPasswordFormValues,
  type ForgotPasswordPayload,
  forgotPasswordSchema,
} from '@/features/auth/schemas/authSchemas';
import { ROUTES } from '@/lib/constants/routes';

export function OrganizerForgotPasswordPage(): JSX.Element {
  const { configurationStatus } = useOrganizerAuth();
  const isUnconfigured = configurationStatus === 'unconfigured';
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues, unknown, ForgotPasswordPayload>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (values: ForgotPasswordPayload): Promise<void> => {
    setSubmitError(null);
    try {
      await requestOrganizerPasswordReset(values);
      setSubmittedEmail(values.email);
    } catch (error: unknown) {
      setSubmitError(translateOrganizerAuthError(error).message);
    }
  };

  return (
    <section
      data-testid="route-organizer-forgot-password"
      aria-labelledby="organizer-forgot-password-heading"
      className="mx-auto flex w-full max-w-md flex-col py-6"
    >
      <Card>
        <CardHeader className="space-y-1.5">
          <CardTitle asChild>
            <h1
              id="organizer-forgot-password-heading"
              className="text-2xl font-semibold tracking-tight"
            >
              Reset Organizer Password
            </h1>
          </CardTitle>
          <CardDescription>
            Enter your organizer email address to receive a one-time password recovery link.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {isUnconfigured ? <AuthUnconfiguredNotice /> : null}

          {submittedEmail ? (
            <div
              role="status"
              data-testid="forgot-password-sent-notice"
              className="bg-muted/60 space-y-2 rounded-lg border p-4 text-sm"
            >
              <div className="flex items-center gap-2 font-medium">
                <MailCheck className="text-primary size-4 shrink-0" aria-hidden="true" />
                <span>Check your inbox</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                If an organizer account exists for{' '}
                <strong className="text-foreground">{submittedEmail}</strong>, a password recovery
                link has been sent. Open that link in this browser to choose a new password.
              </p>
            </div>
          ) : (
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
                  <Label htmlFor="forgot-password-email">Email address</Label>
                  <Input
                    id="forgot-password-email"
                    type="email"
                    autoComplete="email"
                    placeholder="organizer@studio.com"
                    disabled={isUnconfigured || isSubmitting}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'forgot-password-email-error' : undefined}
                    {...register('email')}
                  />
                  <FormFieldError
                    id="forgot-password-email-error"
                    message={errors.email?.message}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isUnconfigured || isSubmitting}
                  data-testid="forgot-password-submit-button"
                >
                  {isSubmitting ? 'Sending reset link…' : 'Send reset link'}
                </Button>
              </form>
            </>
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
