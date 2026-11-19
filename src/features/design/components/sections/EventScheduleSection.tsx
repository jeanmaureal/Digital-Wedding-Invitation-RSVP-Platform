import type { JSX } from 'react';
import { OrnamentDivider } from '@/features/design/components/sections/OrnamentDivider';
import type { EventScheduleSectionContent } from '@/features/design/schemas/designSchemas';
import type { OrnamentStyleId } from '@/features/design/themes/themePresets';

export interface EventScheduleSectionProps {
  readonly content: EventScheduleSectionContent;
  readonly timezone: string;
  readonly ornamentStyle: OrnamentStyleId;
}

export function EventScheduleSection({
  content,
  timezone,
  ornamentStyle,
}: EventScheduleSectionProps): JSX.Element {
  return (
    <section
      data-testid="invitation-section-event_schedule"
      className="border-b px-6 py-12 sm:px-12"
      style={{
        backgroundColor: 'var(--inv-surface-muted)',
        borderColor: 'var(--inv-border)',
      }}
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
          <p className="text-xs" style={{ color: 'var(--inv-ink-muted)' }}>
            {content.timezoneNote
              ? `${content.timezoneNote} (${timezone})`
              : `Timezone: ${timezone}`}
          </p>
        </div>

        <ol className="space-y-3">
          {content.items.map((item, index) => (
            <li
              key={`${item.timeLabel}-${index}`}
              className="flex flex-col gap-2 border p-5 sm:flex-row sm:items-baseline sm:justify-between"
              style={{
                backgroundColor: 'var(--inv-surface)',
                borderColor: 'var(--inv-border)',
                borderRadius: 'var(--inv-radius)',
              }}
            >
              <div className="space-y-1">
                <p
                  className="text-xs font-semibold tracking-wider uppercase"
                  style={{ color: 'var(--inv-accent)' }}
                >
                  {item.timeLabel}
                </p>
                <h3
                  className="text-lg font-medium"
                  style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-ink)' }}
                >
                  {item.title}
                </h3>
                {item.notes ? (
                  <p className="text-xs" style={{ color: 'var(--inv-ink-muted)' }}>
                    {item.notes}
                  </p>
                ) : null}
              </div>

              {item.venueName || item.address ? (
                <div className="text-xs sm:text-right" style={{ color: 'var(--inv-ink-muted)' }}>
                  {item.venueName ? (
                    <p className="font-medium" style={{ color: 'var(--inv-ink)' }}>
                      {item.venueName}
                    </p>
                  ) : null}
                  {item.address ? <p>{item.address}</p> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
