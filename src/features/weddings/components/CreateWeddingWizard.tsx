import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { type JSX, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { createOrganizerWedding, type WeddingRecord } from '@/features/weddings/api/weddingApi';
import { translateWeddingError } from '@/features/weddings/api/weddingErrors';
import { weddingQueryKeys } from '@/features/weddings/queryKeys';
import {
  type CreateWeddingFormValues,
  type CreateWeddingParsedValues,
  createWeddingSchema,
  suggestWeddingSlug,
  WEDDING_ACCESS_MODE_LABELS,
} from '@/features/weddings/schemas/weddingSchemas';
import {
  getBrowserDefaultIanaTimezone,
  getSupportedWeddingTimezones,
} from '@/features/weddings/utils/weddingTimezone';

export interface CreateWeddingWizardProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly onCreated: (wedding: WeddingRecord) => void;
  readonly onCancel?: (() => void) | undefined;
}

const STEP_ONE_FIELDS: ReadonlyArray<keyof CreateWeddingFormValues> = [
  'partnerOneName',
  'partnerTwoName',
  'title',
  'slug',
  'eventDate',
  'venueName',
  'venueLocation',
];

export function CreateWeddingWizard({
  userId,
  workspaceId,
  workspaceName,
  onCreated,
  onCancel,
}: CreateWeddingWizardProps): JSX.Element {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [hasCustomizedTitle, setHasCustomizedTitle] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const timezones = useMemo(() => getSupportedWeddingTimezones(), []);
  const defaultTimezone = useMemo(() => getBrowserDefaultIanaTimezone(), []);

  const {
    register,
    control,
    trigger,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateWeddingFormValues, unknown, CreateWeddingParsedValues>({
    resolver: zodResolver(createWeddingSchema),
    defaultValues: {
      partnerOneName: '',
      partnerTwoName: '',
      title: '',
      slug: '',
      eventDate: '',
      venueName: '',
      venueLocation: '',
      timezone: defaultTimezone,
      accessMode: 'public',
      isRsvpOpen: true,
      rsvpDeadlineDate: '',
      rsvpDeadlineTime: '',
      allowPlusOnesDefault: false,
      showGuestDietaryNotes: true,
      contactEmail: '',
    },
  });

  const watchedPartnerOne = useWatch({ control, name: 'partnerOneName' });
  const watchedPartnerTwo = useWatch({ control, name: 'partnerTwoName' });
  const watchedSlug = useWatch({ control, name: 'slug' });
  const watchedTimezone = useWatch({ control, name: 'timezone' });

  const slugPreview =
    watchedSlug && watchedSlug.trim().length > 0
      ? watchedSlug.trim().toLowerCase()
      : suggestWeddingSlug(watchedPartnerOne ?? '', watchedPartnerTwo ?? '');

  const syncSuggestedTitle = (nextP1: string, nextP2: string): void => {
    if (hasCustomizedTitle) {
      return;
    }
    const p1 = nextP1.trim();
    const p2 = nextP2.trim();
    if (p1 && p2) {
      setValue('title', `${p1} & ${p2}'s Wedding`, { shouldValidate: false });
    }
  };

  const onNextStep = async (): Promise<void> => {
    setSubmitError(null);
    const isStepOneValid = await trigger(STEP_ONE_FIELDS);
    if (isStepOneValid) {
      setStep(2);
    }
  };

  const onSubmit = async (values: CreateWeddingParsedValues): Promise<void> => {
    setSubmitError(null);
    try {
      const created = await createOrganizerWedding({
        workspaceId,
        ...values,
      });
      await queryClient.invalidateQueries({
        queryKey: weddingQueryKeys.allInWorkspace(userId, workspaceId),
      });
      onCreated(created);
    } catch (error: unknown) {
      const translated = translateWeddingError(error);
      setSubmitError(translated.message);
      if (translated.code === 'WEDDING_SLUG_TAKEN' || translated.code === 'RESERVED_WEDDING_SLUG') {
        setStep(1);
      }
    }
  };

  const partnerOneRegistration = register('partnerOneName', {
    onChange: (event: { target: { value: string } }) => {
      syncSuggestedTitle(event.target.value, watchedPartnerTwo ?? '');
    },
  });

  const partnerTwoRegistration = register('partnerTwoName', {
    onChange: (event: { target: { value: string } }) => {
      syncSuggestedTitle(watchedPartnerOne ?? '', event.target.value);
    },
  });

  const titleRegistration = register('title', {
    onChange: () => {
      setHasCustomizedTitle(true);
    },
  });

  return (
    <Card data-testid="create-wedding-wizard-card" className="border-primary/25">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="secondary" data-testid="wedding-wizard-step-badge">
            Step {step} of 2
          </Badge>
          <span className="text-muted-foreground text-xs">Workspace: {workspaceName}</span>
        </div>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="text-primary size-5" aria-hidden="true" />
          <span>Create Wedding Project</span>
        </CardTitle>
        <CardDescription>
          {step === 1
            ? 'Enter the couple details, public URL slug, and optional celebration venue.'
            : 'Choose the explicit IANA timezone, guest access policy, and optional RSVP deadline.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {submitError ? (
          <div
            role="alert"
            data-testid="create-wedding-error"
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
          {step === 1 ? (
            <div data-testid="wedding-wizard-step-1" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wizard-partner-one">Partner 1 name</Label>
                  <Input
                    id="wizard-partner-one"
                    type="text"
                    placeholder="Elena"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.partnerOneName)}
                    aria-describedby={
                      errors.partnerOneName ? 'wizard-partner-one-error' : undefined
                    }
                    {...partnerOneRegistration}
                  />
                  <FormFieldError
                    id="wizard-partner-one-error"
                    message={errors.partnerOneName?.message}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="wizard-partner-two">Partner 2 name</Label>
                  <Input
                    id="wizard-partner-two"
                    type="text"
                    placeholder="Mateo"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.partnerTwoName)}
                    aria-describedby={
                      errors.partnerTwoName ? 'wizard-partner-two-error' : undefined
                    }
                    {...partnerTwoRegistration}
                  />
                  <FormFieldError
                    id="wizard-partner-two-error"
                    message={errors.partnerTwoName?.message}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wizard-wedding-title">Project title</Label>
                  <Input
                    id="wizard-wedding-title"
                    type="text"
                    placeholder="Elena & Mateo's Wedding"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.title)}
                    aria-describedby={errors.title ? 'wizard-wedding-title-error' : undefined}
                    {...titleRegistration}
                  />
                  <FormFieldError id="wizard-wedding-title-error" message={errors.title?.message} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="wizard-wedding-slug">
                    Public URL slug{' '}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="wizard-wedding-slug"
                    type="text"
                    placeholder="elena-mateo-2027"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.slug)}
                    aria-describedby={
                      errors.slug ? 'wizard-wedding-slug-error' : 'wizard-wedding-slug-hint'
                    }
                    {...register('slug')}
                  />
                  {errors.slug ? (
                    <FormFieldError id="wizard-wedding-slug-error" message={errors.slug.message} />
                  ) : (
                    <p
                      id="wizard-wedding-slug-hint"
                      data-testid="wizard-slug-preview"
                      className="text-muted-foreground text-xs"
                    >
                      Public preview path: <code>/w/{slugPreview}</code>
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wizard-event-date">
                    Celebration date{' '}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="wizard-event-date"
                    type="date"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.eventDate)}
                    aria-describedby={errors.eventDate ? 'wizard-event-date-error' : undefined}
                    {...register('eventDate')}
                  />
                  <FormFieldError
                    id="wizard-event-date-error"
                    message={errors.eventDate?.message}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="wizard-venue-name">
                    Venue name <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="wizard-venue-name"
                    type="text"
                    placeholder="San Agustin Church"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.venueName)}
                    {...register('venueName')}
                  />
                  <FormFieldError
                    id="wizard-venue-name-error"
                    message={errors.venueName?.message}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="wizard-venue-location">
                    City / location{' '}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="wizard-venue-location"
                    type="text"
                    placeholder="Intramuros, Manila"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.venueLocation)}
                    {...register('venueLocation')}
                  />
                  <FormFieldError
                    id="wizard-venue-location-error"
                    message={errors.venueLocation?.message}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                {onCancel ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={onCancel}
                    data-testid="wizard-cancel-button"
                  >
                    Cancel
                  </Button>
                ) : (
                  <span />
                )}

                <Button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void onNextStep()}
                  data-testid="wizard-next-step-button"
                >
                  Continue to timezone &amp; RSVP
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : (
            <div data-testid="wedding-wizard-step-2" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wizard-timezone">Wedding IANA timezone</Label>
                  <NativeSelect
                    id="wizard-timezone"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.timezone)}
                    {...register('timezone')}
                  >
                    {timezones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </NativeSelect>
                  <FormFieldError id="wizard-timezone-error" message={errors.timezone?.message} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="wizard-access-mode">Website access policy</Label>
                  <NativeSelect
                    id="wizard-access-mode"
                    disabled={isSubmitting}
                    {...register('accessMode')}
                  >
                    <option value="public">{WEDDING_ACCESS_MODE_LABELS.public}</option>
                    <option value="invite_only">{WEDDING_ACCESS_MODE_LABELS.invite_only}</option>
                  </NativeSelect>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wizard-deadline-date">
                    RSVP deadline date{' '}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="wizard-deadline-date"
                    type="date"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.rsvpDeadlineDate)}
                    {...register('rsvpDeadlineDate')}
                  />
                  <FormFieldError
                    id="wizard-deadline-date-error"
                    message={errors.rsvpDeadlineDate?.message}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="wizard-deadline-time">
                    Deadline time ({watchedTimezone || 'UTC'})
                  </Label>
                  <Input
                    id="wizard-deadline-time"
                    type="time"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.rsvpDeadlineTime)}
                    {...register('rsvpDeadlineTime')}
                  />
                  <FormFieldError
                    id="wizard-deadline-time-error"
                    message={errors.rsvpDeadlineTime?.message}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="wizard-contact-email">
                    Guest contact email{' '}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="wizard-contact-email"
                    type="email"
                    placeholder="rsvp@couple.example.com"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.contactEmail)}
                    {...register('contactEmail')}
                  />
                  <FormFieldError
                    id="wizard-contact-email-error"
                    message={errors.contactEmail?.message}
                  />
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border p-3.5 sm:grid-cols-3">
                <label className="flex items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 rounded"
                    disabled={isSubmitting}
                    {...register('isRsvpOpen')}
                  />
                  <span>
                    <strong className="block font-medium">RSVP collection enabled</strong>
                    <span className="text-muted-foreground text-xs">
                      Accept token-verified household RSVPs once published.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 rounded"
                    disabled={isSubmitting}
                    {...register('allowPlusOnesDefault')}
                  />
                  <span>
                    <strong className="block font-medium">Plus-ones allowed by default</strong>
                    <span className="text-muted-foreground text-xs">
                      Default household preference when adding guest groups.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 rounded"
                    disabled={isSubmitting}
                    {...register('showGuestDietaryNotes')}
                  />
                  <span>
                    <strong className="block font-medium">Collect dietary notes</strong>
                    <span className="text-muted-foreground text-xs">
                      Prompt attending guests for allergies or meal restrictions.
                    </span>
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => setStep(1)}
                  data-testid="wizard-back-button"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Back to basics
                </Button>

                <div className="flex flex-wrap items-center gap-2">
                  {onCancel ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isSubmitting}
                      onClick={onCancel}
                    >
                      Cancel
                    </Button>
                  ) : null}

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    data-testid="create-wedding-submit-button"
                  >
                    {isSubmitting ? 'Creating draft project…' : 'Create wedding project'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
