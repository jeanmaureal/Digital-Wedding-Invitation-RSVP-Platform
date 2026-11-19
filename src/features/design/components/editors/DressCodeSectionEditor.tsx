import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import type { JSX } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  type DressCodeSectionContent,
  dressCodeSectionContentSchema,
  hexColorSchema,
} from '@/features/design/schemas/designSchemas';

const dressCodeFormSchema = z
  .strictObject({
    heading: dressCodeSectionContentSchema.shape.heading,
    dressCodeTitle: dressCodeSectionContentSchema.shape.dressCodeTitle,
    guidance: dressCodeSectionContentSchema.shape.guidance,
    swatches: z.array(z.strictObject({ hex: hexColorSchema })).max(5),
  })
  .transform((vals) => ({
    heading: vals.heading,
    dressCodeTitle: vals.dressCodeTitle,
    guidance: vals.guidance,
    swatchHexes: vals.swatches.map((s) => s.hex),
  }))
  .pipe(dressCodeSectionContentSchema);

type DressCodeFormInput = z.input<typeof dressCodeFormSchema>;

export interface DressCodeSectionEditorProps {
  readonly content: DressCodeSectionContent;
  readonly canEdit: boolean;
  readonly onValidChange: (next: DressCodeSectionContent) => void;
  readonly onValidationIssue: (message: string | null) => void;
}

export function DressCodeSectionEditor({
  content,
  canEdit,
  onValidChange,
  onValidationIssue,
}: DressCodeSectionEditorProps): JSX.Element {
  const {
    register,
    control,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<DressCodeFormInput, unknown, DressCodeSectionContent>({
    resolver: zodResolver(dressCodeFormSchema),
    mode: 'onChange',
    defaultValues: {
      heading: content.heading,
      dressCodeTitle: content.dressCodeTitle,
      guidance: content.guidance,
      swatches: content.swatchHexes.map((hex) => ({ hex })),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'swatches',
  });

  const emitCurrentDraft = () => {
    if (!canEdit) {
      return;
    }
    const parsed = dressCodeFormSchema.safeParse(getValues());
    if (parsed.success) {
      onValidChange(parsed.data);
    } else {
      onValidationIssue(
        parsed.error.issues[0]?.message ?? 'Please fix validation errors in Attire & Palette.',
      );
    }
  };

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      onChange={emitCurrentDraft}
      data-testid="section-editor-dress_code"
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="dress-heading">Section heading</Label>
        <Input
          id="dress-heading"
          disabled={!canEdit}
          data-testid="dress-heading-input"
          aria-invalid={Boolean(errors.heading)}
          {...register('heading')}
        />
        <FormFieldError message={errors.heading?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dress-title">Dress code title</Label>
        <Input
          id="dress-title"
          disabled={!canEdit}
          data-testid="dress-title-input"
          aria-invalid={Boolean(errors.dressCodeTitle)}
          {...register('dressCodeTitle')}
        />
        <FormFieldError message={errors.dressCodeTitle?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dress-guidance">Guest attire guidance (optional)</Label>
        <Textarea
          id="dress-guidance"
          rows={3}
          disabled={!canEdit}
          data-testid="dress-guidance-textarea"
          aria-invalid={Boolean(errors.guidance)}
          {...register('guidance')}
        />
        <FormFieldError message={errors.guidance?.message} />
      </div>

      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Suggested color swatches ({fields.length}/5)</p>
            <p className="text-muted-foreground text-xs">
              Enter 6-digit hex color codes (e.g. #C8B6A6).
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || fields.length >= 5}
            data-testid="dress-add-swatch-button"
            onClick={() => {
              append({ hex: '#D4C5B9' });
              void trigger('swatches');
              emitCurrentDraft();
            }}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add swatch
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field, index) => {
            const swatchError = errors.swatches?.[index]?.hex?.message;
            return (
              <div
                key={field.id}
                data-testid={`dress-swatch-item-${index}`}
                className="bg-muted/20 space-y-1.5 rounded-lg border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`dress-swatch-hex-${index}`}>Swatch {index + 1}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!canEdit}
                    className="text-destructive h-6 px-1.5 text-xs"
                    aria-label={`Remove swatch ${index + 1}`}
                    data-testid={`dress-remove-swatch-${index}`}
                    onClick={() => {
                      remove(index);
                      void trigger('swatches');
                      emitCurrentDraft();
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
                <Input
                  id={`dress-swatch-hex-${index}`}
                  placeholder="#C8B6A6"
                  disabled={!canEdit}
                  data-testid={`dress-swatch-hex-${index}`}
                  aria-invalid={Boolean(swatchError)}
                  {...register(`swatches.${index}.hex`)}
                />
                <FormFieldError message={swatchError} />
              </div>
            );
          })}
        </div>
      </div>
    </form>
  );
}
