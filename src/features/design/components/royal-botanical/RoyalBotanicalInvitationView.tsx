import { ArrowRight, Clock, ExternalLink, Images, Mail, MapPin } from 'lucide-react';
import { type CSSProperties, type JSX, useEffect, useState } from 'react';
import {
  CornerTulipBranch,
  PearlTrio,
} from '@/features/design/components/royal-botanical/RoyalBotanicalArt';
import type { RoyalBotanicalHouseholdContext } from '@/features/design/components/royal-botanical/RoyalBotanicalEnvelope';
import { FaqNotesSection } from '@/features/design/components/sections/FaqNotesSection';
import { GiftRegistrySection } from '@/features/design/components/sections/GiftRegistrySection';
import { RichMarkdownText } from '@/features/design/components/sections/RichMarkdownText';
import { RsvpBannerSection } from '@/features/design/components/sections/RsvpBannerSection';
import {
  formatMilestoneDate,
  hasMilestoneContent,
} from '@/features/design/components/sections/storyMilestoneUtils';
import type {
  DressCodeSectionContent,
  EventScheduleSectionContent,
  HeroSectionContent,
  InvitationDocument,
  InvitationSection,
  InvitationWeddingMetadata,
  OurStorySectionContent,
  VenueTravelSectionContent,
} from '@/features/design/schemas/designSchemas';
import {
  formatInvitationDeadline,
  formatInvitationEventDate,
} from '@/features/design/themes/dateFormatting';
import {
  type ResolvedInvitationTheme,
  resolveSectionStyleOverrides,
} from '@/features/design/themes/themePresets';

export interface RoyalBotanicalInvitationViewProps {
  readonly document: InvitationDocument;
  readonly resolvedTheme: ResolvedInvitationTheme;
  readonly visibleSections: readonly InvitationSection[];
  readonly household?: RoyalBotanicalHouseholdContext | undefined;
  readonly isMobileFrame?: boolean | undefined;
  readonly onShowEnvelope?: (() => void) | undefined;
  readonly onPrimaryRsvpAction?: (() => void) | undefined;
  readonly onOpenFullStory?: (() => void) | undefined;
}

interface CountdownParts {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
}

function computeCountdown(eventDateIso: string | null): CountdownParts | null {
  if (!eventDateIso) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDateIso.trim());
  if (!match) {
    return null;
  }
  const targetMs = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    15,
    0,
    0,
  );
  const diffMs = Math.max(0, targetMs - Date.now());
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

function formatFullWeekdayDate(eventDateIso: string | null): string {
  if (!eventDateIso) {
    return 'Date to be announced';
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDateIso.trim());
  if (!match) {
    return formatInvitationEventDate(eventDateIso);
  }
  const parsed = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0),
  );
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(parsed);
  } catch {
    return formatInvitationEventDate(eventDateIso);
  }
}

const KNOWN_SWATCH_LABELS: Readonly<Record<string, { readonly name: string; readonly note: string }>> =
  {
    '#3E4C30': { name: 'Olive Green', note: 'RICH BOTANICAL' },
    '#3B482D': { name: 'Olive Green', note: 'RICH BOTANICAL' },
    '#4F6F58': { name: 'Forest Sage', note: 'BOTANICAL LEAF' },
    '#7E8E72': { name: 'Sage Green', note: 'SOFT FOLIAGE' },
    '#87987A': { name: 'Sage Green', note: 'SOFT FOLIAGE' },
    '#DDD6C3': { name: 'Warm Beige', note: 'IVORY SILK' },
    '#E5DEC9': { name: 'Warm Beige', note: 'IVORY SILK' },
    '#C8B6A6': { name: 'Warm Champagne', note: 'IVORY SILK' },
    '#EFE094': { name: 'Butter Yellow', note: 'GOLDEN PETAL' },
    '#F3E49D': { name: 'Butter Yellow', note: 'GOLDEN PETAL' },
    '#C2A65A': { name: 'Antique Gold', note: 'LUSTROUS ACCENT' },
    '#8D7B68': { name: 'Warm Taupe', note: 'EARTH TONE' },
    '#4A403A': { name: 'Deep Espresso', note: 'CLASSIC INK' },
  };

function describeSwatch(hex: string): { readonly name: string; readonly note: string } {
  const normalized = hex.trim().toUpperCase();
  return KNOWN_SWATCH_LABELS[normalized] ?? { name: normalized, note: 'MOTIF TONE' };
}

function splitCoupleHeadline(
  headline: string,
  wedding: InvitationWeddingMetadata,
): { readonly first: string; readonly second: string } | null {
  const trimmed = headline.trim();
  const ampIndex = trimmed.indexOf('&');
  if (ampIndex > 0 && ampIndex < trimmed.length - 1) {
    const first = trimmed.slice(0, ampIndex).trim();
    const second = trimmed.slice(ampIndex + 1).trim();
    if (first && second) {
      return { first, second };
    }
  }
  if (wedding.partnerOneName.trim() && wedding.partnerTwoName.trim()) {
    return {
      first: wedding.partnerOneName.trim(),
      second: wedding.partnerTwoName.trim(),
    };
  }
  return null;
}

