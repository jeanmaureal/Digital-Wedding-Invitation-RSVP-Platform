import { type JSX, useEffect, useRef, useState } from 'react';
import {
  CornerTulipBranch,
  CurlyGoldArrow,
  EnvelopePearlCharm,
  EnvelopeTulipBouquet,
  WaxSealMonogram,
} from '@/features/design/components/royal-botanical/RoyalBotanicalArt';
import type { InvitationWeddingMetadata } from '@/features/design/schemas/designSchemas';
import { formatInvitationEventDate } from '@/features/design/themes/dateFormatting';

export interface RoyalBotanicalHouseholdContext {
  readonly displayName: string;
  readonly maxAttendees: number;
}

export interface RoyalBotanicalEnvelopeProps {
  readonly wedding: InvitationWeddingMetadata;
  readonly eyebrow?: string | undefined;
  readonly displayDateLabel?: string | undefined;
  readonly household?: RoyalBotanicalHouseholdContext | undefined;
  readonly isFullPage?: boolean | undefined;
  readonly onOpened: () => void;
}

type EnvelopePhase = 'closed' | 'opening' | 'sliding' | 'zooming';

export function RoyalBotanicalEnvelope({
  wedding,
  eyebrow,
  displayDateLabel,
  household,
  isFullPage = true,
  onOpened,
}: RoyalBotanicalEnvelopeProps): JSX.Element {
  const [phase, setPhase] = useState<EnvelopePhase>('closed');
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const timerId of timersRef.current) {
        window.clearTimeout(timerId);
      }
      timersRef.current = [];
    };
  }, []);

  const partnerOne = wedding.partnerOneName.trim() || 'Partner One';
  const partnerTwo = wedding.partnerTwoName.trim() || 'Partner Two';
  const monogram = `${partnerOne.charAt(0).toUpperCase()}&${partnerTwo.charAt(0).toUpperCase()}`;

  const rawDate =
    displayDateLabel && displayDateLabel.trim().length > 0
      ? displayDateLabel.trim()
      : formatInvitationEventDate(wedding.eventDate);
  const uppercaseDate = rawDate.toUpperCase();
  const topEyebrow =
    eyebrow && eyebrow.trim().length > 0 ? eyebrow.trim() : 'A ROYAL BOTANICAL CELEBRATION';

  function handleOpenEnvelope(): void {
    if (phase !== 'closed') {
      return;
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setPhase('zooming');
      onOpened();
      return;
    }

    setPhase('opening');

    const t1 = window.setTimeout(() => {
      setPhase('sliding');
    }, 520);

    const t2 = window.setTimeout(() => {
      setPhase('zooming');
    }, 1300);

    const t3 = window.setTimeout(() => {
      onOpened();
    }, 1820);

    timersRef.current = [t1, t2, t3];
  }

  const isFlapOpen = phase === 'opening' || phase === 'sliding' || phase === 'zooming';
  const isCardSliding = phase === 'sliding' || phase === 'zooming';
  const isZooming = phase === 'zooming';

  return (
    <div
      data-testid="royal-botanical-envelope-stage"
      data-envelope-phase={phase}
      className={`rb-envelope-backdrop relative flex w-full flex-col items-center justify-center overflow-hidden px-4 py-12 sm:px-8 ${
        isFullPage ? 'min-h-screen' : 'min-h-[640px] rounded-xl'
      } ${isZooming ? 'rb-stage-zooming' : ''}`}
    >
      {/* Corner botanicals on the cream backdrop */}
      <CornerTulipBranch
        position="top-left"
        className="absolute -top-4 -left-4 w-36 opacity-90 sm:w-52 md:w-64"
      />
      <CornerTulipBranch
        position="bottom-right"
        className="absolute -right-4 -bottom-4 w-36 opacity-90 sm:w-52 md:w-64"
      />

      {/* Scattered luminous white pearls */}
      <span aria-hidden="true" className="rb-pearl rb-pearl-md absolute top-[20%] left-[21%] hidden sm:block" />
      <span aria-hidden="true" className="rb-pearl rb-pearl-sm absolute top-[22%] right-[20%] hidden sm:block" />
      <span aria-hidden="true" className="rb-pearl rb-pearl-lg absolute bottom-[22%] left-[17%] hidden sm:block" />
      <span aria-hidden="true" className="rb-pearl rb-pearl-sm absolute right-[26%] bottom-[16%] hidden sm:block" />
      <span aria-hidden="true" className="rb-pearl rb-pearl-md absolute right-[15%] bottom-[28%] hidden sm:block" />

      {/* Top invitation title header */}
      <div
        className={`relative z-10 mb-8 text-center transition-all duration-350 sm:mb-10 ${
          isFlapOpen ? '-translate-y-3 opacity-0' : 'opacity-100'
        }`}
      >
        <p className="text-[11px] font-medium tracking-[0.28em] uppercase text-[#5E6852] sm:text-xs">
          {topEyebrow}
        </p>
        <p
          className="mt-1.5 text-2xl italic tracking-wide text-[#2F3A26] sm:text-3xl"
          style={{
            fontFamily: "Garamond, 'Baskerville Old Face', 'Palatino Linotype', Georgia, serif",
          }}
        >
          {partnerOne}{' '}
          <span className="text-[#B6984B]">&amp;</span>{' '}
          {partnerTwo}
        </p>
        {household ? (
          <p
            data-testid="envelope-household-greeting"
            className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#DDD3B5] bg-[#FAF6E8]/90 px-4 py-1 text-xs font-medium tracking-wide text-[#4D5A3E]"
          >
            <span className="rb-pearl rb-pearl-xs" aria-hidden="true" />
            <span>Prepared for {household.displayName}</span>
            <span className="rb-pearl rb-pearl-xs" aria-hidden="true" />
          </p>
        ) : null}
      </div>

      {/* Interactive 3D Envelope */}
      <button
        type="button"
        data-testid="royal-botanical-envelope-button"
        onClick={handleOpenEnvelope}
        disabled={phase !== 'closed'}
        aria-label={`Open wedding invitation envelope for ${partnerOne} and ${partnerTwo}`}
        className={`group relative z-20 w-full max-w-[460px] cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2A65A] focus-visible:ring-offset-4 focus-visible:ring-offset-[#F4EFE2] disabled:cursor-default sm:max-w-[520px] ${
          phase === 'closed' ? 'transition-transform duration-300 hover:-translate-y-1' : ''
        }`}
        style={{ perspective: '1400px' }}
      >
        <div
          className={`relative mx-auto aspect-[1.52/1] w-full rounded-xl transition-transform duration-700 ease-out ${
            isZooming ? 'scale-[1.18] opacity-0' : 'scale-100 opacity-100'
          }`}
          style={{
            boxShadow:
              '0 26px 52px -14px rgba(34, 44, 24, 0.42), 0 10px 20px -8px rgba(34, 44, 24, 0.22)',
          }}
        >
          {/* Envelope Back Interior */}
          <div
            className="absolute inset-0 rounded-xl"
            style={{
              background: 'linear-gradient(160deg, #334025 0%, #2A351E 100%)',
            }}
          />

          {/* Sliding Ivory Invitation Letter inside the pocket */}
          <div
            data-testid="royal-botanical-sliding-letter"
            className="absolute right-[4.5%] bottom-[6%] left-[4.5%] h-[88%] rounded-lg border px-5 py-6 text-center transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] sm:px-8 sm:py-7"
            style={{
              backgroundColor: '#FBF9F2',
              borderColor: '#D5BF7D',
              boxShadow: '0 8px 24px -6px rgba(20, 26, 14, 0.25)',
              zIndex: isCardSliding ? 15 : 8,
              transform: isZooming
                ? 'translateY(-62%) scale(1.22)'
                : isCardSliding
                  ? 'translateY(-50%) scale(1.01)'
                  : 'translateY(0%) scale(0.97)',
              opacity: isFlapOpen ? 1 : 0.96,
            }}
          >
            {/* Inner thin gold frame */}
            <div
              className="flex h-full flex-col items-center justify-start rounded-md border px-3 pt-4 sm:pt-5"
              style={{ borderColor: 'rgba(194, 166, 90, 0.35)' }}
            >
              <p className="text-[9px] font-semibold tracking-[0.26em] uppercase text-[#76806B] sm:text-[10px]">
                YOU ARE CORDIALLY INVITED
              </p>
              <p
                className="mt-2 text-2xl italic tracking-tight text-[#2F3A26] sm:text-4xl"
                style={{
                  fontFamily:
                    "'Snell Roundhand', 'Brush Script MT', 'Segoe Script', Garamond, Georgia, serif",
                }}
              >
                {partnerOne}{' '}
                <span className="text-[#C2A65A]">&amp;</span>{' '}
                {partnerTwo}
              </p>
              <p className="mt-1.5 text-[10px] font-semibold tracking-[0.22em] uppercase text-[#B7984A] sm:text-xs">
                {uppercaseDate}
              </p>
              {household ? (
                <p className="mt-2 text-[10px] tracking-[0.14em] uppercase text-[#5C6650]">
                  {household.maxAttendees} {household.maxAttendees === 1 ? 'Seat' : 'Seats'} Reserved
                </p>
              ) : null}
            </div>
          </div>

          {/* Front Left & Right Diagonal Pocket Folds */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-xl"
          >
            {/* Left triangle fold */}
            <div
              className="absolute inset-0"
              style={{
                clipPath: 'polygon(0 0, 52% 53%, 0 100%)',
                background: 'linear-gradient(135deg, #3D4C2F 0%, #344127 100%)',
              }}
            />
            {/* Right triangle fold */}
            <div
              className="absolute inset-0"
              style={{
                clipPath: 'polygon(100% 0, 48% 53%, 100% 100%)',
                background: 'linear-gradient(225deg, #3B4A2D 0%, #313E25 100%)',
              }}
            />
            {/* Bottom triangle fold */}
            <div
              className="absolute inset-0"
              style={{
                clipPath: 'polygon(0 100%, 50% 48%, 100% 100%)',
                background: 'linear-gradient(180deg, #3E4D30 0%, #334026 100%)',
                boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)',
              }}
            />
            {/* Crisp fold highlight lines */}
            <svg viewBox="0 0 100 66" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              <line x1="0" y1="66" x2="50" y2="31.5" stroke="rgba(255,255,255,0.06)" strokeWidth="0.35" />
              <line x1="100" y1="66" x2="50" y2="31.5" stroke="rgba(255,255,255,0.06)" strokeWidth="0.35" />
            </svg>

            {/* Bottom-left Butter-Yellow Tulip Bouquet */}
            <EnvelopeTulipBouquet className="absolute bottom-[6%] left-[5%] w-[24%] drop-shadow-sm" />

            {/* Top-right Olive Ribbon Bow + Pearl/Heart/Star Charm */}
            <EnvelopePearlCharm className="absolute top-[5%] right-[4%] w-[13%] drop-shadow-sm" />
          </div>

          {/* Top Triangular Flap (3D flip open on click) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 right-0 left-0 h-[56%] origin-top transition-transform duration-600 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              zIndex: isCardSliding ? 5 : 30,
              transform: isFlapOpen ? 'rotateX(180deg)' : 'rotateX(0deg)',
              transformStyle: 'preserve-3d',
            }}
          >
            {/* Outer face of flap (base at top hinge, tip pointing down when closed) */}
            <div
              className="absolute inset-0 rounded-t-xl"
              style={{
                clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                background: 'linear-gradient(180deg, #435334 0%, #39482B 100%)',
                filter: 'drop-shadow(0 6px 10px rgba(15, 22, 10, 0.35))',
                backfaceVisibility: 'hidden',
              }}
            />
            {/* Inner face of flap (rotated 180deg around center -> base sits flush on top hinge, tip points UP when open) */}
            <div
              className="absolute inset-0"
              style={{
                clipPath: 'polygon(0 100%, 100% 100%, 50% 0)',
                background: 'linear-gradient(0deg, #3A482C 0%, #485838 100%)',
                transform: 'rotateX(180deg)',
                backfaceVisibility: 'hidden',
              }}
            />
          </div>

          {/* Centered Gold Wax Seal with Monogram */}
          <div
            className={`pointer-events-none absolute top-[50%] left-[50%] z-40 -translate-x-1/2 -translate-y-1/2 transition-all duration-400 ${
              isFlapOpen
                ? 'scale-75 opacity-0'
                : 'scale-100 opacity-100 group-hover:scale-105'
            }`}
          >
            <WaxSealMonogram monogram={monogram} />
          </div>
        </div>
      </button>

      {/* Bottom Tap Prompt */}
      <div
        className={`relative z-10 mt-8 text-center transition-all duration-500 sm:mt-10 ${
          isZooming ? 'translate-y-3 opacity-0' : 'opacity-100'
        }`}
      >
        <button
          type="button"
          onClick={handleOpenEnvelope}
          disabled={phase !== 'closed'}
          className="inline-flex cursor-pointer items-center gap-2 text-lg italic tracking-wide text-[#38452B] transition-opacity hover:opacity-80 disabled:cursor-default sm:text-xl"
          style={{
            fontFamily: "Garamond, 'Baskerville Old Face', 'Palatino Linotype', Georgia, serif",
          }}
        >
          <span>{phase === 'closed' ? 'Tap Here to Open the Envelope' : 'Opening Your Invitation…'}</span>
          {phase === 'closed' ? <CurlyGoldArrow /> : null}
        </button>
        <p className="mt-1 text-[10px] font-semibold tracking-[0.26em] uppercase text-[#B5974B] sm:text-[11px]">
          {partnerOne.toUpperCase()} &amp; {partnerTwo.toUpperCase()} &bull; {uppercaseDate}
        </p>
      </div>
    </div>
  );
}
