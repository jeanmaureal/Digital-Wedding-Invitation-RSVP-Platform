import { zodResolver } from '@hookform/resolvers/zod';
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
import { signInOrganizerWithPassword } from '@/features/auth/api/authApi';
import { translateOrganizerAuthError } from '@/features/auth/api/authErrors';
import { AuthUnconfiguredNotice } from '@/features/auth/components/AuthUnconfiguredNotice';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';
import {
  buildAuthPageHref,
  type LoginFormValues,
  type LoginPayload,
  loginSchema,
  sanitizeOrganizerRedirect,
} from '@/features/auth/schemas/authSchemas';
import { ROUTES } from '@/lib/constants/routes';

export function OrganizerLoginPage(): JSX.Element {
  const { configurationStatus } = useOrganizerAuth();
  const isUnconfigured = configurationStatus === 'unconfigured';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const rawRedirectTo = searchParams.get('redirectTo');
  const destinationPath = sanitizeOrganizerRedirect(rawRedirectTo);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues, unknown, LoginPayload>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginPayload): Promise<void> => {
    setSubmitError(null);
    try {
      await signInOrganizerWithPassword(values);
      void navigate(destinationPath, { replace: true });
    } catch (error: unknown) {
      setSubmitError(translateOrganizerAuthError(error).message);
    }
  };

  return (
    <section
      data-testid="route-organizer-login"
      aria-labelledby="organizer-login-heading"
      className="mx-auto flex w-full max-w-md flex-col py-6"
    >
      <Card>
        <CardHeader className="space-y-1.5">
          <CardTitle asChild>
            <h1 id="organizer-login-heading" className="text-2xl font-semibold tracking-tight">
              Organizer Sign In
            </h1>
          </CardTitle>
          <CardDescription>
            Sign in to manage your workspaces, wedding websites, and guest RSVPs.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {isUnconfigured ? <AuthUnconfiguredNotice /> : null}

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
              <Label htmlFor="login-email">Email address</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="organizer@studio.com"
                disabled={isUnconfigured || isSubmitting}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'login-email-error' : undefined}
                {...register('email')}
              />
              <FormFieldError id="login-email-error" message={errors.email?.message} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="login-password">Password</Label>
                <Link
                  to={ROUTES.organizerForgotPassword}
                  className="text-primary text-xs font-medium underline-offset-4 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                disabled={isUnconfigured || isSubmitting}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'login-password-error' : undefined}
                {...register('password')}
              />
              <FormFieldError id="login-password-error" message={errors.password?.message} />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isUnconfigured || isSubmitting}
              data-testid="login-submit-button"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="text-muted-foreground justify-center border-t pt-5 text-sm">
          <span>New to the organizer portal?&nbsp;</span>
          <Link
            to={buildAuthPageHref(ROUTES.organizerSignup, rawRedirectTo)}
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </CardFooter>
      </Card>
    </section>
  );
}
