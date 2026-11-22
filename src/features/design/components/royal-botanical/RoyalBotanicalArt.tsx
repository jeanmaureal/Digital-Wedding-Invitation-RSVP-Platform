import type { JSX } from 'react';

export function PearlTrio({
  withLines = false,
  className = '',
}: {
  readonly withLines?: boolean;
  readonly className?: string;
}): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center gap-3 ${className}`}
    >
      {withLines ? (
        <span
          className="h-px w-12"
          style={{ background: 'linear-gradient(90deg, transparent, #C2A65A)' }}
        />
      ) : null}
      <span className="flex items-center gap-2">
        <span className="rb-pearl rb-pearl-sm" />
        <span className="rb-pearl rb-pearl-md" />
        <span className="rb-pearl rb-pearl-sm" />
      </span>
      {withLines ? (
        <span
          className="h-px w-12"
          style={{ background: 'linear-gradient(90deg, #C2A65A, transparent)' }}
        />
      ) : null}
    </div>
  );
}

/**
 * Corner botanical sprig (olive/sage leaves + butter-yellow & ivory tulips + tiny pearls)
 * matching the top-left and bottom-right accents on both the envelope canvas and hero card.
 */
export function CornerTulipBranch({
  position,
  className = '',
}: {
  readonly position: 'top-left' | 'bottom-right';
  readonly className?: string;
}): JSX.Element {
  const isBottomRight = position === 'bottom-right';

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 210 180"
      fill="none"
      className={`pointer-events-none select-none ${className}`}
      style={isBottomRight ? { transform: 'rotate(180deg)' } : undefined}
    >
      <defs>
        <linearGradient id={`rb-leaf-${position}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6D7D5C" />
          <stop offset="100%" stopColor="#4F5E41" />
        </linearGradient>
        <linearGradient id={`rb-petal-yellow-${position}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFDF4" />
          <stop offset="55%" stopColor="#F4E399" />
          <stop offset="100%" stopColor="#DEC262" />
        </linearGradient>
        <linearGradient id={`rb-petal-ivory-${position}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#EAE4D3" />
        </linearGradient>
        <radialGradient id={`rb-pearl-grad-${position}`} cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="65%" stopColor="#F5F2E9" />
          <stop offset="100%" stopColor="#D6CFC0" />
        </radialGradient>
      </defs>

      {/* Main botanical stems */}
      <path
        d="M-8 -4 C 34 26, 78 62, 128 118"
        stroke="#526142"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M12 -10 C 52 10, 90 28, 126 50"
        stroke="#627350"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* Sage & olive leaves */}
      <path
        d="M22 18 C 52 10, 84 20, 98 38 C 72 44, 40 36, 22 18 Z"
        fill={`url(#rb-leaf-${position})`}
        opacity="0.9"
      />
      <path
        d="M4 46 C 36 56, 62 84, 68 112 C 40 104, 14 78, 4 46 Z"
        fill={`url(#rb-leaf-${position})`}
        opacity="0.85"
      />
      <path
        d="M54 -8 C 82 -14, 114 -4, 134 14 C 106 18, 76 10, 54 -8 Z"
        fill="#7E8E6D"
        opacity="0.82"
      />

      {/* Upper ivory tulip bud */}
      <g transform="translate(132 42) rotate(36)">
        <ellipse cx="-11" cy="0" rx="11" ry="20" fill={`url(#rb-petal-ivory-${position})`} />
        <ellipse cx="11" cy="0" rx="11" ry="20" fill={`url(#rb-petal-ivory-${position})`} />
        <ellipse cx="0" cy="-2" rx="11" ry="22" fill="#FFFDF8" />
      </g>

      {/* Lower butter-yellow & ivory tulip bud */}
      <g transform="translate(106 84) rotate(42)">
        <ellipse cx="-11" cy="0" rx="12" ry="22" fill={`url(#rb-petal-ivory-${position})`} />
        <ellipse cx="11" cy="0" rx="12" ry="22" fill={`url(#rb-petal-ivory-${position})`} />
        <ellipse cx="0" cy="-2" rx="11" ry="24" fill={`url(#rb-petal-yellow-${position})`} />
      </g>

      {/* Luminous tiny pearls */}
      <circle cx="132" cy="122" r="4.5" fill={`url(#rb-pearl-grad-${position})`} />
      <circle cx="88" cy="108" r="3" fill="#DEC262" opacity="0.85" />
      <circle cx="122" cy="76" r="3.5" fill={`url(#rb-pearl-grad-${position})`} />
    </svg>
  );
}

