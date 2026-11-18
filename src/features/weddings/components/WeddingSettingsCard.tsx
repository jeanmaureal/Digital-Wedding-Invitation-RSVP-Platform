import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { type JSX, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  updateOrganizerWeddingSettings,
  type WeddingSettingsRecord,
} from '@/features/weddings/api/weddingApi';
import { translateWeddingError } from '@/features/weddings/api/weddingErrors';
import { canCreateOrEditWedding } from '@/features/weddings/permissions/weddingPermissions';
import { weddingQueryKeys } from '@/features/weddings/queryKeys';
import {
  type UpdateWeddingSettingsFormValues,
  type UpdateWeddingSettingsParsedValues,
  updateWeddingSettingsSchema,
  WEDDING_ACCESS_MODE_LABELS,
} from '@/features/weddings/schemas/weddingSchemas';
import {
  getSupportedWeddingTimezones,
  utcIsoToLocalDateTimeInTimezone,
} from '@/features/weddings/utils/weddingTimezone';
import {
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from '@/features/workspace/schemas/workspaceSchemas';

export interface WeddingSettingsCardProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly callerRole: WorkspaceRole;
  readonly settings: WeddingSettingsRecord;
}

export function WeddingSettingsCard({
  userId,
  workspaceId,
  callerRole,
  settings,
}: WeddingSettingsCardProps): JSX.Element {
  const queryClient = useQueryClient();
  const canEdit = canCreateOrEditWedding(callerRole);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const timezones = useMemo(() => {
    const base = getSupportedWeddingTimezones();
    return base.includes(settings.timezone) ? base : [settings.timezone, ...base];
  }, [settings.timezone]);

  const initialDeadline = settings.rsvp_deadline
    ? utcIsoToLocalDateTimeInTimezone(settings.rsvp_deadline, settings.timezone)
    : null;

  const {
    register,
    reset,
    control,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateWeddingSettingsFormValues, unknown, UpdateWeddingSettingsParsedValues>({
    resolver: zodResolver(updateWeddingSettingsSchema),
    defaultValues: {
      timezone: settings.timezone,
      accessMode: settings.access_mode,
      isRsvpOpen: settings.is_rsvp_open,
      rsvpDeadlineDate: initialDeadline?.date ?? '',
      rsvpDeadlineTime: initialDeadline?.time ?? '',
      allowPlusOnesDefault: settings.allow_plus_ones_default,
      showGuestDietaryNotes: settings.show_guest_dietary_notes,
      primaryLocale: settings.primary_locale,
      contactEmail: settings.contact_email ?? '',
      dressCode: settings.dress_code,
      rsvpConfirmationMessage: settings.rsvp_confirmation_message,
    },
  });

  const watchedTimezone = useWatch({ control, name: 'timezone' });

  const onSubmit = async (values: UpdateWeddingSettingsParsedValues): Promise<void> => {
    setSubmitError(null);
    setSavedNotice(false);
    try {
      const updated = await updateOrganizerWeddingSettings({
        workspaceId,
        weddingId: settings.wedding_id,
        ...values,
      });
      const updatedDeadline = updated.rsvp_deadline
        ? utcIsoToLocalDateTimeInTimezone(updated.rsvp_deadline, updated.timezone)
        : null;
      reset({
        timezone: updated.timezone,
        accessMode: updated.access_mode,
        isRsvpOpen: updated.is_rsvp_open,
        rsvpDeadlineDate: updatedDeadline?.date ?? '',
        rsvpDeadlineTime: updatedDeadline?.time ?? '',
        allowPlusOnesDefault: updated.allow_plus_ones_default,
        showGuestDietaryNotes: updated.show_guest_dietary_notes,
        primaryLocale: updated.primary_locale,
        contactEmail: updated.contact_email ?? '',
        dressCode: updated.dress_code,
        rsvpConfirmationMessage: updated.rsvp_confirmation_message,
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
    <Card data-testid="wedding-settings-card">
      <CardHeader className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <CardTitle>Timezone, Website Access &amp; RSVP Policy</CardTitle>
          <CardDescription>
            Deadlines convert between <code>{watchedTimezone || settings.timezone}</code> wall-clock
            time and UTC <code>timestamptz</code> in PostgreSQL (`P2-AC06`).
          </CardDescription>
        </div>

        {!canEdit ? (
          <Badge variant="outline" data-testid="wedding-settings-readonly-badge">
            Read-only ({WORKSPACE_ROLE_LABELS[callerRole]})
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {submitError ? (
          <div
            role="alert"
            data-testid="wedding-settings-error"
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-sm"
          >
            {submitError}
          </div>
        ) : null}

        {savedNotice ? (
          <div
            role="status"
            data-testid="wedding-settings-saved-notice"
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-900 dark:text-emerald-200"
          >
            Wedding settings saved.
          </div>
        ) : null}

        <form
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          noValidate
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="settings-timezone">Wedding IANA timezone</Label>
              <NativeSelect
                id="settings-timezone"
                disabled={!canEdit || isSubmitting}
                aria-invalid={Boolean(errors.timezone)}
                {...register('timezone')}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </NativeSelect>
              <FormFieldError id="settings-timezone-error" message={errors.timezone?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-access-mode">Website access policy</Label>
              <NativeSelect
                id="settings-access-mode"
                disabled={!canEdit || isSubmitting}
                {...register('accessMode')}
              >
                <option value="public">{WEDDING_ACCESS_MODE_LABELS.public}</option>
                <option value="invite_only">{WEDDING_ACCESS_MODE_LABELS.invite_only}</option>
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-primary-locale">Primary locale</Label>
              <Input
                id="settings-primary-locale"
                type="text"
                placeholder="en"
                disabled={!canEdit || isSubmitting}
                aria-invalid={Boolean(errors.primaryLocale)}
                {...register('primaryLocale')}
              />
              <FormFieldError
                id="settings-primary-locale-error"
                message={errors.primaryLocale?.message}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="settings-deadline-date">RSVP deadline date</Label>
              <Input
                id="settings-deadline-date"
                type="date"
                disabled={!canEdit || isSubmitting}
                aria-invalid={Boolean(errors.rsvpDeadlineDate)}
                {...register('rsvpDeadlineDate')}
              />
              <FormFieldError
                id="settings-deadline-date-error"
                message={errors.rsvpDeadlineDate?.message}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-deadline-time">
                Deadline time ({watchedTimezone || settings.timezone})
              </Label>
              <Input
                id="settings-deadline-time"
                type="time"
                disabled={!canEdit || isSubmitting}
                aria-invalid={Boolean(errors.rsvpDeadlineTime)}
                {...register('rsvpDeadlineTime')}
              />
              <FormFieldError
                id="settings-deadline-time-error"
                message={errors.rsvpDeadlineTime?.message}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-contact-email">Guest contact email</Label>
              <Input
                id="settings-contact-email"
                type="email"
                placeholder="rsvp@couple.example.com"
                disabled={!canEdit || isSubmitting}
                aria-invalid={Boolean(errors.contactEmail)}
                {...register('contactEmail')}
              />
              <FormFieldError
                id="settings-contact-email-error"
                message={errors.contactEmail?.message}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="settings-dress-code">Dress code guidance</Label>
              <Input
                id="settings-dress-code"
                type="text"
                placeholder="Formal Garden Attire"
                disabled={!canEdit || isSubmitting}
                aria-invalid={Boolean(errors.dressCode)}
                {...register('dressCode')}
              />
              <FormFieldError id="settings-dress-code-error" message={errors.dressCode?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-rsvp-message">RSVP confirmation message</Label>
              <Textarea
                id="settings-rsvp-message"
                rows={2}
                placeholder="Thank you for responding! We look forward to celebrating with you."
                disabled={!canEdit || isSubmitting}
                aria-invalid={Boolean(errors.rsvpConfirmationMessage)}
                {...register('rsvpConfirmationMessage')}
              />
              <FormFieldError
                id="settings-rsvp-message-error"
                message={errors.rsvpConfirmationMessage?.message}
              />
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border p-3.5 sm:grid-cols-3">
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4 rounded"
                disabled={!canEdit || isSubmitting}
                {...register('isRsvpOpen')}
              />
              <span>
                <strong className="block font-medium">RSVP collection enabled</strong>
                <span className="text-muted-foreground text-xs">
                  Uncheck to pause guest RSVP submissions at any time.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4 rounded"
                disabled={!canEdit || isSubmitting}
                {...register('allowPlusOnesDefault')}
              />
              <span>
                <strong className="block font-medium">Plus-ones allowed by default</strong>
                <span className="text-muted-foreground text-xs">
                  Default household policy for new guest groups.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4 rounded"
                disabled={!canEdit || isSubmitting}
                {...register('showGuestDietaryNotes')}
              />
              <span>
                <strong className="block font-medium">Collect dietary notes</strong>
                <span className="text-muted-foreground text-xs">
                  Include dietary/allergy field on household RSVP forms.
                </span>
              </span>
            </label>
          </div>

          {canEdit ? (
            <Button
              type="submit"
              disabled={isSubmitting || !isDirty}
              data-testid="save-wedding-settings-button"
            >
              {isSubmitting ? 'Saving settings…' : 'Save wedding settings'}
            </Button>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
