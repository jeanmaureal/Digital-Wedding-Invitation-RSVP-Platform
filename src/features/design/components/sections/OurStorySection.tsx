import type { JSX } from 'react';
import { OrnamentDivider } from '@/features/design/components/sections/OrnamentDivider';
import type { OurStorySectionContent } from '@/features/design/schemas/designSchemas';
import type { OrnamentStyleId } from '@/features/design/themes/themePresets';

export interface OurStorySectionProps {
  readonly content: OurStorySectionContent;
  readonly ornamentStyle: OrnamentStyleId;
}

export function OurStorySection({ content, ornamentStyle }: OurStorySectionProps): JSX.Element {
  const paragraphs = content.narrative
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

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

        <div
          className="space-y-4 text-sm leading-relaxed sm:text-base"
          style={{ color: 'var(--inv-ink-muted)' }}
        >
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>

        {content.milestones.length > 0 ? (
          <div className="grid gap-4 pt-4 text-left sm:grid-cols-2">
            {content.milestones.map((milestone, index) => (
              <div
                key={`${milestone.periodLabel}-${index}`}
                className="border p-5"
                style={{
                  backgroundColor: 'var(--inv-surface)',
                  borderColor: 'var(--inv-border)',
                  borderRadius: 'var(--inv-radius)',
                }}
              >
                <p
                  className="text-xs font-semibold tracking-wider uppercase"
                  style={{ color: 'var(--inv-accent)' }}
                >
                  {milestone.periodLabel}
                </p>
                <h3
                  className="mt-1 text-lg font-medium"
                  style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-ink)' }}
                >
                  {milestone.title}
                </h3>
                <p className="mt-1.5 text-sm" style={{ color: 'var(--inv-ink-muted)' }}>
                  {milestone.description}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
