import type { JSX } from 'react';
import { OrnamentDivider } from '@/features/design/components/sections/OrnamentDivider';
import type {
  InvitationWeddingMetadata,
  RsvpBannerSectionContent,
} from '@/features/design/schemas/designSchemas';
import { formatInvitationDeadline } from '@/features/design/themes/dateFormatting';
import type { OrnamentStyleId } from '@/features/design/themes/themePresets';

export interface RsvpBannerSectionProps {
  readonly content: RsvpBannerSectionContent;
  readonly wedding: InvitationWeddingMetadata;
  readonly ornamentStyle: OrnamentStyleId;
  readonly onPrimaryAction?: (() => void) | undefined;
}

export function RsvpBannerSection({
  content,
  wedding,
  ornamentStyle,
  onPrimaryAction,
}: RsvpBannerSectionProps): JSX.Element {
  const formattedDeadline = content.showDeadline
    ? formatInvitationDeadline(wedding.rsvpDeadline, wedding.timezone)
    : null;

  return (
    <section
      data-testid="invitation-section-rsvp_banner"
      className="px-6 py-14 text-center sm:px-12"
      style={{ backgroundColor: 'var(--inv-surface)' }}
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
          className="text-sm leading-relaxed sm:text-base"
          style={{ color: 'var(--inv-ink-muted)' }}
        >
          {content.message}
        </p>

        {formattedDeadline ? (
          <p className="text-xs font-medium" style={{ color: 'var(--inv-accent)' }}>
            Kindly respond by {formattedDeadline}
          </p>
        ) : null}

        <div className="pt-2">
          {wedding.isRsvpOpen ? (
            <button
              type="button"
              onClick={onPrimaryAction}
              className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
              style={{
                backgroundColor: 'var(--inv-accent)',
                color: 'var(--inv-accent-contrast)',
                borderRadius: 'var(--inv-radius)',
              }}
            >
              {content.buttonLabel}
            </button>
          ) : (
            <span
              className="inline-block border px-4 py-2 text-xs font-medium"
              style={{
                borderColor: 'var(--inv-border)',
                color: 'var(--inv-ink-muted)',
                borderRadius: 'var(--inv-radius)',
              }}
            >
              Online RSVP is currently closed
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
