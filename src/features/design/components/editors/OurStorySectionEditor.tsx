import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { type ChangeEvent, type JSX, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { uploadWeddingDesignAsset } from '@/features/design/api/designAssetsApi';
import {
  type OurStorySectionContent,
  ourStorySectionContentSchema,
  type StoryMilestoneImage,
  type StoryMilestoneImageLayout,
  type StoryMilestoneImageTileSpan,
} from '@/features/design/schemas/designSchemas';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

type OurStoryFormInput = z.input<typeof ourStorySectionContentSchema>;

export interface OurStorySectionEditorProps {
  readonly content: OurStorySectionContent;
  readonly canEdit: boolean;
  readonly workspaceId?: string | undefined;
  readonly weddingId?: string | undefined;
  readonly client?: TypedSupabaseClient | null | undefined;
  readonly onValidChange: (next: OurStorySectionContent) => void;
  readonly onValidationIssue: (message: string | null) => void;
}

function generateImageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function OurStorySectionEditor({
  content,
  canEdit,
  workspaceId,
  weddingId,
  client,
  onValidChange,
  onValidationIssue,
}: OurStorySectionEditorProps): JSX.Element {
  const {
    register,
    control,
    getValues,
    setValue,
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
        dateLabel: m.dateLabel ?? '',
        title: m.title,
        description: m.description,
        images: (m.images ?? []).map((img) => ({
          id: img.id,
          url: img.url,
          alt: img.alt,
          tileSpan: img.tileSpan ?? 'standard',
        })),
        imageLayout: m.imageLayout ?? 'grid_2',
      })),
    },
  });

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'milestones',
  });

  const watchedMilestones = useWatch({ control, name: 'milestones' });
  const [uploadingMilestoneIdx, setUploadingMilestoneIdx] = useState<number | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<number, string>>({});

  const emitCurrentDraft = () => {
    if (!canEdit) {
      return;
    }
    const raw = getValues();
    // Strip empty optional arrays/strings cleanly while preserving valid structure
    const normalized = {
      ...raw,
      milestones: raw.milestones.map((m) => ({
        periodLabel: m.periodLabel ?? '',
        ...(m.dateLabel?.trim() ? { dateLabel: m.dateLabel.trim() } : {}),
        title: m.title ?? '',
        description: m.description ?? '',
        ...(m.images && m.images.length > 0
          ? {
              images: m.images.map((img) => ({
                id: img.id,
                url: img.url,
                alt: img.alt ?? '',
                ...(img.tileSpan ? { tileSpan: img.tileSpan } : {}),
              })),
              imageLayout: m.imageLayout ?? 'grid_2',
            }
          : {}),
      })),
    };

    const parsed = ourStorySectionContentSchema.safeParse(normalized);
    if (parsed.success) {
      onValidChange(parsed.data);
    } else {
      onValidationIssue(
        parsed.error.issues[0]?.message ?? 'Please fix validation errors in Our Story.',
      );
    }
  };

  const updateMilestoneImages = (
    milestoneIndex: number,
    nextImages: StoryMilestoneImage[],
    nextLayout?: StoryMilestoneImageLayout,
  ) => {
    setValue(`milestones.${milestoneIndex}.images`, nextImages, { shouldDirty: true });
    if (nextLayout) {
      setValue(`milestones.${milestoneIndex}.imageLayout`, nextLayout, { shouldDirty: true });
    }
    void trigger(`milestones.${milestoneIndex}`);
    emitCurrentDraft();
  };

  const handleMilestoneImageUpload = async (
    milestoneIndex: number,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0 || !canEdit) {
      return;
    }
    const files = Array.from(fileList);
    event.target.value = '';

    if (!workspaceId || !weddingId) {
      setUploadErrors((prev) => ({
        ...prev,
        [milestoneIndex]: 'Workspace context is unavailable for image uploads.',
      }));
      return;
    }

    setUploadingMilestoneIdx(milestoneIndex);
    setUploadErrors((prev) => {
      const next = { ...prev };
      delete next[milestoneIndex];
      return next;
    });

    try {
      const uploadedItems: StoryMilestoneImage[] = [];
      for (const file of files) {
        const uploaded = await uploadWeddingDesignAsset(
          {
            workspaceId,
            weddingId,
            category: 'milestones',
            file,
          },
          client,
        );
        uploadedItems.push({
          id: generateImageId(),
          url: uploaded.publicUrl,
          alt: '',
          tileSpan: 'standard',
        });
      }

      const currentImages = getValues(`milestones.${milestoneIndex}.images`) ?? [];
      updateMilestoneImages(milestoneIndex, [...currentImages, ...uploadedItems]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to upload milestone photo.';
      setUploadErrors((prev) => ({ ...prev, [milestoneIndex]: message }));
    } finally {
      setUploadingMilestoneIdx(null);
    }
  };

  const handleMoveMilestoneImage = (
    milestoneIndex: number,
    imageIndex: number,
    direction: 'left' | 'right',
  ) => {
    const current = [...(getValues(`milestones.${milestoneIndex}.images`) ?? [])];
    const targetIndex = direction === 'left' ? imageIndex - 1 : imageIndex + 1;
    if (targetIndex < 0 || targetIndex >= current.length) {
      return;
    }
    const temp = current[imageIndex]!;
    current[imageIndex] = current[targetIndex]!;
    current[targetIndex] = temp;
    updateMilestoneImages(milestoneIndex, current);
  };

  const handleRemoveMilestoneImage = (milestoneIndex: number, imageIndex: number) => {
    const current = [...(getValues(`milestones.${milestoneIndex}.images`) ?? [])];
    current.splice(imageIndex, 1);
    updateMilestoneImages(milestoneIndex, current);
  };

  const handleChangeImageSpan = (
    milestoneIndex: number,
    imageIndex: number,
    tileSpan: StoryMilestoneImageTileSpan,
  ) => {
    const current = [...(getValues(`milestones.${milestoneIndex}.images`) ?? [])];
    const target = current[imageIndex];
    if (!target) {
      return;
    }
    current[imageIndex] = { ...target, tileSpan };
    updateMilestoneImages(milestoneIndex, current, 'custom_mosaic');
  };

  const handleChangeImageCaption = (
    milestoneIndex: number,
    imageIndex: number,
    alt: string,
  ) => {
    const current = [...(getValues(`milestones.${milestoneIndex}.images`) ?? [])];
    const target = current[imageIndex];
    if (!target) {
      return;
    }
    current[imageIndex] = { ...target, alt };
    updateMilestoneImages(milestoneIndex, current);
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
        <Label htmlFor="story-narrative">Story narrative (optional)</Label>
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
            <p className="text-sm font-medium">Story milestones ({fields.length}/24)</p>
            <p className="text-muted-foreground text-xs">
              Reorder chapters anytime. Empty fields auto-hide. The main invitation features your
              first photo, and guests can open the dedicated Story &amp; Photos page to see them
              all.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || fields.length >= 24}
            data-testid="story-add-milestone-button"
            onClick={() => {
              append({
                periodLabel: 'New Chapter',
                dateLabel: '',
                title: 'Memorable Moment',
                description: 'Share a short memory with your guests.',
                images: [],
                imageLayout: 'grid_2',
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
          const milestoneImages = watchedMilestones?.[index]?.images ?? [];
          const currentLayout = watchedMilestones?.[index]?.imageLayout ?? 'grid_2';
          const isUploadingHere = uploadingMilestoneIdx === index;

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
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!canEdit || index === 0}
                    className="h-7 w-7 p-0"
                    aria-label={`Move milestone ${index + 1} up`}
                    data-testid={`story-move-milestone-up-${index}`}
                    onClick={() => {
                      move(index, index - 1);
                      void trigger('milestones');
                      emitCurrentDraft();
                    }}
                  >
                    <ArrowUp className="size-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!canEdit || index === fields.length - 1}
                    className="h-7 w-7 p-0"
                    aria-label={`Move milestone ${index + 1} down`}
                    data-testid={`story-move-milestone-down-${index}`}
                    onClick={() => {
                      move(index, index + 1);
                      void trigger('milestones');
                      emitCurrentDraft();
                    }}
                  >
                    <ArrowDown className="size-3.5" aria-hidden="true" />
                  </Button>
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
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`story-milestone-period-${index}`}>Label (optional)</Label>
                  <Input
                    id={`story-milestone-period-${index}`}
                    placeholder="e.g., First Met, The Proposal"
                    disabled={!canEdit}
                    data-testid={`story-milestone-period-${index}`}
                    aria-invalid={Boolean(itemErrors?.periodLabel)}
                    {...register(`milestones.${index}.periodLabel`)}
                  />
                  <FormFieldError message={itemErrors?.periodLabel?.message} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`story-milestone-date-${index}`}>Date (optional)</Label>
                  <Input
                    id={`story-milestone-date-${index}`}
                    type="date"
                    disabled={!canEdit}
                    data-testid={`story-milestone-date-${index}`}
                    aria-invalid={Boolean(itemErrors?.dateLabel)}
                    {...register(`milestones.${index}.dateLabel`)}
                  />
                  <FormFieldError message={itemErrors?.dateLabel?.message} />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`story-milestone-title-${index}`}>Milestone title (optional)</Label>
                <Input
                  id={`story-milestone-title-${index}`}
                  disabled={!canEdit}
                  data-testid={`story-milestone-title-${index}`}
                  aria-invalid={Boolean(itemErrors?.title)}
                  {...register(`milestones.${index}.title`)}
                />
                <FormFieldError message={itemErrors?.title?.message} />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`story-milestone-desc-${index}`}>Description (optional)</Label>
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

              {/* Milestone Photos — Upload, Reorder & Custom Tiling */}
              <div className="space-y-2.5 border-t pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <ImageIcon className="text-muted-foreground size-3.5" aria-hidden="true" />
                    <span className="text-xs font-medium">
                      Photos ({milestoneImages.length} uploaded · unlimited)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {milestoneImages.length > 1 ? (
                      <NativeSelect
                        aria-label={`Milestone ${index + 1} photo tile layout`}
                        disabled={!canEdit}
                        value={currentLayout}
                        data-testid={`story-milestone-layout-${index}`}
                        onChange={(e) => {
                          setValue(
                            `milestones.${index}.imageLayout`,
                            e.target.value as StoryMilestoneImageLayout,
                            { shouldDirty: true },
                          );
                          emitCurrentDraft();
                        }}
                        className="h-7 text-xs"
                      >
                        <option value="grid_2">2-Column Grid</option>
                        <option value="grid_3">3-Column Grid</option>
                        <option value="featured_top">Featured Top</option>
                        <option value="custom_mosaic">Custom Mosaic</option>
                      </NativeSelect>
                    ) : null}

                    <label
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        !canEdit || isUploadingHere
                          ? 'pointer-events-none opacity-50'
                          : 'bg-background hover:bg-accent'
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                        multiple
                        disabled={!canEdit || isUploadingHere}
                        data-testid={`story-milestone-upload-${index}`}
                        onChange={(e) => void handleMilestoneImageUpload(index, e)}
                        className="sr-only"
                      />
                      {isUploadingHere ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                      ) : (
                        <Upload className="size-3" aria-hidden="true" />
                      )}
                      Add photos
                    </label>
                  </div>
                </div>

                <FormFieldError message={uploadErrors[index]} />

                {milestoneImages.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {milestoneImages.map((img, imgIdx) => (
                      <div
                        key={img.id}
                        data-testid={`story-milestone-${index}-image-${imgIdx}`}
                        className="bg-background space-y-2 rounded-md border p-2"
                      >
                        <div className="relative aspect-[16/10] overflow-hidden rounded border">
                          <img
                            src={img.url}
                            alt={img.alt || `Milestone photo ${imgIdx + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </div>

                        <Input
                          placeholder="Caption (optional)"
                          disabled={!canEdit}
                          value={img.alt ?? ''}
                          data-testid={`story-milestone-${index}-img-caption-${imgIdx}`}
                          onChange={(e) =>
                            handleChangeImageCaption(index, imgIdx, e.target.value)
                          }
                          className="h-7 text-xs"
                        />

                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={!canEdit || imgIdx === 0}
                              className="h-6 w-6 p-0"
                              aria-label={`Move photo ${imgIdx + 1} earlier`}
                              data-testid={`story-milestone-${index}-img-move-left-${imgIdx}`}
                              onClick={() => handleMoveMilestoneImage(index, imgIdx, 'left')}
                            >
                              <ArrowLeft className="size-3" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={!canEdit || imgIdx === milestoneImages.length - 1}
                              className="h-6 w-6 p-0"
                              aria-label={`Move photo ${imgIdx + 1} later`}
                              data-testid={`story-milestone-${index}-img-move-right-${imgIdx}`}
                              onClick={() => handleMoveMilestoneImage(index, imgIdx, 'right')}
                            >
                              <ArrowRight className="size-3" aria-hidden="true" />
                            </Button>
                          </div>

                          <div className="flex items-center gap-1">
                            {milestoneImages.length > 1 ? (
                              <NativeSelect
                                aria-label={`Photo ${imgIdx + 1} tile size`}
                                disabled={!canEdit}
                                value={img.tileSpan ?? 'standard'}
                                data-testid={`story-milestone-${index}-img-span-${imgIdx}`}
                                onChange={(e) =>
                                  handleChangeImageSpan(
                                    index,
                                    imgIdx,
                                    e.target.value as StoryMilestoneImageTileSpan,
                                  )
                                }
                                className="h-6 px-1.5 text-[11px]"
                              >
                                <option value="standard">1×1</option>
                                <option value="wide">Wide (2×1)</option>
                                <option value="tall">Tall (1×2)</option>
                              </NativeSelect>
                            ) : null}

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={!canEdit}
                              className="text-destructive h-6 w-6 p-0"
                              aria-label={`Remove photo ${imgIdx + 1}`}
                              data-testid={`story-milestone-${index}-img-remove-${imgIdx}`}
                              onClick={() => handleRemoveMilestoneImage(index, imgIdx)}
                            >
                              <Trash2 className="size-3" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </form>
  );
}
