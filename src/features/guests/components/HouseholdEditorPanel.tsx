import { zodResolver } from '@hookform/resolvers/zod';
import type { JSX } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  type HouseholdFormValues,
  householdFormSchema,
} from '@/features/guests/schemas/guestSchemas';

export interface HouseholdEditorPanelProps {
  readonly mode: 'create' | 'edit';
  readonly initialValues?: HouseholdFormValues;
  readonly isSubmitting: boolean;
  readonly errorMessage: string | null;
  readonly onSubmitValues: (values: HouseholdFormValues) => Promise<void>;
  readonly onCancel: () => void;
}

const DEFAULT_HOUSEHOLD_VALUES: HouseholdFormValues = {
  displayName: '',
  maxAttendees: 2,
  notes: '',
};

export function HouseholdEditorPanel({
  mode,
  initialValues = DEFAULT_HOUSEHOLD_VALUES,
  isSubmitting,
  errorMessage,
  onSubmitValues,
  onCancel,
}: HouseholdEditorPanelProps): JSX.Element {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<HouseholdFormValues>({
    resolver: zodResolver(householdFormSchema),
    defaultValues: initialValues,
  });

  return (
    <form
      noValidate
      data-testid={mode === 'create' ? 'create-household-form' : 'edit-household-form'}
      onSubmit={(event) => void handleSubmit(onSubmitValues)(event)}
      className="bg-muted/30 space-y-4 rounded-lg border p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {mode === 'create' ? 'Create Household Group' : 'Edit Household Group'}
        </h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <div className="space-y-1.5">
          <Label htmlFor={`household-name-${mode}`}>Household Display Name</Label>
          <Input
            id={`household-name-${mode}`}
            data-testid="household-display-name-input"
            placeholder="e.g., The Rivera Family or Jordan & Sam Lee"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.displayName)}
            {...register('displayName')}
          />
          {errors.displayName ? (
            <p role="alert" className="text-destructive text-xs">
              {errors.displayName.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`household-max-${mode}`}>Max Attendees (1–50)</Label>
          <Input
            id={`household-max-${mode}`}
            data-testid="household-max-attendees-input"
            type="number"
            min={1}
            max={50}
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.maxAttendees)}
            {...register('maxAttendees', { valueAsNumber: true })}
          />
          {errors.maxAttendees ? (
            <p role="alert" className="text-destructive text-xs">
              {errors.maxAttendees.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`household-notes-${mode}`}>Organizer Notes (Private)</Label>
        <Textarea
          id={`household-notes-${mode}`}
          data-testid="household-notes-input"
          rows={2}
          placeholder="Optional table assignment or VIP note (never shown to guests)"
          disabled={isSubmitting}
          aria-invalid={Boolean(errors.notes)}
          {...register('notes')}
        />
        {errors.notes ? (
          <p role="alert" className="text-destructive text-xs">
            {errors.notes.message}
          </p>
        ) : null}
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
        <Button type="submit" size="sm" disabled={isSubmitting} data-testid="save-household-button">
          {isSubmitting
            ? 'Saving…'
            : mode === 'create'
              ? 'Create Household'
              : 'Save Household Changes'}
        </Button>
      </div>
    </form>
  );
}
