import { ArrowLeft, X } from 'lucide-react';
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

export function OurStoryGalleryView({
  content,
  wedding,
  ornamentStyle,
  onBack,
}: OurStoryGalleryViewProps): JSX.Element {
  const [lightboxImage, setLightboxImage] = useState<StoryMilestoneImage | null>(null);

  const paragraphs = content.narrative
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const visibleMilestones = content.milestones.filter(hasMilestoneContent);

  return (
    <div
      data-testid="our-story-dedicated-page"
      className="px-6 py-8 sm:px-12 sm:py-12"
      style={{ color: 'var(--inv-ink)' }}
    >
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--inv-border)' }}>
          <button
            type="button"
            data-testid="our-story-back-button"
            onClick={onBack}
            className="inline-flex items-center gap-2 border px-3.5 py-2 text-xs font-semibold tracking-wide uppercase transition-opacity hover:opacity-80"
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

              const gridClassName =
                images.length === 1
                  ? 'mt-4 grid grid-cols-1'
                  : layout === 'grid_3'
                    ? 'mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3'
                    : layout === 'custom_mosaic'
                      ? 'mt-4 grid grid-cols-2 auto-rows-[10rem] gap-3 sm:auto-rows-[12rem]'
                      : 'mt-4 grid grid-cols-2 gap-3';

              return (
                <article
                  key={`${label || title || 'milestone'}-${index}`}
                  data-testid={`dedicated-story-milestone-${index}`}
                  className="border p-6"
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
                    <div
                      className={gridClassName}
                      data-testid="milestone-image-grid"
                      data-image-layout={layout}
                    >
                      {images.map((image, imgIdx) => {
                        const span = image.tileSpan ?? 'standard';
                        let tileClass = 'aspect-[4/3]';
                        if (images.length === 1) {
                          tileClass = 'aspect-[16/10]';
                        } else if (layout === 'featured_top') {
                          tileClass = imgIdx === 0 ? 'col-span-2 aspect-[16/9]' : 'aspect-[4/3]';
                        } else if (layout === 'custom_mosaic') {
                          tileClass =
                            span === 'wide'
                              ? 'col-span-2 row-span-1'
                              : span === 'tall'
                                ? 'col-span-1 row-span-2'
                                : 'col-span-1 row-span-1';
                        } else if (layout === 'grid_3') {
                          tileClass = 'aspect-square';
                        }

                        return (
                          <figure
                            key={image.id}
                            data-testid={`milestone-image-tile-${imgIdx}`}
                            data-tile-span={span}
                            className={`group relative cursor-pointer overflow-hidden border ${tileClass}`}
                            style={{
                              borderColor: 'var(--inv-border)',
                              borderRadius: 'calc(var(--inv-radius) * 0.65)',
                            }}
                            onClick={() => setLightboxImage(image)}
                          >
                            <img
                              src={image.url}
                              alt={image.alt || title || `Story milestone photo ${imgIdx + 1}`}
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            />
                            {image.alt ? (
                              <figcaption className="absolute inset-x-0 bottom-0 bg-black/55 px-2.5 py-1.5 text-xs text-white backdrop-blur-[1px]">
                                {image.alt}
                              </figcaption>
                            ) : null}
                          </figure>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </div>

      {lightboxImage ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Expanded story photo"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close photo"
              onClick={() => setLightboxImage(null)}
              className="absolute -top-10 right-0 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25"
            >
              <X className="size-4" aria-hidden="true" />
              Close
            </button>
            <img
              src={lightboxImage.url}
              alt={lightboxImage.alt || 'Story photo'}
              className="max-h-[82vh] w-auto rounded-lg object-contain shadow-2xl"
            />
            {lightboxImage.alt ? (
              <p className="mt-2 text-center text-sm text-white/90">{lightboxImage.alt}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
