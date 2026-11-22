import type { JSX } from 'react';
import { OrnamentDivider } from '@/features/design/components/sections/OrnamentDivider';
import { RichMarkdownText } from '@/features/design/components/sections/RichMarkdownText';
import type { FaqNotesSectionContent } from '@/features/design/schemas/designSchemas';
import type { OrnamentStyleId } from '@/features/design/themes/themePresets';

export interface FaqNotesSectionProps {
  readonly content: FaqNotesSectionContent;
  readonly ornamentStyle: OrnamentStyleId;
}

export function FaqNotesSection({ content, ornamentStyle }: FaqNotesSectionProps): JSX.Element {
  return (
    <section
      data-testid="invitation-section-faq_notes"
      className="border-b px-6 py-12 sm:px-12"
      style={{ borderColor: 'var(--inv-border)' }}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="text-center">
          <h2
            className="text-2xl font-normal sm:text-3xl"
            style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-ink)' }}
          >
            {content.heading}
          </h2>
          <OrnamentDivider styleId={ornamentStyle} />
        </div>

        <dl className="space-y-3">
          {content.items.map((item, index) => (
            <div
              key={`${item.question}-${index}`}
              className="border p-5"
              style={{
                backgroundColor: 'var(--inv-surface)',
                borderColor: 'var(--inv-border)',
                borderRadius: 'var(--inv-radius)',
              }}
            >
              <dt
                className="text-base font-medium"
                style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-ink)' }}
              >
                <RichMarkdownText text={item.question} />
              </dt>
              <dd
                className="mt-1.5 text-sm leading-relaxed"
                style={{ color: 'var(--inv-ink-muted)' }}
              >
                <RichMarkdownText text={item.answer} multiline className="space-y-2" />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
