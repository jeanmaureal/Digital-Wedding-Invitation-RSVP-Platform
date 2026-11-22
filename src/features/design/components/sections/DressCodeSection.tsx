import type { JSX } from 'react';
import { OrnamentDivider } from '@/features/design/components/sections/OrnamentDivider';
import { RichMarkdownText } from '@/features/design/components/sections/RichMarkdownText';
import type { DressCodeSectionContent } from '@/features/design/schemas/designSchemas';
import type { OrnamentStyleId } from '@/features/design/themes/themePresets';

export interface DressCodeSectionProps {
  readonly content: DressCodeSectionContent;
  readonly ornamentStyle: OrnamentStyleId;
}

export function DressCodeSection({ content, ornamentStyle }: DressCodeSectionProps): JSX.Element {
  return (
    <section
      data-testid="invitation-section-dress_code"
      className="border-b px-6 py-12 text-center sm:px-12"
      style={{
        backgroundColor: 'var(--inv-surface-muted)',
        borderColor: 'var(--inv-border)',
      }}
    >
      <div className="mx-auto max-w-2xl space-y-4">
        <h2
          className="text-2xl font-normal sm:text-3xl"
          style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-ink)' }}
        >
          {content.heading}
        </h2>
        <OrnamentDivider styleId={ornamentStyle} />

        <p
          className="text-lg font-medium"
          style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-accent)' }}
        >
          <RichMarkdownText text={content.dressCodeTitle} />
        </p>

        {content.guidance ? (
          <div className="text-sm leading-relaxed" style={{ color: 'var(--inv-ink-muted)' }}>
            <RichMarkdownText text={content.guidance} multiline className="space-y-2.5" />
          </div>
        ) : null}

        {content.swatches && content.swatches.length > 0 ? (
          <div
            aria-label="Suggested attire color palette"
            className="flex flex-wrap items-start justify-center gap-4 pt-2"
          >
            {content.swatches.map((swatch, index) => (
              <div
                key={`${swatch.hex}-${index}`}
                className="flex flex-col items-center gap-1 text-center"
              >
                <span
                  title={swatch.label || swatch.hex}
                  className="inline-block size-9 rounded-full border shadow-xs"
                  style={{
                    backgroundColor: swatch.hex,
                    borderColor: 'var(--inv-border)',
                  }}
                />
                {swatch.label ? (
                  <span
                    className="text-xs font-medium"
                    style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-ink)' }}
                  >
                    {swatch.label}
                  </span>
                ) : null}
                {swatch.subLabel ? (
                  <span
                    className="text-[10px] tracking-wider uppercase"
                    style={{ color: 'var(--inv-ink-muted)' }}
                  >
                    {swatch.subLabel}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : content.swatchHexes.length > 0 ? (
          <div
            aria-label="Suggested attire color palette"
            className="flex flex-wrap items-center justify-center gap-3 pt-2"
          >
            {content.swatchHexes.map((hex, index) => (
              <span
                key={`${hex}-${index}`}
                title={hex}
                className="inline-block size-8 rounded-full border shadow-xs"
                style={{
                  backgroundColor: hex,
                  borderColor: 'var(--inv-border)',
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
