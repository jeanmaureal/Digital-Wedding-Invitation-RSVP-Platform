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
  nullableHttpsUrlSchema,
  type VenueTravelSectionContent,
  venueTravelSectionContentSchema,
} from '@/features/design/schemas/designSchemas';

const httpsUrlInputSchema = z
  .string()
  .transform((val): string | null => val)
  .pipe(nullableHttpsUrlSchema);

const venueTravelFormSchema = z
  .strictObject({
    heading: venueTravelSectionContentSchema.shape.heading,
    sameLocation: z.boolean().optional(),
    ceremonyVenueName: venueTravelSectionContentSchema.shape.ceremonyVenueName,
    ceremonyAddress: venueTravelSectionContentSchema.shape.ceremonyAddress,
    receptionVenueName: venueTravelSectionContentSchema.shape.receptionVenueName,
    receptionAddress: venueTravelSectionContentSchema.shape.receptionAddress,
    directionsNote: venueTravelSectionContentSchema.shape.directionsNote,
    mapUrl: httpsUrlInputSchema,
    accommodations: z
      .array(
        z.strictObject({
          name: z
            .string()
            .trim()
            .min(1, 'Accommodation name must be at least 1 characters.')
            .max(80),
          note: z.string().trim().max(200),
          bookingUrl: httpsUrlInputSchema,
        }),
      )
      .max(4),
  })
  .pipe(venueTravelSectionContentSchema);

type VenueTravelFormInput = z.input<typeof venueTravelFormSchema>;

export interface VenueTravelSectionEditorProps {
  readonly content: VenueTravelSectionContent;
  readonly canEdit: boolean;
  readonly onValidChange: (next: VenueTravelSectionContent) => void;
  readonly onValidationIssue: (message: string | null) => void;
}

function inferInitialSameLocation(content: VenueTravelSectionContent): boolean {
  if (typeof content.sameLocation === 'boolean') {
    return content.sameLocation;
  }
  const cName = content.ceremonyVenueName.trim().toLowerCase();
  const rName = content.receptionVenueName.trim().toLowerCase();
  const cAddr = content.ceremonyAddress.trim().toLowerCase();
  const rAddr = content.receptionAddress.trim().toLowerCase();
  return Boolean((cName || cAddr) && cName === rName && cAddr === rAddr);
}

