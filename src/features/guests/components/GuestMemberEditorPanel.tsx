import { zodResolver } from '@hookform/resolvers/zod';
import type { JSX } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  GUEST_SIDE_LABELS,
  GUEST_SIDE_OPTIONS,
  type GuestMemberFormValues,
  guestMemberFormSchema,
} from '@/features/guests/schemas/guestSchemas';

export interface GuestMemberEditorPanelProps {
  readonly mode: 'create' | 'edit';
  readonly householdName: string;
  readonly initialValues?: GuestMemberFormValues;
  readonly isSubmitting: boolean;
  readonly errorMessage: string | null;
  readonly onSubmitValues: (values: GuestMemberFormValues) => Promise<void>;
  readonly onCancel: () => void;
}

const DEFAULT_GUEST_VALUES: GuestMemberFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  side: 'mutual',
  isChild: false,
  dietaryNotes: '',
};

export function GuestMemberEditorPanel({
  mode,
  householdName,
  initialValues = DEFAULT_GUEST_VALUES,
  isSubmitting,
  errorMessage,
  onSubmitValues,
  onCancel,
}: GuestMemberEditorPanelProps): JSX.Element {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GuestMemberFormValues>({
    resolver: zodResolver(guestMemberFormSchema),
    defaultValues: initialValues,
  });

  return (
    <form
      noValidate
      data-testid={mode === 'create' ? 'create-guest-form' : 'edit-guest-form'}
      onSubmit={(event) => void handleSubmit(onSubmitValues)(event)}
      className="bg-muted/25 space-y-3 rounded-lg border p-3.5"
    >
      <h4 className="text-xs font-semibold tracking-wide uppercase">
        {mode === 'create' ? `Add Guest to ${householdName}` : `Edit Guest in ${householdName}`}
      </h4>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`guest-first-${mode}`}>First Name</Label>
          <Input
            id={`guest-first-${mode}`}
            data-testid="guest-first-name-input"
            placeholder="Elena"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.firstName)}
            {...register('firstName')}
          />
          {errors.firstName ? (
            <p role="alert" className="text-destructive text-xs">
              {errors.firstName.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`guest-last-${mode}`}>Last Name</Label>
          <Input
            id={`guest-last-${mode}`}
            data-testid="guest-last-name-input"
            placeholder="Rivera"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.lastName)}
            {...register('lastName')}
          />
          {errors.lastName ? (
            <p role="alert" className="text-destructive text-xs">
              {errors.lastName.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`guest-email-${mode}`}>Email (Organizer Private)</Label>
          <Input
            id={`guest-email-${mode}`}
            data-testid="guest-email-input"
            type="email"
            placeholder="elena@example.com"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
          />
          {errors.email ? (
            <p role="alert" className="text-destructive text-xs">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`guest-phone-${mode}`}>Phone (Organizer Private)</Label>
          <Input
            id={`guest-phone-${mode}`}
            data-testid="guest-phone-input"
            placeholder="+63 917 555 0101"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.phone)}
            {...register('phone')}
          />
          {errors.phone ? (
            <p role="alert" className="text-destructive text-xs">
              {errors.phone.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`guest-side-${mode}`}>Celebration Side</Label>
          <NativeSelect
            id={`guest-side-${mode}`}
            data-testid="guest-side-select"
            disabled={isSubmitting}
            {...register('side')}
          >
            {GUEST_SIDE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {GUEST_SIDE_LABELS[option]}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1">
          <Label htmlFor={`guest-dietary-${mode}`}>Dietary Notes</Label>
          <Input
            id={`guest-dietary-${mode}`}
            data-testid="guest-dietary-input"
            placeholder="e.g., Vegetarian, nut allergy"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.dietaryNotes)}
            {...register('dietaryNotes')}
          />
          {errors.dietaryNotes ? (
            <p role="alert" className="text-destructive text-xs">
              {errors.dietaryNotes.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`guest-child-${mode}`}
          data-testid="guest-is-child-checkbox"
          type="checkbox"
          disabled={isSubmitting}
          className="size-4 rounded border"
          {...register('isChild')}
        />
        <Label htmlFor={`guest-child-${mode}`} className="text-xs font-normal">
          Child / Youth Attendee
        </Label>
      </div>

      {errorMessage ? (
        <p role="alert" className="text-destructive text-xs">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting} data-testid="save-guest-button">
          {isSubmitting ? 'Saving…' : mode === 'create' ? 'Add Guest' : 'Save Guest'}
        </Button>
      </div>
    </form>
  );
}
