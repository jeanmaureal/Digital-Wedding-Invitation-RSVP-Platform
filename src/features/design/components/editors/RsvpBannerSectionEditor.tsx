import { zodResolver } from '@hookform/resolvers/zod';
import type { JSX } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  type RsvpBannerSectionContent,
  rsvpBannerSectionContentSchema,
} from '@/features/design/schemas/designSchemas';

type RsvpBannerFormInput = z.input<typeof rsvpBannerSectionContentSchema>;

export interface RsvpBannerSectionEditorProps {
  readonly content: RsvpBannerSectionContent;
  readonly canEdit: boolean;
  readonly onValidChange: (next: RsvpBannerSectionContent) => void;
  readonly onValidationIssue: (message: string | null) => void;
}

export function RsvpBannerSectionEditor({
  content,
  canEdit,
  onValidChange,
  onValidationIssue,
}: RsvpBannerSectionEditorProps): JSX.Element {
  const {
    register,
    getValues,
    formState: { errors },
  } = useForm<RsvpBannerFormInput, unknown, RsvpBannerSectionContent>({
    resolver: zodResolver(rsvpBannerSectionContentSchema),
    mode: 'onChange',
    defaultValues: {
      heading: content.heading,
      message: content.message,
      buttonLabel: content.buttonLabel,
      showDeadline: content.showDeadline,
    },
  });

  const emitCurrentDraft = () => {
    if (!canEdit) {
      return;
    }
    const parsed = rsvpBannerSectionContentSchema.safeParse(getValues());
    if (parsed.success) {
      onValidChange(parsed.data);
    } else {
      onValidationIssue(
        parsed.error.issues[0]?.message ?? 'Please fix validation errors in RSVP Call to Action.',
      );
    }
  };

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      onChange={emitCurrentDraft}
      data-testid="section-editor-rsvp_banner"
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="rsvp-banner-heading">RSVP banner heading</Label>
        <Input
          id="rsvp-banner-heading"
          disabled={!canEdit}
          data-testid="rsvp-banner-heading-input"
          aria-invalid={Boolean(errors.heading)}
          {...register('heading')}
        />
        <FormFieldError message={errors.heading?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rsvp-banner-message">RSVP message</Label>
        <Textarea
          id="rsvp-banner-message"
          rows={3}
          disabled={!canEdit}
          data-testid="rsvp-banner-message-textarea"
          aria-invalid={Boolean(errors.message)}
          {...register('message')}
        />
        <FormFieldError message={errors.message?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rsvp-banner-button-label">RSVP button label</Label>
        <Input
          id="rsvp-banner-button-label"
          disabled={!canEdit}
          data-testid="rsvp-banner-button-label-input"
          aria-invalid={Boolean(errors.buttonLabel)}
          {...register('buttonLabel')}
        />
        <FormFieldError message={errors.buttonLabel?.message} />
      </div>

      <label className="flex items-center gap-2.5 rounded-lg border p-3 text-sm">
        <input
          type="checkbox"
          disabled={!canEdit}
          data-testid="rsvp-banner-show-deadline-checkbox"
          className="size-4 rounded border"
          {...register('showDeadline')}
        />
        <span>Display formatted RSVP deadline when configured in wedding settings</span>
      </label>
    </form>
  );
}
