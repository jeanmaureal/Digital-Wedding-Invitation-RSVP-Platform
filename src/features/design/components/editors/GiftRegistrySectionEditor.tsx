import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, QrCode, Trash2, Upload, X } from 'lucide-react';
import { type ChangeEvent, type JSX, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { uploadWeddingDesignAsset } from '@/features/design/api/designAssetsApi';
import {
  type GiftRegistrySectionContent,
  giftRegistrySectionContentSchema,
} from '@/features/design/schemas/designSchemas';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

type GiftRegistryFormInput = z.input<typeof giftRegistrySectionContentSchema>;

export interface GiftRegistrySectionEditorProps {
  readonly content: GiftRegistrySectionContent;
  readonly canEdit: boolean;
  readonly workspaceId?: string | undefined;
  readonly weddingId?: string | undefined;
  readonly client?: TypedSupabaseClient | null | undefined;
  readonly onValidChange: (next: GiftRegistrySectionContent) => void;
  readonly onValidationIssue: (message: string | null) => void;
}

function generateGiftAccountId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `gift-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function GiftRegistrySectionEditor({
  content,
  canEdit,
  workspaceId,
  weddingId,
  client,
  onValidChange,
  onValidationIssue,
}: GiftRegistrySectionEditorProps): JSX.Element {
  const {
    register,
    control,
    getValues,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<GiftRegistryFormInput, unknown, GiftRegistrySectionContent>({
    resolver: zodResolver(giftRegistrySectionContentSchema),
    mode: 'onChange',
    defaultValues: {
      eyebrow: content.eyebrow,
      heading: content.heading,
      introMessage: content.introMessage,
      noteEyebrow: content.noteEyebrow,
      noteHeading: content.noteHeading,
      noteMessage: content.noteMessage,
      accounts: content.accounts.map((account) => ({
        id: account.id,
        providerName: account.providerName,
        accountLabel: account.accountLabel,
        accountNumber: account.accountNumber,
        accountHolderName: account.accountHolderName,
        qrCodeImageUrl: account.qrCodeImageUrl ?? '',
        qrHeading: account.qrHeading,
        instructionsTitle: account.instructionsTitle,
        instructions: account.instructions,
        disclaimer: account.disclaimer,
      })),
      showReturnToTop: content.showReturnToTop,
      returnToTopLabel: content.returnToTopLabel,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'accounts',
  });

  const watchedAccounts = useWatch({ control, name: 'accounts' });
  const showReturnToTop = useWatch({ control, name: 'showReturnToTop' });
  const [uploadingAccountIndex, setUploadingAccountIndex] = useState<number | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<number, string>>({});

  const emitCurrentDraft = () => {
    if (!canEdit) {
      return;
    }
    const parsed = giftRegistrySectionContentSchema.safeParse(getValues());
    if (parsed.success) {
      onValidChange(parsed.data);
    } else {
      onValidationIssue(
        parsed.error.issues[0]?.message ?? 'Please fix validation errors in Monetary Gift & QR.',
      );
    }
  };

  const handleQrFileUpload = async (
    accountIndex: number,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canEdit) {
      return;
    }

    if (!workspaceId || !weddingId) {
      setUploadErrors((prev) => ({
        ...prev,
        [accountIndex]: 'Unable to upload QR image without an active wedding workspace.',
      }));
      return;
    }

    setUploadingAccountIndex(accountIndex);
    setUploadErrors((prev) => {
      const next = { ...prev };
      delete next[accountIndex];
      return next;
    });

    try {
      const uploaded = await uploadWeddingDesignAsset(
        {
          workspaceId,
          weddingId,
          category: 'gifts',
          file,
        },
        client,
      );
      setValue(`accounts.${accountIndex}.qrCodeImageUrl`, uploaded.publicUrl, {
        shouldDirty: true,
        shouldValidate: true,
      });
      void trigger(`accounts.${accountIndex}.qrCodeImageUrl`);
      emitCurrentDraft();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to upload QR code image. Please try again.';
      setUploadErrors((prev) => ({
        ...prev,
        [accountIndex]: message,
      }));
    } finally {
      setUploadingAccountIndex(null);
    }
  };

  const handleClearQrImage = (accountIndex: number) => {
    if (!canEdit) {
      return;
    }
    setValue(`accounts.${accountIndex}.qrCodeImageUrl`, '', {
      shouldDirty: true,
      shouldValidate: true,
    });
    void trigger(`accounts.${accountIndex}.qrCodeImageUrl`);
    emitCurrentDraft();
  };

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      onChange={emitCurrentDraft}
      data-testid="section-editor-gift_registry"
      className="space-y-5"
      noValidate
    >
      {/* Section Header */}
      <div className="space-y-3">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Section Header
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gift-eyebrow">Eyebrow label (optional)</Label>
            <Input
              id="gift-eyebrow"
              placeholder="A Day Full of Love"
              disabled={!canEdit}
              data-testid="gift-eyebrow-input"
              aria-invalid={Boolean(errors.eyebrow)}
              {...register('eyebrow')}
            />
            <FormFieldError message={errors.eyebrow?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gift-heading">Section heading</Label>
            <Input
              id="gift-heading"
              placeholder="We can't wait to celebrate with you"
              disabled={!canEdit}
              data-testid="gift-heading-input"
              aria-invalid={Boolean(errors.heading)}
              {...register('heading')}
            />
            <FormFieldError message={errors.heading?.message} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="gift-intro-message">Intro message (optional)</Label>
          <Textarea
            id="gift-intro-message"
            rows={2}
            disabled={!canEdit}
            data-testid="gift-intro-message-input"
            aria-invalid={Boolean(errors.introMessage)}
            {...register('introMessage')}
          />
          <FormFieldError message={errors.introMessage?.message} />
        </div>
      </div>

      {/* Couple's Note Card */}
      <div className="space-y-3 border-t pt-4">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Couple&apos;s Note Card
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gift-note-eyebrow">Note eyebrow (optional)</Label>
            <Input
              id="gift-note-eyebrow"
              placeholder="A Note from the Couple"
              disabled={!canEdit}
              data-testid="gift-note-eyebrow-input"
              aria-invalid={Boolean(errors.noteEyebrow)}
              {...register('noteEyebrow')}
            />
            <FormFieldError message={errors.noteEyebrow?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gift-note-heading">Note heading (optional)</Label>
            <Input
              id="gift-note-heading"
              placeholder="With all that we have, we are truly blessed."
              disabled={!canEdit}
              data-testid="gift-note-heading-input"
              aria-invalid={Boolean(errors.noteHeading)}
              {...register('noteHeading')}
            />
            <FormFieldError message={errors.noteHeading?.message} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="gift-note-message">Note message (optional)</Label>
          <Textarea
            id="gift-note-message"
            rows={3}
            disabled={!canEdit}
            data-testid="gift-note-message-input"
            aria-invalid={Boolean(errors.noteMessage)}
            {...register('noteMessage')}
          />
          <FormFieldError message={errors.noteMessage?.message} />
        </div>
      </div>

      {/* Payment Accounts & QR Codes */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <Label>Payment Channels &amp; QR Codes ({fields.length}/6)</Label>
            <p className="text-muted-foreground text-xs">
              Add GCash, Maya, bank transfer, or e-wallet details and upload your QR code.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || fields.length >= 6}
            data-testid="add-gift-account-button"
            onClick={() => {
              append({
                id: generateGiftAccountId(),
                providerName: 'Bank Transfer',
                accountLabel: 'Account Number',
                accountNumber: '',
                accountHolderName: '',
                qrCodeImageUrl: '',
                qrHeading: 'Scan to Send a Monetary Gift',
                instructionsTitle: 'How to Send Your Gift',
                instructions:
                  'Open your banking or e-wallet app.\nTap Scan QR.\nScan the QR code above.\nCheck the recipient details before confirming.',
                disclaimer: 'Please make sure the recipient name is correct before sending.',
              });
              queueMicrotask(() => {
                void trigger();
                emitCurrentDraft();
              });
            }}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add account
          </Button>
        </div>

        {fields.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs">
            No payment channels added yet. Click &ldquo;Add account&rdquo; to include GCash, bank
            details, or a QR code.
          </p>
        ) : null}

        <div className="space-y-4">
          {fields.map((field, index) => {
            const currentQrUrl = watchedAccounts?.[index]?.qrCodeImageUrl ?? '';
            const isUploading = uploadingAccountIndex === index;
            const uploadError = uploadErrors[index];

            return (
              <div
                key={field.id}
                data-testid={`gift-account-editor-${index}`}
                className="space-y-3 rounded-lg border p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs font-medium">
                    Payment Channel {index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!canEdit}
                    aria-label={`Remove payment channel ${index + 1}`}
                    onClick={() => {
                      remove(index);
                      queueMicrotask(() => {
                        void trigger();
                        emitCurrentDraft();
                      });
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`gift-provider-${index}`}>Payment provider</Label>
                    <Input
                      id={`gift-provider-${index}`}
                      placeholder="GCash"
                      disabled={!canEdit}
                      data-testid={`gift-provider-input-${index}`}
                      aria-invalid={Boolean(errors.accounts?.[index]?.providerName)}
                      {...register(`accounts.${index}.providerName`)}
                    />
                    <FormFieldError message={errors.accounts?.[index]?.providerName?.message} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`gift-account-label-${index}`}>Field label (optional)</Label>
                    <Input
                      id={`gift-account-label-${index}`}
                      placeholder="GCash Number"
                      disabled={!canEdit}
                      aria-invalid={Boolean(errors.accounts?.[index]?.accountLabel)}
                      {...register(`accounts.${index}.accountLabel`)}
                    />
                    <FormFieldError message={errors.accounts?.[index]?.accountLabel?.message} />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`gift-account-number-${index}`}>Account / mobile number</Label>
                    <Input
                      id={`gift-account-number-${index}`}
                      placeholder="0917 123 4567"
                      disabled={!canEdit}
                      data-testid={`gift-account-number-input-${index}`}
                      aria-invalid={Boolean(errors.accounts?.[index]?.accountNumber)}
                      {...register(`accounts.${index}.accountNumber`)}
                    />
                    <FormFieldError message={errors.accounts?.[index]?.accountNumber?.message} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`gift-holder-name-${index}`}>Recipient name</Label>
                    <Input
                      id={`gift-holder-name-${index}`}
                      placeholder="Full recipient name"
                      disabled={!canEdit}
                      data-testid={`gift-holder-name-input-${index}`}
                      aria-invalid={Boolean(errors.accounts?.[index]?.accountHolderName)}
                      {...register(`accounts.${index}.accountHolderName`)}
                    />
                    <FormFieldError
                      message={errors.accounts?.[index]?.accountHolderName?.message}
                    />
                  </div>
                </div>

                {/* QR Code Upload & URL */}
                <div className="bg-muted/30 space-y-2.5 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <QrCode className="text-muted-foreground size-4" aria-hidden="true" />
                      <Label htmlFor={`gift-qr-url-${index}`}>QR Code Image</Label>
                    </div>

                    <div className="flex items-center gap-2">
                      {workspaceId && weddingId ? (
                        <label
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                            !canEdit || isUploading
                              ? 'pointer-events-none opacity-50'
                              : 'bg-background hover:bg-accent'
                          }`}
                        >
                          {isUploading ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Upload className="size-3.5" aria-hidden="true" />
                          )}
                          <span>{isUploading ? 'Uploading...' : 'Upload QR image'}</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                            disabled={!canEdit || isUploading}
                            data-testid={`gift-qr-upload-input-${index}`}
                            className="sr-only"
                            onChange={(event) => void handleQrFileUpload(index, event)}
                          />
                        </label>
                      ) : null}

                      {currentQrUrl ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!canEdit}
                          data-testid={`clear-gift-qr-${index}`}
                          onClick={() => handleClearQrImage(index)}
                        >
                          <X className="size-3.5" aria-hidden="true" />
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {currentQrUrl ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={currentQrUrl}
                        alt="Uploaded QR preview"
                        className="size-16 rounded border bg-white object-contain p-1"
                      />
                      <p className="text-muted-foreground text-xs">
                        QR code ready. Guests will see this scannable image inside the gift card.
                      </p>
                    </div>
                  ) : null}

                  <Input
                    id={`gift-qr-url-${index}`}
                    type="url"
                    placeholder="https://... (or upload a QR image above)"
                    disabled={!canEdit || isUploading}
                    data-testid={`gift-qr-url-input-${index}`}
                    aria-invalid={Boolean(errors.accounts?.[index]?.qrCodeImageUrl)}
                    {...register(`accounts.${index}.qrCodeImageUrl`)}
                  />
                  <FormFieldError
                    message={uploadError ?? errors.accounts?.[index]?.qrCodeImageUrl?.message}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`gift-qr-heading-${index}`}>QR card heading</Label>
                    <Input
                      id={`gift-qr-heading-${index}`}
                      placeholder="Scan to Send a Monetary Gift"
                      disabled={!canEdit}
                      aria-invalid={Boolean(errors.accounts?.[index]?.qrHeading)}
                      {...register(`accounts.${index}.qrHeading`)}
                    />
                    <FormFieldError message={errors.accounts?.[index]?.qrHeading?.message} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`gift-instructions-title-${index}`}>Instructions title</Label>
                    <Input
                      id={`gift-instructions-title-${index}`}
                      placeholder="How to Send Your Gift"
                      disabled={!canEdit}
                      aria-invalid={Boolean(errors.accounts?.[index]?.instructionsTitle)}
                      {...register(`accounts.${index}.instructionsTitle`)}
                    />
                    <FormFieldError
                      message={errors.accounts?.[index]?.instructionsTitle?.message}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`gift-instructions-${index}`}>
                    How to send steps (one step per line)
                  </Label>
                  <Textarea
                    id={`gift-instructions-${index}`}
                    rows={4}
                    placeholder={'Open your GCash app.\nTap Scan QR.\nScan the QR code above.'}
                    disabled={!canEdit}
                    aria-invalid={Boolean(errors.accounts?.[index]?.instructions)}
                    {...register(`accounts.${index}.instructions`)}
                  />
                  <FormFieldError message={errors.accounts?.[index]?.instructions?.message} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`gift-disclaimer-${index}`}>Reminder / disclaimer</Label>
                  <Input
                    id={`gift-disclaimer-${index}`}
                    placeholder="Please make sure the recipient name is correct before sending."
                    disabled={!canEdit}
                    aria-invalid={Boolean(errors.accounts?.[index]?.disclaimer)}
                    {...register(`accounts.${index}.disclaimer`)}
                  />
                  <FormFieldError message={errors.accounts?.[index]?.disclaimer?.message} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Return Button */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center gap-2">
          <input
            id="gift-show-return-top"
            type="checkbox"
            disabled={!canEdit}
            className="size-4 rounded border"
            {...register('showReturnToTop')}
          />
          <Label htmlFor="gift-show-return-top" className="cursor-pointer">
            Show &ldquo;Return to the Invitation&rdquo; scroll-to-top button
          </Label>
        </div>

        {showReturnToTop ? (
          <div className="space-y-1.5">
            <Label htmlFor="gift-return-label">Return button label</Label>
            <Input
              id="gift-return-label"
              placeholder="Return to the Invitation"
              disabled={!canEdit}
              aria-invalid={Boolean(errors.returnToTopLabel)}
              {...register('returnToTopLabel')}
            />
            <FormFieldError message={errors.returnToTopLabel?.message} />
          </div>
        ) : null}
      </div>
    </form>
  );
}
