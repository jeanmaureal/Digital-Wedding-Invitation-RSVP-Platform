import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import type { JSX } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  type DressCodeSectionContent,
  dressCodeSectionContentSchema,
  dressCodeSwatchItemSchema,
} from '@/features/design/schemas/designSchemas';

const dressCodeFormSchema = z
  .strictObject({
    heading: dressCodeSectionContentSchema.shape.heading,
    dressCodeTitle: dressCodeSectionContentSchema.shape.dressCodeTitle,
    guidance: dressCodeSectionContentSchema.shape.guidance,
    swatches: z.array(dressCodeSwatchItemSchema).max(5),
  })
  .transform(
    (vals): DressCodeSectionContent => ({
      heading: vals.heading,
      dressCodeTitle: vals.dressCodeTitle,
      guidance: vals.guidance,
      swatchHexes: vals.swatches.map((s) => s.hex),
      swatches: vals.swatches.map((s) => ({
        hex: s.hex,
        ...(s.label?.trim() ? { label: s.label.trim() } : {}),
        ...(s.subLabel?.trim() ? { subLabel: s.subLabel.trim() } : {}),
      })),
    }),
  );

type DressCodeFormInput = z.input<typeof dressCodeFormSchema>;

export interface DressCodeSectionEditorProps {
  readonly content: DressCodeSectionContent;
  readonly canEdit: boolean;
  readonly onValidChange: (next: DressCodeSectionContent) => void;
  readonly onValidationIssue: (message: string | null) => void;
}

const VALID_HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

export function DressCodeSectionEditor({
  content,
  canEdit,
  onValidChange,
  onValidationIssue,
}: DressCodeSectionEditorProps): JSX.Element {
  const initialSwatches =
    content.swatches && content.swatches.length > 0
      ? content.swatches.map((s) => ({
          hex: s.hex,
          label: s.label ?? '',
          subLabel: s.subLabel ?? '',
        }))
      : content.swatchHexes.map((hex) => ({
          hex,
          label: '',
          subLabel: '',
        }));

  const {
    register,
    control,
    getValues,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<DressCodeFormInput, unknown, DressCodeSectionContent>({
    resolver: zodResolver(dressCodeFormSchema),
    mode: 'onChange',
    defaultValues: {
      heading: content.heading,
      dressCodeTitle: content.dressCodeTitle,
      guidance: content.guidance,
      swatches: initialSwatches,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'swatches',
  });

  const watchedSwatches = useWatch({ control, name: 'swatches' });

  const emitCurrentDraft = () => {
    if (!canEdit) {
      return;
    }
    const parsed = dressCodeFormSchema.safeParse(getValues());
    if (parsed.success) {
      onValidChange({
        ...parsed.data,
        ...(content.style ? { style: content.style } : {}),
      });
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
              Pick a hex color and add an optional label name &amp; motif tone sub-label.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || fields.length >= 5}
            data-testid="dress-add-swatch-button"
            onClick={() => {
              append({ hex: '#D4C5B9', label: '', subLabel: '' });
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
            const hexError = errors.swatches?.[index]?.hex?.message;
            const labelError = errors.swatches?.[index]?.label?.message;
            const subLabelError = errors.swatches?.[index]?.subLabel?.message;
            const currentHex = watchedSwatches?.[index]?.hex ?? '#D4C5B9';
            const pickerHex = VALID_HEX_REGEX.test(currentHex) ? currentHex : '#D4C5B9';

            return (
              <div
                key={field.id}
                data-testid={`dress-swatch-item-${index}`}
                className="bg-muted/20 space-y-2.5 rounded-lg border p-3"
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

                {/* Color picker + Hex input */}
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={`Swatch ${index + 1} color picker`}
                    disabled={!canEdit}
                    value={pickerHex}
                    onChange={(event) => {
                      setValue(`swatches.${index}.hex`, event.target.value.toUpperCase(), {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                      emitCurrentDraft();
                    }}
                    className="h-9 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5 disabled:cursor-not-allowed"
                  />
                  <Input
                    id={`dress-swatch-hex-${index}`}
                    placeholder="#3E4C30"
                    disabled={!canEdit}
                    data-testid={`dress-swatch-hex-${index}`}
                    aria-invalid={Boolean(hexError)}
                    {...register(`swatches.${index}.hex`)}
                  />
                </div>
                <FormFieldError message={hexError} />

                {/* Swatch label name */}
                <div className="space-y-1">
                  <Label
                    htmlFor={`dress-swatch-label-${index}`}
                    className="text-muted-foreground text-xs"
                  >
                    Color name
                  </Label>
                  <Input
                    id={`dress-swatch-label-${index}`}
                    placeholder="e.g., Olive Green"
                    disabled={!canEdit}
                    data-testid={`dress-swatch-label-${index}`}
                    aria-invalid={Boolean(labelError)}
                    {...register(`swatches.${index}.label`)}
                  />
                  <FormFieldError message={labelError} />
                </div>

                {/* Swatch motif tone sub-label */}
                <div className="space-y-1">
                  <Label
                    htmlFor={`dress-swatch-sublabel-${index}`}
                    className="text-muted-foreground text-xs"
                  >
                    Motif tone sub-label
                  </Label>
                  <Input
                    id={`dress-swatch-sublabel-${index}`}
                    placeholder="e.g., Rich Botanical"
                    disabled={!canEdit}
                    data-testid={`dress-swatch-sublabel-${index}`}
                    aria-invalid={Boolean(subLabelError)}
                    {...register(`swatches.${index}.subLabel`)}
                  />
                  <FormFieldError message={subLabelError} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </form>
  );
}
