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
  type FaqNotesSectionContent,
  faqNotesSectionContentSchema,
} from '@/features/design/schemas/designSchemas';

type FaqNotesFormInput = z.input<typeof faqNotesSectionContentSchema>;

export interface FaqNotesSectionEditorProps {
  readonly content: FaqNotesSectionContent;
  readonly canEdit: boolean;
  readonly onValidChange: (next: FaqNotesSectionContent) => void;
  readonly onValidationIssue: (message: string | null) => void;
}

export function FaqNotesSectionEditor({
  content,
  canEdit,
  onValidChange,
  onValidationIssue,
}: FaqNotesSectionEditorProps): JSX.Element {
  const {
    register,
    control,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<FaqNotesFormInput, unknown, FaqNotesSectionContent>({
    resolver: zodResolver(faqNotesSectionContentSchema),
    mode: 'onChange',
    defaultValues: {
      heading: content.heading,
      items: content.items.map((item) => ({
        question: item.question,
        answer: item.answer,
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
    const parsed = faqNotesSectionContentSchema.safeParse(getValues());
    if (parsed.success) {
      onValidChange(parsed.data);
    } else {
      onValidationIssue(
        parsed.error.issues[0]?.message ??
          'Please fix validation errors in Questions & Guest Notes.',
      );
    }
  };

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      onChange={emitCurrentDraft}
      data-testid="section-editor-faq_notes"
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="faq-heading">Section heading</Label>
        <Input
          id="faq-heading"
          disabled={!canEdit}
          data-testid="faq-heading-input"
          aria-invalid={Boolean(errors.heading)}
          {...register('heading')}
        />
        <FormFieldError message={errors.heading?.message} />
      </div>

      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Questions &amp; answers ({fields.length}/10)</p>
            <p className="text-muted-foreground text-xs">
              At least 1 question is required when using this section.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || fields.length >= 10}
            data-testid="faq-add-item-button"
            onClick={() => {
              append({
                question: 'Is guest parking available?',
                answer: 'Complimentary parking will be available on site.',
              });
              void trigger('items');
              emitCurrentDraft();
            }}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add question
          </Button>
        </div>

        {fields.map((field, index) => {
          const itemErrors = errors.items?.[index];
          return (
            <div
              key={field.id}
              data-testid={`faq-item-${index}`}
              className="bg-muted/20 space-y-3 rounded-lg border p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-wide uppercase">
                  Question {index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit || fields.length <= 1}
                  className="text-destructive h-7 px-2 text-xs"
                  aria-label={`Remove question ${index + 1}`}
                  data-testid={`faq-remove-item-${index}`}
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

              <div className="space-y-1">
                <Label htmlFor={`faq-question-${index}`}>Question</Label>
                <Input
                  id={`faq-question-${index}`}
                  disabled={!canEdit}
                  data-testid={`faq-question-${index}`}
                  aria-invalid={Boolean(itemErrors?.question)}
                  {...register(`items.${index}.question`)}
                />
                <FormFieldError message={itemErrors?.question?.message} />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`faq-answer-${index}`}>Answer</Label>
                <Textarea
                  id={`faq-answer-${index}`}
                  rows={2}
                  disabled={!canEdit}
                  data-testid={`faq-answer-${index}`}
                  aria-invalid={Boolean(itemErrors?.answer)}
                  {...register(`items.${index}.answer`)}
                />
                <FormFieldError message={itemErrors?.answer?.message} />
              </div>
            </div>
          );
        })}
      </div>
    </form>
  );
}
