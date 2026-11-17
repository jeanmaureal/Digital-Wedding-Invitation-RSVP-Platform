import { zodResolver } from '@hookform/resolvers/zod';
import { type JSX, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createOrganizerWorkspace } from '@/features/workspace/api/workspaceApi';
import { translateWorkspaceError } from '@/features/workspace/api/workspaceErrors';
import { useActiveWorkspace } from '@/features/workspace/context/activeWorkspaceContext';
import {
  type CreateWorkspaceFormValues,
  type CreateWorkspacePayload,
  createWorkspaceSchema,
} from '@/features/workspace/schemas/workspaceSchemas';

export interface CreateWorkspaceCardProps {
  readonly mode: 'onboarding' | 'additional';
  readonly onCreated?: (() => void) | undefined;
  readonly onCancel?: (() => void) | undefined;
}

export function CreateWorkspaceCard({
  mode,
  onCreated,
  onCancel,
}: CreateWorkspaceCardProps): JSX.Element {
  const { activateCreatedWorkspace } = useActiveWorkspace();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateWorkspaceFormValues, unknown, CreateWorkspacePayload>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: {
      name: '',
      slug: '',
    },
  });

  const onSubmit = async (values: CreateWorkspacePayload): Promise<void> => {
    setSubmitError(null);
    try {
      const created = await createOrganizerWorkspace(values);
      await activateCreatedWorkspace(created.id);
      reset();
      onCreated?.();
    } catch (error: unknown) {
      setSubmitError(translateWorkspaceError(error).message);
    }
  };

  const isOnboarding = mode === 'onboarding';
  const nameInputId = isOnboarding ? 'onboarding-workspace-name' : 'additional-workspace-name';
  const slugInputId = isOnboarding ? 'onboarding-workspace-slug' : 'additional-workspace-slug';

  return (
    <Card
      data-testid={isOnboarding ? 'workspace-onboarding-card' : 'workspace-create-additional-card'}
    >
      <CardHeader>
        <CardTitle>
          {isOnboarding ? 'Create Your First Workspace' : 'Create Another Workspace'}
        </CardTitle>
        <CardDescription>
          {isOnboarding
            ? 'Workspaces isolate wedding projects, invitations, guest lists, and team permissions. Creating a workspace assigns you as its Owner.'
            : 'Spin up an isolated workspace for another studio, client brand, or planning team.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {submitError ? (
          <div
            role="alert"
            data-testid="create-workspace-error"
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={nameInputId}>Workspace name</Label>
              <Input
                id={nameInputId}
                type="text"
                placeholder="Morgan Wedding Studio"
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? `${nameInputId}-error` : undefined}
                {...register('name')}
              />
              <FormFieldError id={`${nameInputId}-error`} message={errors.name?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={slugInputId}>
                Workspace URL slug{' '}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id={slugInputId}
                type="text"
                placeholder="morgan-wedding-studio"
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.slug)}
                aria-describedby={errors.slug ? `${slugInputId}-error` : `${slugInputId}-hint`}
                {...register('slug')}
              />
              {errors.slug ? (
                <FormFieldError id={`${slugInputId}-error`} message={errors.slug.message} />
              ) : (
                <p id={`${slugInputId}-hint`} className="text-muted-foreground text-xs">
                  Leave blank to generate a unique lowercase slug automatically.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              data-testid="create-workspace-submit-button"
            >
              {isSubmitting ? 'Creating workspace…' : 'Create workspace'}
            </Button>

            {onCancel ? (
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