/**
 * Bouquet of 3 butter-yellow & ivory tulips with gold-outlined olive stems & pearls
 * pinned on the bottom-left face of the olive envelope.
 */
export function EnvelopeTulipBouquet({ className = '' }: { readonly className?: string }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 130 140"
      fill="none"
      className={`pointer-events-none select-none ${className}`}
    >
      <defs>
        <linearGradient id="rb-env-tulip-gold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFDF5" />
          <stop offset="65%" stopColor="#F5E59F" />
          <stop offset="100%" stopColor="#E1C668" />
        </linearGradient>
        <radialGradient id="rb-env-pearl" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="70%" stopColor="#F4F0E6" />
          <stop offset="100%" stopColor="#CFC8B7" />
        </radialGradient>
      </defs>

      {/* Stems */}
      <path d="M24 128 C 30 96, 38 66, 44 36" stroke="#C5AC62" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M25 128 C 44 96, 60 72, 74 44" stroke="#C5AC62" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M26 128 C 52 108, 78 92, 98 76" stroke="#C5AC62" strokeWidth="1.6" strokeLinecap="round" />

      {/* Olive-sage leaves with subtle gold outline */}
      <path
        d="M36 96 C 24 80, 22 62, 30 50 C 40 60, 44 78, 36 96 Z"
        fill="#596A47"
        stroke="#C5AC62"
        strokeWidth="0.9"
      />
      <path
        d="M42 74 C 36 58, 38 42, 46 32 C 52 44, 52 60, 42 74 Z"
        fill="#697B55"
        stroke="#C5AC62"
        strokeWidth="0.9"
      />
      <path
        d="M52 106 C 64 96, 80 96, 92 104 C 78 112, 64 114, 52 106 Z"
        fill="#596A47"
        stroke="#C5AC62"
        strokeWidth="0.9"
      />

      {/* Left tulip */}
      <g transform="translate(46 26) rotate(-10)">
        <ellipse cx="-6.5" cy="0" rx="6" ry="13" fill="#F2E196" />
        <ellipse cx="6.5" cy="0" rx="6" ry="13" fill="#F2E196" />
        <ellipse cx="0" cy="-1" rx="6.5" ry="14" fill="url(#rb-env-tulip-gold)" />
      </g>

      {/* Center tulip */}
      <g transform="translate(76 38) rotate(14)">
        <ellipse cx="-6.5" cy="0" rx="6" ry="13" fill="#F2E196" />
        <ellipse cx="6.5" cy="0" rx="6" ry="13" fill="#F2E196" />
        <ellipse cx="0" cy="-1" rx="6.5" ry="14" fill="url(#rb-env-tulip-gold)" />
      </g>

      {/* Right tulip */}
      <g transform="translate(102 72) rotate(48)">
        <ellipse cx="-6.5" cy="0" rx="6" ry="13" fill="#F2E196" />
        <ellipse cx="6.5" cy="0" rx="6" ry="13" fill="#F2E196" />
        <ellipse cx="0" cy="-1" rx="6.5" ry="14" fill="url(#rb-env-tulip-gold)" />
      </g>

      {/* Tiny luminous pearls */}
      <circle cx="38" cy="54" r="2.8" fill="url(#rb-env-pearl)" />
      <circle cx="60" cy="64" r="2.6" fill="url(#rb-env-pearl)" />
      <circle cx="68" cy="88" r="2.8" fill="url(#rb-env-pearl)" />
    </svg>
  );
}

/**
 * Dark olive ribbon bow with dangling gold chain holding pearl -> gold heart -> pearl -> gold star
 * pinned on the top-right corner of the olive envelope.
 */
