import type { JSX } from 'react';
import { OrnamentDivider } from '@/features/design/components/sections/OrnamentDivider';
import type {
  OurStorySectionContent,
  StoryMilestone,
  StoryMilestoneImageLayout,
} from '@/features/design/schemas/designSchemas';
import type { OrnamentStyleId } from '@/features/design/themes/themePresets';

export interface OurStorySectionProps {
  readonly content: OurStorySectionContent;
  readonly ornamentStyle: OrnamentStyleId;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function formatMilestoneDate(rawDate: string | undefined): string | null {
  const trimmed = rawDate?.trim() ?? '';
  if (!trimmed) {
    return null;
  }
  const match = ISO_DATE_PATTERN.exec(trimmed);
  if (match) {
    const year = Number.parseInt(match[1]!, 10);
    const month = Number.parseInt(match[2]!, 10);
    const day = Number.parseInt(match[3]!, 10);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
    }
  }
  return trimmed;
}

function hasMilestoneContent(milestone: StoryMilestone): boolean {
  return Boolean(
    milestone.periodLabel.trim() ||
      milestone.dateLabel?.trim() ||
      milestone.title.trim() ||
      milestone.description.trim() ||
      (milestone.images && milestone.images.length > 0),
  );
}

function renderMilestoneImages(milestone: StoryMilestone): JSX.Element | null {
  const images = milestone.images ?? [];
  if (images.length === 0) {
    return null;
  }

  const layout: StoryMilestoneImageLayout = milestone.imageLayout ?? 'grid_2';

  if (images.length === 1) {
    const only = images[0]!;
    return (
      <div
        className="mt-3"
        data-testid="milestone-image-grid"
        data-image-layout={layout}
      >
        <figure className="overflow-hidden border" style={{ borderColor: 'var(--inv-border)', borderRadius: 'calc(var(--inv-radius) * 0.65)' }}>
          <img
            src={only.url}
            alt={only.alt || milestone.title || 'Story milestone photo'}
            loading="lazy"
            className="aspect-[16/10] w-full object-cover"
          />
          {only.alt ? (
            <figcaption className="px-2.5 py-1.5 text-xs" style={{ color: 'var(--inv-ink-muted)' }}>
              {only.alt}
            </figcaption>
          ) : null}
        </figure>
      </div>
    );
  }

  const gridClassName =
    layout === 'grid_3'
      ? 'mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3'
      : layout === 'custom_mosaic'
        ? 'mt-3 grid grid-cols-2 auto-rows-[8.5rem] gap-2'
        : 'mt-3 grid grid-cols-2 gap-2';

  return (
    <div
      className={gridClassName}
      data-testid="milestone-image-grid"
      data-image-layout={layout}
    >
      {images.map((image, imgIdx) => {
        const span = image.tileSpan ?? 'standard';
        let tileClass = 'aspect-[4/3]';
        if (layout === 'featured_top') {
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
            className={`relative overflow-hidden border ${tileClass}`}
            style={{
              borderColor: 'var(--inv-border)',
              borderRadius: 'calc(var(--inv-radius) * 0.65)',
            }}
          >
            <img
              src={image.url}
              alt={image.alt || milestone.title || `Story milestone photo ${imgIdx + 1}`}
              loading="lazy"
              className="h-full w-full object-cover"
            />
            {image.alt ? (
              <figcaption className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-[11px] text-white backdrop-blur-[1px]">
                {image.alt}
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}

export function OurStorySection({ content, ornamentStyle }: OurStorySectionProps): JSX.Element {
  const paragraphs = content.narrative
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const visibleMilestones = content.milestones.filter(hasMilestoneContent);

  return (
    <section
      data-testid="invitation-section-our_story"
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
            &ldquo;{content.leadQuote}&rdquo;
          </blockquote>
        ) : null}

        {paragraphs.length > 0 ? (
          <div
            className="space-y-4 text-sm leading-relaxed sm:text-base"
            style={{ color: 'var(--inv-ink-muted)' }}
          >
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        ) : null}

        {visibleMilestones.length > 0 ? (
          <div
            className={`grid gap-4 pt-4 text-left ${
              visibleMilestones.length === 1 ? 'mx-auto max-w-xl grid-cols-1' : 'sm:grid-cols-2'
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
                      {title}
                    </h3>
                  ) : null}

                  {description ? (
                    <p
                      data-testid={`invitation-story-milestone-desc-${index}`}
                      className={`${title || label || formattedDate ? 'mt-1.5' : ''} text-sm`}
                      style={{ color: 'var(--inv-ink-muted)' }}
                    >
                      {description}
                    </p>
                  ) : null}

                  {renderMilestoneImages(milestone)}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
