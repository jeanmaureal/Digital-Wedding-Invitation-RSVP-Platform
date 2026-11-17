import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { type JSX, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOrganizerAuth } from '@/features/auth/context/organizerAuthContext';
import {
  type OrganizerWorkspaceMembership,
  updateOrganizerWorkspace,
} from '@/features/workspace/api/workspaceApi';
import { translateWorkspaceError } from '@/features/workspace/api/workspaceErrors';
import { canEditWorkspaceSettings } from '@/features/workspace/permissions/workspacePermissions';
import { workspaceQueryKeys } from '@/features/workspace/queryKeys';
import {
  type UpdateWorkspaceFormValues,
  type UpdateWorkspacePayload,
  updateWorkspaceSchema,
  WORKSPACE_ROLE_LABELS,
} from '@/features/workspace/schemas/workspaceSchemas';

export interface WorkspaceGeneralSettingsCardProps {
  readonly activeMembership: OrganizerWorkspaceMembership;
}

export function WorkspaceGeneralSettingsCard({
  activeMembership,
}: WorkspaceGeneralSettingsCardProps): JSX.Element {
  const { user } = useOrganizerAuth();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const canEdit = canEditWorkspaceSettings(activeMembership.role);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateWorkspaceFormValues, unknown, UpdateWorkspacePayload>({
    resolver: zodResolver(updateWorkspaceSchema),
    defaultValues: {
      name: activeMembership.workspace.name,
      slug: activeMembership.workspace.slug,
    },
  });

  useEffect(() => {
    reset({
      name: activeMembership.workspace.name,
      slug: activeMembership.workspace.slug,
    });
  }, [activeMembership.workspace.name, activeMembership.workspace.slug, reset]);

  const onSubmit = async (values: UpdateWorkspacePayload): Promise<void> => {
    if (!user) {
      return;
    }
    setSubmitError(null);
    setSavedNotice(false);
    try {
      const updated = await updateOrganizerWorkspace({
        workspaceId: activeMembership.workspace.id,
        name: values.name,
        slug: values.slug,
      });
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.memberships(user.id),
      });
      reset({ name: updated.name, slug: updated.slug });
      setSavedNotice(true);
    } catch (error: unknown) {
      setSubmitError(translateWorkspaceError(error).message);
    }
  };

  return (
    <Card data-testid="workspace-general-settings-card">
      <CardHeader>
        <CardTitle>Workspace Details</CardTitle>
        <CardDescription>
          {canEdit
            ? 'Update the workspace name and URL slug visible to workspace members.'
            : `Read-only for your ${WORKSPACE_ROLE_LABELS[activeMembership.role]} role. Only Owners and Admins can edit workspace details.`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {submitError ? (
          <div
            role="alert"
            data-testid="workspace-settings-error"
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-sm"
          >
            {submitError}
          </div>
        ) : null}

        {savedNotice ? (
          <p
            role="status"
            data-testid="workspace-settings-saved-notice"
            className="text-primary text-xs font-medium"
          >
            Workspace details updated.
          </p>
        ) : null}

        <form
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          noValidate
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="settings-workspace-name">Workspace name</Label>
              <Input
                id="settings-workspace-name"
                type="text"
                disabled={!canEdit || isSubmitting}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'settings-workspace-name-error' : undefined}
                {...register('name')}
              />
              <FormFieldError id="settings-workspace-name-error" message={errors.name?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-workspace-slug">Workspace URL slug</Label>
              <Input
                id="settings-workspace-slug"
                type="text"
                disabled={!canEdit || isSubmitting}
                aria-invalid={Boolean(errors.slug)}
                aria-describedby={errors.slug ? 'settings-workspace-slug-error' : undefined}
                {...register('slug')}
              />
              <FormFieldError id="settings-workspace-slug-error" message={errors.slug?.message} />
            </div>
          </div>

          {canEdit ? (
            <Button
              type="submit"
              disabled={isSubmitting || !isDirty}
              data-testid="workspace-settings-save-button"
            >
              {isSubmitting ? 'Saving changes…' : 'Save workspace details'}
            </Button>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