export function EnvelopePearlCharm({ className = '' }: { readonly className?: string }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 136"
      fill="none"
      className={`pointer-events-none select-none ${className}`}
    >
      <defs>
        <radialGradient id="rb-charm-pearl" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="68%" stopColor="#F3EFE4" />
          <stop offset="100%" stopColor="#C8C0AE" />
        </radialGradient>
      </defs>

      {/* Ribbon bow */}
      <path
        d="M32 18 C 22 8, 8 10, 10 20 C 12 28, 24 26, 32 20 Z"
        fill="#39472B"
        stroke="#27321D"
        strokeWidth="1"
      />
      <path
        d="M32 18 C 42 8, 56 10, 54 20 C 52 28, 40 26, 32 20 Z"
        fill="#39472B"
        stroke="#27321D"
        strokeWidth="1"
      />
      <path d="M30 22 L 22 38 L 28 36 L 32 24 Z" fill="#2E3A23" />
      <path d="M34 22 L 42 38 L 36 36 L 32 24 Z" fill="#2E3A23" />
      <rect x="28" y="15" width="8" height="8" rx="3" fill="#465636" stroke="#C5AC62" strokeWidth="0.9" />

      {/* Vertical gold thread */}
      <line x1="32" y1="24" x2="32" y2="112" stroke="#D5BC72" strokeWidth="1" />

      {/* Top pearl */}
      <circle cx="32" cy="48" r="5" fill="url(#rb-charm-pearl)" />

      {/* Gold heart outline */}
      <path
        d="M32 76 C 28 72, 23 68, 23 63.5 C 23 60.5, 25.5 58.5, 28.2 58.5 C 30 58.5, 31.3 59.6, 32 61 C 32.7 59.6, 34 58.5, 35.8 58.5 C 38.5 58.5, 41 60.5, 41 63.5 C 41 68, 36 72, 32 76 Z"
        stroke="#D8BD70"
        strokeWidth="1.5"
        fill="none"
      />

      {/* Second pearl */}
      <circle cx="32" cy="92" r="4.5" fill="url(#rb-charm-pearl)" />

      {/* Bottom gold star */}
      <path
        d="M32 105 L 34.1 110.2 L 39.7 110.6 L 35.4 114.2 L 36.8 119.6 L 32 116.6 L 27.2 119.6 L 28.6 114.2 L 24.3 110.6 L 29.9 110.2 Z"
        fill="#E5CB7C"
      />
    </svg>
  );
}

/**
 * Embossed gold wax seal with monogram & olive ribbon bow tucked underneath.
 */
export function WaxSealMonogram({
  monogram,
  className = '',
}: {
  readonly monogram: string;
  readonly className?: string;
}): JSX.Element {
  return (
    <div className={`relative inline-flex flex-col items-center justify-center ${className}`}>
      {/* Metallic gold seal disc */}
      <div
        className="relative z-10 flex size-16 items-center justify-center rounded-full shadow-lg sm:size-[72px]"
        style={{
          background:
            'radial-gradient(circle at 32% 28%, #F8E8A6 0%, #DFC068 48%, #B8943A 85%, #9B7928 100%)',
          boxShadow:
            '0 10px 24px -6px rgba(18, 24, 12, 0.55), inset 0 2px 4px rgba(255, 250, 224, 0.7), inset 0 -3px 6px rgba(120, 90, 20, 0.45)',
        }}
      >
        <div
          className="flex size-[52px] items-center justify-center rounded-full border sm:size-[58px]"
          style={{
            borderColor: 'rgba(130, 98, 26, 0.42)',
            boxShadow: 'inset 0 1px 2px rgba(255, 252, 232, 0.55)',
          }}
        >
          <span
            className="text-base italic tracking-wide sm:text-lg"
            style={{
              fontFamily: "Garamond, 'Baskerville Old Face', 'Palatino Linotype', Georgia, serif",
              color: '#344026',
              textShadow: '0 1px 0 rgba(255, 248, 214, 0.5)',
            }}
          >
            {monogram}
          </span>
        </div>
      </div>

      {/* Tiny olive ribbon bow tucked below the seal */}
      <svg
        aria-hidden="true"
        viewBox="0 0 54 24"
        fill="none"
        className="-mt-2.5 h-6 w-12 drop-shadow-sm"
      >
        <path
          d="M27 7 C 19 1, 7 3, 9 11 C 11 16, 20 14, 27 10 Z"
          fill="#3A492C"
          stroke="#25301B"
          strokeWidth="0.9"
        />
        <path
          d="M27 7 C 35 1, 47 3, 45 11 C 43 16, 34 14, 27 10 Z"
          fill="#3A492C"
          stroke="#25301B"
          strokeWidth="0.9"
        />
        <path d="M25 10 L 18 22 L 23 20 L 27 12 Z" fill="#2D3922" />
        <path d="M29 10 L 36 22 L 31 20 L 27 12 Z" fill="#2D3922" />
        <circle cx="27" cy="9" r="3" fill="#4B5C3A" />
      </svg>
    </div>
  );
}

/**
 * Curly upward gold arrow beside "Tap Here to Open the Envelope".
 */
export function CurlyGoldArrow({ className = '' }: { readonly className?: string }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 28 32"
      fill="none"
      className={`inline-block h-6 w-5 ${className}`}
    >
      <path
        d="M5 27 C 15 26, 21 20, 17 15 C 14 12, 10 15, 13 18 C 16 20, 21 15, 20 5"
        stroke="#C2A65A"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M15.5 9.5 L 20 4.5 L 24 9.5"
        stroke="#C2A65A"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
