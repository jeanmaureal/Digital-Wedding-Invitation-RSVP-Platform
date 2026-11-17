import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { type JSX, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
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
import { signUpOrganizer } from '@/features/auth/api/authApi';
import { translateOrganizerAuthError } from '@/features/auth/api/authErrors';
import { AuthUnconfiguredNotice } from '@/features/auth/components/AuthUnconfiguredNotice';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';
import {
  buildAuthPageHref,
  sanitizeOrganizerRedirect,
  type SignupFormValues,
  type SignupPayload,
  signupSchema,
} from '@/features/auth/schemas/authSchemas';
import { ROUTES } from '@/lib/constants/routes';

export function OrganizerSignupPage(): JSX.Element {
  const { configurationStatus } = useOrganizerAuth();
  const isUnconfigured = configurationStatus === 'unconfigured';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  const rawRedirectTo = searchParams.get('redirectTo');
  const destinationPath = sanitizeOrganizerRedirect(rawRedirectTo);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues, unknown, SignupPayload>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: SignupPayload): Promise<void> => {
    setSubmitError(null);
    try {
      const outcome = await signUpOrganizer({
        fullName: values.fullName,
        email: values.email,
        password: values.password,
      });

      if (outcome.kind === 'signed_in') {
        void navigate(destinationPath, { replace: true });
        return;
      }

      setConfirmationEmail(outcome.email);
    } catch (error: unknown) {
      setSubmitError(translateOrganizerAuthError(error).message);
    }
  };

  return (
    <section
      data-testid="route-organizer-signup"
      aria-labelledby="organizer-signup-heading"
      className="mx-auto flex w-full max-w-md flex-col py-6"
    >
      <Card>
        <CardHeader className="space-y-1.5">
          <CardTitle asChild>
            <h1 id="organizer-signup-heading" className="text-2xl font-semibold tracking-tight">
              Create Organizer Account
            </h1>
          </CardTitle>
          <CardDescription>
            Register an organizer profile to create or join wedding workspaces.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {isUnconfigured ? <AuthUnconfiguredNotice /> : null}

          {confirmationEmail ? (
            <div
              role="status"
              data-testid="signup-confirmation-notice"
              className="bg-muted/60 space-y-2 rounded-lg border p-4 text-sm"
            >
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="text-primary size-4 shrink-0" aria-hidden="true" />
                <span>Verify your email address</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                We sent a confirmation link to{' '}
                <strong className="text-foreground">{confirmationEmail}</strong>. Open that link to
                activate your organizer account, then sign in.
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
                  <Label htmlFor="signup-full-name">Full name</Label>
                  <Input
                    id="signup-full-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Alex Morgan"
                    disabled={isUnconfigured || isSubmitting}
                    aria-invalid={Boolean(errors.fullName)}
                    aria-describedby={errors.fullName ? 'signup-full-name-error' : undefined}
                    {...register('fullName')}
                  />
                  <FormFieldError id="signup-full-name-error" message={errors.fullName?.message} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="signup-email">Email address</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    placeholder="organizer@studio.com"
                    disabled={isUnconfigured || isSubmitting}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'signup-email-error' : undefined}
                    {...register('email')}
                  />
                  <FormFieldError id="signup-email-error" message={errors.email?.message} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    disabled={isUnconfigured || isSubmitting}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'signup-password-error' : undefined}
                    {...register('password')}
                  />
                  <FormFieldError id="signup-password-error" message={errors.password?.message} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="signup-confirm-password">Confirm password</Label>
                  <Input
                    id="signup-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    disabled={isUnconfigured || isSubmitting}
                    aria-invalid={Boolean(errors.confirmPassword)}
                    aria-describedby={
                      errors.confirmPassword ? 'signup-confirm-password-error' : undefined
                    }
                    {...register('confirmPassword')}
                  />
                  <FormFieldError
                    id="signup-confirm-password-error"
                    message={errors.confirmPassword?.message}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isUnconfigured || isSubmitting}
                  data-testid="signup-submit-button"
                >
                  {isSubmitting ? 'Creating account…' : 'Create account'}
                </Button>
              </form>
            </>
          )}
        </CardContent>

        <CardFooter className="text-muted-foreground justify-center border-t pt-5 text-sm">
          <span>Already have an organizer account?&nbsp;</span>
          <Link
            to={buildAuthPageHref(ROUTES.organizerLogin, rawRedirectTo)}
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </CardFooter>
      </Card>
    </section>
  );
}
