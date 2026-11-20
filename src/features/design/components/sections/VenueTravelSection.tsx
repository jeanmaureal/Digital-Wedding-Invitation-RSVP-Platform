import type { JSX } from 'react';
import { OrnamentDivider } from '@/features/design/components/sections/OrnamentDivider';
import type { VenueTravelSectionContent } from '@/features/design/schemas/designSchemas';
import type { OrnamentStyleId } from '@/features/design/themes/themePresets';

export interface VenueTravelSectionProps {
  readonly content: VenueTravelSectionContent;
  readonly ornamentStyle: OrnamentStyleId;
}

function normalizeVenueText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function VenueTravelSection({
  content,
  ornamentStyle,
}: VenueTravelSectionProps): JSX.Element {
  const ceremonyName = content.ceremonyVenueName.trim();
  const ceremonyAddress = content.ceremonyAddress.trim();
  const receptionName = content.receptionVenueName.trim();
  const receptionAddress = content.receptionAddress.trim();

  const hasCeremony = Boolean(ceremonyName || ceremonyAddress);
  const hasReception = Boolean(receptionName || receptionAddress);

  const venuesMatch =
    hasCeremony &&
    hasReception &&
    normalizeVenueText(ceremonyName) === normalizeVenueText(receptionName) &&
    normalizeVenueText(ceremonyAddress) === normalizeVenueText(receptionAddress);

  const renderAsUnifiedCard =
    content.sameLocation === true || venuesMatch || (!hasCeremony && !hasReception);

  return (
    <section
      data-testid="invitation-section-venue_travel"
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

        {renderAsUnifiedCard ? (
          <div
            data-testid="venue-combined-card"
            className="mx-auto max-w-xl border p-6 text-center"
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
              Ceremony &amp; Reception
            </p>
            <h3
              className="mt-1.5 text-lg font-medium"
              style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-ink)' }}
            >
              {ceremonyName || receptionName || 'Venue details forthcoming'}
            </h3>
            {ceremonyAddress || receptionAddress ? (
              <p className="mt-1 text-sm" style={{ color: 'var(--inv-ink-muted)' }}>
                {ceremonyAddress || receptionAddress}
              </p>
            ) : null}
          </div>
        ) : (
          <div
            className={`grid gap-4 ${
              hasCeremony && hasReception ? 'sm:grid-cols-2' : 'mx-auto max-w-xl grid-cols-1'
            }`}
          >
            {hasCeremony ? (
              <div
                data-testid="venue-ceremony-card"
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
                  Ceremony
                </p>
                <h3
                  className="mt-1 text-lg font-medium"
                  style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-ink)' }}
                >
                  {ceremonyName || 'Venue details forthcoming'}
                </h3>
                {ceremonyAddress ? (
                  <p className="mt-1 text-sm" style={{ color: 'var(--inv-ink-muted)' }}>
                    {ceremonyAddress}
                  </p>
                ) : null}
              </div>
            ) : null}

            {hasReception ? (
              <div
                data-testid="venue-reception-card"
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
                  Reception
                </p>
                <h3
                  className="mt-1 text-lg font-medium"
                  style={{ fontFamily: 'var(--inv-font-heading)', color: 'var(--inv-ink)' }}
                >
                  {receptionName || 'Reception details forthcoming'}
                </h3>
                {receptionAddress ? (
                  <p className="mt-1 text-sm" style={{ color: 'var(--inv-ink-muted)' }}>
                    {receptionAddress}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {content.directionsNote ? (
          <p className="text-center text-sm" style={{ color: 'var(--inv-ink-muted)' }}>
            {content.directionsNote}
          </p>
        ) : null}

        {content.mapUrl ? (
          <div className="text-center">
            <a
              href={content.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center border px-4 py-2 text-xs font-semibold tracking-wide uppercase underline-offset-4 hover:underline"
              style={{
                borderColor: 'var(--inv-accent)',
                color: 'var(--inv-accent)',
                borderRadius: 'var(--inv-radius)',
              }}
            >
              Open Venue Map
            </a>
          </div>
        ) : null}

        {content.accommodations.length > 0 ? (
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            {content.accommodations.map((hotel, index) => (
              <div
                key={`${hotel.name}-${index}`}
                className="border p-4 text-sm"
                style={{
                  backgroundColor: 'var(--inv-surface-muted)',
                  borderColor: 'var(--inv-border)',
                  borderRadius: 'var(--inv-radius)',
                }}
              >
                <p className="font-medium" style={{ color: 'var(--inv-ink)' }}>
                  {hotel.name}
                </p>
                {hotel.note ? (
                  <p className="mt-1 text-xs" style={{ color: 'var(--inv-ink-muted)' }}>
                    {hotel.note}
                  </p>
                ) : null}
                {hotel.bookingUrl ? (
                  <a
                    href={hotel.bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs font-medium underline"
                    style={{ color: 'var(--inv-accent)' }}
                  >
                    View hotel details
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
