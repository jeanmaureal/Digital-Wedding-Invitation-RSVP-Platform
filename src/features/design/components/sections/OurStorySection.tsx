import { ArrowRight, Images } from 'lucide-react';
import type { JSX } from 'react';
import { OrnamentDivider } from '@/features/design/components/sections/OrnamentDivider';
import { RichMarkdownText } from '@/features/design/components/sections/RichMarkdownText';
import {
  formatMilestoneDate,
  hasMilestoneContent,
} from '@/features/design/components/sections/storyMilestoneUtils';
import type { OurStorySectionContent } from '@/features/design/schemas/designSchemas';
import type { OrnamentStyleId } from '@/features/design/themes/themePresets';

export interface OurStorySectionProps {
  readonly content: OurStorySectionContent;
  readonly ornamentStyle: OrnamentStyleId;
  readonly onOpenFullStory?: (() => void) | undefined;
}

export function OurStorySection({
  content,
  ornamentStyle,
  onOpenFullStory,
}: OurStorySectionProps): JSX.Element {
  const paragraphs = content.narrative
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const visibleMilestones = content.milestones.filter(hasMilestoneContent);

  // Feature only ONE image in the main invitation section; all remaining photos live on the dedicated story page.
  const allPhotos = visibleMilestones.flatMap((m) => m.images ?? []);
  const featuredPhoto = allPhotos[0] ?? null;
  const totalPhotos = allPhotos.length;

  const showMoreButton =
    Boolean(onOpenFullStory) && (totalPhotos > 1 || visibleMilestones.length > 0);
  const photoAlignment = content.featuredPhotoAlignment ?? 'center';
  const isSideAligned = Boolean(featuredPhoto) && (photoAlignment === 'left' || photoAlignment === 'right');

  const featuredPhotoNode = featuredPhoto ? (
    <figure
      data-testid="our-story-featured-image"
      className={`relative overflow-hidden border shadow-xs ${
        isSideAligned ? 'w-full' : 'mx-auto max-w-2xl'
      }`}
      style={{
        borderColor: 'var(--inv-border)',
        borderRadius: 'var(--inv-radius)',
      }}
    >
      <img
        src={featuredPhoto.url}
        alt={featuredPhoto.alt || content.heading || 'Our Story featured photo'}
        loading="lazy"
        className={`${isSideAligned ? 'aspect-[4/5]' : 'aspect-[16/10]'} w-full object-cover`}
      />
      {totalPhotos > 1 ? (
        <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur-xs">
          <Images className="size-3.5" aria-hidden="true" />
          {totalPhotos} photos
        </span>
      ) : null}
      {featuredPhoto.alt ? (
        <figcaption
          className="px-3 py-2 text-xs"
          style={{ backgroundColor: 'var(--inv-surface)', color: 'var(--inv-ink-muted)' }}
        >
          {featuredPhoto.alt}
        </figcaption>
      ) : null}
    </figure>
  ) : null;

  const narrativeAndMilestonesNode = (
    <div className="space-y-6">
      {paragraphs.length > 0 ? (
        <div
          className={`space-y-4 text-sm leading-relaxed sm:text-base ${
            isSideAligned ? 'text-left' : 'text-center'
          }`}
          style={{ color: 'var(--inv-ink-muted)' }}
        >
          {paragraphs.map((paragraph, index) => (
            <RichMarkdownText key={index} text={paragraph} multiline className="space-y-2" />
          ))}
        </div>
      ) : null}

      {visibleMilestones.length > 0 ? (
        <div
          className={`grid gap-4 pt-2 text-left ${
            visibleMilestones.length === 1 || isSideAligned
              ? 'mx-auto grid-cols-1'
              : 'sm:grid-cols-2'
          }`}
        >
          {visibleMilestones.map((milestone, index) => {
            const label = milestone.periodLabel.trim();
            const formattedDate = formatMilestoneDate(milestone.dateLabel);
            const title = milestone.title.trim();
            const description = milestone.description.trim();

            return (
              <div
                key={`${label || title || 'milestone'}-${index}`}
                data-testid={`invitation-story-milestone-${index}`}
                className="border p-5"
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
                        data-testid={`invitation-story-milestone-label-${index}`}
                        className="text-xs font-semibold tracking-wider uppercase"
                        style={{ color: 'var(--inv-accent)' }}
                      >
                        {label}
                      </p>
                    ) : null}
                    {formattedDate ? (
                      <time
                        dateTime={milestone.dateLabel}
                        data-testid={`invitation-story-milestone-date-${index}`}
                        className="text-xs font-medium"
                        style={{ color: 'var(--inv-ink-muted)' }}
                      >
                        {formattedDate}
                      </time>
                    ) : null}
                  </div>
                ) : null}

                {title ? (
                  <h3
                    data-testid={`invitation-story-milestone-title-${index}`}
                    className={`${label || formattedDate ? 'mt-1.5' : ''} text-lg font-medium`}
                    style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-ink)' }}
                  >
                    <RichMarkdownText text={title} />
                  </h3>
                ) : null}

                {description ? (
                  <div
                    data-testid={`invitation-story-milestone-desc-${index}`}
                    className={`${title || label || formattedDate ? 'mt-1.5' : ''} text-sm`}
                    style={{ color: 'var(--inv-ink-muted)' }}
                  >
                    <RichMarkdownText text={description} multiline className="space-y-2" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );

  return (
    <section
      data-testid="invitation-section-our_story"
      data-photo-alignment={photoAlignment}
      className="border-b px-6 py-12 sm:px-12"
      style={{ borderColor: 'var(--inv-border)' }}
    >
      <div className="mx-auto max-w-3xl space-y-6 text-center">
        <div className="space-y-2">
          <h2
            className="text-2xl font-normal sm:text-3xl"
            style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-ink)' }}
          >
            {content.heading}
          </h2>
          <OrnamentDivider styleId={ornamentStyle} />
        </div>

        {content.leadQuote ? (
          <blockquote
            className="mx-auto max-w-xl text-lg italic"
            style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-accent)' }}
          >
            &ldquo;<RichMarkdownText text={content.leadQuote} />&rdquo;
          </blockquote>
        ) : null}

        {isSideAligned ? (
          <div
            className={`grid items-start gap-6 ${
              photoAlignment === 'right' ? 'md:grid-cols-[1fr_280px]' : 'md:grid-cols-[280px_1fr]'
            }`}
          >
            {photoAlignment === 'right' ? (
              <>
                {narrativeAndMilestonesNode}
                {featuredPhotoNode}
              </>
            ) : (
              <>
                {featuredPhotoNode}
                {narrativeAndMilestonesNode}
              </>
            )}
          </div>
        ) : (
          <>
            {featuredPhotoNode}
            {narrativeAndMilestonesNode}
          </>
        )}

        {showMoreButton ? (
          <div className="pt-2">
            <button
              type="button"
              data-testid="our-story-more-button"
              onClick={onOpenFullStory}
              className="inline-flex items-center gap-2 border px-5 py-2.5 text-xs font-semibold tracking-wide uppercase transition-opacity hover:opacity-85"
              style={{
                borderColor: 'var(--inv-accent)',
                color: 'var(--inv-accent)',
                backgroundColor: 'var(--inv-surface)',
                borderRadius: 'var(--inv-radius)',
              }}
            >
              <span>
                {totalPhotos > 1
                  ? `Read Full Story & View All ${totalPhotos} Photos`
                  : 'Read Full Story & Photos'}
              </span>
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