function RoyalHeroCard({
  content,
  wedding,
  household,
  onPrimaryAction,
  style,
}: {
  readonly content: HeroSectionContent;
  readonly wedding: InvitationWeddingMetadata;
  readonly household?: RoyalBotanicalHouseholdContext | undefined;
  readonly onPrimaryAction?: (() => void) | undefined;
  readonly style: CSSProperties;
}): JSX.Element {
  const [countdown, setCountdown] = useState<CountdownParts | null>(() =>
    computeCountdown(wedding.eventDate),
  );

  useEffect(() => {
    if (!wedding.eventDate || !content.showCountdownBadge) {
      return;
    }
    const interval = window.setInterval(() => {
      setCountdown(computeCountdown(wedding.eventDate));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [wedding.eventDate, content.showCountdownBadge]);

  const coupleParts = splitCoupleHeadline(content.coupleHeadline, wedding);
  const fullDateLabel =
    content.displayDateLabel.trim().length > 0
      ? content.displayDateLabel.trim()
      : formatFullWeekdayDate(wedding.eventDate);
  const venueName = wedding.venueName.trim();
  const venueLocation =
    content.locationSummary.trim().length > 0
      ? content.locationSummary.trim()
      : wedding.venueLocation.trim();
  const deadlineLabel = formatInvitationDeadline(wedding.rsvpDeadline, wedding.timezone);

  return (
    <header
      id="rb-section-hero"
      data-testid="invitation-section-hero"
      className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-[28px] border bg-[#FBF9F2] p-3 shadow-[0_20px_50px_-20px_rgba(47,58,38,0.18)] sm:p-5"
      style={{
        borderColor: '#E5DBC0',
        ...style,
      }}
    >
      {/* Inner delicate gold double frame */}
      <div
        className="relative overflow-hidden rounded-[22px] border px-6 py-12 text-center sm:px-12 sm:py-16"
        style={{ borderColor: 'rgba(194, 166, 90, 0.45)' }}
      >
        <CornerTulipBranch
          position="top-left"
          className="absolute -top-3 -left-3 w-28 opacity-90 sm:w-40"
        />
        <CornerTulipBranch
          position="bottom-right"
          className="absolute -right-3 -bottom-3 w-28 opacity-90 sm:w-40"
        />

        <div className="relative z-10 mx-auto max-w-xl space-y-6">
          <PearlTrio withLines />

          <p className="mx-auto max-w-md text-[10px] font-semibold tracking-[0.26em] uppercase text-[#66705A] sm:text-[11px]">
            <RichMarkdownText
              text={
                content.eyebrow ||
                'TOGETHER WITH THEIR BELOVED FAMILIES, WE INVITE YOU TO CELEBRATE THE MARRIAGE OF'
              }
            />
          </p>

          {/* Stacked Couple Display Names */}
          <h1
            data-testid="invitation-hero-headline"
            className="space-y-1 font-normal tracking-tight text-[#2F3A26]"
            style={{ fontFamily: 'var(--inv-font-heading)' }}
          >
            {coupleParts ? (
              <>
                <span className="block text-5xl leading-[1.08] sm:text-6xl">
                  {coupleParts.first}
                </span>
                <span className="my-2 flex items-center justify-center gap-4 text-3xl italic text-[#C2A65A] sm:text-4xl">
                  <span className="h-px w-8 bg-[#D8C58E]" aria-hidden="true" />
                  <span>&amp;</span>
                  <span className="h-px w-8 bg-[#D8C58E]" aria-hidden="true" />
                </span>
                <span className="block text-5xl leading-[1.08] sm:text-6xl">
                  {coupleParts.second}
                </span>
              </>
            ) : (
              <span className="block text-4xl leading-tight sm:text-5xl">
                {content.coupleHeadline}
              </span>
            )}
          </h1>

          {/* Personalized Seat Reservation Pill (butter-yellow + pearls) */}
          {household ? (
            <div className="space-y-1.5 pt-1">
              <div
                data-testid="rb-reserved-seats-pill"
                className="inline-flex items-center gap-3 rounded-full border px-5 py-2 text-[10px] font-semibold tracking-[0.22em] uppercase text-[#3A472C] shadow-xs sm:px-6 sm:text-xs"
                style={{
                  backgroundColor: '#FAF2CE',
                  borderColor: '#DFC97B',
                }}
              >
                <span className="rb-pearl rb-pearl-xs" aria-hidden="true" />
                <span>
                  WE HAVE RESERVED{' '}
                  <strong className="underline decoration-[#C2A65A] underline-offset-4">
                    {household.maxAttendees}{' '}
                    {household.maxAttendees === 1 ? 'SEAT' : 'SEATS'}
                  </strong>{' '}
                  IN YOUR HONOR
                </span>
                <span className="rb-pearl rb-pearl-xs" aria-hidden="true" />
              </div>
              <p className="text-xs italic text-[#69705E]">
                Specially prepared for {household.displayName}
              </p>
            </div>
          ) : content.celebrationSubtitle ? (
            <div className="pt-1">
              <div
                className="inline-flex items-center gap-3 rounded-full border px-5 py-2 text-[10px] font-semibold tracking-[0.18em] uppercase text-[#3A472C] sm:px-6 sm:text-xs"
                style={{
                  backgroundColor: '#FAF2CE',
                  borderColor: '#DFC97B',
                }}
              >
                <span className="rb-pearl rb-pearl-xs" aria-hidden="true" />
                <span>
                  <RichMarkdownText text={content.celebrationSubtitle} />
                </span>
                <span className="rb-pearl rb-pearl-xs" aria-hidden="true" />
              </div>
            </div>
          ) : null}

          <div
            aria-hidden="true"
            className="mx-auto h-px w-full max-w-md"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(194,166,90,0.45), transparent)',
            }}
          />

          {/* Save the Date & Venue */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-semibold tracking-[0.26em] uppercase text-[#B5974B]">
              SAVE THE DATE
            </p>
            <p
              className="text-2xl font-normal text-[#2F3A26] sm:text-3xl"
              style={{ fontFamily: 'var(--inv-font-heading)' }}
            >
              {fullDateLabel}
            </p>

            {(venueName || venueLocation) ? (
              <>
                <div aria-hidden="true" className="flex items-center justify-center gap-2 py-0.5">
                  <span className="h-px w-6 bg-[#DFD2AE]" />
                  <span className="rb-pearl rb-pearl-xs" />
                  <span className="h-px w-6 bg-[#DFD2AE]" />
                </div>
                {venueName ? (
                  <p
                    className="text-base font-medium text-[#2F3A26] sm:text-lg"
                    style={{ fontFamily: 'var(--inv-font-heading)' }}
                  >
                    {venueName}
                  </p>
                ) : null}
                {venueLocation ? (
                  <p className="text-xs tracking-wide text-[#6E7663] sm:text-sm">
                    {venueLocation}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          <div
            aria-hidden="true"
            className="mx-auto h-px w-full max-w-md"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(194,166,90,0.45), transparent)',
            }}
          />

          {/* Circular Gold Countdown Rings */}
          {content.showCountdownBadge && countdown ? (
            <div className="space-y-4">
              <p className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#76806B]">
                COUNTING DOWN UNTIL WE SAY &ldquo;I DO&rdquo;
              </p>
              <div
                data-testid="rb-countdown-rings"
                className="flex flex-wrap items-center justify-center gap-3 sm:gap-4"
              >
                {[
                  { label: 'DAYS', value: countdown.days },
                  { label: 'HOURS', value: countdown.hours },
                  { label: 'MINS', value: countdown.minutes },
                  { label: 'SECS', value: countdown.seconds },
                ].map((unit) => (
                  <div
                    key={unit.label}
                    className="flex size-16 flex-col items-center justify-center rounded-full border bg-[#F8F4E6] shadow-xs sm:size-[74px]"
                    style={{
                      borderColor: '#CBB167',
                      boxShadow:
                        'inset 0 0 0 3px #FBF9F2, 0 4px 12px -4px rgba(154, 123, 79, 0.22)',
                    }}
                  >
                    <span
                      className="text-lg font-medium leading-none text-[#2F3A26] sm:text-xl"
                      style={{ fontFamily: 'var(--inv-font-heading)' }}
                    >
                      {String(unit.value).padStart(2, '0')}
                    </span>
                    <span className="mt-1 text-[8px] font-semibold tracking-[0.18em] uppercase text-[#9A8242] sm:text-[9px]">
                      {unit.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Primary Olive Pill CTA */}
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              data-testid="invitation-hero-cta"
              onClick={onPrimaryAction}
              className="inline-flex cursor-pointer items-center justify-center gap-2.5 rounded-full px-8 py-3.5 text-xs font-semibold tracking-[0.22em] uppercase text-[#FBF9F2] shadow-md transition-all hover:-translate-y-0.5 hover:opacity-95"
              style={{ backgroundColor: 'var(--inv-accent, #3E4C30)' }}
            >
              <span>{content.primaryCtaLabel}</span>
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </button>

            {deadlineLabel ? (
              <p className="text-[11px] text-[#7A826F]">
                Kindly confirm your attendance on or before {deadlineLabel}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

function RoyalOurStoryCard({
  content,
  wedding,
  onOpenFullStory,
  style,
}: {
  readonly content: OurStorySectionContent;
  readonly wedding: InvitationWeddingMetadata;
  readonly onOpenFullStory?: (() => void) | undefined;
  readonly style: CSSProperties;
}): JSX.Element {
  const visibleMilestones = content.milestones.filter(hasMilestoneContent);
  const allPhotos = visibleMilestones.flatMap((m) => m.images ?? []);
  const featuredPhoto = allPhotos[0] ?? null;
  const totalPhotos = allPhotos.length;
  const showMoreButton =
    Boolean(onOpenFullStory) && (totalPhotos > 0 || visibleMilestones.length > 0);
  const photoAlignment = content.featuredPhotoAlignment ?? 'left';

  const chaptersGridNode = (
    <div className="grid gap-4 sm:grid-cols-2">
      {visibleMilestones.length > 0 ? (
        visibleMilestones.map((milestone, index) => {
          const label = milestone.periodLabel.trim();
          const formattedDate = formatMilestoneDate(milestone.dateLabel);
          const title = milestone.title.trim();
          const description = milestone.description.trim();

          return (
            <div
              key={`${label || title || 'chapter'}-${index}`}
              data-testid={`invitation-story-milestone-${index}`}
              className="rounded-2xl border bg-[#F8F5EB] p-5 text-left"
              style={{ borderColor: '#EAE1C8' }}
            >
              <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-[#B5974B]">
                {[label || `Chapter ${index + 1}`, formattedDate].filter(Boolean).join(' · ')}
              </p>
              {title ? (
                <h3
                  data-testid={`invitation-story-milestone-title-${index}`}
                  className="mt-1.5 text-lg font-medium text-[#2F3A26]"
                  style={{ fontFamily: 'var(--inv-font-heading)' }}
                >
                  <RichMarkdownText text={title} />
                </h3>
              ) : null}
              {description ? (
                <div
                  data-testid={`invitation-story-milestone-desc-${index}`}
                  className="mt-1.5 text-xs leading-relaxed text-[#69705E]"
                >
                  <RichMarkdownText text={description} multiline className="space-y-2" />
                </div>
              ) : null}
            </div>
          );
        })
      ) : (
        <div className="col-span-full rounded-2xl border border-[#EAE1C8] bg-[#F8F5EB] p-6 text-sm leading-relaxed text-[#69705E]">
          <RichMarkdownText text={content.narrative} multiline />
        </div>
      )}
    </div>
  );

  const ovalPortraitNode = (
    <div className="flex flex-col items-center justify-center gap-5">
      <div
        className="relative flex h-60 w-48 items-center justify-center overflow-hidden rounded-[999px] border-2 bg-[#F7F2E2] p-2 shadow-inner"
        style={{
          borderColor: '#C9B06B',
          boxShadow: 'inset 0 0 0 4px #FBF9F2, 0 10px 24px -12px rgba(47,58,38,0.2)',
        }}
      >
        {featuredPhoto ? (
          <img
            data-testid="our-story-featured-image"
            src={featuredPhoto.url}
            alt={featuredPhoto.alt || content.heading || 'Couple portrait'}
            loading="lazy"
            className="h-full w-full rounded-[999px] object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center rounded-[999px] border border-[#E5DBC0] px-4 text-center">
            <PearlTrio className="mb-3" />
            <p
              className="text-xl italic text-[#B5974B]"
              style={{
                fontFamily:
                  "'Snell Roundhand', 'Brush Script MT', 'Segoe Script', Garamond, Georgia, serif",
              }}
            >
              Forever Begins
            </p>
            <p className="mt-1 text-[10px] tracking-[0.22em] uppercase text-[#76806B]">
              {wedding.partnerOneName} &amp; {wedding.partnerTwoName}
            </p>
          </div>
        )}
      </div>

      {showMoreButton ? (
        <button
          type="button"
          data-testid="our-story-more-button"
          onClick={onOpenFullStory}
          className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#D8C58E] bg-[#FBF9F2] px-5 py-2 text-[10px] font-semibold tracking-[0.2em] uppercase text-[#4B583D] transition-colors hover:bg-[#F3ECD6]"
        >
          <span>
            {totalPhotos > 1 ? `View Galleries (${totalPhotos})` : 'View Full Story'}
          </span>
        </button>
      ) : null}
    </div>
  );

  return (
    <section
      id="rb-section-our_story"
      data-testid="invitation-section-our_story"
      data-photo-alignment={photoAlignment}
      className="mx-auto w-full max-w-4xl space-y-6"
      style={style}
    >
      <div className="space-y-2 text-center">
        <p className="text-[10px] font-semibold tracking-[0.28em] uppercase text-[#B5974B]">
          CHAPTERS OF FOREVER
        </p>
        <h2
          className="text-3xl font-normal text-[#2F3A26] sm:text-4xl"
          style={{ fontFamily: 'var(--inv-font-heading)' }}
        >
          {content.heading}
        </h2>
        {content.leadQuote ? (
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-[#69705E]">
            <RichMarkdownText text={content.leadQuote} />
          </p>
        ) : content.narrative ? (
          <RichMarkdownText
            text={content.narrative}
            multiline
            className="mx-auto max-w-xl space-y-2.5 text-sm leading-relaxed text-[#69705E]"
          />
        ) : null}
      </div>

      {photoAlignment === 'center' ? (
        <div
          className="space-y-7 rounded-[26px] border bg-[#FBF9F2] p-6 shadow-[0_14px_38px_-18px_rgba(47,58,38,0.14)] sm:p-10"
          style={{ borderColor: '#E5DBC0' }}
        >
          {featuredPhoto ? (
            <figure
              data-testid="our-story-featured-image"
              className="relative mx-auto max-w-2xl overflow-hidden rounded-2xl border-2 bg-[#F7F2E2] p-1.5 shadow-sm"
              style={{ borderColor: '#D5BF7D' }}
            >
              <img
                src={featuredPhoto.url}
                alt={featuredPhoto.alt || content.heading || 'Couple portrait'}
                loading="lazy"
                className="aspect-[16/10] w-full rounded-xl object-cover"
              />
              {totalPhotos > 1 ? (
                <button
                  type="button"
                  onClick={onOpenFullStory}
                  className="absolute right-4 bottom-4 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#232C1C]/75 px-3.5 py-1.5 text-xs font-medium text-[#FBF9F2] backdrop-blur-xs transition-opacity hover:opacity-90"
                >
                  <Images className="size-3.5" aria-hidden="true" />
                  <span>{totalPhotos} photos</span>
                </button>
              ) : null}
            </figure>
          ) : null}

          {content.narrative && content.leadQuote ? (
            <RichMarkdownText
              text={content.narrative}
              multiline
              className="mx-auto max-w-2xl space-y-2.5 text-center text-sm leading-relaxed text-[#69705E]"
            />
          ) : null}

          {chaptersGridNode}

          {showMoreButton ? (
            <div className="pt-1 text-center">
              <button
                type="button"
                data-testid="our-story-more-button"
                onClick={onOpenFullStory}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#D8C58E] bg-[#FBF9F2] px-6 py-2.5 text-[10px] font-semibold tracking-[0.2em] uppercase text-[#4B583D] transition-colors hover:bg-[#F3ECD6]"
              >
                <span>
                  {totalPhotos > 1 ? `View Galleries (${totalPhotos})` : 'View Full Story'}
                </span>
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className={`grid items-center gap-8 rounded-[26px] border bg-[#FBF9F2] p-6 shadow-[0_14px_38px_-18px_rgba(47,58,38,0.14)] sm:p-10 ${
            photoAlignment === 'right' ? 'md:grid-cols-[1fr_240px]' : 'md:grid-cols-[240px_1fr]'
          }`}
          style={{ borderColor: '#E5DBC0' }}
        >
          {photoAlignment === 'right' ? (
            <>
              {chaptersGridNode}
              {ovalPortraitNode}
            </>
          ) : (
            <>
              {ovalPortraitNode}
              {chaptersGridNode}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function RoyalVenueCard({
  content,
  style,
}: {
  readonly content: VenueTravelSectionContent;
  readonly style: CSSProperties;
}): JSX.Element {
  const primaryName =
    content.ceremonyVenueName.trim() ||
    content.receptionVenueName.trim() ||
    'Venue details forthcoming';
  const primaryAddress =
    content.ceremonyAddress.trim() || content.receptionAddress.trim();
  const hasSeparateReception =
    !content.sameLocation &&
    content.receptionVenueName.trim().length > 0 &&
    content.receptionVenueName.trim().toLowerCase() !==
      content.ceremonyVenueName.trim().toLowerCase();

  return (
    <section
      id="rb-section-venue_travel"
      data-testid="invitation-section-venue_travel"
      className="flex h-full flex-col justify-between rounded-[26px] border bg-[#FBF9F2] p-7 text-left shadow-[0_14px_38px_-18px_rgba(47,58,38,0.14)] sm:p-9"
      style={{ borderColor: '#E5DBC0', ...style }}
    >
      <div className="space-y-4">
        <div
          className="inline-flex size-12 items-center justify-center rounded-full border bg-[#F6F1E0] text-[#3E4C30]"
          style={{
            borderColor: '#CBB167',
            boxShadow: 'inset 0 0 0 3px #FBF9F2',
          }}
        >
          <MapPin className="size-5" aria-hidden="true" />
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-semibold tracking-[0.26em] uppercase text-[#B5974B]">
            {hasSeparateReception ? 'CEREMONY & RECEPTION VENUES' : 'CEREMONY & RECEPTION HALL'}
          </p>
          <h2
            className="text-2xl font-normal text-[#2F3A26] sm:text-3xl"
            style={{ fontFamily: 'var(--inv-font-heading)' }}
          >
            {primaryName}
          </h2>
          {primaryAddress ? (
            <p className="text-sm text-[#69705E]">{primaryAddress}</p>
          ) : null}
        </div>

        {hasSeparateReception ? (
          <div className="rounded-xl border border-[#EAE1C8] bg-[#F8F5EB] p-3.5 text-xs">
            <p className="font-semibold tracking-[0.18em] uppercase text-[#B5974B]">Reception</p>
            <p className="mt-1 font-medium text-[#2F3A26]">{content.receptionVenueName}</p>
            {content.receptionAddress ? (
              <p className="text-[#69705E]">{content.receptionAddress}</p>
            ) : null}
          </div>
        ) : null}

        {content.directionsNote ? (
          <RichMarkdownText
            text={content.directionsNote}
            multiline
            className="space-y-2.5 text-sm leading-relaxed text-[#5E6753]"
          />
        ) : null}

        {content.accommodations.length > 0 ? (
          <div className="space-y-2 pt-1">
            {content.accommodations.map((hotel, idx) => (
              <div
                key={`${hotel.name}-${idx}`}
                className="rounded-xl border border-[#EAE1C8] bg-[#F8F5EB] p-3 text-xs"
              >
                <p className="font-medium text-[#2F3A26]">{hotel.name}</p>
                {hotel.note ? (
                  <p className="mt-0.5 text-[#69705E]">
                    <RichMarkdownText text={hotel.note} />
                  </p>
                ) : null}
                {hotel.bookingUrl ? (
                  <a
                    href={hotel.bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block font-medium text-[#3E4C30] underline"
                  >
                    View hotel details
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Inner Venue Directions & Maps Pill Box */}
      <div
        data-testid="venue-combined-card"
        className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-[#F4EFE0] px-5 py-4"
        style={{ borderColor: '#E4DABF' }}
      >
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-[#4B583D]">
            VENUE DIRECTIONS
          </p>
          <p className="text-xs text-[#6E7663]">{primaryAddress || primaryName}</p>
        </div>

        {content.mapUrl ? (
          <a
            href={content.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-xs font-medium text-[#FBF9F2] transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--inv-accent, #3E4C30)' }}
          >
            <span>Open Google Maps</span>
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </section>
  );
}

function RoyalScheduleCard({
  content,
  style,
}: {
  readonly content: EventScheduleSectionContent;
  readonly style: CSSProperties;
}): JSX.Element {
  return (
    <section
      id="rb-section-event_schedule"
      data-testid="invitation-section-event_schedule"
      className="flex h-full flex-col rounded-[26px] border bg-[#FBF9F2] p-7 text-left shadow-[0_14px_38px_-18px_rgba(47,58,38,0.14)] sm:p-9"
      style={{ borderColor: '#E5DBC0', ...style }}
    >
      <div className="space-y-4">
        <div
          className="inline-flex size-12 items-center justify-center rounded-full border bg-[#F6F1E0] text-[#3E4C30]"
          style={{
            borderColor: '#CBB167',
            boxShadow: 'inset 0 0 0 3px #FBF9F2',
          }}
        >
          <Clock className="size-5" aria-hidden="true" />
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-semibold tracking-[0.26em] uppercase text-[#B5974B]">
            ORDER OF EVENTS
          </p>
          <h2
            className="text-2xl font-normal text-[#2F3A26] sm:text-3xl"
            style={{ fontFamily: 'var(--inv-font-heading)' }}
          >
            {content.heading}
          </h2>
        </div>

        {/* Vertical Gold & Pearl Timeline */}
        <ol className="relative mt-4 space-y-5 pl-7 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-[#D8C58E]">
          {content.items.map((item, index) => (
            <li key={`${item.timeLabel}-${index}`} className="relative">
              <span
                aria-hidden="true"
                className="rb-pearl rb-pearl-sm absolute top-1 -left-7"
              />
              <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#B5974B]">
                {item.timeLabel}
              </p>
              <h3
                className="mt-0.5 text-lg font-medium text-[#2F3A26]"
                style={{ fontFamily: 'var(--inv-font-heading)' }}
              >
                <RichMarkdownText text={item.title} />
              </h3>
              {item.notes ? (
                <div className="mt-0.5 text-xs leading-relaxed text-[#69705E]">
                  <RichMarkdownText text={item.notes} multiline className="space-y-1.5" />
                </div>
              ) : item.venueName ? (
                <p className="mt-0.5 text-xs text-[#69705E]">{item.venueName}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function RoyalDressCodeCard({
  content,
  onPrimaryAction,
  style,
}: {
  readonly content: DressCodeSectionContent;
  readonly onPrimaryAction?: (() => void) | undefined;
  readonly style: CSSProperties;
}): JSX.Element {
  const swatches =
    content.swatches && content.swatches.length > 0
      ? content.swatches.map((s) => {
          const fallback = describeSwatch(s.hex);
          return {
            hex: s.hex,
            name: s.label?.trim() || fallback.name,
            note: s.subLabel?.trim() || fallback.note,
          };
        })
      : (content.swatchHexes.length > 0
          ? content.swatchHexes
          : ['#3E4C30', '#7E8E72', '#DDD6C3', '#EFE094']
        ).map((hex) => {
          const fallback = describeSwatch(hex);
          return {
            hex,
            name: fallback.name,
            note: fallback.note,
          };
        });

  const swatchAlignment = content.swatchAlignment ?? 'center';
  const swatchJustifyClass =
    swatchAlignment === 'left'
      ? 'justify-start'
      : swatchAlignment === 'right'
        ? 'justify-end'
        : 'justify-center';

  return (
    <section
      id="rb-section-dress_code"
      data-testid="invitation-section-dress_code"
      className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-[26px] border bg-[#FBF9F2] px-6 py-10 text-center shadow-[0_14px_38px_-18px_rgba(47,58,38,0.14)] sm:px-12 sm:py-12"
      style={{ borderColor: '#E5DBC0', ...style }}
    >
      {/* Subtle corner pearls */}
      <span aria-hidden="true" className="rb-pearl rb-pearl-sm absolute top-5 left-5" />
      <span aria-hidden="true" className="rb-pearl rb-pearl-sm absolute top-5 right-5" />

      <div className="mx-auto max-w-2xl space-y-4">
        <p className="text-[10px] font-semibold tracking-[0.28em] uppercase text-[#B5974B]">
          GUEST ATTIRE &amp; PALETTE
        </p>
        <h2
          className="text-3xl font-normal text-[#2F3A26] sm:text-4xl"
          style={{ fontFamily: 'var(--inv-font-heading)' }}
        >
          <RichMarkdownText text={content.dressCodeTitle || content.heading} />
        </h2>
        {content.guidance ? (
          <RichMarkdownText
            text={content.guidance}
            multiline
            className="mx-auto max-w-xl space-y-2.5 text-sm leading-relaxed text-[#69705E]"
          />
        ) : null}
      </div>

      {/* Swatch Cards Grid */}
      <div
        aria-label="Suggested attire color palette"
        data-swatch-alignment={swatchAlignment}
        className={`mx-auto mt-8 flex max-w-3xl flex-wrap gap-4 ${swatchJustifyClass}`}
      >
        {swatches.map((swatch, index) => (
          <div
            key={`${swatch.hex}-${index}`}
            className="flex w-[calc(50%-0.5rem)] flex-col items-center rounded-2xl border bg-[#F7F3E7] px-4 py-5 sm:w-[calc(25%-0.75rem)]"
            style={{ borderColor: '#E8DFC7' }}
          >
            <span
              title={swatch.name}
              className="inline-block size-14 rounded-full border-2 p-1 shadow-xs"
              style={{
                borderColor: '#D5C083',
                backgroundColor: '#FBF9F2',
              }}
            >
              <span
                className="block h-full w-full rounded-full"
                style={{ backgroundColor: swatch.hex }}
              />
            </span>
            <p
              className="mt-3 text-sm font-medium text-[#2F3A26]"
              style={{ fontFamily: 'var(--inv-font-heading)' }}
            >
              {swatch.name}
            </p>
            <p className="mt-0.5 text-[9px] font-semibold tracking-[0.18em] uppercase text-[#A48D52]">
              {swatch.note}
            </p>
          </div>
        ))}
      </div>

      {/* Butter-yellow Pearl CTA Button */}
      {onPrimaryAction ? (
        <div className="mt-8">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="inline-flex cursor-pointer items-center gap-3 rounded-full border px-8 py-3 text-xs font-semibold tracking-[0.22em] uppercase text-[#2F3A26] shadow-xs transition-all hover:-translate-y-0.5 hover:brightness-98"
            style={{
              backgroundColor: '#EFE094',
              borderColor: '#D4BE6A',
            }}
          >
            <span className="rb-pearl rb-pearl-xs" aria-hidden="true" />
            <span>RESPOND TO INVITATION</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function RoyalBotanicalInvitationView({
  document: doc,
  resolvedTheme,
  visibleSections,
  household,
  isMobileFrame = false,
  onShowEnvelope,
  onPrimaryRsvpAction,
  onOpenFullStory,
}: RoyalBotanicalInvitationViewProps): JSX.Element {
  const { wedding } = doc;
  const partnerOne = wedding.partnerOneName.trim() || 'Partner One';
  const partnerTwo = wedding.partnerTwoName.trim() || 'Partner Two';
  const formattedFooterDate = formatInvitationEventDate(wedding.eventDate).toUpperCase();
  const footerVenue = [wedding.venueName.trim(), wedding.venueLocation.trim()]
    .filter(Boolean)
    .join(', ')
    .toUpperCase();

  function scrollToSection(sectionId: string): void {
    const el = window.document.getElementById(sectionId);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  const navItems: Array<{ readonly id: string; readonly label: string }> = [];
  for (const s of visibleSections) {
    if (s.sectionType === 'hero') navItems.push({ id: 'rb-section-hero', label: 'INVITATION' });
    if (s.sectionType === 'our_story')
      navItems.push({ id: 'rb-section-our_story', label: 'OUR STORY' });
    if (s.sectionType === 'venue_travel')
      navItems.push({ id: 'rb-section-venue_travel', label: 'VENUE' });
    if (s.sectionType === 'event_schedule')
      navItems.push({ id: 'rb-section-event_schedule', label: 'SCHEDULE' });
    if (s.sectionType === 'dress_code')
      navItems.push({ id: 'rb-section-dress_code', label: 'ATTIRE' });
  }

  // Group adjacent venue_travel + event_schedule into a side-by-side 2-column row (matching Image 5!)
  const renderedBlocks: JSX.Element[] = [];
  let i = 0;
  while (i < visibleSections.length) {
    const current = visibleSections[i];
    const next = visibleSections[i + 1];

    const isVenueSchedulePair =
      current &&
      next &&
      ((current.sectionType === 'venue_travel' && next.sectionType === 'event_schedule') ||
        (current.sectionType === 'event_schedule' && next.sectionType === 'venue_travel'));

    if (isVenueSchedulePair) {
      const firstStyle = resolveSectionStyleOverrides(current.content.style, resolvedTheme);
      const secondStyle = resolveSectionStyleOverrides(next.content.style, resolvedTheme);
      renderedBlocks.push(
        <div
          key={`pair-${current.id}-${next.id}`}
          className={`mx-auto grid w-full max-w-4xl gap-6 ${isMobileFrame ? 'grid-cols-1' : 'md:grid-cols-2'}`}
        >
          {current.sectionType === 'venue_travel' ? (
            <RoyalVenueCard content={current.content} style={firstStyle} />
          ) : (
            <RoyalScheduleCard content={current.content} style={firstStyle} />
          )}
          {next.sectionType === 'venue_travel' ? (
            <RoyalVenueCard content={next.content} style={secondStyle} />
          ) : (
            <RoyalScheduleCard content={next.content} style={secondStyle} />
          )}
        </div>,
      );
      i += 2;
      continue;
    }

    if (!current) {
      break;
    }

    const sectionStyle = resolveSectionStyleOverrides(current.content.style, resolvedTheme);

    switch (current.sectionType) {
      case 'hero':
        renderedBlocks.push(
          <RoyalHeroCard
            key={current.id}
            content={current.content}
            wedding={wedding}
            household={household}
            onPrimaryAction={onPrimaryRsvpAction}
            style={sectionStyle}
          />,
        );
        break;
      case 'our_story':
        renderedBlocks.push(
          <RoyalOurStoryCard
            key={current.id}
            content={current.content}
            wedding={wedding}
            onOpenFullStory={onOpenFullStory}
            style={sectionStyle}
          />,
        );
        break;
      case 'venue_travel':
        renderedBlocks.push(
          <div key={current.id} className="mx-auto w-full max-w-3xl">
            <RoyalVenueCard content={current.content} style={sectionStyle} />
          </div>,
        );
        break;
      case 'event_schedule':
        renderedBlocks.push(
          <div key={current.id} className="mx-auto w-full max-w-3xl">
            <RoyalScheduleCard content={current.content} style={sectionStyle} />
          </div>,
        );
        break;
      case 'dress_code':
        renderedBlocks.push(
          <RoyalDressCodeCard
            key={current.id}
            content={current.content}
            onPrimaryAction={onPrimaryRsvpAction}
            style={sectionStyle}
          />,
        );
        break;
      case 'faq_notes':
        renderedBlocks.push(
          <div
            key={current.id}
            className="mx-auto w-full max-w-4xl overflow-hidden rounded-[26px] border bg-[#FBF9F2] shadow-[0_14px_38px_-18px_rgba(47,58,38,0.14)]"
            style={{ borderColor: '#E5DBC0', ...sectionStyle }}
          >
            <FaqNotesSection
              content={current.content}
              ornamentStyle={resolvedTheme.ornamentStyle}
            />
          </div>,
        );
        break;
      case 'gift_registry':
        renderedBlocks.push(
          <div
            key={current.id}
            className="mx-auto w-full max-w-4xl overflow-hidden rounded-[26px] border bg-[#FBF9F2] shadow-[0_14px_38px_-18px_rgba(47,58,38,0.14)]"
            style={{ borderColor: '#E5DBC0', ...sectionStyle }}
          >
            <GiftRegistrySection
              content={current.content}
              ornamentStyle={resolvedTheme.ornamentStyle}
            />
          </div>,
        );
        break;
      case 'rsvp_banner':
        renderedBlocks.push(
          <div
            key={current.id}
            className="mx-auto w-full max-w-4xl overflow-hidden rounded-[26px] border bg-[#FBF9F2] shadow-[0_14px_38px_-18px_rgba(47,58,38,0.14)]"
            style={{ borderColor: '#E5DBC0', ...sectionStyle }}
          >
            <RsvpBannerSection
              content={current.content}
              wedding={wedding}
              ornamentStyle={resolvedTheme.ornamentStyle}
              onPrimaryAction={onPrimaryRsvpAction}
            />
          </div>,
        );
        break;
    }
    i += 1;
  }

  return (
    <div
      data-testid="royal-botanical-letter-view"
      className="rb-letter-reveal flex min-h-full w-full flex-col bg-[#F5F0E3] text-[#2F3A26]"
    >
      {/* Clean Royal Botanical Top Navigation Bar (matches Image 8) */}
      <nav
        aria-label="Invitation sections"
        data-testid="royal-botanical-topbar"
        className="sticky top-0 z-30 border-b border-[#E6DDC4] bg-[#FBF9F2]/92 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => scrollToSection('rb-section-hero')}
            className="cursor-pointer text-xl italic tracking-tight text-[#2F3A26] sm:text-2xl"
            style={{
              fontFamily:
                "'Snell Roundhand', 'Brush Script MT', 'Segoe Script', Garamond, Georgia, serif",
            }}
          >
            {partnerOne} <span className="text-[#C2A65A]">&amp;</span> {partnerTwo}
          </button>

          {!isMobileFrame ? (
            <div className="hidden items-center gap-6 md:flex">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className="cursor-pointer text-[11px] font-medium tracking-[0.2em] uppercase text-[#5C6650] transition-colors hover:text-[#2F3A26]"
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            {onShowEnvelope ? (
              <button
                type="button"
                data-testid="royal-botanical-replay-envelope"
                onClick={onShowEnvelope}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#DCD2B4] bg-[#FBF9F2] px-3.5 py-1.5 text-[10px] font-semibold tracking-[0.18em] uppercase text-[#3E4C30] transition-colors hover:bg-[#F3ECD6]"
              >
                <Mail className="size-3.5" aria-hidden="true" />
                <span>ENVELOPE</span>
              </button>
            ) : null}
            {onPrimaryRsvpAction ? (
              <button
                type="button"
                onClick={onPrimaryRsvpAction}
                className="cursor-pointer rounded-full px-4 py-1.5 text-[10px] font-semibold tracking-[0.2em] uppercase text-[#FBF9F2] transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--inv-accent, #3E4C30)' }}
              >
                RSVP
              </button>
            ) : null}
          </div>
        </div>
      </nav>

      {/* Letter Page Body */}
      <div className="mx-auto w-full max-w-5xl flex-1 space-y-12 px-4 py-10 sm:px-8 sm:py-14">
        {renderedBlocks}
      </div>

      {/* Clean Sample-Matching Footer (matches Image 7) */}
      <footer
        data-testid="royal-botanical-footer"
        className="border-t border-[#E6DDC4] bg-[#F8F4E8] px-6 py-12 text-center"
      >
        <PearlTrio className="mb-3" />
        <p
          className="text-3xl italic text-[#2F3A26] sm:text-4xl"
          style={{
            fontFamily:
              "'Snell Roundhand', 'Brush Script MT', 'Segoe Script', Garamond, Georgia, serif",
          }}
        >
          {partnerOne} <span className="text-[#C2A65A]">&amp;</span> {partnerTwo}
        </p>
        <p className="mt-2.5 text-[10px] font-semibold tracking-[0.26em] uppercase text-[#B5974B] sm:text-[11px]">
          {[formattedFooterDate, footerVenue].filter(Boolean).join(' • ')}
        </p>
      </footer>
    </div>
  );
}
