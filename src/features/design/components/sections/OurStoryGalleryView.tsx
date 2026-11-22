import { ArrowLeft, ChevronLeft, ChevronRight, Images, X } from 'lucide-react';
import { type JSX, useState } from 'react';
import { OrnamentDivider } from '@/features/design/components/sections/OrnamentDivider';
import { RichMarkdownText } from '@/features/design/components/sections/RichMarkdownText';
import {
  formatMilestoneDate,
  hasMilestoneContent,
} from '@/features/design/components/sections/storyMilestoneUtils';
import type {
  InvitationWeddingMetadata,
  OurStorySectionContent,
  StoryMilestoneImage,
  StoryMilestoneImageLayout,
} from '@/features/design/schemas/designSchemas';
import type { OrnamentStyleId } from '@/features/design/themes/themePresets';

export interface OurStoryGalleryViewProps {
  readonly content: OurStorySectionContent;
  readonly wedding: InvitationWeddingMetadata;
  readonly ornamentStyle: OrnamentStyleId;
  readonly onBack: () => void;
}

interface LightboxState {
  readonly images: readonly StoryMilestoneImage[];
  readonly index: number;
  readonly chapterTitle: string;
}

function ChapterPhotoCarousel({
  images,
  layout,
  chapterTitle,
  chapterIndex,
  onOpenLightbox,
}: {
  readonly images: readonly StoryMilestoneImage[];
  readonly layout: StoryMilestoneImageLayout;
  readonly chapterTitle: string;
  readonly chapterIndex: number;
  readonly onOpenLightbox: (index: number) => void;
}): JSX.Element {
  const [activeIdx, setActiveIdx] = useState(0);
  const safeIdx = activeIdx < images.length ? activeIdx : 0;
  const hasMultiple = images.length > 1;

  const handlePrev = () => {
    setActiveIdx((prev) => (prev <= 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setActiveIdx((prev) => (prev >= images.length - 1 ? 0 : prev + 1));
  };

  return (
    <div
      className="mt-5 space-y-3"
      data-testid="milestone-image-grid"
      data-image-layout={layout}
      data-carousel={String(hasMultiple)}
    >
      {/* Main Featured Carousel Stage */}
      <div
        className="relative overflow-hidden border shadow-sm"
        style={{
          borderColor: 'var(--inv-border)',
          borderRadius: 'var(--inv-radius)',
          backgroundColor: 'var(--inv-surface-muted)',
        }}
      >
        <div
          className="flex transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `translateX(-${safeIdx * 100}%)` }}
        >
          {images.map((image, imgIdx) => {
            const span = image.tileSpan ?? 'standard';
            return (
              <figure
                key={image.id}
                data-testid={`milestone-image-tile-${imgIdx}`}
                data-tile-span={span}
                className="group relative aspect-[16/10] w-full shrink-0 cursor-pointer overflow-hidden"
                onClick={() => onOpenLightbox(imgIdx)}
              >
                <img
                  src={image.url}
                  alt={image.alt || chapterTitle || `Story milestone photo ${imgIdx + 1}`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                />
                {image.alt ? (
                  <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-4 pt-8 pb-3 text-left text-xs text-white sm:text-sm">
                    {image.alt}
                  </figcaption>
                ) : null}
              </figure>
            );
          })}
        </div>

        {/* Floating Photo Counter Pill (inspired by Image 3) */}
        {hasMultiple ? (
          <span
            data-testid={`chapter-carousel-counter-${chapterIndex}`}
            className="pointer-events-none absolute right-3.5 bottom-3.5 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1 text-xs font-medium text-white backdrop-blur-xs"
          >
            <Images className="size-3.5" aria-hidden="true" />
            <span>
              {safeIdx + 1} / {images.length} photos
            </span>
          </span>
        ) : null}

        {/* Previous / Next Navigation Arrows */}
        {hasMultiple ? (
          <>
            <button
              type="button"
              data-testid={`chapter-carousel-prev-${chapterIndex}`}
              aria-label={`Previous photo in ${chapterTitle || `chapter ${chapterIndex + 1}`}`}
              onClick={handlePrev}
              className="absolute top-1/2 left-3 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-xs transition-colors hover:bg-black/70"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-testid={`chapter-carousel-next-${chapterIndex}`}
              aria-label={`Next photo in ${chapterTitle || `chapter ${chapterIndex + 1}`}`}
              onClick={handleNext}
              className="absolute top-1/2 right-3 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-xs transition-colors hover:bg-black/70"
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>

      {/* Thumbnail Strip & Dot Indicators for multi-photo chapters */}
      {hasMultiple ? (
        <div className="flex flex-col items-center gap-2.5">
          <div className="flex max-w-full items-center gap-2 overflow-x-auto px-1 py-1">
            {images.map((image, imgIdx) => {
              const isSelected = imgIdx === safeIdx;
              return (
                <button
                  key={`thumb-${image.id}`}
                  type="button"
                  data-testid={`chapter-carousel-thumb-${chapterIndex}-${imgIdx}`}
                  aria-label={`Show photo ${imgIdx + 1} of ${images.length}`}
                  aria-pressed={isSelected}
                  onClick={() => setActiveIdx(imgIdx)}
                  className={`relative h-12 w-16 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition-all ${
                    isSelected ? 'scale-105 opacity-100 shadow-sm' : 'opacity-60 hover:opacity-90'
                  }`}
                  style={{
                    borderColor: isSelected ? 'var(--inv-accent)' : 'var(--inv-border)',
                  }}
                >
                  <img
                    src={image.url}
                    alt={image.alt || `Thumbnail ${imgIdx + 1}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function OurStoryGalleryView({
  content,
  wedding,
  ornamentStyle,
  onBack,
}: OurStoryGalleryViewProps): JSX.Element {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  const paragraphs = content.narrative
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const visibleMilestones = content.milestones.filter(hasMilestoneContent);

  const activeLightboxImage = lightbox ? lightbox.images[lightbox.index] ?? null : null;

  return (
    <div
      data-testid="our-story-dedicated-page"
      className="px-6 py-8 sm:px-12 sm:py-12"
      style={{ color: 'var(--inv-ink)' }}
    >
      <div className="mx-auto max-w-4xl space-y-8">
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"
          style={{ borderColor: 'var(--inv-border)' }}
        >
          <button
            type="button"
            data-testid="our-story-back-button"
            onClick={onBack}
            className="inline-flex cursor-pointer items-center gap-2 border px-3.5 py-2 text-xs font-semibold tracking-wide uppercase transition-opacity hover:opacity-80"
            style={{
              borderColor: 'var(--inv-border)',
              backgroundColor: 'var(--inv-surface)',
              color: 'var(--inv-ink)',
              borderRadius: 'var(--inv-radius)',
            }}
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to Invitation
          </button>

          <p className="text-xs tracking-wider uppercase" style={{ color: 'var(--inv-ink-muted)' }}>
            {wedding.partnerOneName} &amp; {wedding.partnerTwoName}
          </p>
        </div>

        <div className="space-y-4 text-center">
          <h1
            className="text-3xl font-normal sm:text-4xl"
            style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-ink)' }}
          >
            {content.heading}
          </h1>
          <OrnamentDivider styleId={ornamentStyle} />

          {content.leadQuote ? (
            <blockquote
              className="mx-auto max-w-2xl text-lg italic sm:text-xl"
              style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-accent)' }}
            >
              &ldquo;<RichMarkdownText text={content.leadQuote} />&rdquo;
            </blockquote>
          ) : null}

          {paragraphs.length > 0 ? (
            <div
              className="mx-auto max-w-2xl space-y-4 text-sm leading-relaxed sm:text-base"
              style={{ color: 'var(--inv-ink-muted)' }}
            >
              {paragraphs.map((paragraph, index) => (
                <RichMarkdownText key={index} text={paragraph} multiline className="space-y-2" />
              ))}
            </div>
          ) : null}
        </div>

        {visibleMilestones.length > 0 ? (
          <div className="space-y-8 pt-2">
            {visibleMilestones.map((milestone, index) => {
              const label = milestone.periodLabel.trim();
              const formattedDate = formatMilestoneDate(milestone.dateLabel);
              const title = milestone.title.trim();
              const description = milestone.description.trim();
              const images = milestone.images ?? [];
              const layout: StoryMilestoneImageLayout = milestone.imageLayout ?? 'grid_2';

              return (
                <article
                  key={`${label || title || 'milestone'}-${index}`}
                  data-testid={`dedicated-story-milestone-${index}`}
                  className="border p-6 sm:p-8"
                  style={{
                    backgroundColor: 'var(--inv-surface)',
                    borderColor: 'var(--inv-border)',
                    borderRadius: 'var(--inv-radius)',
                  }}
                >
                  {label || formattedDate ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {label ? (
                        <p
                          data-testid={`dedicated-story-milestone-label-${index}`}
                          className="text-xs font-semibold tracking-wider uppercase"
                          style={{ color: 'var(--inv-accent)' }}
                        >
                          {label}
                        </p>
                      ) : null}
                      {formattedDate ? (
                        <time
                          dateTime={milestone.dateLabel}
                          data-testid={`dedicated-story-milestone-date-${index}`}
                          className="text-xs font-medium"
                          style={{ color: 'var(--inv-ink-muted)' }}
                        >
                          {formattedDate}
                        </time>
                      ) : null}
                    </div>
                  ) : null}

                  {title ? (
                    <h2
                      data-testid={`dedicated-story-milestone-title-${index}`}
                      className={`${label || formattedDate ? 'mt-1.5' : ''} text-xl font-medium sm:text-2xl`}
                      style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-ink)' }}
                    >
                      <RichMarkdownText text={title} />
                    </h2>
                  ) : null}

                  {description ? (
                    <div
                      data-testid={`dedicated-story-milestone-desc-${index}`}
                      className={`${title || label || formattedDate ? 'mt-2' : ''} text-sm leading-relaxed sm:text-base`}
                      style={{ color: 'var(--inv-ink-muted)' }}
                    >
                      <RichMarkdownText text={description} multiline className="space-y-2" />
                    </div>
                  ) : null}

                  {images.length > 0 ? (
                    <ChapterPhotoCarousel
                      images={images}
                      layout={layout}
                      chapterTitle={title}
                      chapterIndex={index}
                      onOpenLightbox={(imgIdx) =>
                        setLightbox({ images, index: imgIdx, chapterTitle: title })
                      }
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </div>

      {lightbox && activeLightboxImage ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Expanded story photo"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close photo"
              onClick={() => setLightbox(null)}
              className="absolute -top-10 right-0 inline-flex cursor-pointer items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25"
            >
              <X className="size-4" aria-hidden="true" />
              Close
            </button>

            <div className="relative flex items-center justify-center">
              {lightbox.images.length > 1 ? (
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() =>
                    setLightbox((prev) =>
                      prev
                        ? {
                            ...prev,
                            index: prev.index <= 0 ? prev.images.length - 1 : prev.index - 1,
                          }
                        : null,
                    )
                  }
                  className="absolute left-2 inline-flex size-10 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/80"
                >
                  <ChevronLeft className="size-5" aria-hidden="true" />
                </button>
              ) : null}

              <img
                src={activeLightboxImage.url}
                alt={activeLightboxImage.alt || lightbox.chapterTitle || 'Story photo'}
                className="max-h-[80vh] w-auto rounded-lg object-contain shadow-2xl"
              />

              {lightbox.images.length > 1 ? (
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() =>
                    setLightbox((prev) =>
                      prev
                        ? {
                            ...prev,
                            index: prev.index >= prev.images.length - 1 ? 0 : prev.index + 1,
                          }
                        : null,
                    )
                  }
                  className="absolute right-2 inline-flex size-10 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/80"
                >
                  <ChevronRight className="size-5" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <div className="mt-2.5 flex items-center justify-center gap-3 text-center text-sm text-white/90">
              {activeLightboxImage.alt ? <p>{activeLightboxImage.alt}</p> : null}
              {lightbox.images.length > 1 ? (
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs">
                  {lightbox.index + 1} / {lightbox.images.length}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
