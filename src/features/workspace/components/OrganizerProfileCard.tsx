import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type JSX, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';
import {
  fetchOwnOrganizerProfile,
  updateOwnOrganizerProfile,
} from '@/features/workspace/api/workspaceApi';
import { translateWorkspaceError } from '@/features/workspace/api/workspaceErrors';
import { useActiveWorkspace } from '@/features/workspace/context/activeWorkspaceContext';
import { workspaceQueryKeys } from '@/features/workspace/queryKeys';
import {
  type ProfileFullNameFormValues,
  type ProfileFullNamePayload,
  profileFullNameSchema,
} from '@/features/workspace/schemas/workspaceSchemas';

export function OrganizerProfileCard(): JSX.Element | null {
  const { user } = useOrganizerAuth();
  const { activeWorkspaceId } = useActiveWorkspace();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const userId = user?.id ?? null;

  const profileQuery = useQuery({
    queryKey: userId ? workspaceQueryKeys.profile(userId) : ['organizer-profile', 'anonymous'],
    queryFn: () => {
      if (!userId) {
        return Promise.resolve(null);
      }
      return fetchOwnOrganizerProfile(userId);
    },
    enabled: Boolean(userId),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFullNameFormValues, unknown, ProfileFullNamePayload>({
    resolver: zodResolver(profileFullNameSchema),
    defaultValues: {
      fullName: '',
    },
  });

  const serverFullName = profileQuery.data?.full_name;
  useEffect(() => {
    if (serverFullName !== undefined) {
      reset({ fullName: serverFullName });
    }
  }, [reset, serverFullName]);

  if (!userId) {
    return null;
  }

  const onSubmit = async (values: ProfileFullNamePayload): Promise<void> => {
    setSubmitError(null);
    setSavedNotice(false);
    try {
      const updated = await updateOwnOrganizerProfile({
        userId,
        fullName: values.fullName,
      });
      queryClient.setQueryData(workspaceQueryKeys.profile(userId), updated);
      if (activeWorkspaceId) {
        await queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.memberDirectory(userId, activeWorkspaceId),
        });
      }
      reset({ fullName: updated.full_name });
      setSavedNotice(true);
    } catch (error: unknown) {
      setSubmitError(translateWorkspaceError(error).message);
    }
  };

  return (
    <Card data-testid="organizer-profile-card">
      <CardHeader>
        <CardTitle>Organizer Profile</CardTitle>
        <CardDescription>
          Your display name appears to co-members across shared workspaces (`P1-AC02`).
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {submitError ? (
          <div
            role="alert"
            data-testid="profile-update-error"
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-sm"
          >
            {submitError}
          </div>
        ) : null}

        {savedNotice ? (
          <p
            role="status"
            data-testid="profile-saved-notice"
            className="text-primary text-xs font-medium"
          >
            Profile display name saved.
          </p>
        ) : null}

        <form
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          noValidate
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-email-readonly">Account email (managed by Auth)</Label>
              <Input
                id="profile-email-readonly"
                type="email"
                value={profileQuery.data?.email ?? user?.email ?? ''}
                disabled
                readOnly
                data-testid="profile-email-readonly"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-full-name">Display name</Label>
              <Input
                id="profile-full-name"
                type="text"
                placeholder="Alex Morgan"
                disabled={profileQuery.isPending || isSubmitting}
                aria-invalid={Boolean(errors.fullName)}
                aria-describedby={errors.fullName ? 'profile-full-name-error' : undefined}
                {...register('fullName')}
              />
              <FormFieldError id="profile-full-name-error" message={errors.fullName?.message} />
            </div>
          </div>

          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={profileQuery.isPending || isSubmitting || !isDirty}
            data-testid="profile-save-button"
          >
            {isSubmitting ? 'Saving…' : 'Save profile'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
