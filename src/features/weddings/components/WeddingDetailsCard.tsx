import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { type JSX, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  updateOrganizerWeddingDetails,
  type WeddingRecord,
} from '@/features/weddings/api/weddingApi';
import { translateWeddingError } from '@/features/weddings/api/weddingErrors';
import { canCreateOrEditWedding } from '@/features/weddings/permissions/weddingPermissions';
import { weddingQueryKeys } from '@/features/weddings/queryKeys';
import {
  type UpdateWeddingDetailsFormValues,
  type UpdateWeddingDetailsPayload,
  updateWeddingDetailsSchema,
} from '@/features/weddings/schemas/weddingSchemas';
import {
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from '@/features/workspace/schemas/workspaceSchemas';

export interface WeddingDetailsCardProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly callerRole: WorkspaceRole;
  readonly wedding: WeddingRecord;
}

export function WeddingDetailsCard({
  userId,
  workspaceId,
  callerRole,
  wedding,
}: WeddingDetailsCardProps): JSX.Element {
  const queryClient = useQueryClient();
  const canEdit = canCreateOrEditWedding(callerRole);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateWeddingDetailsFormValues, unknown, UpdateWeddingDetailsPayload>({
    resolver: zodResolver(updateWeddingDetailsSchema),
    defaultValues: {
      title: wedding.title,
      partnerOneName: wedding.partner_one_name,
      partnerTwoName: wedding.partner_two_name,
      slug: wedding.slug,
      eventDate: wedding.event_date ?? '',
      venueName: wedding.venue_name,
      venueLocation: wedding.venue_location,
    },
  });

  const onSubmit = async (values: UpdateWeddingDetailsPayload): Promise<void> => {
    setSubmitError(null);
    setSavedNotice(false);
    try {
      const updated = await updateOrganizerWeddingDetails({
        workspaceId,
        weddingId: wedding.id,
        ...values,
      });
      reset({
        title: updated.title,
        partnerOneName: updated.partner_one_name,
        partnerTwoName: updated.partner_two_name,
        slug: updated.slug,
        eventDate: updated.event_date ?? '',
        venueName: updated.venue_name,
        venueLocation: updated.venue_location,
      });
      await queryClient.invalidateQueries({
        queryKey: weddingQueryKeys.allInWorkspace(userId, workspaceId),
      });
      setSavedNotice(true);
    } catch (error: unknown) {
      setSubmitError(translateWeddingError(error).message);
    }
  };

  return (
    <Card data-testid="wedding-details-card">
      <CardHeader className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <CardTitle>Couple, Venue &amp; Public URL Slug</CardTitle>
          <CardDescription>
            Core celebration identity and globally unique <code>/w/:slug</code> routing path.
          </CardDescription>
        </div>

        {!canEdit ? (
          <Badge variant="outline" data-testid="wedding-details-readonly-badge">
            Read-only ({WORKSPACE_ROLE_LABELS[callerRole]})
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {submitError ? (
          <div
            role="alert"
            data-testid="wedding-details-error"
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-sm"
          >
            {submitError}
          </div>
        ) : null}

        {savedNotice ? (
          <div
            role="status"
            data-testid="wedding-details-saved-notice"
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-900 dark:text-emerald-200"
          >
            Wedding details saved.
          </div>
        ) : null}

        <form
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          noValidate
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="detail-wedding-title">Project title</Label>
              <Input
                id="detail-wedding-title"
                type="text"
                disabled={!canEdit || isSubmitting}
                aria-invalid={Boolean(errors.title)}
                {...register('title')}
              />
              <FormFieldError id="detail-wedding-title-error" message={errors.title?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="detail-wedding-slug">Public URL slug</Label>
              <Input
                id="detail-wedding-slug"
                type="text"
                disabled={!canEdit || isSubmitting}
                aria-invalid={Boolean(errors.slug)}
                {...register('slug')}
              />
              {errors.slug ? (
                <FormFieldError id="detail-wedding-slug-error" message={errors.slug.message} />
              ) : (
                <p className="text-muted-foreground text-xs">
                  Reserved public path: <code>/w/{wedding.slug}</code>
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="detail-partner-one">Partner 1 name</Label>
              <Input
                id="detail-partner-one"
                type="text"
                disabled={!canEdit || isSubmitting}
                aria-invalid={Boolean(errors.partnerOneName)}
                {...register('partnerOneName')}
              />
              <FormFieldError
                id="detail-partner-one-error"
                message={errors.partnerOneName?.message}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="detail-partner-two">Partner 2 name</Label>
              <Input
                id="detail-partner-two"
                type="text"
                disabled={!canEdit || isSubmitting}
                aria-invalid={Boolean(errors.partnerTwoName)}
                {...register('partnerTwoName')}
              />
              <FormFieldError
                id="detail-partner-two-error"
                message={errors.partnerTwoName?.message}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="detail-event-date">Celebration date</Label>
              <Input
                id="detail-event-date"
                type="date"
                disabled={!canEdit || isSubmitting}
                aria-invalid={Boolean(errors.eventDate)}
                {...register('eventDate')}
              />
              <FormFieldError id="detail-event-date-error" message={errors.eventDate?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="detail-venue-name">Venue name</Label>
              <Input
                id="detail-venue-name"
                type="text"
                disabled={!canEdit || isSubmitting}
                aria-invalid={Boolean(errors.venueName)}
                {...register('venueName')}
              />
              <FormFieldError id="detail-venue-name-error" message={errors.venueName?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="detail-venue-location">City / location</Label>
              <Input
                id="detail-venue-location"
                type="text"
                disabled={!canEdit || isSubmitting}
                aria-invalid={Boolean(errors.venueLocation)}
                {...register('venueLocation')}
              />
              <FormFieldError
                id="detail-venue-location-error"
                message={errors.venueLocation?.message}
              />
            </div>
          </div>

          {canEdit ? (
            <Button
              type="submit"
              disabled={isSubmitting || !isDirty}
              data-testid="save-wedding-details-button"
            >
              {isSubmitting ? 'Saving details…' : 'Save wedding details'}
            </Button>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
