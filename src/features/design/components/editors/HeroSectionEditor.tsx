import { zodResolver } from '@hookform/resolvers/zod';
import type { JSX } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  type HeroSectionContent,
  heroSectionContentSchema,
} from '@/features/design/schemas/designSchemas';

type HeroFormInput = z.input<typeof heroSectionContentSchema>;

export interface HeroSectionEditorProps {
  readonly content: HeroSectionContent;
  readonly canEdit: boolean;
  readonly onValidChange: (next: HeroSectionContent) => void;
  readonly onValidationIssue: (message: string | null) => void;
}

export function HeroSectionEditor({
  content,
  canEdit,
  onValidChange,
  onValidationIssue,
}: HeroSectionEditorProps): JSX.Element {
  const {
    register,
    getValues,
    formState: { errors },
  } = useForm<HeroFormInput, unknown, HeroSectionContent>({
    resolver: zodResolver(heroSectionContentSchema),
    mode: 'onChange',
    defaultValues: {
      eyebrow: content.eyebrow,
      coupleHeadline: content.coupleHeadline,
      celebrationSubtitle: content.celebrationSubtitle,
      displayDateLabel: content.displayDateLabel,
      locationSummary: content.locationSummary,
      primaryCtaLabel: content.primaryCtaLabel,
      showCountdownBadge: content.showCountdownBadge,
      alignment: content.alignment,
    },
  });

  const emitCurrentDraft = () => {
    if (!canEdit) {
      return;
    }
    const parsed = heroSectionContentSchema.safeParse(getValues());
    if (parsed.success) {
      onValidChange(parsed.data);
    } else {
      onValidationIssue(
        parsed.error.issues[0]?.message ?? 'Please fix validation errors in Hero Cover.',
      );
    }
  };

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      onChange={emitCurrentDraft}
      data-testid="section-editor-hero"
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="hero-eyebrow">Eyebrow line (optional)</Label>
        <Input
          id="hero-eyebrow"
          disabled={!canEdit}
          data-testid="hero-eyebrow-input"
          aria-invalid={Boolean(errors.eyebrow)}
          {...register('eyebrow')}
        />
        <FormFieldError message={errors.eyebrow?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hero-couple-headline">Couple headline</Label>
        <Input
          id="hero-couple-headline"
          disabled={!canEdit}
          data-testid="hero-couple-headline-input"
          aria-invalid={Boolean(errors.coupleHeadline)}
          {...register('coupleHeadline')}
        />
        <FormFieldError message={errors.coupleHeadline?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hero-subtitle">Celebration subtitle (optional)</Label>
        <Input
          id="hero-subtitle"
          disabled={!canEdit}
          data-testid="hero-subtitle-input"
          aria-invalid={Boolean(errors.celebrationSubtitle)}
          {...register('celebrationSubtitle')}
        />
        <FormFieldError message={errors.celebrationSubtitle?.message} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="hero-date-label">Custom date label override (optional)</Label>
          <Input
            id="hero-date-label"
            placeholder="Uses wedding event date when blank"
            disabled={!canEdit}
            data-testid="hero-date-label-input"
            aria-invalid={Boolean(errors.displayDateLabel)}
            {...register('displayDateLabel')}
          />
          <FormFieldError message={errors.displayDateLabel?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="hero-location-summary">Location summary (optional)</Label>
          <Input
            id="hero-location-summary"
            disabled={!canEdit}
            data-testid="hero-location-summary-input"
            aria-invalid={Boolean(errors.locationSummary)}
            {...register('locationSummary')}
          />
          <FormFieldError message={errors.locationSummary?.message} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="hero-primary-cta">Primary button label</Label>
          <Input
            id="hero-primary-cta"
            disabled={!canEdit}
            data-testid="hero-primary-cta-input"
            aria-invalid={Boolean(errors.primaryCtaLabel)}
            {...register('primaryCtaLabel')}
          />
          <FormFieldError message={errors.primaryCtaLabel?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="hero-alignment">Hero layout alignment</Label>
          <NativeSelect
            id="hero-alignment"
            disabled={!canEdit}
            data-testid="hero-alignment-select"
            {...register('alignment')}
          >
            <option value="center">Centered editorial</option>
            <option value="split">Left-aligned split</option>
          </NativeSelect>
          <FormFieldError message={errors.alignment?.message} />
        </div>
      </div>

      <label className="flex items-center gap-2.5 rounded-lg border p-3 text-sm">
        <input
          type="checkbox"
          disabled={!canEdit}
          data-testid="hero-countdown-checkbox"
          className="size-4 rounded border"
          {...register('showCountdownBadge')}
        />
        <span>Display days-until-celebration badge when event date is in the future</span>
      </label>
    </form>
  );
}
