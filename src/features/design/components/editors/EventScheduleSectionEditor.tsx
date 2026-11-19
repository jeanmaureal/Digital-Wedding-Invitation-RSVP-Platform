import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import type { JSX } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  type EventScheduleSectionContent,
  eventScheduleSectionContentSchema,
} from '@/features/design/schemas/designSchemas';

type EventScheduleFormInput = z.input<typeof eventScheduleSectionContentSchema>;

export interface EventScheduleSectionEditorProps {
  readonly content: EventScheduleSectionContent;
  readonly timezone: string;
  readonly canEdit: boolean;
  readonly onValidChange: (next: EventScheduleSectionContent) => void;
  readonly onValidationIssue: (message: string | null) => void;
}

export function EventScheduleSectionEditor({
  content,
  timezone,
  canEdit,
  onValidChange,
  onValidationIssue,
}: EventScheduleSectionEditorProps): JSX.Element {
  const {
    register,
    control,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<EventScheduleFormInput, unknown, EventScheduleSectionContent>({
    resolver: zodResolver(eventScheduleSectionContentSchema),
    mode: 'onChange',
    defaultValues: {
      heading: content.heading,
      timezoneNote: content.timezoneNote,
      items: content.items.map((item) => ({
        timeLabel: item.timeLabel,
        title: item.title,
        venueName: item.venueName,
        address: item.address,
        notes: item.notes,
      })),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const emitCurrentDraft = () => {
    if (!canEdit) {
      return;
    }
    const parsed = eventScheduleSectionContentSchema.safeParse(getValues());
    if (parsed.success) {
      onValidChange(parsed.data);
    } else {
      onValidationIssue(
        parsed.error.issues[0]?.message ?? 'Please fix validation errors in Order of Events.',
      );
    }
  };

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      onChange={emitCurrentDraft}
      data-testid="section-editor-event_schedule"
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="schedule-heading">Section heading</Label>
        <Input
          id="schedule-heading"
          disabled={!canEdit}
          data-testid="schedule-heading-input"
          aria-invalid={Boolean(errors.heading)}
          {...register('heading')}
        />
        <FormFieldError message={errors.heading?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="schedule-tz-note">Timezone note (displayed alongside {timezone})</Label>
        <Input
          id="schedule-tz-note"
          disabled={!canEdit}
          data-testid="schedule-tz-note-input"
          aria-invalid={Boolean(errors.timezoneNote)}
          {...register('timezoneNote')}
        />
        <FormFieldError message={errors.timezoneNote?.message} />
      </div>

      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Schedule moments ({fields.length}/8)</p>
            <p className="text-muted-foreground text-xs">
              At least 1 event item is required in the schedule.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || fields.length >= 8}
            data-testid="schedule-add-item-button"
            onClick={() => {
              append({
                timeLabel: '8:30 PM',
                title: 'Evening Toast & Dancing',
                venueName: '',
                address: '',
                notes: '',
              });
              void trigger('items');
              emitCurrentDraft();
            }}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add event
          </Button>
        </div>

        {fields.map((field, index) => {
          const itemErrors = errors.items?.[index];
          return (
            <div
              key={field.id}
              data-testid={`schedule-item-${index}`}
              className="bg-muted/20 space-y-3 rounded-lg border p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-wide uppercase">
                  Event {index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit || fields.length <= 1}
                  className="text-destructive h-7 px-2 text-xs"
                  aria-label={`Remove event ${index + 1}`}
                  data-testid={`schedule-remove-item-${index}`}
                  onClick={() => {
                    remove(index);
                    void trigger('items');
                    emitCurrentDraft();
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Remove
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`schedule-time-${index}`}>Time label</Label>
                  <Input
                    id={`schedule-time-${index}`}
                    disabled={!canEdit}
                    data-testid={`schedule-time-${index}`}
                    aria-invalid={Boolean(itemErrors?.timeLabel)}
                    {...register(`items.${index}.timeLabel`)}
                  />
                  <FormFieldError message={itemErrors?.timeLabel?.message} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`schedule-title-${index}`}>Event title</Label>
                  <Input
                    id={`schedule-title-${index}`}
                    disabled={!canEdit}
                    data-testid={`schedule-title-${index}`}
                    aria-invalid={Boolean(itemErrors?.title)}
                    {...register(`items.${index}.title`)}
                  />
                  <FormFieldError message={itemErrors?.title?.message} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`schedule-venue-${index}`}>Venue name (optional)</Label>
                  <Input
                    id={`schedule-venue-${index}`}
                    disabled={!canEdit}
                    data-testid={`schedule-venue-${index}`}
                    aria-invalid={Boolean(itemErrors?.venueName)}
                    {...register(`items.${index}.venueName`)}
                  />
                  <FormFieldError message={itemErrors?.venueName?.message} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`schedule-address-${index}`}>Address (optional)</Label>
                  <Input
                    id={`schedule-address-${index}`}
                    disabled={!canEdit}
                    data-testid={`schedule-address-${index}`}
                    aria-invalid={Boolean(itemErrors?.address)}
                    {...register(`items.${index}.address`)}
                  />
                  <FormFieldError message={itemErrors?.address?.message} />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`schedule-notes-${index}`}>Guest notes (optional)</Label>
                <Textarea
                  id={`schedule-notes-${index}`}
                  rows={2}
                  disabled={!canEdit}
                  data-testid={`schedule-notes-${index}`}
                  aria-invalid={Boolean(itemErrors?.notes)}
                  {...register(`items.${index}.notes`)}
                />
                <FormFieldError message={itemErrors?.notes?.message} />
              </div>
            </div>
          );
        })}
      </div>
    </form>
  );
}
