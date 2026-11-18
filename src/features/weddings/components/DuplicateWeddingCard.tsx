import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { type JSX, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { duplicateOrganizerWedding, type WeddingRecord } from '@/features/weddings/api/weddingApi';
import { translateWeddingError } from '@/features/weddings/api/weddingErrors';
import { weddingQueryKeys } from '@/features/weddings/queryKeys';
import {
  type DuplicateWeddingFormValues,
  type DuplicateWeddingPayload,
  duplicateWeddingSchema,
} from '@/features/weddings/schemas/weddingSchemas';

export interface DuplicateWeddingCardProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly sourceWedding: WeddingRecord;
  readonly onDuplicated: (duplicated: WeddingRecord) => void;
  readonly onCancel: () => void;
}

export function DuplicateWeddingCard({
  userId,
  workspaceId,
  sourceWedding,
  onDuplicated,
  onCancel,
}: DuplicateWeddingCardProps): JSX.Element {
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const defaultCopyTitle = `Copy of ${sourceWedding.title}`.slice(0, 120);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DuplicateWeddingFormValues, unknown, DuplicateWeddingPayload>({
    resolver: zodResolver(duplicateWeddingSchema),
    defaultValues: {
      title: defaultCopyTitle,
      slug: '',
      partnerOneName: sourceWedding.partner_one_name,
      partnerTwoName: sourceWedding.partner_two_name,
      eventDate: '',
    },
  });

  const onSubmit = async (values: DuplicateWeddingPayload): Promise<void> => {
    setSubmitError(null);
    try {
      const duplicated = await duplicateOrganizerWedding({
        workspaceId,
        sourceWeddingId: sourceWedding.id,
        ...values,
      });
      await queryClient.invalidateQueries({
        queryKey: weddingQueryKeys.allInWorkspace(userId, workspaceId),
      });
      onDuplicated(duplicated);
    } catch (error: unknown) {
      setSubmitError(translateWeddingError(error).message);
    }
  };

  return (
    <Card data-testid="duplicate-wedding-card" className="border-primary/25">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Copy className="text-primary size-5" aria-hidden="true" />
          <span>Duplicate &ldquo;{sourceWedding.title}&rdquo;</span>
        </CardTitle>
        <CardDescription>
          Clones venue defaults and 1:1 wedding settings (timezone, access mode, and guest policies)
          into a fresh <strong>Draft</strong> project within this workspace while resetting RSVP
          deadlines cleanly.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {submitError ? (
          <div
            role="alert"
            data-testid="duplicate-wedding-error"
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3.5 py-2.5 text-sm"
          >
            {submitError}
          </div>
        ) : null}

        <form
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          noValidate
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="duplicate-wedding-title">New project title</Label>
              <Input
                id="duplicate-wedding-title"
                type="text"
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.title)}
                {...register('title')}
              />
              <FormFieldError id="duplicate-wedding-title-error" message={errors.title?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="duplicate-wedding-slug">
                New public URL slug{' '}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="duplicate-wedding-slug"
                type="text"
                placeholder="auto-generated-from-title"
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.slug)}
                {...register('slug')}
              />
              <FormFieldError id="duplicate-wedding-slug-error" message={errors.slug?.message} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="duplicate-partner-one">Partner 1 name</Label>
              <Input
                id="duplicate-partner-one"
                type="text"
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.partnerOneName)}
                {...register('partnerOneName')}
              />
              <FormFieldError
                id="duplicate-partner-one-error"
                message={errors.partnerOneName?.message}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="duplicate-partner-two">Partner 2 name</Label>
              <Input
                id="duplicate-partner-two"
                type="text"
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.partnerTwoName)}
                {...register('partnerTwoName')}
              />
              <FormFieldError
                id="duplicate-partner-two-error"
                message={errors.partnerTwoName?.message}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="duplicate-event-date">
                Celebration date{' '}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="duplicate-event-date"
                type="date"
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.eventDate)}
                {...register('eventDate')}
              />
              <FormFieldError id="duplicate-event-date-error" message={errors.eventDate?.message} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              data-testid="duplicate-wedding-submit-button"
            >
              {isSubmitting ? 'Duplicating…' : 'Create duplicate draft'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={onCancel}
              data-testid="duplicate-wedding-cancel-button"
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
