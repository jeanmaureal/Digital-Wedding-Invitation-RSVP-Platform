import type { JSX } from 'react';
import { OrnamentDivider } from '@/features/design/components/sections/OrnamentDivider';
import type {
  HeroSectionContent,
  InvitationWeddingMetadata,
} from '@/features/design/schemas/designSchemas';
import { formatInvitationEventDate } from '@/features/design/themes/dateFormatting';
import type { OrnamentStyleId } from '@/features/design/themes/themePresets';

export interface HeroSectionProps {
  readonly content: HeroSectionContent;
  readonly wedding: InvitationWeddingMetadata;
  readonly ornamentStyle: OrnamentStyleId;
  readonly onPrimaryAction?: (() => void) | undefined;
}

export function HeroSection({
  content,
  wedding,
  ornamentStyle,
  onPrimaryAction,
}: HeroSectionProps): JSX.Element {
  const monogram =
    `${wedding.partnerOneName.charAt(0)}${wedding.partnerTwoName.charAt(0)}`.toUpperCase();
  const effectiveDate =
    content.displayDateLabel.length > 0
      ? content.displayDateLabel
      : formatInvitationEventDate(wedding.eventDate);
  const effectiveLocation =
    content.locationSummary.length > 0
      ? content.locationSummary
      : wedding.venueLocation || wedding.venueName;

  const isSplit = content.alignment === 'split';

  return (
    <header
      data-testid="invitation-section-hero"
      className={`border-b px-6 py-14 sm:px-12 sm:py-20 ${isSplit ? 'text-left' : 'text-center'}`}
      style={{
        backgroundColor: 'var(--inv-surface)',
        borderColor: 'var(--inv-border)',
      }}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        {content.eyebrow ? (
          <p
            className="text-xs font-medium tracking-[0.22em] uppercase"
            style={{ color: 'var(--inv-ink-muted)' }}
          >
            {content.eyebrow}
          </p>
        ) : null}

        {!isSplit ? <OrnamentDivider styleId={ornamentStyle} monogramText={monogram} /> : null}

        <h1
          data-testid="invitation-hero-headline"
          className="text-4xl leading-tight font-normal tracking-tight sm:text-5xl"
          style={{
            fontFamily: 'var(--inv-font-heading)',
            color: 'var(--inv-ink)',
          }}
        >
          {content.coupleHeadline}
        </h1>

        {content.celebrationSubtitle ? (
          <p className="text-base sm:text-lg" style={{ color: 'var(--inv-ink-muted)' }}>
            {content.celebrationSubtitle}
          </p>
        ) : null}

        <div
          className={`flex flex-wrap gap-3 pt-2 text-sm font-medium ${
            isSplit ? 'justify-start' : 'justify-center'
          }`}
        >
          {content.showCountdownBadge ? (
            <span
              className="rounded-full border px-4 py-1.5"
              style={{
                borderColor: 'var(--inv-border)',
                backgroundColor: 'var(--inv-surface-muted)',
                color: 'var(--inv-ink)',
              }}
            >
              {effectiveDate}
            </span>
          ) : (
            <span>{effectiveDate}</span>
          )}

          {effectiveLocation ? (
            <span
              className="rounded-full border px-4 py-1.5"
              style={{
                borderColor: 'var(--inv-border)',
                color: 'var(--inv-ink-muted)',
              }}
            >
              {effectiveLocation}
            </span>
          ) : null}
        </div>

        <div className="pt-4">
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
            {content.primaryCtaLabel}
          </button>
        </div>
      </div>
    </header>
  );
}
