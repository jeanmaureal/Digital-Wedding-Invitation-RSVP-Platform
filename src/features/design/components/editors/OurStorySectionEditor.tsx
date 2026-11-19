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
  type OurStorySectionContent,
  ourStorySectionContentSchema,
} from '@/features/design/schemas/designSchemas';

type OurStoryFormInput = z.input<typeof ourStorySectionContentSchema>;

export interface OurStorySectionEditorProps {
  readonly content: OurStorySectionContent;
  readonly canEdit: boolean;
  readonly onValidChange: (next: OurStorySectionContent) => void;
  readonly onValidationIssue: (message: string | null) => void;
}

export function OurStorySectionEditor({
  content,
  canEdit,
  onValidChange,
  onValidationIssue,
}: OurStorySectionEditorProps): JSX.Element {
  const {
    register,
    control,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<OurStoryFormInput, unknown, OurStorySectionContent>({
    resolver: zodResolver(ourStorySectionContentSchema),
    mode: 'onChange',
    defaultValues: {
      heading: content.heading,
      leadQuote: content.leadQuote,
      narrative: content.narrative,
      milestones: content.milestones.map((m) => ({
        periodLabel: m.periodLabel,
        title: m.title,
        description: m.description,
      })),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'milestones',
  });

  const emitCurrentDraft = () => {
    if (!canEdit) {
      return;
    }
    const parsed = ourStorySectionContentSchema.safeParse(getValues());
    if (parsed.success) {
      onValidChange(parsed.data);
    } else {
      onValidationIssue(
        parsed.error.issues[0]?.message ?? 'Please fix validation errors in Our Story.',
      );
    }
  };

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      onChange={emitCurrentDraft}
      data-testid="section-editor-our_story"
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="story-heading">Section heading</Label>
        <Input
          id="story-heading"
          disabled={!canEdit}
          data-testid="story-heading-input"
          aria-invalid={Boolean(errors.heading)}
          {...register('heading')}
        />
        <FormFieldError message={errors.heading?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="story-lead-quote">Lead quote (optional)</Label>
        <Input
          id="story-lead-quote"
          disabled={!canEdit}
          data-testid="story-lead-quote-input"
          aria-invalid={Boolean(errors.leadQuote)}
          {...register('leadQuote')}
        />
        <FormFieldError message={errors.leadQuote?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="story-narrative">Story narrative</Label>
        <Textarea
          id="story-narrative"
          rows={4}
          disabled={!canEdit}
          data-testid="story-narrative-textarea"
          aria-invalid={Boolean(errors.narrative)}
          {...register('narrative')}
        />
        <FormFieldError message={errors.narrative?.message} />
      </div>

      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Story milestones ({fields.length}/6)</p>
            <p className="text-muted-foreground text-xs">
              Highlight up to 6 meaningful chapters in your journey.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || fields.length >= 6}
            data-testid="story-add-milestone-button"
            onClick={() => {
              append({
                periodLabel: 'New Chapter',
                title: 'Memorable Moment',
                description: 'Share a short memory with your guests.',
              });
              void trigger('milestones');
              emitCurrentDraft();
            }}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add milestone
          </Button>
        </div>

        {fields.map((field, index) => {
          const itemErrors = errors.milestones?.[index];
          return (
            <div
              key={field.id}
              data-testid={`story-milestone-item-${index}`}
              className="bg-muted/20 space-y-3 rounded-lg border p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-wide uppercase">
                  Milestone {index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit}
                  className="text-destructive h-7 px-2 text-xs"
                  aria-label={`Remove milestone ${index + 1}`}
                  data-testid={`story-remove-milestone-${index}`}
                  onClick={() => {
                    remove(index);
                    void trigger('milestones');
                    emitCurrentDraft();
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Remove
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`story-milestone-period-${index}`}>Period / date label</Label>
                  <Input
                    id={`story-milestone-period-${index}`}
                    disabled={!canEdit}
                    data-testid={`story-milestone-period-${index}`}
                    aria-invalid={Boolean(itemErrors?.periodLabel)}
                    {...register(`milestones.${index}.periodLabel`)}
                  />
                  <FormFieldError message={itemErrors?.periodLabel?.message} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`story-milestone-title-${index}`}>Milestone title</Label>
                  <Input
                    id={`story-milestone-title-${index}`}
                    disabled={!canEdit}
                    data-testid={`story-milestone-title-${index}`}
                    aria-invalid={Boolean(itemErrors?.title)}
                    {...register(`milestones.${index}.title`)}
                  />
                  <FormFieldError message={itemErrors?.title?.message} />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`story-milestone-desc-${index}`}>Description</Label>
                <Textarea
                  id={`story-milestone-desc-${index}`}
                  rows={2}
                  disabled={!canEdit}
                  data-testid={`story-milestone-desc-${index}`}
                  aria-invalid={Boolean(itemErrors?.description)}
                  {...register(`milestones.${index}.description`)}
                />
                <FormFieldError message={itemErrors?.description?.message} />
              </div>
            </div>
          );
        })}
      </div>
    </form>
  );
}