export function VenueTravelSectionEditor({
  content,
  canEdit,
  onValidChange,
  onValidationIssue,
}: VenueTravelSectionEditorProps): JSX.Element {
  const {
    register,
    control,
    getValues,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<VenueTravelFormInput, unknown, VenueTravelSectionContent>({
    resolver: zodResolver(venueTravelFormSchema),
    mode: 'onChange',
    defaultValues: {
      heading: content.heading,
      sameLocation: inferInitialSameLocation(content),
      ceremonyVenueName: content.ceremonyVenueName,
      ceremonyAddress: content.ceremonyAddress,
      receptionVenueName: content.receptionVenueName,
      receptionAddress: content.receptionAddress,
      directionsNote: content.directionsNote,
      mapUrl: content.mapUrl ?? '',
      accommodations: content.accommodations.map((item) => ({
        name: item.name,
        note: item.note,
        bookingUrl: item.bookingUrl ?? '',
      })),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'accommodations',
  });

  const isSameLocation = Boolean(useWatch({ control, name: 'sameLocation' }));

  const emitCurrentDraft = () => {
    if (!canEdit) {
      return;
    }
    const raw = getValues();
    const normalized = raw.sameLocation
      ? {
          ...raw,
          receptionVenueName: raw.ceremonyVenueName,
          receptionAddress: raw.ceremonyAddress,
        }
      : raw;

    const parsed = venueTravelFormSchema.safeParse(normalized);
    if (parsed.success) {
      onValidChange(parsed.data);
    } else {
      onValidationIssue(
        parsed.error.issues[0]?.message ?? 'Please fix validation errors in Venue & Travel.',
      );
    }
  };

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      onChange={emitCurrentDraft}
      data-testid="section-editor-venue_travel"
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="venue-heading">Section heading</Label>
        <Input
          id="venue-heading"
          disabled={!canEdit}
          data-testid="venue-heading-input"
          aria-invalid={Boolean(errors.heading)}
          {...register('heading')}
        />
        <FormFieldError message={errors.heading?.message} />
      </div>

      <label className="bg-muted/20 flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          disabled={!canEdit}
          data-testid="venue-same-location-checkbox"
          checked={isSameLocation}
          onChange={(event) => {
            const checked = event.target.checked;
            setValue('sameLocation', checked, { shouldDirty: true });
            if (checked) {
              setValue('receptionVenueName', getValues('ceremonyVenueName'), { shouldDirty: true });
              setValue('receptionAddress', getValues('ceremonyAddress'), { shouldDirty: true });
            }
            emitCurrentDraft();
          }}
          className="accent-primary size-4 rounded border"
        />
        <span className="text-xs font-medium">
          Ceremony and reception are at the same location
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="venue-ceremony-name">
            {isSameLocation ? 'Ceremony & reception venue (optional)' : 'Ceremony venue (optional)'}
          </Label>
          <Input
            id="venue-ceremony-name"
            disabled={!canEdit}
            data-testid="venue-ceremony-name-input"
            aria-invalid={Boolean(errors.ceremonyVenueName)}
            {...register('ceremonyVenueName')}
          />
          <FormFieldError message={errors.ceremonyVenueName?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="venue-ceremony-address">
            {isSameLocation ? 'Venue address (optional)' : 'Ceremony address (optional)'}
          </Label>
          <Input
            id="venue-ceremony-address"
            disabled={!canEdit}
            data-testid="venue-ceremony-address-input"
            aria-invalid={Boolean(errors.ceremonyAddress)}
            {...register('ceremonyAddress')}
          />
          <FormFieldError message={errors.ceremonyAddress?.message} />
        </div>
      </div>

      {!isSameLocation ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="venue-reception-name">Reception venue (optional)</Label>
            <Input
              id="venue-reception-name"
              disabled={!canEdit}
              data-testid="venue-reception-name-input"
              aria-invalid={Boolean(errors.receptionVenueName)}
              {...register('receptionVenueName')}
            />
            <FormFieldError message={errors.receptionVenueName?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venue-reception-address">Reception address (optional)</Label>
            <Input
              id="venue-reception-address"
              disabled={!canEdit}
              data-testid="venue-reception-address-input"
              aria-invalid={Boolean(errors.receptionAddress)}
              {...register('receptionAddress')}
            />
            <FormFieldError message={errors.receptionAddress?.message} />
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="venue-directions-note">Directions &amp; parking note (optional)</Label>
        <Textarea
          id="venue-directions-note"
          rows={3}
          disabled={!canEdit}
          data-testid="venue-directions-note-textarea"
          aria-invalid={Boolean(errors.directionsNote)}
          {...register('directionsNote')}
        />
        <FormFieldError message={errors.directionsNote?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="venue-map-url">External map URL (https:// only, optional)</Label>
        <Input
          id="venue-map-url"
          type="url"
          placeholder="https://maps.google.com/..."
          disabled={!canEdit}
          data-testid="venue-map-url-input"
          aria-invalid={Boolean(errors.mapUrl)}
          {...register('mapUrl')}
        />
        <FormFieldError id="venue-map-url-error" message={errors.mapUrl?.message} />
      </div>

      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Recommended accommodations ({fields.length}/4)</p>
            <p className="text-muted-foreground text-xs">
              Share nearby hotels and secure https:// booking links.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || fields.length >= 4}
            data-testid="venue-add-hotel-button"
            onClick={() => {
              append({
                name: 'Partner Hotel',
                note: 'Mention the wedding block when booking.',
                bookingUrl: '',
              });
              void trigger('accommodations');
              emitCurrentDraft();
            }}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add hotel
          </Button>
        </div>

        {fields.map((field, index) => {
          const itemErrors = errors.accommodations?.[index];
          return (
            <div
              key={field.id}
              data-testid={`venue-hotel-item-${index}`}
              className="bg-muted/20 space-y-3 rounded-lg border p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-wide uppercase">
                  Accommodation {index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit}
                  className="text-destructive h-7 px-2 text-xs"
                  aria-label={`Remove accommodation ${index + 1}`}
                  data-testid={`venue-remove-hotel-${index}`}
                  onClick={() => {
                    remove(index);
                    void trigger('accommodations');
                    emitCurrentDraft();
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Remove
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`venue-hotel-name-${index}`}>Hotel name</Label>
                  <Input
                    id={`venue-hotel-name-${index}`}
                    disabled={!canEdit}
                    data-testid={`venue-hotel-name-${index}`}
                    aria-invalid={Boolean(itemErrors?.name)}
                    {...register(`accommodations.${index}.name`)}
                  />
                  <FormFieldError message={itemErrors?.name?.message} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`venue-hotel-url-${index}`}>Booking URL (https://)</Label>
                  <Input
                    id={`venue-hotel-url-${index}`}
                    type="url"
                    placeholder="https://..."
                    disabled={!canEdit}
                    data-testid={`venue-hotel-url-${index}`}
                    aria-invalid={Boolean(itemErrors?.bookingUrl)}
                    {...register(`accommodations.${index}.bookingUrl`)}
                  />
                  <FormFieldError message={itemErrors?.bookingUrl?.message} />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`venue-hotel-note-${index}`}>Guest note (optional)</Label>
                <Input
                  id={`venue-hotel-note-${index}`}
                  disabled={!canEdit}
                  data-testid={`venue-hotel-note-${index}`}
                  aria-invalid={Boolean(itemErrors?.note)}
                  {...register(`accommodations.${index}.note`)}
                />
                <FormFieldError message={itemErrors?.note?.message} />
              </div>
            </div>
          );
        })}
      </div>
    </form>
  );
}
